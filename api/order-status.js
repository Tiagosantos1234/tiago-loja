import { createClient } from "@supabase/supabase-js";
import { cleanString } from "./lib/utils.js";

// ============================================================
// GET /api/order-status?ref=PED-xxx
//
// Endpoint seguro para consultar status de pedido na página
// de sucesso — sem expor PII e sem depender de sessão do cliente.
//
// ✅ Usa service_role no servidor (nunca exposto ao cliente)
// ✅ Valida formato do external_reference antes de consultar
// ✅ Devolve apenas campos não-sensíveis: status, total, external_reference
// ✅ Funciona mesmo sem sessão ativa (redirect MP quebra sessão no iOS/Safari)
// ============================================================

// Formato esperado: "PED-" seguido de dígitos ou alfanumérico sem espaços
// Exemplos válidos: PED-1745268000000, PED-A3F2C1B0
const VALID_REF_PATTERN = /^PED-[A-Z0-9_-]{4,64}$/i;

export default async function handler(req, res) {
  // Só aceita GET
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const ref = cleanString(req.query?.ref);

  // 1. Valida presença
  if (!ref) {
    return res.status(400).json({ error: "Parâmetro ref ausente" });
  }

  // 2. Valida formato — evita queries com strings arbitrárias no banco
  if (!VALID_REF_PATTERN.test(ref)) {
    return res.status(400).json({ error: "Formato de referência inválido" });
  }

  // 3. Valida variáveis de ambiente
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.error("[order-status] Supabase não configurado");
    return res.status(500).json({ error: "Configuração do servidor incompleta" });
  }

  // 4. Consulta com service_role no servidor — sem depender de RLS do cliente
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY // service_role — nunca exposta no frontend
  );

  const { data: order, error } = await supabase
    .from("orders")
    .select("external_reference, status, total") // ← apenas campos não-sensíveis
    .eq("external_reference", ref)
    .maybeSingle();

  if (error) {
    console.error("[order-status] Erro ao consultar pedido:", error.message, error.code);
    return res.status(500).json({ error: "Erro ao consultar pedido" });
  }

  if (!order) {
    // Retorna 404 sem revelar se o ref existe ou não (evita enumeration)
    return res.status(404).json({ error: "Pedido não encontrado" });
  }

  // 5. Devolve apenas o mínimo necessário para a página de sucesso
  return res.status(200).json({
    external_reference: order.external_reference,
    status: order.status,
    total: order.total,
  });
}
