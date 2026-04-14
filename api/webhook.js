import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { cleanString } from "./lib/utils.js";

// =====================
// HELPERS
// =====================

function getPaymentId(req) {
  const body = req.body || {};
  const directId = body?.data?.id || body?.id || req.query?.["data.id"] || req.query?.id;
  if (directId) return cleanString(directId);

  const resource = cleanString(body?.resource || req.query?.resource);
  const match = resource.match(/\/payments\/(\d+)/i);
  if (match?.[1]) return match[1];
  return "";
}

function getNotificationType(req) {
  const body = req.body || {};
  return cleanString(body?.type || body?.topic || req.query?.type || req.query?.topic).toLowerCase();
}

function parseSignatureHeader(signatureHeader) {
  const signature = { ts: "", v1: "" };

  cleanString(signatureHeader)
    .split(",")
    .map((part) => part.trim())
    .forEach((part) => {
      const [key, value] = part.split("=");
      if (!key || !value) return;
      if (key === "ts") signature.ts = cleanString(value);
      if (key === "v1") signature.v1 = cleanString(value);
    });

  return signature;
}

function safeCompareHex(a, b) {
  const left = cleanString(a).toLowerCase();
  const right = cleanString(b).toLowerCase();
  if (!left || !right || left.length !== right.length) return false;

  try {
    return crypto.timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
  } catch {
    return false;
  }
}

function validateMercadoPagoSignature(req) {
  const webhookSecret = cleanString(
    process.env.MP_WEBHOOK_SECRET ||
      process.env.MERCADO_PAGO_WEBHOOK_SECRET ||
      process.env.MP_WEBHOOK_SIGNING_SECRET
  );

  if (!webhookSecret) return { ok: false, reason: "missing_webhook_secret" };

  const signatureHeader = req.headers?.["x-signature"];
  const requestIdHeader = req.headers?.["x-request-id"];
  const { ts, v1 } = parseSignatureHeader(signatureHeader);
  const paymentId = cleanString(getPaymentId(req)).toLowerCase();
  const requestId = cleanString(requestIdHeader);

  // x-request-id é necessário para gerar o manifest, mas notificações IPN antigas do MP
  // não o enviam. Nesse caso, retornamos "missing_request_id" e o handler
  // trata como modo degradado (sem bloquear), pois o pagamento é re-validado via API.
  if (!ts || !v1) {
    return {
      ok: false,
      reason: "missing_signature_header",
      details: { has_x_signature: Boolean(signatureHeader) },
    };
  }

  if (!requestId) {
    return { ok: false, reason: "missing_request_id" };
  }

  if (!paymentId) {
    return {
      ok: false,
      reason: "missing_payment_id_for_signature",
    };
  }

  const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`;
  const expected = crypto.createHmac("sha256", webhookSecret).update(manifest).digest("hex");

  return { ok: safeCompareHex(expected, v1), reason: "validated", manifest };
}

async function fetchPayment(paymentId) {
  const mpToken = cleanString(process.env.MP_TOKEN);
  const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${mpToken}` },
  });

  if (!mpResponse.ok) {
    const errorText = await mpResponse.text();
    throw new Error(`Erro ao consultar pagamento: ${errorText}`);
  }

  return mpResponse.json();
}

async function decrementOrderStockOnce(supabase, orderId) {
  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("product_id, quantity")
    .eq("order_id", orderId);

  if (itemsError) throw itemsError;

  for (const item of items || []) {
    const productId = item?.product_id;
    const qty = Number(item?.quantity || 0);

    if (!productId || qty <= 0) continue;

    const { error: stockError } = await supabase.rpc("decrement_stock", {
      product_id: productId,
      qty,
    });

    if (stockError) throw stockError;
  }
}

// =====================
// HANDLER PRINCIPAL
// =====================

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  console.log('[webhook] Recebido:', {
    method: req.method,
    type: req.body?.type || req.body?.topic,
    payment_id: req.body?.data?.id || req.query?.["data.id"],
    has_signature: Boolean(req.headers?.["x-signature"]),
    has_request_id: Boolean(req.headers?.["x-request-id"]),
  });

  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
      console.error('[webhook] SUPABASE_URL ou SUPABASE_KEY não configurados');
      return res.status(500).json({ error: "Supabase não configurado" });
    }

    const mpToken = cleanString(process.env.MP_TOKEN);
    if (!mpToken) {
      console.error('[webhook] MP_TOKEN não configurado');
      return res.status(500).json({ error: "MP_TOKEN não configurado" });
    }

    const signatureValidation = validateMercadoPagoSignature(req);
    console.log('[webhook] Validação de assinatura:', signatureValidation.reason);

    if (!signatureValidation.ok) {
      const degradedReasons = [
        "missing_webhook_secret",
        "missing_request_id",       // notificações IPN antigas (sem x-request-id)
        "missing_signature_header",  // ambiente de teste sem headers
      ];

      if (degradedReasons.includes(signatureValidation.reason)) {
        console.warn(`[webhook] Modo degradado (${signatureValidation.reason}) — validando pagamento via API do MP`);
      } else {
        console.error('[webhook] Assinatura inválida:', signatureValidation);
        return res.status(401).json({
          error: "Assinatura do webhook invalida",
          reason: signatureValidation.reason,
        });
      }
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    const paymentId = getPaymentId(req);
    const notificationType = getNotificationType(req);

    console.log('[webhook] paymentId:', paymentId, '| tipo:', notificationType);

    if (!paymentId) {
      console.log('[webhook] Ignorado: sem payment_id');
      return res.status(200).json({ ok: true, ignored: "missing_payment_id" });
    }

    if (notificationType && notificationType !== "payment") {
      console.log('[webhook] Ignorado: tipo não suportado:', notificationType);
      return res.status(200).json({ ok: true, ignored: "unsupported_type" });
    }

    console.log('[webhook] Consultando pagamento', paymentId, 'na API do MP...');
    const payment = await fetchPayment(paymentId);
    const external_reference = cleanString(payment.external_reference);
    console.log('[webhook] Pagamento recuperado:', {
      id: payment.id,
      status: payment.status,
      external_reference,
    });

    if (!external_reference) {
      console.log('[webhook] Ignorado: sem external_reference no pagamento');
      return res.status(200).json({ ok: true, ignored: "missing_external_reference" });
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, status, mp_payment_id, external_reference")
      .eq("external_reference", external_reference)
      .maybeSingle();

    if (orderError) {
      console.error('[webhook] Erro ao localizar pedido no banco:', orderError.message, orderError.code);
      return res.status(200).json({ ok: true, ignored: "order_not_found" });
    }

    if (!order) {
      console.warn('[webhook] Pedido não encontrado para external_reference:', external_reference);
      return res.status(200).json({ ok: true, ignored: "order_not_found" });
    }

    console.log('[webhook] Pedido encontrado:', { id: order.id, status_atual: order.status });

    const paymentStatus = cleanString(payment.status, "pending");
    const isNowApproved = paymentStatus === "approved";
    let stockDecremented = false;

    if (isNowApproved) {
      console.log('[webhook] Pagamento aprovado! Atualizando pedido', order.id);
      const { data: approvalTransition, error: approvalError } = await supabase
        .from("orders")
        .update({ status: paymentStatus, mp_payment_id: payment.id })
        .eq("id", order.id)
        .neq("status", "approved")
        .select("id");

      if (approvalError) {
        console.error('[webhook] Erro ao atualizar pedido (approved):', approvalError.message);
        return res.status(500).json({ error: "Erro ao atualizar pedido" });
      }

      if (approvalTransition?.length) {
        console.log('[webhook] Status atualizado para approved. Decrementando estoque...');
        try {
          await decrementOrderStockOnce(supabase, order.id);
          stockDecremented = true;
          console.log('[webhook] Estoque decrementado com sucesso');
        } catch (stockError) {
          console.error('[webhook] Erro ao decrementar estoque:', stockError.message);
          return res.status(500).json({ error: "Erro ao decrementar estoque" });
        }
      } else if (order.mp_payment_id !== payment.id) {
        const { error: syncErr } = await supabase
          .from("orders")
          .update({ status: paymentStatus, mp_payment_id: payment.id })
          .eq("id", order.id);

        if (syncErr) {
          console.error('[webhook] Erro ao sincronizar approved:', syncErr.message);
          return res.status(500).json({ error: "Erro ao sincronizar pedido" });
        }
      }
    } else if (order.status !== "approved") {
      console.log('[webhook] Atualizando status:', order.status, '->', paymentStatus);
      const { error: updateError } = await supabase
        .from("orders")
        .update({ status: paymentStatus, mp_payment_id: payment.id })
        .eq("id", order.id);

      if (updateError) {
        console.error('[webhook] Erro ao atualizar status:', updateError.message);
        return res.status(500).json({ error: "Erro ao atualizar pedido" });
      }
    } else {
      console.log('[webhook] Pedido já aprovado — sem alterações');
    }

    console.log('[webhook] Concluído:', { external_reference, status: paymentStatus, stockDecremented });
    return res.status(200).json({
      ok: true,
      external_reference,
      status: paymentStatus,
      stock_decremented: stockDecremented,
    });
  } catch (err) {
    console.error('[webhook] ERRO GERAL:', err?.message || err);
    return res.status(500).json({ error: "Erro webhook" });
  }
}