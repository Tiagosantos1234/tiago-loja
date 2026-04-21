/**
 * Configurações públicas do frontend.
 *
 * Estas chaves são PÚBLICAS e seguras para expor no cliente:
 * - SUPABASE_URL: apenas o endpoint do projeto
 * - SUPABASE_ANON_KEY: chave com permissões limitadas pelas regras RLS do Supabase
 *
 * Nunca coloque aqui a Service Role Key ou tokens do Mercado Pago.
 *
 * ⚠️ ATENÇÃO — FORMATO DA CHAVE:
 * Se a SUPABASE_ANON_KEY usar o formato novo `sb_publishable_...`,
 * certifique-se de que o SDK no importmap seja >= 2.49.0.
 * Caso os produtos/pedidos não carreguem, troque pela chave JWT clássica
 * (começa com eyJ...) em: Supabase → Project Settings → API → "anon public (JWT)"
 */
export const SUPABASE_URL = "https://nmosbabyarqnmihihalu.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_RrPDyew7vfhihy3WvrNr6w_zZJ3kLql";
