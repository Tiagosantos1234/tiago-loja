import { createClient } from "@supabase/supabase-js"

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" })
  }

  try {
    const { cart } = req.body

    // =====================
    // VALIDAÇÃO
    // =====================
    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: "Carrinho vazio" })
    }

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

    // =====================
    // TOTAL
    // =====================
    const total = cart.reduce((sum, item) => {
      return sum + Number(item.price) * Number(item.quantity)
    }, 0)

    const external_reference = "PED-" + Date.now()

    // =====================
    // SALVA PEDIDO
    // =====================
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert([{
        external_reference,
        customer_name: "Cliente Site",
        customer_email: "cliente@email.com",
        total,
        status: "pending"
      }])
      .select()
      .single()

    if (orderError || !order) {
      console.error("ERRO ORDER:", orderError)
      return res.status(500).json({
        error: "Erro ao salvar pedido",
        details: orderError?.message || orderError
      })
    }

    // =====================
    // SALVA ITENS
    // =====================
    const itemsToInsert = cart.map(item => ({
      order_id: order.id,
      product_id: item.id,
      product_name: item.name || item.nome || "Produto",
      product_price: Number(item.price),
      quantity: Number(item.quantity),
      image_url: null
    }))

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(itemsToInsert)

    if (itemsError) {
      console.error("ERRO ITEMS:", itemsError)
      return res.status(500).json({
        error: "Erro ao salvar itens",
        details: itemsError.message || itemsError
      })
    }

    // =====================
    // ESTOQUE (SEGURANÇA)
    // =====================
    for (const item of cart) {
      try {
        const { error: stockError } = await supabase.rpc("decrement_stock", {
          product_id: item.id,
          qty: item.quantity
        })

        if (stockError) {
          console.error("Erro estoque:", stockError)
        }

      } catch (err) {
        console.error("Erro crítico estoque:", err)
      }
    }

    // =====================
    // MERCADO PAGO
    // =====================
    const mpResponse = await fetch(
      "https://api.mercadopago.com/checkout/preferences",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.MP_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          items: cart.map(item => ({
            title: item.name || item.nome || "Produto",
            quantity: Number(item.quantity),
            currency_id: "BRL",
            unit_price: Number(item.price)
          })),
          external_reference,
          back_urls: {
            success: "https://tiago-loja.vercel.app/sucesso.html",
            failure: "https://tiago-loja.vercel.app/erro.html",
            pending: "https://tiago-loja.vercel.app/"
          },
          auto_return: "approved"
        })
      }
    )

    // =====================
    // VALIDA RESPOSTA MP
    // =====================
    if (!mpResponse.ok) {
      const errorText = await mpResponse.text()
      console.error("MP ERROR RAW:", errorText)

      return res.status(500).json({
        error: "Erro Mercado Pago",
        details: errorText
      })
    }

    const mpData = await mpResponse.json()

    console.log("MP RESPONSE:", mpData)

    if (!mpData.init_point) {
      return res.status(500).json({
        error: "Mercado Pago não retornou link",
        details: mpData
      })
    }

    // =====================
    // FINAL
    // =====================
    return res.status(200).json({
      init_point: mpData.init_point
    })

  } catch (err) {
    console.error("ERRO GERAL:", err)

    return res.status(500).json({
      error: "Erro interno",
      details: err.message
    })
  }
}