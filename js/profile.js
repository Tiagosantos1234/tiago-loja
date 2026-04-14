import { supabaseClient } from "./supabase.js";
import { showToast, safeText, formatPrice } from "./ui.js";
import { getSessionUser, getProfileDataFromMetadata } from "./auth.js";

// =====================
// CARREGAMENTO DE PERFIL
// =====================

/**
 * Carrega os dados completos da página de perfil:
 * informações do usuário, endereço salvo e lista de pedidos.
 * Redireciona para a loja se não estiver autenticado.
 */
export async function loadProfilePage() {
  console.log('[profile] Carregando página de perfil...');
  const user = await getSessionUser({ context: "load-profile", reloadOnFailure: true });

  if (!user) {
    console.warn('[profile] Usuário não autenticado, redirecionando...');
    window.location.href = "/";
    return;
  }

  console.log('[profile] Usuário:', user.email);

  // Dados básicos do usuário
  const userName = document.getElementById("userName");
  const userEmail = document.getElementById("userEmail");
  if (userName) userName.textContent = user.user_metadata?.full_name || "Cliente";
  if (userEmail) userEmail.textContent = user.email;

  // Carrega endereço salvo no banco
  const { data: profile, error: profileError } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error('[profile] Erro ao carregar perfil do banco:', profileError.message, profileError.code);
  } else {
    console.log('[profile] Perfil carregado:', profile ? 'encontrado' : 'não existe ainda');
  }

  const metadataProfile = getProfileDataFromMetadata(user);

  const fields = [
    ["cep", profile?.cep || metadataProfile.zip],
    ["street", profile?.street || metadataProfile.street],
    ["number", profile?.number || metadataProfile.number],
    ["city", profile?.city || metadataProfile.city],
    ["state", profile?.state || metadataProfile.state],
  ];

  fields.forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.value = value || "";
  });

  // Carrega pedidos
  await loadMyOrders(user);
}

// =====================
// SALVAR PERFIL
// =====================

/**
 * Salva as alterações de endereço do usuário.
 */
export async function saveProfile() {
  const user = await getSessionUser({ context: "save-profile", reloadOnFailure: true });

  if (!user) {
    showToast("Faça login para salvar");
    return;
  }

  const profile = {
    id: user.id,
    email: user.email,
    name: user.user_metadata?.full_name || "",
    cep: document.getElementById("cep")?.value?.trim() || "",
    street: document.getElementById("street")?.value?.trim() || "",
    number: document.getElementById("number")?.value?.trim() || "",
    city: document.getElementById("city")?.value?.trim() || "",
    state: document.getElementById("state")?.value?.trim() || "",
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseClient.from("profiles").upsert([profile]);

  if (error) {
    console.error("Erro ao salvar perfil:", error);
    showToast("Erro ao salvar dados");
    return;
  }

  showToast("Dados salvos com sucesso");
}

// =====================
// PEDIDOS
// =====================

/**
 * Carrega os pedidos do usuário e renderiza.
 * @param {object} user
 */
async function loadMyOrders(user) {
  console.log('[profile] Carregando pedidos para:', user.email);
  try {
    const { data: orders, error } = await supabaseClient
      .from("orders")
      .select("*")
      .eq("customer_email", user.email)
      .order("created_at", { ascending: false });

    if (error) {
      console.error('[profile] Erro ao buscar pedidos:', error.message, error.code);
      // Se for erro de RLS, o SQL fix_rls_and_schema.sql corrige
      renderOrders([]);
      return;
    }

    console.log('[profile] Pedidos encontrados:', orders?.length || 0);
    renderOrders(sortByCreatedAtDesc(orders || []));
  } catch (err) {
    console.warn('[profile] Exceção ao carregar pedidos:', err?.message || err);
    renderOrders([]);
  }
}

function sortByCreatedAtDesc(list = []) {
  return [...list].sort((a, b) => {
    const aTime = a?.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b?.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });
}

function formatStatus(status) {
  const statusMap = {
    approved: "Pagamento aprovado",
    pending: "Aguardando pagamento",
    rejected: "Pagamento recusado",
  };
  return statusMap[status] || status;
}

function renderOrders(orders) {
  const container = document.getElementById("ordersList");
  if (!container) return;

  if (!orders.length) {
    container.innerHTML = "<p>Nenhum pedido encontrado</p>";
    return;
  }

  container.innerHTML = orders
    .map(
      (order) => `
    <div class="order-card">
      <div class="order-header">
        <strong>${order.external_reference}</strong>
        <span class="status ${order.status}">
          ${formatStatus(order.status)}
        </span>
      </div>

      <div class="order-body">
        <p>Total: ${formatPrice(order.total)}</p>
      </div>
    </div>
  `
    )
    .join("");
}

// =====================
// NAVEGAÇÃO POR TABS
// =====================

/**
 * Alterna a aba ativa na página de perfil.
 * @param {string} tab - "profile" | "address" | "orders"
 */
export function switchTab(tab) {
  document.querySelectorAll(".tab-content").forEach((el) => el.classList.remove("active"));

  const target = document.getElementById(tab);
  if (target) target.classList.add("active");

  document.querySelectorAll(".sidebar-menu button").forEach((btn) => {
    btn.classList.remove("active");
    const btnTab = btn.dataset.tab || "";
    const onclickAttr = btn.getAttribute("onclick") || "";
    if (btnTab === tab || onclickAttr.includes(`switchTab('${tab}')`)) {
      btn.classList.add("active");
    }
  });

  if (window.location.pathname.includes("profile.html")) {
    window.history.replaceState(null, "", `${window.location.pathname}#${tab}`);
  }
}

/**
 * Inicializa a lógica da página de perfil.
 */
export function initProfilePage() {
  loadProfilePage();

  const initialTab = window.location.hash.replace("#", "");
  if (initialTab) switchTab(initialTab);

  window.addEventListener("hashchange", () => {
    const nextTab = window.location.hash.replace("#", "");
    if (nextTab) switchTab(nextTab);
  });
}
