import { supabaseClient } from "./supabase.js";
import { showToast, safeText, setButtonBusy, resetButtonBusy, getScopedInputValue, isValidEmail } from "./ui.js";

// =====================
// SESSÃO
// =====================

/**
 * Força logout e opcionalmente recarrega a página.
 * @param {boolean} shouldReload
 */
async function clearBrokenSession(shouldReload = false) {
  try {
    await supabaseClient.auth.signOut();
  } catch (err) {
    console.warn("Falha ao limpar sessão local:", err);
  }
  if (shouldReload) window.location.reload();
}

/**
 * Retorna o usuário autenticado da sessão atual.
 * Tenta renovar o token se a sessão estiver expirada.
 *
 * @param {{ context?: string, tryRefresh?: boolean, reloadOnFailure?: boolean }} options
 * @returns {Promise<import("@supabase/supabase-js").User|null>}
 */
export async function getSessionUser(options = {}) {
  const { context = "auth", tryRefresh = true, reloadOnFailure = false } = options;
  console.log(`[auth] getSessionUser — contexto: ${context}`);

  try {
    let { data, error } = await supabaseClient.auth.getSession();
    let session = data?.session || null;

    if (error) {
      console.warn(`[auth][${context}] getSession erro:`, error.message);
    }

    if (error || !session) {
      if (tryRefresh) {
        console.log(`[auth][${context}] sem sessão, tentando refreshSession...`);
        const refresh = await supabaseClient.auth.refreshSession();

        if (refresh.error || !refresh.data?.session) {
          const msg = refresh.error?.message || error?.message || "Sessão indisponível";
          console.warn(`[auth][${context}] refreshSession falhou:`, msg);
          if (/refresh token/i.test(msg)) await clearBrokenSession(reloadOnFailure);
          return null;
        }

        session = refresh.data.session;
        console.log(`[auth][${context}] refreshSession OK — user:`, session.user?.email);
      } else {
        console.log(`[auth][${context}] sem sessão ativa (tryRefresh=false)`);
        return null;
      }
    }

    console.log(`[auth][${context}] sessão OK — user:`, session?.user?.email);
    return session?.user || null;
  } catch (err) {
    console.error(`[auth][${context}] exceção:`, err?.message || err);
    if (/refresh token/i.test(String(err?.message || err))) {
      await clearBrokenSession(reloadOnFailure);
    }
    return null;
  }
}

// =====================
// HELPERS
// =====================

function normalizeAuthEmail(value) {
  return safeText(value).trim().toLowerCase();
}

/**
 * Retorna uma mensagem de erro legível para erros de autenticação.
 * @param {unknown} error
 * @param {"login"|"register"} mode
 * @returns {string}
 */
function getAuthMessage(error, mode = "login") {
  const rawMessage = safeText(error?.message || error, "").trim();
  const message = rawMessage.toLowerCase();

  if (!rawMessage) {
    return mode === "register"
      ? "Não foi possível criar a conta"
      : "Não foi possível entrar na conta";
  }

  if (message.includes("invalid login credentials")) return "Email ou senha inválidos";
  if (message.includes("email not confirmed")) return "Confirme seu email antes de entrar";
  if (message.includes("user already registered")) return "Este email já está cadastrado";
  if (message.includes("password should be")) return rawMessage;
  if (message.includes("unable to validate email address")) return "Digite um email válido";

  return rawMessage;
}

/**
 * Extrai os dados do formulário de cadastro pelos IDs dos inputs.
 * @returns {object}
 */
function getRegisterFormData() {
  return {
    name: document.getElementById("registerName")?.value?.trim() || "",
    email: normalizeAuthEmail(document.getElementById("registerEmail")?.value || ""),
    password: document.getElementById("registerPassword")?.value?.trim() || "",
    phone: document.getElementById("registerPhone")?.value?.trim() || "",
    zip: document.getElementById("registerZip")?.value?.trim() || "",
    street: document.getElementById("registerStreet")?.value?.trim() || "",
    number: document.getElementById("registerNumber")?.value?.trim() || "",
    complement: document.getElementById("registerComplement")?.value?.trim() || "",
    neighborhood: document.getElementById("registerNeighborhood")?.value?.trim() || "",
    city: document.getElementById("registerCity")?.value?.trim() || "",
    state: document.getElementById("registerState")?.value?.trim() || "",
    cpf: document.getElementById("registerCpf")?.value?.trim() || "",
    reference: document.getElementById("registerReference")?.value?.trim() || "",
  };
}

/**
 * Extrai endereço do user_metadata do Supabase.
 * @param {object} user
 */
export function getProfileDataFromMetadata(user) {
  const meta = user?.user_metadata || {};
  return {
    zip: meta.cep || meta.zip || "",
    street: meta.street || "",
    number: meta.number || "",
    neighborhood: meta.neighborhood || "",
    city: meta.city || "",
    state: meta.state || "",
    complement: meta.complement || "",
  };
}

/**
 * Retorna o primeiro valor preenchido entre os argumentos.
 * @param {...unknown} values
 * @returns {string}
 */
export function firstFilledValue(...values) {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

/**
 * Cria ou atualiza o perfil do usuário no banco.
 * Faz fallback para um schema mínimo se a tabela não tiver as colunas de endereço.
 * @param {object} user
 * @param {object} profileData
 */
export async function upsertProfileForUser(user, profileData = {}) {
  if (!user?.id) return;

  const fullProfile = {
    id: user.id,
    email: user.email || "",
    name:
      profileData.name ||
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      "",
    cep: profileData.zip || "",
    street: profileData.street || "",
    number: profileData.number || "",
    neighborhood: profileData.neighborhood || "",
    city: profileData.city || "",
    state: profileData.state || "",
    complement: profileData.complement || "",
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseClient.from("profiles").upsert([fullProfile]);

  if (!error) return; // Sucesso com schema completo

  // PGRST204 = coluna não encontrada na tabela. Tenta schema mínimo.
  if (error.code === "PGRST204" || error.message?.includes("Could not find")) {
    console.warn(
      "[profiles] Coluna ausente na tabela, salvando schema mínimo. Crie as colunas:\n" +
      "  cep TEXT, street TEXT, number TEXT, neighborhood TEXT, city TEXT, state TEXT, complement TEXT"
    );

    const minimalProfile = {
      id: user.id,
      email: user.email || "",
      name: fullProfile.name,
      updated_at: fullProfile.updated_at,
    };

    const { error: minError } = await supabaseClient.from("profiles").upsert([minimalProfile]);
    if (minError) throw minError;
    return;
  }

  throw error;
}

/**
 * Garante que o usuário tem um registro em `profiles`.
 * Se não existir, cria a partir do user_metadata (preenchido no cadastro).
 * Útil para usuários que confirmaram email e fazem login pela primeira vez.
 * @param {object} user
 */
export async function syncProfileFromMetadata(user) {
  if (!user?.id) return;

  try {
    const { data: existing } = await supabaseClient
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (existing) return; // Perfil já existe

    // Perfil não existe — cria a partir do user_metadata
    const meta = user.user_metadata || {};
    await upsertProfileForUser(user, {
      name: meta.full_name || meta.name || "",
      zip: meta.cep || meta.zip || "",
      street: meta.street || "",
      number: meta.number || "",
      neighborhood: meta.neighborhood || "",
      city: meta.city || "",
      state: meta.state || "",
      complement: meta.complement || "",
    });
  } catch (err) {
    console.warn("syncProfileFromMetadata falhou (não crítico):", err);
  }
}

// =====================
// AUTH ACTIONS
// =====================

/**
 * Realiza login com email e senha.
 */
export async function login() {
  const loginBox = document.getElementById("loginBox");
  const loginBtn = loginBox?.querySelector(".btn-dark");
  const email = normalizeAuthEmail(getScopedInputValue(loginBox, 'input[type="email"]'));
  const password = getScopedInputValue(loginBox, 'input[type="password"]');

  console.log('[auth] login iniciado — email:', email);

  if (!email || !password) {
    showToast("Preencha email e senha");
    return;
  }

  try {
    setButtonBusy(loginBtn, "Entrando...");

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
      console.error('[auth] login erro:', error.message, error.status);
      throw error;
    }
    if (!data?.session || !data?.user) throw new Error("Sessão não iniciada");

    console.log('[auth] login OK — user:', data.user.email, '| id:', data.user.id);

    // Garante que o perfil existe no banco (para quem confirmou email depois do cadastro)
    await syncProfileFromMetadata(data.user);

    document.getElementById("authModal")?.classList.remove("active");
    document.body.style.overflow = "";
    showToast("Login realizado com sucesso");
    window.location.reload();
  } catch (err) {
    console.error('[auth] login exceção:', err?.message || err);
    showToast(getAuthMessage(err, "login"));
  } finally {
    resetButtonBusy(loginBtn);
  }
}

/**
 * Cria uma nova conta e faz login automaticamente.
 */
export async function register() {
  const registerBox = document.getElementById("registerBox");
  const registerBtn = registerBox?.querySelector(".btn-dark");
  const formData = getRegisterFormData();
  const { name, email, password } = formData;

  if (!name || !email || !password) {
    showToast("Preencha nome, email e senha");
    return;
  }

  if (!isValidEmail(email)) {
    showToast("Digite um email válido");
    return;
  }

  try {
    setButtonBusy(registerBtn, "Criando...");

    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          full_name: name,
          phone: formData.phone,
          cep: formData.zip,
          street: formData.street,
          number: formData.number,
          complement: formData.complement,
          neighborhood: formData.neighborhood,
          city: formData.city,
          state: formData.state,
          cpf: formData.cpf,
          reference: formData.reference,
        },
      },
    });

    if (error) throw error;
    if (!data?.user) throw new Error("Não foi possível criar o usuário");

    if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error("Este email já está cadastrado");
    }

    if (data.session) {
      await upsertProfileForUser(data.user, formData);
      await loadUserUI(data.user);
      document.getElementById("authModal")?.classList.remove("active");
      document.body.style.overflow = "";
      showToast("Conta criada e login realizado");
      return;
    }

    showToast("Conta criada. Confirme seu email antes de entrar");
  } catch (err) {
    showToast(getAuthMessage(err, "register"));
  } finally {
    resetButtonBusy(registerBtn);
  }
}

/**
 * Inicia login com Google via OAuth.
 */
export async function loginWithGoogle() {
  const googleBtn = document.querySelector("#registerBox .btn-ghost");

  try {
    setButtonBusy(googleBtn, "Conectando...");

    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/" },
    });

    if (error) throw error;
  } catch (err) {
    showToast("Erro no login Google");
  } finally {
    resetButtonBusy(googleBtn);
  }
}

/**
 * Faz logout do usuário.
 */
export async function logout() {
  console.log('[auth] logout iniciado');
  try {
    await supabaseClient.auth.signOut();
    console.log('[auth] logout OK — sessão encerrada');
  } catch (err) {
    console.warn('[auth] erro ao fazer signOut:', err?.message || err);
  }
  // Redireciona para a raiz (mostra tela de login via modal)
  window.location.href = '/';
}

// =====================
// UI DE AUTENTICAÇÃO
// =====================

/**
 * Inicializa o modal de login/cadastro.
 */
export function initAuthUI() {
  const authModal = document.getElementById("authModal");
  const loginToggle = document.getElementById("loginToggle");
  const authClose = document.getElementById("closeModal");
  const authBox = document.getElementById("authBox");
  const btnLogin = document.getElementById("btnLogin");
  const btnRegister = document.getElementById("btnRegister");
  const loginBox = document.getElementById("loginBox");
  const registerBox = document.getElementById("registerBox");

  loginToggle?.addEventListener("click", () => {
    authModal?.classList.add("active");
    document.body.style.overflow = "hidden";
  });

  authClose?.addEventListener("click", () => {
    authModal?.classList.remove("active");
    document.body.style.overflow = "";
  });

  authModal?.addEventListener("click", (e) => {
    if (authBox && !authBox.contains(e.target)) {
      authModal.classList.remove("active");
      document.body.style.overflow = "";
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && authModal?.classList.contains("active")) {
      authModal.classList.remove("active");
      document.body.style.overflow = "";
    }
  });

  btnLogin?.addEventListener("click", () => {
    btnLogin.classList.add("active");
    btnRegister?.classList.remove("active");
    loginBox?.classList.add("active");
    registerBox?.classList.remove("active");
  });

  btnRegister?.addEventListener("click", () => {
    btnRegister.classList.add("active");
    btnLogin?.classList.remove("active");
    registerBox?.classList.add("active");
    loginBox?.classList.remove("active");
  });
}

// =====================
// ESTADO DO USUÁRIO NA UI
// =====================

/**
 * Sincroniza o usuário na UI — public.users nao e gerenciada aqui.
 * O perfil do usuario e salvo em public.profiles via upsertProfileForUser.
 * Esta funcao e mantida para compatibilidade de chamadas no app.js.
 * @param {object} user
 */
export async function checkUser(user) {
  // Nao gravamos em public.users (tabela nao padrao do Supabase).
  // O perfil e sincronizado via upsertProfileForUser/syncProfileFromMetadata.
  if (!user) return;
}

/**
 * Atualiza todos os elementos de UI com os dados do usuário logado.
 * @param {object|null} user
 */
export async function loadUserUI(user) {
  if (!user) return;

  const displayName =
    user.user_metadata?.name ||
    user.user_metadata?.full_name ||
    user.email ||
    "Usuário";

  const avatarSrc =
    user.user_metadata?.avatar_url ||
    user.user_metadata?.picture ||
    "https://i.pravatar.cc/150?img=12";

  // Header
  const userArea = document.getElementById("userArea");
  const userNameHeader = document.getElementById("userNameHeader");
  const userEmailHeader = document.getElementById("userEmailHeader");
  const userAvatar = document.getElementById("userAvatar");
  const loginToggle = document.getElementById("loginToggle");

  if (loginToggle) {
    loginToggle.style.display = "none";
    loginToggle.remove();
  }
  if (userArea) userArea.style.display = "flex";
  if (userNameHeader) userNameHeader.textContent = displayName.split(" ")[0];
  if (userEmailHeader) userEmailHeader.textContent = user.email || "";
  if (userAvatar) userAvatar.src = avatarSrc;

  // Sidebar (profile.html)
  const sidebarName = document.getElementById("sidebarName");
  const sidebarEmail = document.getElementById("sidebarEmail");
  const sidebarAvatar = document.getElementById("sidebarAvatar");

  if (sidebarName) sidebarName.textContent = displayName;
  if (sidebarEmail) sidebarEmail.textContent = user.email;
  if (sidebarAvatar) sidebarAvatar.src = avatarSrc;
}

export function goProfile() {
  window.location.href = "/profile.html";
}

export function goOrders() {
  window.location.href = "/profile.html#orders";
}
