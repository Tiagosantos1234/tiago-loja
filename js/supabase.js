import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

/**
 * Instância única do cliente Supabase para o frontend.
 * Importar este módulo de qualquer lugar garante o mesmo cliente.
 */
export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Verificação rápida de conectividade — detecta chave inválida ou projeto offline
// e loga um aviso acionável no console dos DevTools.
(async () => {
  try {
    const { error } = await supabaseClient.from("products").select("id").limit(1);
    if (error) {
      const isAuthError = error.code === "PGRST301" || error.message?.toLowerCase().includes("jwt") || error.status === 401 || error.status === 403;
      if (isAuthError) {
        console.error(
          "%c[RESPEITA] ❌ CHAVE SUPABASE INVÁLIDA",
          "color:#ef4444;font-weight:bold;font-size:13px",
          "\n\nA SUPABASE_ANON_KEY atual pode ser incompatível com o SDK.",
          "\nSe estiver usando o formato sb_publishable_..., verifique se o SDK é >= 2.49.0.",
          "\nSe os dados não carregarem, pegue a chave JWT clássica (eyJ...) em:",
          "\nSupabase → Project Settings → API → \"anon public\"",
          "\n\nErro original:", error.message
        );
      } else {
        console.warn("[RESPEITA] Supabase conectado, mas query retornou erro:", error.message, "| code:", error.code);
      }
    }
  } catch (err) {
    console.warn("[RESPEITA] Não foi possível verificar conectividade Supabase:", err?.message);
  }
})();
