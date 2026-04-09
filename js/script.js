// =====================
// CONFIG
// =====================
const SUPABASE_URL = "https://nmosbabyarqnmihihalu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_RrPDyew7vfhihy3WvrNr6w_zZJ3kLql";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
window.supabaseClient = supabaseClient;

function readStoredCart() {
  try {
    const raw = localStorage.getItem("tl_cart_v1");
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("Carrinho local invalido, resetando armazenamento:", err);
    localStorage.removeItem("tl_cart_v1");
    return [];
  }
}

// =====================
// STATE
// =====================
const state = {
  cart: readStoredCart(),
};

const checkoutData = {
  customer: {
    name: "",
    email: ""
  },
  shipping: {
    zip: "",
    street: "",
    number: "",
    neighborhood: "",
    city: "",
    state: "",
    complement: ""
  }
}

let checkoutStep = 1;

function firstFilledValue(...values) {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function debugCheckout(label, payload) {
  console.debug(`[CHECKOUT] ${label}`, payload);
}

function sortByCreatedAtDesc(list = []) {
  return [...list].sort((a, b) => {
    const aTime = a?.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b?.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });
}

async function clearBrokenSession(shouldReload = false) {
  try {
    await supabaseClient.auth.signOut();
  } catch (signOutError) {
    console.warn("Falha ao limpar sessao local:", signOutError);
  }

  if (shouldReload) {
    window.location.reload();
  }
}

async function getSessionUser(options = {}) {
  const {
    context = "auth",
    tryRefresh = true,
    reloadOnFailure = false,
  } = options;

  try {
    let { data, error } = await supabaseClient.auth.getSession();
    let session = data?.session || null;

    if (error || !session) {
      console.warn("Sessao invalida, tentando renovar...", {
        context,
        error: error?.message || null,
        hasSession: Boolean(session),
      });

      if (tryRefresh) {
        const refresh = await supabaseClient.auth.refreshSession();

        if (refresh.error || !refresh.data?.session) {
          const refreshMessage =
            refresh.error?.message ||
            error?.message ||
            "Sessao indisponivel";

          console.warn("Sessao perdida, forçando logout", {
            context,
            error: refreshMessage,
          });

          if (/refresh token/i.test(refreshMessage)) {
            await clearBrokenSession(reloadOnFailure);
          }

          return null;
        }

        session = refresh.data.session;
      } else {
        return null;
      }
    }

    const user = session?.user || null;

    if (!user) return null;

    console.log("SESSION:", session);
    console.log("USER:", user);

    return user;
  } catch (err) {
    console.warn("Erro ao recuperar sessao:", { context, error: err?.message || err });

    if (/refresh token/i.test(String(err?.message || err))) {
      await clearBrokenSession(reloadOnFailure);
    }

    return null;
  }
}

let products = [];
let currentCategory = "all";

function isMobileViewport() {
  return window.innerWidth <= 768;
}

// =====================
// INIT
// =====================
document.addEventListener("DOMContentLoaded", () => {
  initHeader();
  initReveal();
  initSmoothScroll();
  initCartUI();
  initFilters();
  initAuthUI();
  initNewsletter();
  renderCart();
  showSkeleton();
  loadProducts();
  checkUser();
  initUserDropdown();
  initMobileMenu();
  initCheckoutFlow();
});

function initUserDropdown() {
  const userTrigger =
    document.getElementById("userTrigger") ||
    document.getElementById("userArea");
  const dropdown = document.getElementById("userDropdown");
  const mobileMenu = document.getElementById("mobileMenu");
  const isAppPage = document.body.classList.contains("app");

  if (!userTrigger || !dropdown || userTrigger.dataset.bound === "true") return;

  userTrigger.addEventListener("click", (e) => {
    e.stopPropagation();

    if (isMobileViewport() && isAppPage) {
      dropdown.classList.remove("show");
      return;
    }

    mobileMenu?.classList.remove("active");
    dropdown.classList.toggle("show");
  });

  dropdown.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  document.addEventListener("click", () => {
    dropdown.classList.remove("show");
  });

  window.addEventListener("resize", () => {
    if (isMobileViewport()) {
      dropdown.classList.remove("show");
    }
  });

  userTrigger.dataset.bound = "true";
}

window.addEventListener("load", async () => {
  try {
    document.body.classList.add("loaded");

    await checkUser();
    await loadUserUI();
    await updateHeaderUser?.();

  } catch (err) {
    console.log("Erro ignorado:", err);
  }

});

// =====================
// HELPERS
// =====================
function formatPrice(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function safeText(value, fallback = "") {
  return value == null ? fallback : String(value);
}

function getScopedInputValue(scope, selector) {
  return scope?.querySelector(selector)?.value?.trim() || "";
}

function normalizeAuthEmail(value) {
  return safeText(value).trim().toLowerCase();
}

function getRegisterFormData() {
  const registerBox = document.getElementById("registerBox");
  const inputs = Array.from(registerBox?.querySelectorAll("input") || []);

  return {
    name: inputs[0]?.value?.trim() || "",
    email: normalizeAuthEmail(inputs[1]?.value || ""),
    password: inputs[2]?.value?.trim() || "",
    phone: inputs[3]?.value?.trim() || "",
    zip: inputs[4]?.value?.trim() || "",
    street: inputs[5]?.value?.trim() || "",
    number: inputs[6]?.value?.trim() || "",
    complement: inputs[7]?.value?.trim() || "",
    neighborhood: inputs[8]?.value?.trim() || "",
    city: inputs[9]?.value?.trim() || "",
    state: inputs[10]?.value?.trim() || "",
    cpf: inputs[11]?.value?.trim() || "",
    reference: inputs[12]?.value?.trim() || "",
  };
}

function getProfileDataFromMetadata(user) {
  const metadata = user?.user_metadata || {};

  return {
    zip: metadata.cep || metadata.zip || "",
    street: metadata.street || "",
    number: metadata.number || "",
    neighborhood: metadata.neighborhood || "",
    city: metadata.city || "",
    state: metadata.state || "",
    complement: metadata.complement || "",
  };
}

async function upsertProfileForUser(user, profileData = {}) {
  if (!user?.id) return;

  const profile = {
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

  const { error } = await supabaseClient
    .from("profiles")
    .upsert([profile]);

  if (error) throw error;
}

function getAuthMessage(error, mode = "login") {
  const rawMessage = safeText(error?.message || error, "").trim();
  const message = rawMessage.toLowerCase();

  if (!rawMessage) {
    return mode === "register"
      ? "Nao foi possivel criar a conta"
      : "Nao foi possivel entrar na conta";
  }

  if (message.includes("invalid login credentials")) {
    return "Email ou senha invalidos";
  }

  if (message.includes("email not confirmed")) {
    return "Confirme seu email antes de entrar";
  }

  if (message.includes("user already registered")) {
    return "Este email ja esta cadastrado";
  }

  if (message.includes("password should be")) {
    return rawMessage;
  }

  if (message.includes("unable to validate email address")) {
    return "Digite um email valido";
  }

  return rawMessage;
}

function setButtonBusy(button, label) {
  if (!button) return;
  button.dataset.originalText = button.dataset.originalText || button.textContent;
  button.textContent = label;
  button.disabled = true;
}

function resetButtonBusy(button) {
  if (!button) return;
  button.textContent = button.dataset.originalText || button.textContent;
  button.disabled = false;
}

function persistCart() {
  localStorage.setItem("tl_cart_v1", JSON.stringify(state.cart));
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}

function getImages(product) {
  if (!product || !product.image_url) return ["img/bg.png"];

  if (Array.isArray(product.image_url)) {
    return product.image_url.length ? product.image_url : ["img/bg.png"];
  }

  try {
    const parsed = JSON.parse(product.image_url);
    if (Array.isArray(parsed) && parsed.length) return parsed;
    return [product.image_url];
  } catch {
    return [product.image_url];
  }
}

function getProductName(product) {
  return safeText(product?.nome || product?.name, "Produto");
}

function getProductDescription(product) {
  return safeText(product?.description || product?.descricao, "");
}

function getProductPrice(product) {
  return Number(product?.price || product?.preco || 0);
}

function getProductCategory(product) {
  return safeText(product?.category, "").toLowerCase();
}

function isPositiveInteger(value) {
  const num = Number(value);
  return Number.isInteger(num) && num > 0;
}

function isValidCheckoutCart() {
  if (!Array.isArray(state.cart) || !state.cart.length) {
    showToast("Carrinho vazio");
    return false;
  }

  const hasInvalidItem = state.cart.some((item) => {
    const productId = safeText(item?.id).trim();
    return !productId || !isPositiveInteger(item?.quantity);
  });

  if (hasInvalidItem) {
    showToast("Carrinho invalido. Atualize a pagina e tente novamente.");
    return false;
  }

  return true;
}

function isValidCheckoutCustomer() {
  const name = safeText(checkoutData.customer?.name).trim();
  const email = safeText(checkoutData.customer?.email).trim();

  if (!name) {
    showToast("Digite seu nome");
    return false;
  }

  if (!email || !email.includes("@")) {
    showToast("Digite um e-mail valido");
    return false;
  }

  return true;
}

function isValidCheckoutShipping() {
  const shipping = checkoutData.shipping || {};

  if (
    !safeText(shipping.zip).trim() ||
    !safeText(shipping.street).trim() ||
    !safeText(shipping.number).trim()
  ) {
    showToast("Preencha CEP, rua e numero");
    return false;
  }

  if (!safeText(shipping.city).trim() || !safeText(shipping.state).trim()) {
    showToast("Preencha cidade e estado");
    return false;
  }

  return true;
}

// =====================
// HEADER / HERO
// =====================

function initHeader() {
  const header = document.querySelector(".topbar");
  const heroBg = document.getElementById("heroBg");

  if (!header) return;

  let lastScroll = 0;

  window.addEventListener(
    "scroll",
    () => {
      const currentScroll = window.pageYOffset;

      header.classList.toggle("scrolled", currentScroll > 40);

      if (currentScroll > lastScroll && currentScroll > 80) {
        header.classList.add("hide");
      } else {
        header.classList.remove("hide");
      }

      if (heroBg) {
        heroBg.style.transform = `scale(1.1) translateY(${currentScroll * 0.25}px)`;
      }

      lastScroll = currentScroll;
    },
    { passive: true }
  );
}

function initReveal() {
  const els = document.querySelectorAll(".reveal");
  if (!els.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
        }
      });
    },
    { threshold: 0.15 }
  );

  els.forEach((el) => observer.observe(el));
}

function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      const href = this.getAttribute("href");
      if (!href || href === "#") return;

      const target = document.querySelector(href);
      if (!target) return;

      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth" });
    });
  });
}

// =====================
// SKELETON
// =====================
function showSkeleton() {
  const grid = document.getElementById("productsGrid");
  if (!grid) return;

  grid.innerHTML = Array(4)
    .fill(null)
    .map(
      () => `
      <div class="product-slide">
        <div class="skeleton"></div>
      </div>
    `
    )
    .join("");
}

// =====================
// PRODUTOS
// =====================
async function loadProducts() {
  const grid = document.getElementById("productsGrid");

  try {
    const { data, error } = await supabaseClient.from("products").select("*");

    if (error) throw error;

    if (!data || !data.length) {
      products = [];
      if (grid) {
        grid.innerHTML = `<p style="padding:20px">Nenhum produto cadastrado</p>`;
      }
      renderFeaturedProduct();
      return;
    }

    products = data;
    renderProducts();
    renderFeaturedProduct();
  } catch (err) {
    console.error("Erro ao carregar produtos:", err);
    if (grid) {
      grid.innerHTML = `<p style="padding:20px">Erro ao carregar produtos</p>`;
    }
  }
}

function renderProducts() {
  const grid = document.getElementById("productsGrid");
  if (!grid) return;

  let filtered = products;

  if (currentCategory !== "all") {
    filtered = products.filter(
      (p) => getProductCategory(p) === currentCategory
    );
  }

  if (!filtered.length) {
    grid.innerHTML = `<p style="padding:20px">Nenhum produto encontrado</p>`;
    return;
  }

  grid.innerHTML = filtered
    .map((p) => {
      const images = getImages(p);
      const img1 = images[0] || "img/bg.png";
      const img2 = images[1] || img1;

      return `
        <div class="product-slide">
          <article class="product-card">
            <div class="product-media">
              <img src="${img1}" alt="${getProductName(p)}" class="product-img main" />
              <img src="${img2}" alt="${getProductName(p)}" class="product-img hover" />
            </div>

            <div class="product-body">
              <div class="product-topline">
                <div>
                  <h3 class="product-title">${getProductName(p)}</h3>
                  <p class="product-desc">${getProductDescription(p)}</p>
                </div>

                <div class="product-price">
                  <strong>${formatPrice(getProductPrice(p))}</strong>
                  <span>Pronto envio</span>
                </div>
              </div>

              <div class="product-actions">
                <button class="btn-dark add-to-cart" data-id="${p.id}">
  Comprar
</button>
              </div>
            </div>
          </article>
        </div>
      `;
    })
    .join("");
}

function renderFeaturedProduct() {
  const el = document.getElementById("featuredProduct");
  if (!el) return;

  if (!products.length) {
    el.innerHTML = "";
    return;
  }

  const product = products[0];
  const images = getImages(product);
  const img = images[0] || "img/bg.png";

  el.innerHTML = `
  <div class="hero-card-top">
    <small>Destaque</small>
    <div class="hero-card-price">${formatPrice(getProductPrice(product))}</div>
  </div>

  <div class="hero-card-image">
    <img src="${img}" alt="${getProductName(product)}" />
  </div>

  <h3>${getProductName(product)}</h3>
  <p>${getProductDescription(product)}</p>

  <div class="hero-mini-tags">
    <span>Premium</span>
    <span>Drop</span>
    <span>Street</span>
  </div>

  <div class="hero-card-actions">
    <button class="btn-dark featured-buy" data-id="${product.id}">
      Comprar agora
    </button>
  </div>
`;
}

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("featured-buy")) {
    const id = e.target.dataset.id;
    addToCart(id);
    showToast("Produto adicionado ao carrinho");
  }
});

function initFilters() {
  document.querySelectorAll(".chip").forEach((button) => {
    button.addEventListener("click", () => {
      document
        .querySelectorAll(".chip")
        .forEach((b) => b.classList.remove("active"));

      button.classList.add("active");
      currentCategory = safeText(button.dataset.filter, "all").toLowerCase();
      renderProducts();
    });
  });
}

window.scrollCarousel = function (direction) {
  const container = document.querySelector(".products-carousel");
  const slide = document.querySelector(".product-slide");
  if (!container || !slide) return;

  const width = slide.offsetWidth + 22;
  container.scrollBy({
    left: direction * width,
    behavior: "smooth",
  });
};

// =====================
// CARRINHO
// =====================
function openCart() {
  const cartDrawer = document.getElementById("cartDrawer");
  const overlay = document.getElementById("overlay");

  cartDrawer?.classList.add("active");
  overlay?.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeCart() {
  const cartDrawer = document.getElementById("cartDrawer");
  const overlay = document.getElementById("overlay");

  cartDrawer?.classList.remove("active");
  overlay?.classList.remove("active");
  document.body.style.overflow = "";
}

function initCartUI() {
  const cartToggle = document.getElementById("cartToggle");
  const closeCartBtn = document.getElementById("closeCart");
  const continueBtn = document.getElementById("continueBtn");
  cartToggle?.addEventListener("click", () => {
    renderCart();
    openCart();
  });

  closeCartBtn?.addEventListener("click", closeCart);
  continueBtn?.addEventListener("click", closeCart);

  const overlay = document.getElementById("overlay");
  const profileMenu = document.getElementById("profileMenu");

  if (overlay && profileMenu) {
    overlay.addEventListener("click", () => {
      profileMenu.classList.remove("active");
      overlay.classList.remove("active");
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeCart();
  });
}

function renderCart() {
  const cartItemsEl = document.getElementById("cartItems");
  const countEl = document.getElementById("cartCount");
  const subtotalEl = document.getElementById("subtotal");
  const totalEl = document.getElementById("total");

  if (!cartItemsEl) return;

  const totalItems = state.cart.reduce((acc, item) => acc + item.quantity, 0);
  const subtotal = state.cart.reduce(
    (acc, item) => acc + Number(item.price) * Number(item.quantity),
    0
  );

  if (countEl) countEl.textContent = String(totalItems);
  if (subtotalEl) subtotalEl.textContent = formatPrice(subtotal);
  if (totalEl) totalEl.textContent = formatPrice(subtotal);

  if (!state.cart.length) {
    cartItemsEl.innerHTML = `<div class="cart-empty">Seu carrinho esta vazio</div>`;
    return;
  }

  cartItemsEl.innerHTML = state.cart
    .map(
      (item) => `
      <div class="cart-item">
        <div>
          <h4>${safeText(item.name, "Produto")}</h4>
          <div class="cart-meta">${item.quantity}x &bull; ${formatPrice(item.price)}</div>

          <div class="cart-row">
            <strong>${formatPrice(Number(item.price) * Number(item.quantity))}</strong>
            <button onclick="removeFromCart('${item.id}')" class="remove-btn">
              Remover
            </button>
          </div>
        </div>
      </div>
    `
    )
    .join("");
}

window.addToCart = function (id) {
  const product = products.find((p) => String(p.id) === String(id));
  if (!product) {
    showToast("Produto nao encontrado");
    return;
  }

  const existing = state.cart.find((item) => String(item.id) === String(id));

  if (existing) {
    existing.quantity += 1;
  } else {
    state.cart.push({
      id: product.id,
      name: getProductName(product),
      price: getProductPrice(product),
      quantity: 1,
    });
  }

  persistCart();
  renderCart();
  showToast("Produto adicionado ao carrinho");
  openCart();
};

window.removeFromCart = function (id) {
  state.cart = state.cart.filter((item) => String(item.id) !== String(id));
  persistCart();
  renderCart();
  showToast("Produto removido");
};

async function openCheckoutFlow() {
  const modal = document.getElementById("checkoutModal");
  if (!modal) return;

  await hydrateCheckoutFromUser();
  debugCheckout("CHECKOUT DATA BEFORE RENDER", { ...checkoutData });
  checkoutStep = 1;
  renderCheckoutStep();
  modal.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeCheckoutFlow() {
  const modal = document.getElementById("checkoutModal");
  if (!modal) return;

  modal.classList.remove("active");
  document.body.style.overflow = "";
}

async function hydrateCheckoutFromUser() {
  try {
    const user = await getSessionUser({
      context: "checkout-hydrate",
      reloadOnFailure: false,
    });

    if (!user) {
      console.warn("SEM SESSAO ATIVA");
      return;
    }

    const metadataShipping = getProfileDataFromMetadata(user);

    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    checkoutData.customer = {
      name: firstFilledValue(
        user.user_metadata?.full_name,
        user.user_metadata?.name,
        checkoutData.customer.name
      ),
      email: firstFilledValue(user.email, checkoutData.customer.email),
    };

    checkoutData.shipping = {
      zip: firstFilledValue(profile?.cep, metadataShipping.zip, checkoutData.shipping.zip),
      street: firstFilledValue(profile?.street, metadataShipping.street, checkoutData.shipping.street),
      number: firstFilledValue(profile?.number, metadataShipping.number, checkoutData.shipping.number),
      neighborhood: firstFilledValue(profile?.neighborhood, metadataShipping.neighborhood, checkoutData.shipping.neighborhood),
      city: firstFilledValue(profile?.city, metadataShipping.city, checkoutData.shipping.city),
      state: firstFilledValue(profile?.state, metadataShipping.state, checkoutData.shipping.state),
      complement: firstFilledValue(profile?.complement, metadataShipping.complement, checkoutData.shipping.complement),
    };

    debugCheckout("HYDRATE PROFILE", {
      userId: user.id,
      profileFound: Boolean(profile),
      customer: checkoutData.customer,
      shipping: checkoutData.shipping,
    });

  } catch (err) {
    console.log("Erro ao carregar dados do usuario:", err);
  }
}

function syncCheckoutInputsFromState() {
  if (checkoutStep === 1) {
    const nameInput = document.getElementById("checkoutName");
    const emailInput = document.getElementById("checkoutEmail");

    if (nameInput) nameInput.value = safeText(checkoutData.customer.name);
    if (emailInput) emailInput.value = safeText(checkoutData.customer.email);
    return;
  }

  if (checkoutStep === 2) {
    const fieldMap = [
      ["checkoutZip", checkoutData.shipping.zip],
      ["checkoutStreet", checkoutData.shipping.street],
      ["checkoutNumber", checkoutData.shipping.number],
      ["checkoutNeighborhood", checkoutData.shipping.neighborhood],
      ["checkoutCity", checkoutData.shipping.city],
      ["checkoutState", checkoutData.shipping.state],
      ["checkoutComplement", checkoutData.shipping.complement],
    ];

    fieldMap.forEach(([id, value]) => {
      const input = document.getElementById(id);
      if (input) input.value = safeText(value);
    });

    debugCheckout("CHECKOUT STEP 2 VALUES", { ...checkoutData.shipping });
  }
}

function renderCheckoutStep() {
  const title = document.getElementById("checkoutStepTitle");
  const content = document.getElementById("checkoutStepContent");
  const prevBtn = document.getElementById("checkoutPrevBtn");
  const nextBtn = document.getElementById("checkoutNextBtn");
  const confirmBtn = document.getElementById("checkoutConfirmBtn");

  updateCheckoutProgress();

  if (!content) return;

  if (title) {
    title.textContent =
      checkoutStep === 1
        ? "Dados do cliente"
        : checkoutStep === 2
          ? "Endereco de entrega"
          : "Revisao do pedido";
  }

  if (prevBtn) prevBtn.style.display = checkoutStep === 1 ? "none" : "inline-flex";
  if (nextBtn) nextBtn.style.display = checkoutStep === 3 ? "none" : "inline-flex";
  if (confirmBtn) confirmBtn.style.display = checkoutStep === 3 ? "inline-flex" : "none";

  if (checkoutStep === 1) {
    content.innerHTML = `
      <div class="checkout-fields">
        <input id="checkoutName" type="text" placeholder="Nome completo" value="${safeText(checkoutData.customer.name)}" />
        <input id="checkoutEmail" type="email" placeholder="Seu e-mail" value="${safeText(checkoutData.customer.email)}" />
      </div>
    `;

    requestAnimationFrame(() => {
      syncCheckoutInputsFromState();
    });

    return;
  }

  if (checkoutStep === 2) {
    content.innerHTML = `
      <div class="checkout-fields">
        <input id="checkoutZip" data-field="zip" type="text" placeholder="CEP" value="${safeText(checkoutData.shipping.zip)}" />
        <input id="checkoutStreet" data-field="street" type="text" placeholder="Rua" value="${safeText(checkoutData.shipping.street)}" />
        <input id="checkoutNumber" data-field="number" type="text" placeholder="Numero" value="${safeText(checkoutData.shipping.number)}" />
        <input id="checkoutNeighborhood" data-field="neighborhood" type="text" placeholder="Bairro" value="${safeText(checkoutData.shipping.neighborhood)}" />
        <input id="checkoutCity" data-field="city" type="text" placeholder="Cidade" value="${safeText(checkoutData.shipping.city)}" />
        <input id="checkoutState" data-field="state" type="text" placeholder="Estado" value="${safeText(checkoutData.shipping.state)}" />
        <input id="checkoutComplement" type="text" placeholder="Complemento" value="${safeText(checkoutData.shipping.complement)}" />
      </div>
    `;

    requestAnimationFrame(() => {
      syncCheckoutInputsFromState();

      const cepInput = document.getElementById("checkoutZip");
      const streetInput = document.getElementById("checkoutStreet");
      const neighborhoodInput = document.getElementById("checkoutNeighborhood");
      const cityInput = document.getElementById("checkoutCity");
      const stateInput = document.getElementById("checkoutState");

      if (!cepInput || cepInput.dataset.bound === "true") return;

      cepInput.addEventListener("blur", (e) => {
        buscarCEP(e.target.value);
      });

      [streetInput, neighborhoodInput, cityInput, stateInput].forEach((input) => {
        if (input) input.disabled = true;
      });

      cepInput.dataset.bound = "true";
    });

    return;
  }

  if (checkoutStep === 3) {
    content.innerHTML = `
    <div class="checkout-step-enter">
      <div class="checkout-review">

        <div class="checkout-review-block">
          <h4>Cliente</h4>
          <p>${checkoutData.customer.name || "-"}</p>
          <p>${checkoutData.customer.email || "-"}</p>
        </div>

        <div class="checkout-review-block">
          <h4>Entrega</h4>
          <p>${checkoutData.shipping.street || ""} ${checkoutData.shipping.number || ""}</p>
          <p>${checkoutData.shipping.neighborhood || ""}</p>
          <p>${checkoutData.shipping.city || ""} - ${checkoutData.shipping.state || ""}</p>
          <p>CEP: ${checkoutData.shipping.zip || ""}</p>
        </div>

        <div class="checkout-review-block">
          <h4>Pedido</h4>
          ${state.cart.map(item => `
            <div class="checkout-review-item">
              <span>${item.name} x${item.quantity}</span>
              <strong>${formatPrice(Number(item.price) * Number(item.quantity))}</strong>
            </div>
          `).join("")}

          <div class="checkout-review-total">
            <span>Total</span>
            <strong>${formatPrice(
      state.cart.reduce((acc, item) => acc + Number(item.price) * Number(item.quantity), 0)
    )}</strong>
          </div>
        </div>

      </div>
    </div>
  `;
    return;
  }
}

function updateCheckoutProgress() {
  const progress = document.getElementById("checkoutProgress");
  const steps = document.querySelectorAll(".progress-steps .step");

  if (!progress) return;

  let width = 33;

  if (checkoutStep === 2) width = 66;
  if (checkoutStep === 3) width = 100;

  progress.style.width = width + "%";

  steps.forEach((el, i) => {
    el.classList.toggle("active", i < checkoutStep);
  });
}

function persistCheckoutStep() {
  if (checkoutStep === 1) {
    checkoutData.customer.name = document.getElementById("checkoutName")?.value.trim() || "";
    checkoutData.customer.email = document.getElementById("checkoutEmail")?.value.trim() || "";
    return;
  }

  if (checkoutStep === 2) {
    checkoutData.shipping.zip = document.getElementById("checkoutZip")?.value.trim() || "";
    checkoutData.shipping.street = document.getElementById("checkoutStreet")?.value.trim() || "";
    checkoutData.shipping.number = document.getElementById("checkoutNumber")?.value.trim() || "";
    checkoutData.shipping.neighborhood = document.getElementById("checkoutNeighborhood")?.value.trim() || "";
    checkoutData.shipping.city = document.getElementById("checkoutCity")?.value.trim() || "";
    checkoutData.shipping.state = document.getElementById("checkoutState")?.value.trim() || "";
    checkoutData.shipping.complement = document.getElementById("checkoutComplement")?.value.trim() || "";
  }
}

function validateCheckoutStep() {
  persistCheckoutStep();

  if (checkoutStep === 1) {
    if (!checkoutData.customer.name) {
      showToast("Digite seu nome");
      return false;
    }

    if (!checkoutData.customer.email || !checkoutData.customer.email.includes("@")) {
      showToast("Digite um e-mail valido");
      return false;
    }
  }

  if (checkoutStep === 2) {
    if (!checkoutData.shipping.zip || !checkoutData.shipping.street || !checkoutData.shipping.number) {
      showToast("Preencha CEP, rua e numero");
      return false;
    }

    if (!checkoutData.shipping.city || !checkoutData.shipping.state) {
      showToast("Preencha cidade e estado");
      return false;
    }
  }

  return true;
}

function nextCheckoutStep() {
  if (!validateCheckoutStep()) return;
  if (checkoutStep < 3) {
    checkoutStep += 1;
    renderCheckoutStep();
  }
}

function prevCheckoutStep() {
  persistCheckoutStep();
  if (checkoutStep > 1) {
    checkoutStep -= 1;
    renderCheckoutStep();
  }
}

function initCheckoutFlow() {
  const closeBtn = document.getElementById("closeCheckoutModal");
  const prevBtn = document.getElementById("checkoutPrevBtn");
  const nextBtn = document.getElementById("checkoutNextBtn");
  const confirmBtn = document.getElementById("checkoutConfirmBtn");
  const modal = document.getElementById("checkoutModal");
  const box = document.getElementById("checkoutBox");

  closeBtn?.addEventListener("click", closeCheckoutFlow);
  prevBtn?.addEventListener("click", prevCheckoutStep);
  nextBtn?.addEventListener("click", nextCheckoutStep);
  confirmBtn?.addEventListener("click", confirmCheckout);

  if (modal && box) {
    modal.addEventListener("click", (e) => {
      if (!box.contains(e.target)) closeCheckoutFlow();
    });
  }
}

async function confirmCheckout() {
  persistCheckoutStep();

  const btn = document.getElementById("checkoutConfirmBtn");
  if (!btn) return;

  btn.classList.add("loading");
  btn.innerText = "Processando...";
  btn.disabled = true;

  if (!isValidCheckoutCart() || !isValidCheckoutCustomer() || !isValidCheckoutShipping()) {
    btn.classList.remove("loading");
    btn.innerText = "Ir para pagamento";
    btn.disabled = false;
    return;
  }

  btn.innerText = "Processando...";
  btn.disabled = true;

  try {
    await saveCheckoutProfile();

    const requestBody = {
      cart: state.cart,
      customer: checkoutData.customer,
      shipping: checkoutData.shipping,
    };

    debugCheckout("REQUEST BODY TO CHECKOUT API", requestBody);

    const res = await fetch("/api/create-checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Erro na API de checkout");
    }

    const data = await res.json();

    if (!data.init_point) {
      throw new Error("Pagamento nao gerado");
    }

    window.location.href = data.init_point;
  } catch (err) {
    console.error("Erro checkout:", err);
    showToast("Erro ao iniciar pagamento");
  } finally {
    btn.classList.remove("loading");
    btn.innerText = "Ir para pagamento";
    btn.disabled = false;
  }
}


// =====================
// AUTH UI BASICA
// =====================
function initAuthUI() {
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
// NEWSLETTER
// =====================
function initNewsletter() {
  const form = document.getElementById("newsletterForm");
  const emailInput = document.getElementById("newsletterEmail");

  if (!form || !emailInput) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();

    if (!email || !email.includes("@")) {
      showToast("Digite um e-mail valido");
      return;
    }

    try {
      const { error } = await supabaseClient
        .from("leads")
        .upsert(
          [{ email, created_at: new Date().toISOString() }],
          { onConflict: "email" }
        );

      if (error) throw error;

      form.reset();
      showToast("E-mail cadastrado com sucesso");
    } catch (err) {
      console.error("Erro ao salvar lead:", err);
      showToast("Erro ao salvar e-mail");
    }
  });
}

async function checkUser() {
  try {
    const user = await getSessionUser({
      context: "check-user",
      reloadOnFailure: false,
    });

    if (!user) return;

    await supabaseClient.from("users").upsert(
      [
        {
          id: user.id,
          email: user.email,
          name:
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            "",
          created_at: new Date().toISOString(),
        },
      ],
      { onConflict: "id" }
    );

  } catch (err) {
    console.log("Usuario nao logado (normal)");
  }
}

async function loadUserUI() {
  try {
    const user = await getSessionUser({
      context: "load-user-ui",
      reloadOnFailure: false,
    });

    if (!user) return;

    // ===== HEADER =====
    const userArea = document.getElementById("userArea");
    const userNameHeader = document.getElementById("userNameHeader");
    const userEmailHeader = document.getElementById("userEmailHeader");
    const userAvatar = document.getElementById("userAvatar");

    if (userArea) userArea.style.display = "flex";

    if (userNameHeader) {
      userNameHeader.textContent =
        user.user_metadata?.name ||
        user.user_metadata?.full_name ||
        user.email ||
        "Usuario";
    }

    if (userEmailHeader) {
      userEmailHeader.textContent = user.email || "";
    }

    if (userAvatar) {
      userAvatar.src =
        user.user_metadata?.avatar_url ||
        user.user_metadata?.picture ||
        "https://i.pravatar.cc/150?img=12";
    }

    // ===== SIDEBAR (NOVO LAYOUT) =====
    const sidebarName = document.getElementById("sidebarName");
    const sidebarEmail = document.getElementById("sidebarEmail");
    const sidebarAvatar = document.getElementById("sidebarAvatar");

    if (sidebarName) {
      sidebarName.textContent =
        user.user_metadata?.name ||
        user.user_metadata?.full_name ||
        user.email;
    }

    if (sidebarEmail) {
      sidebarEmail.textContent = user.email;
    }

    if (sidebarAvatar) {
      sidebarAvatar.src =
        user.user_metadata?.avatar_url ||
        user.user_metadata?.picture ||
        "https://i.pravatar.cc/150?img=12";
    }

  } catch (err) {
    console.log("Erro ao carregar usuario:", err);
  }
}

async function logout() {
  await supabaseClient.auth.signOut()
  location.reload()
}


// =====================
// CHECKOUT MERCADO PAGO
// =====================
window.startCheckout = async function () {
  if (!state.cart.length) {
    showToast("Carrinho vazio");
    return;
  }

  openCheckoutFlow();
};


window.loginWithGoogle = async function () {
  const googleBtn = document.querySelector("#registerBox .btn-ghost");

  try {
    setButtonBusy(googleBtn, "Conectando...");

    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin + "/"
      }
    });

    if (error) throw error;

  } catch (err) {
    console.error("Erro no login Google:", err);
    showToast("Erro no login Google");
  } finally {
    resetButtonBusy(googleBtn);
  }
};

window.login = async function () {
  const loginBox = document.getElementById("loginBox");
  const loginBtn = loginBox?.querySelector(".btn-dark");
  const email = normalizeAuthEmail(getScopedInputValue(loginBox, 'input[type="email"]'));
  const password = getScopedInputValue(loginBox, 'input[type="password"]');

  if (!email || !password) {
    showToast("Preencha email e senha");
    return;
  }

  try {
    setButtonBusy(loginBtn, "Entrando...");

    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    if (!data?.session || !data?.user) {
      throw new Error("Sessao nao iniciada")
    }

    document.getElementById("authModal")?.classList.remove("active");
    document.body.style.overflow = "";
    showToast("Login realizado com sucesso");
    window.location.reload();
  } catch (err) {
    console.error("Erro no login:", err);
    showToast(getAuthMessage(err, "login"));
  } finally {
    resetButtonBusy(loginBtn);
  }
};

window.register = async function () {
  const registerBox = document.getElementById("registerBox");
  const registerBtn = registerBox?.querySelector(".btn-dark");
  const formData = getRegisterFormData();
  const { name, email, password } = formData;

  if (!name || !email || !password) {
    showToast("Preencha nome, email e senha");
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
    if (!data?.user) {
      throw new Error("Nao foi possivel criar o usuario")
    }

    if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error("Este email ja esta cadastrado")
    }

    if (data.session) {
      await upsertProfileForUser(data.user, formData);
      await loadUserUI();
      await updateHeaderUser();

      document.getElementById("authModal")?.classList.remove("active");
      document.body.style.overflow = "";
      showToast("Conta criada e login realizado");
      return;
    }

    showToast("Conta criada. Confirme seu email antes de entrar");
  } catch (err) {
    console.error("Erro no cadastro:", err);
    showToast(getAuthMessage(err, "register"));
  } finally {
    resetButtonBusy(registerBtn);
  }
};

async function loadProfile() {
  const user = await getSessionUser({
    context: "load-profile",
    reloadOnFailure: true,
  })

  if (!user) {
    window.location.href = "/"
    return
  }

  const userName = document.getElementById("userName")
  const userEmail = document.getElementById("userEmail")

  if (userName) {
    userName.innerText = user.user_metadata?.full_name || "Cliente"
  }

  if (userEmail) {
    userEmail.innerText = user.email
  }
}

async function saveProfile() {
  const user = await getSessionUser({
    context: "save-profile",
    reloadOnFailure: true,
  })

  if (!user) {
    alert("Faca login");
    return;
  }

  const profile = {
    id: user.id,
    email: user.email,
    name: user.user_metadata?.full_name || "",
    cep: document.getElementById("cep").value,
    street: document.getElementById("street").value,
    number: document.getElementById("number").value,
    city: document.getElementById("city").value,
    state: document.getElementById("state").value,
    updated_at: new Date().toISOString()
  }

  const { error } = await supabaseClient
    .from("profiles")
    .upsert([profile])

  if (error) {
    console.error(error)
    alert("Erro ao salvar")
    return
  }

  alert("Salvo com sucesso")
}

async function loadProfileData() {
  const user = await getSessionUser({
    context: "load-profile-data",
    reloadOnFailure: true,
  })

  if (!user) return

  const userName = document.getElementById("userName")
  const userEmail = document.getElementById("userEmail")

  if (userName) {
    userName.innerText = user.user_metadata?.full_name || "Cliente"
  }

  if (userEmail) {
    userEmail.innerText = user.email
  }

  const { data: profile, error: profileError } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle()

  if (profileError) {
    console.error("Erro ao carregar perfil:", profileError)
    return
  }

  const metadataProfile = getProfileDataFromMetadata(user)

  const cep = document.getElementById("cep")
  const street = document.getElementById("street")
  const number = document.getElementById("number")
  const city = document.getElementById("city")
  const stateInput = document.getElementById("state")

  if (cep) cep.value = profile?.cep || metadataProfile.zip || ""
  if (street) street.value = profile?.street || metadataProfile.street || ""
  if (number) number.value = profile?.number || metadataProfile.number || ""
  if (city) city.value = profile?.city || metadataProfile.city || ""
  if (stateInput) stateInput.value = profile?.state || metadataProfile.state || ""
}

async function updateHeaderUser() {
  const user = await getSessionUser({
    context: "update-header-user",
    reloadOnFailure: false,
  })

  if (!user) return

  const loginBtn = document.getElementById("loginToggle")
  const userArea = document.getElementById("userArea")
  const userName = document.getElementById("userNameHeader")
  const userAvatar = document.getElementById("userAvatar")

  if (loginBtn) {
    loginBtn.style.display = "none"
    loginBtn.remove()
  }

  if (userArea) userArea.style.display = "flex"

  if (userName) {
    const name =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      "Cliente"

    userName.innerText = name.split(" ")[0]
  }

  if (userAvatar) {
    userAvatar.src =
      user.user_metadata?.avatar_url ||
      "https://i.pravatar.cc/150"
  }
}

function goProfile() {
  window.location.href = "/profile.html"
}

function goOrders() {
  window.location.href = "/profile.html#orders"
}

document.querySelectorAll(".profile-item").forEach(item => {
  item.addEventListener("mousemove", (e) => {
    const rect = item.getBoundingClientRect()
    const x = e.clientX - rect.left - rect.width / 2
    const y = e.clientY - rect.top - rect.height / 2

    item.style.transform = `translate(${x * 0.15}px, ${y * 0.15}px)`
  })

  item.addEventListener("mouseleave", () => {
    item.style.transform = "translate(0,0)"
  })
})
const profileMenu = document.getElementById("profileMenu");
const profileBtn = document.getElementById("profileBtn");
const profileOverlay = document.getElementById("overlay");

if (profileBtn && profileMenu && profileOverlay) {

  profileBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    profileMenu.classList.toggle("active");
    profileOverlay.classList.toggle("active");
  });

  profileOverlay.addEventListener("click", () => {
    profileMenu.classList.remove("active");
    profileOverlay.classList.remove("active");
  });

}

function initMobileMenu() {
  const menu = document.getElementById("mobileMenu");
  const menuBtn = document.getElementById("menuBtn");
  const closeBtn = document.getElementById("closeMenu");
  const backdrop = document.getElementById("mobileMenuBackdrop");
  const links = document.querySelectorAll(".mobile-nav a");
  const menuInner = menu?.querySelector(".mobile-menu-inner");
  const menuContent = menu?.querySelector(".mobile-menu-content");
  const dropdown = document.getElementById("userDropdown");
  const menuPanel = menuInner || menuContent;

  if (!menu || !menuBtn || menuBtn.dataset.mobileMenuBound === "true") return;

  function openMenu() {
    dropdown?.classList.remove("show");
    menu.classList.add("active");
    menuBtn.classList.add("active");
    document.body.classList.add("menu-open");
    document.body.style.overflow = "hidden";
  }

  function closeMenu() {
    menu.classList.remove("active");
    menuBtn.classList.remove("active");
    document.body.classList.remove("menu-open");
    document.body.style.overflow = "";
  }

  menuBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isMobileViewport()) {
      return;
    }

    menu.classList.contains("active") ? closeMenu() : openMenu();
  });

  closeBtn?.addEventListener("click", closeMenu);
  backdrop?.addEventListener("click", closeMenu);

  links.forEach(link => {
    link.addEventListener("click", closeMenu);
  });

  menuPanel?.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  menuContent?.querySelectorAll("button, a").forEach((item) => {
    item.addEventListener("click", () => {
      closeMenu();
    });
  });

  document.addEventListener("click", (e) => {
    if (!menu.classList.contains("active")) return;
    if (menuBtn.contains(e.target)) return;
    if (menuPanel?.contains(e.target)) return;
    closeMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  window.addEventListener("resize", () => {
    if (!isMobileViewport()) {
      closeMenu();
    }
  });

  menuBtn.dataset.mobileMenuBound = "true";
}

function animateToCart(imgElement) {
  const cartBtn = document.getElementById("cartToggle");

  if (!imgElement || !cartBtn) return;

  const imgRect = imgElement.getBoundingClientRect();
  const cartRect = cartBtn.getBoundingClientRect();

  const clone = imgElement.cloneNode(true);

  clone.classList.add("fly-image");

  clone.style.top = imgRect.top + "px";
  clone.style.left = imgRect.left + "px";
  clone.style.width = imgRect.width + "px";
  clone.style.height = imgRect.height + "px";

  document.body.appendChild(clone);

  requestAnimationFrame(() => {
    clone.style.top = cartRect.top + "px";
    clone.style.left = cartRect.left + "px";
    clone.style.width = "20px";
    clone.style.height = "20px";
    clone.style.opacity = "0.5";
  });

  setTimeout(() => {
    clone.remove();
  }, 700);
}

document.addEventListener("click", function (e) {
  const btn = e.target.closest(".add-to-cart");
  if (!btn) return;

  const id = btn.dataset.id;

  const card = btn.closest(".product-card");
  const img = card?.querySelector(".product-img");

  if (img) {
    animateToCart(img);
  }

  addToCart(id);
});

async function saveCheckoutProfile() {
  try {
    const user = await getSessionUser({
      context: "save-checkout-profile",
      reloadOnFailure: false,
    });

    if (!user) return;

    const profile = {
      id: user.id,
      email: user.email,
      name: checkoutData.customer.name,
      cep: checkoutData.shipping.zip,
      street: checkoutData.shipping.street,
      number: checkoutData.shipping.number,
      neighborhood: checkoutData.shipping.neighborhood,
      city: checkoutData.shipping.city,
      state: checkoutData.shipping.state,
      complement: checkoutData.shipping.complement,
      updated_at: new Date().toISOString()
    };

    await supabaseClient
      .from("profiles")
      .upsert([profile]);

  } catch (err) {
    console.log("Erro ao salvar perfil:", err);
  }
}

if (window.location.pathname.includes("sucesso.html")) {
  localStorage.removeItem("tl_cart_v1");
}

async function buscarCEP(cep) {
  try {
    cep = cep.replace(/\D/g, "");

    if (cep.length !== 8) return;

    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await res.json();

    if (data.erro) return;

    const streetInput = document.querySelector('input[data-field="street"]');
    const neighborhoodInput = document.querySelector('input[data-field="neighborhood"]');
    const cityInput = document.querySelector('input[data-field="city"]');
    const stateInput = document.querySelector('input[data-field="state"]');

    if (streetInput) streetInput.value = data.logradouro || "";
    if (neighborhoodInput) neighborhoodInput.value = data.bairro || "";
    if (cityInput) cityInput.value = data.localidade || "";
    if (stateInput) stateInput.value = data.uf || "";

    // salva no checkoutData tambem
    checkoutData.shipping.street = data.logradouro || "";
    checkoutData.shipping.neighborhood = data.bairro || "";
    checkoutData.shipping.city = data.localidade || "";
    checkoutData.shipping.state = data.uf || "";

  } catch (err) {
    console.log("Erro ao buscar CEP:", err);
  }
}

async function loadMyOrders() {
  try {
    const user = await getSessionUser({
      context: "load-my-orders",
      reloadOnFailure: true,
    });

    if (!user) return;

    const { data: orders } = await supabaseClient
      .from("orders")
      .select("*")
      .eq("customer_email", user.email);

    renderOrders(sortByCreatedAtDesc(orders || []));

  } catch (err) {
    console.log("Erro ao carregar pedidos:", err);
  }
}

function renderOrders(orders) {
  const container = document.getElementById("ordersList");
  if (!container) return;

  if (!orders.length) {
    container.innerHTML = "<p>Nenhum pedido encontrado</p>";
    return;
  }

  container.innerHTML = orders.map(order => `
    <div class="order-card">
      <div class="order-header">
        <strong>${order.external_reference}</strong>
        <span class="status ${order.status}">
          ${formatStatus(order.status)}
        </span>
      </div>

      <div class="order-body">
        <p>Total: R$ ${order.total}</p>
      </div>
    </div>
  `).join("");
}

function formatStatus(status) {
  if (status === "approved") return "Pagamento aprovado";
  if (status === "pending") return "Aguardando pagamento";
  if (status === "rejected") return "Pagamento recusado";
  return status;
}

function switchTab(tab) {
  document.querySelectorAll(".tab-content").forEach(el => {
    el.classList.remove("active");
  });

  const target = document.getElementById(tab);
  if (target) target.classList.add("active");

  document.querySelectorAll(".sidebar-menu button").forEach(btn => {
    btn.classList.remove("active");
  });

  document.querySelectorAll(".sidebar-menu button").forEach(btn => {
    const buttonTab = btn.dataset.tab || "";
    const clickHandler = btn.getAttribute("onclick") || "";
    if (buttonTab === tab || clickHandler.includes(`switchTab('${tab}')`)) {
      btn.classList.add("active");
    }
  });

  if (window.location.pathname.includes("profile.html")) {
    const nextUrl = `${window.location.pathname}#${tab}`;
    window.history.replaceState(null, "", nextUrl);
  }
}

if (window.location.pathname.includes("profile.html")) {
  loadProfile();
  loadProfileData();
  loadMyOrders();

  const initialTab = window.location.hash.replace("#", "");
  if (initialTab) {
    switchTab(initialTab);
  }

  window.addEventListener("hashchange", () => {
    const nextTab = window.location.hash.replace("#", "");
    if (nextTab) {
      switchTab(nextTab);
    }
  });
}
