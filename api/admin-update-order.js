import { createClient } from "@supabase/supabase-js";
import { cleanString } from "./lib/utils.js";

// ============================================================
// API ADMIN — Atualizar status de pedido e envio
// Usa service_role (ignora RLS) — acesso apenas via painel admin
// Método: POST /api/admin-update-order
// Body: { id, field, value }
//   field: "status" | "shipping_status"
//   value: string
// ============================================================

const ALLOWED_FIELDS = ["status", "shipping_status"];

const ALLOWED_STATUS = ["pending", "paid", "approved", "cancelled", "rejected"];
const ALLOWED_SHIPPING = ["created", "preparing", "shipped", "delivered"];

function isAllowedValue(field, value) {
  if (field === "status")          return ALLOWED_STATUS.includes(value);
  if (field === "shipping_status") return ALLOWED_SHIPPING.includes(value);
  return false;
}

export default async function handler(req, res) {
  // Só aceita POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  // Verificar secret do admin (header x-admin-token)
  const adminToken = cleanString(req.headers?.["x-admin-token"]);
  const expectedToken = cleanString(process.env.ADMIN_SECRET || process.env.SUPABASE_KEY);

  if (!adminToken || adminToken !== expectedToken) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  const { id, field, value } = req.body || {};

  // Validar campos
  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "ID do pedido inválido" });
  }
  if (!ALLOWED_FIELDS.includes(field)) {
    return res.status(400).json({ error: `Campo inválido: ${field}` });
  }
  if (!isAllowedValue(field, value)) {
    return res.status(400).json({ error: `Valor inválido para ${field}: ${value}` });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    return res.status(500).json({ error: "Supabase não configurado" });
  }

  // Usar service_role para ignorar RLS
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY  // service_role key — nunca expor no client
  );

  const { data, error } = await supabase
    .from("orders")
    .update({ [field]: value })
    .eq("id", id)
    .select("id, status, shipping_status");

  if (error) {
    console.error("[admin-update-order] Erro:", { error, id, field, value });
    return res.status(500).json({ error: error.message, code: error.code });
  }

  if (!data || data.length === 0) {
    return res.status(404).json({ error: "Pedido não encontrado", id });
  }

  return res.status(200).json({ ok: true, order: data[0] });
}
