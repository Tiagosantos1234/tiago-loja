import { createClient } from "@supabase/supabase-js"

export default async function handler(req, res) {
  try {
    const body = req.body

    console.log("WEBHOOK RECEBIDO:", body)

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    )

    // pega id do pagamento
    const paymentId = body?.data?.id

    if (!paymentId) {
      return res.status(200).json({ ok: true })
    }

    // consulta pagamento no Mercado Pago
    const mpResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.MP_TOKEN}`
        }
      }
    )

    const payment = await mpResponse.json()

    console.log("STATUS PAGAMENTO:", payment.status)

    const external_reference = payment.external_reference

    if (!external_reference) {
      return res.status(200).json({ ok: true })
    }

    // atualiza pedido
    const { error } = await supabase
      .from("orders")
      .update({
        status: payment.status,
        mp_payment_id: payment.id
      })
      .eq("external_reference", external_reference)

    if (error) {
      console.error("ERRO UPDATE:", error)
    }

    return res.status(200).json({ ok: true })

  } catch (err) {
    console.error("ERRO WEBHOOK:", err)
    return res.status(500).json({ error: "Erro webhook" })
  }
}