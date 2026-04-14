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

  if (!ts || !v1 || !paymentId || !requestId) {
    return {
      ok: false,
      reason: "missing_signature_parts",
      details: { has_ts: Boolean(ts), has_v1: Boolean(v1), has_payment_id: Boolean(paymentId), has_request_id: Boolean(requestId) },
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

  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
      return res.status(500).json({ error: "Supabase não configurado" });
    }

    const mpToken = cleanString(process.env.MP_TOKEN);
    if (!mpToken) return res.status(500).json({ error: "MP_TOKEN não configurado" });

    const signatureValidation = validateMercadoPagoSignature(req);
    if (!signatureValidation.ok) {
      // Se o motivo for "missing_webhook_secret", o secret nao foi configurado na Vercel.
      // Neste caso, continuamos sem bloquear (modo degradado) pois o pagamento ainda e
      // verificado diretamente na API do MP. Registrar o aviso para acoes corretivas.
      if (signatureValidation.reason === "missing_webhook_secret") {
        console.warn("[webhook] MP_WEBHOOK_SECRET nao configurado — validando pagamento diretamente na API do MP");
      } else {
        console.error("WEBHOOK ASSINATURA INVALIDA:", signatureValidation);
        return res.status(401).json({
          error: "Assinatura do webhook invalida",
          reason: signatureValidation.reason,
        });
      }
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    const paymentId = getPaymentId(req);
    const notificationType = getNotificationType(req);

    if (!paymentId) {
      return res.status(200).json({ ok: true, ignored: "missing_payment_id" });
    }

    if (notificationType && notificationType !== "payment") {
      return res.status(200).json({ ok: true, ignored: "unsupported_type" });
    }

    const payment = await fetchPayment(paymentId);
    const external_reference = cleanString(payment.external_reference);

    if (!external_reference) {
      return res.status(200).json({ ok: true, ignored: "missing_external_reference" });
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, status, mp_payment_id, external_reference")
      .eq("external_reference", external_reference)
      .maybeSingle();

    if (orderError || !order) {
      console.error("ERRO AO LOCALIZAR PEDIDO:", orderError);
      return res.status(200).json({ ok: true, ignored: "order_not_found" });
    }

    const paymentStatus = cleanString(payment.status, "pending");
    const isNowApproved = paymentStatus === "approved";
    let stockDecremented = false;

    if (isNowApproved) {
      const { data: approvalTransition, error: approvalError } = await supabase
        .from("orders")
        .update({ status: paymentStatus, mp_payment_id: payment.id })
        .eq("id", order.id)
        .neq("status", "approved")
        .select("id");

      if (approvalError) {
        console.error("ERRO UPDATE APPROVAL:", approvalError);
        return res.status(500).json({ error: "Erro ao atualizar pedido" });
      }

      if (approvalTransition?.length) {
        try {
          await decrementOrderStockOnce(supabase, order.id);
          stockDecremented = true;
        } catch (stockError) {
          console.error("ERRO ESTOQUE:", stockError);
          return res.status(500).json({ error: "Erro ao decrementar estoque" });
        }
      } else if (order.mp_payment_id !== payment.id) {
        const { error: syncErr } = await supabase
          .from("orders")
          .update({ status: paymentStatus, mp_payment_id: payment.id })
          .eq("id", order.id);

        if (syncErr) {
          console.error("ERRO SYNC APPROVED:", syncErr);
          return res.status(500).json({ error: "Erro ao sincronizar pedido" });
        }
      }
    } else if (order.status !== "approved") {
      const { error: updateError } = await supabase
        .from("orders")
        .update({ status: paymentStatus, mp_payment_id: payment.id })
        .eq("id", order.id);

      if (updateError) {
        console.error("ERRO UPDATE:", updateError);
        return res.status(500).json({ error: "Erro ao atualizar pedido" });
      }
    }

    return res.status(200).json({
      ok: true,
      external_reference,
      status: paymentStatus,
      stock_decremented: stockDecremented,
    });
  } catch (err) {
    console.error("ERRO WEBHOOK:", err);
    return res.status(500).json({ error: "Erro webhook" });
  }
}