import { createClient } from "@supabase/supabase-js";
import { cleanString, parsePositiveInteger } from "./lib/utils.js";

function getDbProductPrice(product) {
  const price = Number(product?.price ?? product?.preco ?? 0);
  if (!Number.isFinite(price) || price < 0) return null;
  return price;
}

function getDbProductName(product) {
  return cleanString(product?.name || product?.nome, "Produto");
}

async function cleanupOrder(supabase, orderId) {
  if (!orderId) return;
  await supabase.from("order_items").delete().eq("order_id", orderId);
  await supabase.from("orders").delete().eq("id", orderId);
}

function buildAppBaseUrl(req) {
  const envUrl =
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.SITE_URL ||
    process.env.VERCEL_URL;

  if (envUrl) {
    if (/^https?:\/\//i.test(envUrl)) return envUrl.replace(/\/+$/, "");
    return `https://${envUrl.replace(/\/+$/, "")}`;
  }

  const origin = cleanString(req.headers?.origin);
  if (origin && !/localhost|127\.0\.0/.test(origin)) return origin.replace(/\/+$/, "");

  const forwardedProto = cleanString(req.headers?.["x-forwarded-proto"], "https");
  const forwardedHost = cleanString(req.headers?.["x-forwarded-host"]);
  const host = forwardedHost || cleanString(req.headers?.host);

  if (host && !/localhost|127\.0\.0/.test(host)) return `${forwardedProto}://${host}`.replace(/\/+$/, "");

  // Em desenvolvimento local, retorna null — o MP não aceita localhost em back_urls
  return null;
}

function buildOrderPayload({ external_reference, total, customer, shipping }) {
  const customerName  = cleanString(customer?.name, "Cliente Site");
  const customerEmail = cleanString(customer?.email);
  const customerPhone = cleanString(customer?.phone);

  const shippingPayload = {
    zip:          cleanString(shipping?.zip),
    street:       cleanString(shipping?.street),
    number:       cleanString(shipping?.number),
    neighborhood: cleanString(shipping?.neighborhood),
    city:         cleanString(shipping?.city),
    state:        cleanString(shipping?.state),
    complement:   cleanString(shipping?.complement),
  };

  const base = {
    external_reference,
    customer_name:  customerName,
    customer_email: customerEmail || null,
    customer_phone: customerPhone || null,
    total,
    status: "pending",
  };

  return {
    base,
    extended: { ...base, shipping_address: shippingPayload },
  };
}

async function resolveCartItems(supabase, cart) {
  const quantityById = new Map();

  for (const item of cart) {
    const productId = cleanString(item?.id);
    const quantity = parsePositiveInteger(item?.quantity);

    if (!productId) return { error: "Produto inválido no carrinho", status: 400 };
    if (!quantity) return { error: "Quantidade inválida no carrinho", status: 400 };

    quantityById.set(productId, (quantityById.get(productId) || 0) + quantity);
  }

  const productIds = Array.from(quantityById.keys());
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, nome, price, preco, image_url")
    .in("id", productIds);

  if (error) return { error: "Erro ao validar produtos", status: 500, details: error.message };

  const productMap = new Map((products || []).map((p) => [String(p.id), p]));
  const resolvedItems = [];

  for (const productId of productIds) {
    const product = productMap.get(productId);
    if (!product) return { error: "Produto não encontrado ou indisponível", status: 400, details: { product_id: productId } };

    const productPrice = getDbProductPrice(product);
    if (productPrice == null) return { error: "Produto com preço inválido", status: 400, details: { product_id: productId } };

    resolvedItems.push({
      product_id: product.id,
      product_name: getDbProductName(product),
      product_price: productPrice,
      quantity: quantityById.get(productId),
      image_url: product.image_url ?? null,
    });
  }

  const total = resolvedItems.reduce((sum, item) => sum + item.product_price * item.quantity, 0);
  return { resolvedItems, total };
}

async function insertOrderWithFallback(supabase, orderPayload) {
  const { data: extendedOrder, error: extendedError } = await supabase
    .from("orders")
    .insert([orderPayload.extended])
    .select()
    .single();

  if (!extendedError && extendedOrder) return { order: extendedOrder, mode: "extended" };

  const { data: baseOrder, error: baseError } = await supabase
    .from("orders")
    .insert([orderPayload.base])
    .select()
    .single();

  if (baseError || !baseOrder) throw baseError || new Error("Erro ao salvar pedido");

  return { order: baseOrder, mode: "base", fallbackError: extendedError };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    const body = req.body || {};
    const cart = Array.isArray(body.cart) ? body.cart : [];
    const customer = body.customer || {};
    const shipping = body.shipping || {};

    if (!cart.length) return res.status(400).json({ error: "Carrinho vazio" });

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
      return res.status(500).json({ error: "Supabase não configurado" });
    }

    const mpToken = cleanString(process.env.MP_TOKEN);
    if (!mpToken) return res.status(500).json({ error: "MP_TOKEN não configurado" });

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    const resolvedCart = await resolveCartItems(supabase, cart);

    if (resolvedCart.error) {
      return res.status(resolvedCart.status || 400).json({
        error: resolvedCart.error,
        details: resolvedCart.details,
      });
    }

    const { resolvedItems, total } = resolvedCart;
    const external_reference = "PED-" + Date.now();
    const orderPayload = buildOrderPayload({ external_reference, total, customer, shipping });
    const { order, fallbackError } = await insertOrderWithFallback(supabase, orderPayload);

    if (fallbackError) {
      // Log completo para diagnóstico — geralmente indica que a coluna shipping_address
      // ainda não existe na tabela orders. Execute o SQL de migration para corrigir.
      console.warn("[create-checkout] Fallback para payload base (sem shipping_address):", {
        message: fallbackError.message,
        code:    fallbackError.code,
        details: fallbackError.details,
        hint:    fallbackError.hint,
      });
    }

    const itemsToInsert = resolvedItems.map((item) => ({
      order_id: order.id,
      product_id: item.product_id,
      product_name: item.product_name,
      product_price: item.product_price,
      quantity: item.quantity,
      image_url: item.image_url,
    }));

    const { error: itemsError } = await supabase.from("order_items").insert(itemsToInsert);

    if (itemsError) {
      await cleanupOrder(supabase, order.id);
      return res.status(500).json({ error: "Erro ao salvar itens", details: itemsError.message });
    }

    const appBaseUrl = buildAppBaseUrl(req);
    const isLocal = !appBaseUrl;

    const mpPreference = {
      items: resolvedItems.map((item) => ({
        title: item.product_name,
        quantity: item.quantity,
        currency_id: "BRL",
        unit_price: item.product_price,
      })),
      payer: {
        name: cleanString(customer?.name) || undefined,
        email: cleanString(customer?.email) || undefined,
      },
      external_reference,
      // Em produção: redireciona automaticamente após aprovação
      // Em localhost: o MP não aceita URLs de localhost, entao remove auto_return e back_urls
      ...(isLocal
        ? {}
        : {
            back_urls: {
              success: `${appBaseUrl}/sucesso.html?external_reference=${encodeURIComponent(external_reference)}`,
              failure: `${appBaseUrl}/erro.html?external_reference=${encodeURIComponent(external_reference)}`,
              pending: `${appBaseUrl}/?external_reference=${encodeURIComponent(external_reference)}`,
            },
            notification_url: `${appBaseUrl}/api/webhook`,
            auto_return: "approved",
          }),
    };

    const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mpToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(mpPreference),
    });

    if (!mpResponse.ok) {
      const errorText = await mpResponse.text();
      await cleanupOrder(supabase, order.id);
      return res.status(500).json({ error: "Erro Mercado Pago", details: errorText });
    }

    const mpData = await mpResponse.json();

    if (!mpData.init_point) {
      await cleanupOrder(supabase, order.id);
      return res.status(500).json({ error: "Mercado Pago não retornou link", details: mpData });
    }

    return res.status(200).json({ init_point: mpData.init_point });
  } catch (err) {
    console.error("ERRO GERAL:", err);
    return res.status(500).json({ error: "Erro interno", details: err.message });
  }
}
