import { createClient } from "@supabase/supabase-js"

function cleanString(value, fallback = "") {
  if (value == null) return fallback
  const text = String(value).trim()
  return text || fallback
}

function getPaymentId(req) {
  const body = req.body || {}

  const directId =
    body?.data?.id ||
    body?.id ||
    req.query?.["data.id"] ||
    req.query?.id

  if (directId) return cleanString(directId)

  const resource = cleanString(body?.resource || req.query?.resource)
  const match = resource.match(/\/payments\/(\d+)/i)

  if (match?.[1]) return match[1]

  return ""
}

function getNotificationType(req) {
  const body = req.body || {}

  return cleanString(
    body?.type ||
      body?.topic ||
      req.query?.type ||
      req.query?.topic
  ).toLowerCase()
}

async function fetchPayment(paymentId) {
  const mpResponse = await fetch(
    `https://api.mercadopago.com/v1/payments/${paymentId}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.MP_TOKEN}`,
      },
    }
  )

  if (!mpResponse.ok) {
    const errorText = await mpResponse.text()
    throw new Error(`Erro ao consultar pagamento: ${errorText}`)
  }

  return mpResponse.json()
}

async function decrementOrderStockOnce(supabase, orderId) {
  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("product_id, quantity")
    .eq("order_id", orderId)

  if (itemsError) {
    throw itemsError
  }

  for (const item of items || []) {
    const productId = item?.product_id
    const qty = Number(item?.quantity || 0)

    if (!productId || qty <= 0) continue

    const { error: stockError } = await supabase.rpc("decrement_stock", {
      product_id: productId,
      qty,
    })

    if (stockError) {
      throw stockError
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" })
  }

  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
      return res.status(500).json({ error: "Supabase não configurado" })
    }

    if (!process.env.MP_TOKEN) {
      return res.status(500).json({ error: "MP_TOKEN não configurado" })
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    )

    const paymentId = getPaymentId(req)
    const notificationType = getNotificationType(req)

    console.log("WEBHOOK RECEBIDO:", {
      type: notificationType,
      paymentId,
      body: req.body,
      query: req.query,
    })

    if (!paymentId) {
      return res.status(200).json({ ok: true, ignored: "missing_payment_id" })
    }

    if (
      notificationType &&
      notificationType !== "payment" &&
      notificationType !== "merchant_order"
    ) {
      return res.status(200).json({ ok: true, ignored: "unsupported_type" })
    }

    const payment = await fetchPayment(paymentId)

    console.log("STATUS PAGAMENTO:", payment.status)

    const external_reference = cleanString(payment.external_reference)

    if (!external_reference) {
      return res.status(200).json({ ok: true, ignored: "missing_external_reference" })
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, status, mp_payment_id, external_reference")
      .eq("external_reference", external_reference)
      .single()

    if (orderError || !order) {
      console.error("ERRO AO LOCALIZAR PEDIDO:", orderError)
      return res.status(200).json({ ok: true, ignored: "order_not_found" })
    }

    const paymentStatus = cleanString(payment.status, "pending")
    const wasAlreadyApproved = order.status === "approved"
    const isNowApproved = paymentStatus === "approved"

    const { error: updateError } = await supabase
      .from("orders")
      .update({
        status: paymentStatus,
        mp_payment_id: payment.id,
      })
      .eq("id", order.id)

    if (updateError) {
      console.error("ERRO UPDATE:", updateError)
      return res.status(500).json({ error: "Erro ao atualizar pedido" })
    }

    if (isNowApproved && !wasAlreadyApproved) {
      try {
        await decrementOrderStockOnce(supabase, order.id)
      } catch (stockError) {
        console.error("ERRO ESTOQUE:", stockError)
        return res.status(500).json({ error: "Erro ao decrementar estoque" })
      }
    }

    return res.status(200).json({
      ok: true,
      external_reference,
      status: paymentStatus,
      stock_decremented: isNowApproved && !wasAlreadyApproved,
    })
  } catch (err) {
    console.error("ERRO WEBHOOK:", err)
    return res.status(500).json({ error: "Erro webhook" })
  }
}
