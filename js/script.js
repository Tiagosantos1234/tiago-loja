// =====================
// CONFIG
// =====================
const SUPABASE_URL = "https://nmosbabyarqnmihihalu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_RrPDyew7vfhihy3WvrNr6w_zZJ3kLql";

window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseClient = window.supabaseClient;

function readStoredCart() {
  try {
    const raw = localStorage.getItem("tl_cart_v1");
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("Carrinho local inválido, resetando armazenamento:", err);
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


let products = [];
let currentCategory = "all";

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

  initUserDropdown();

  renderCart();
  showSkeleton();
  loadProducts();
  checkUser();
  initMobileMenu();
  initCheckoutFlow();

});

function initUserDropdown() {
  const userArea = document.getElementById("userArea");
  const dropdown = document.getElementById("userDropdown");

  if (!userArea || !dropdown) return;

  userArea.addEventListener("click", (e) => {
    e.stopPropagation();

    dropdown.classList.toggle("active");

    if (dropdown.classList.contains("active")) {
      dropdown.style.willChange = "transform, opacity";
    }
  });

  // clicar fora fecha
  document.addEventListener("click", () => {
    dropdown.classList.remove("active");
  });
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
    showToast("Carrinho inválido. Atualize a página e tente novamente.");
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
    showToast("Digite um e-mail válido");
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
    showToast("Preencha CEP, rua e número");
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
    cartItemsEl.innerHTML = `<div class="cart-empty">Seu carrinho está vazio</div>`;
    return;
  }

  cartItemsEl.innerHTML = state.cart
    .map(
      (item) => `
      <div class="cart-item">
        <div>
          <h4>${safeText(item.name, "Produto")}</h4>
          <div class="cart-meta">${item.quantity}x • ${formatPrice(item.price)}</div>

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
    showToast("Produto não encontrado");
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
    const { data } = await supabaseClient.auth.getUser();

    if (!data?.user) return;

    const user = data.user;

    checkoutData.customer.name =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      checkoutData.customer.name ||
      "";

    checkoutData.customer.email =
      user.email ||
      checkoutData.customer.email ||
      "";

    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profile) {
      checkoutData.shipping = {
        zip: profile.cep || "",
        street: profile.street || "",
        number: profile.number || "",
        neighborhood: profile.neighborhood || "",
        city: profile.city || "",
        state: profile.state || "",
        complement: profile.complement || "",
      };
    }

  } catch (err) {
    console.log("Erro ao carregar dados do usuário:", err);
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
          ? "Endereço de entrega"
          : "Revisão do pedido";
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
    return;
  }

  if (checkoutStep === 2) {
    content.innerHTML = `
      <div class="checkout-fields">
        <input id="checkoutZip" type="text" placeholder="CEP" value="${safeText(checkoutData.shipping.zip)}" />
        <input id="checkoutStreet" type="text" placeholder="Rua" value="${safeText(checkoutData.shipping.street)}" />
        <input id="checkoutNumber" type="text" placeholder="Número" value="${safeText(checkoutData.shipping.number)}" />
        <input id="checkoutNeighborhood" type="text" placeholder="Bairro" value="${safeText(checkoutData.shipping.neighborhood)}" />
        <input id="checkoutCity" type="text" placeholder="Cidade" value="${safeText(checkoutData.shipping.city)}" />
        <input id="checkoutState" type="text" placeholder="Estado" value="${safeText(checkoutData.shipping.state)}" />
        <input id="checkoutComplement" type="text" placeholder="Complemento" value="${safeText(checkoutData.shipping.complement)}" />
      </div>
    `;
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
      showToast("Digite um e-mail válido");
      return false;
    }
  }

  if (checkoutStep === 2) {
    if (!checkoutData.shipping.zip || !checkoutData.shipping.street || !checkoutData.shipping.number) {
      showToast("Preencha CEP, rua e número");
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

  if (!isValidCheckoutCart() || !isValidCheckoutCustomer() || !isValidCheckoutShipping()) {
    btn.innerText = "Ir para pagamento";
    btn.disabled = false;
    return;
  }

  btn.innerText = "Processando...";
  btn.disabled = true;

  try {
    await saveCheckoutProfile();

    const res = await fetch("/api/create-checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cart: state.cart,
        customer: checkoutData.customer,
        shipping: checkoutData.shipping,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Erro na API de checkout");
    }

    const data = await res.json();

    if (!data.init_point) {
      throw new Error("Pagamento não gerado");
    }

    window.location.href = data.init_point;
  } catch (err) {
    console.error("Erro checkout:", err);
    showToast("Erro ao iniciar pagamento");
  } finally {
    btn.innerText = "Ir para pagamento";
    btn.disabled = false;
  }
}


// =====================
// AUTH UI BÁSICA
// =====================
function initAuthUI() {
  const authModal = document.getElementById("authModal");
  const loginToggle = document.getElementById("loginToggle");
  const authClose = document.getElementById("closeModal");
  const authTabs = document.querySelectorAll(".auth-tab");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");

  loginToggle?.addEventListener("click", () => {
    authModal?.classList.add("active");
  });

  authClose?.addEventListener("click", () => {
    authModal?.classList.remove("active");
  });

  authTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      authTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      const mode = tab.dataset.authTab;

      if (mode === "login") {
        loginForm?.classList.add("active");
        registerForm?.classList.remove("active");
      } else {
        registerForm?.classList.add("active");
        loginForm?.classList.remove("active");
      }
    });
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
      showToast("Digite um e-mail válido");
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
      showToast("E-mail cadastrado 🔥");
    } catch (err) {
      console.error("Erro ao salvar lead:", err);
      showToast("Erro ao salvar e-mail");
    }
  });
}

async function checkUser() {
  try {
    const { data, error } = await supabaseClient.auth.getUser();

    if (error || !data?.user) return;

    const user = data.user;

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
    console.log("Usuário não logado (normal)");
  }
}

async function loadUserUI() {
  try {
    const { data } = await supabaseClient.auth.getUser();

    if (!data?.user) return;

    const userArea = document.getElementById("userArea");
    const userName = document.getElementById("userName");
    const userEmail = document.getElementById("userEmail");

    if (userArea) userArea.style.display = "block";
    if (userName) {
      userName.innerText =
        data.user.user_metadata?.full_name || "Cliente";
    }
    if (userEmail) {
      userEmail.innerText = data.user.email;
    }

  } catch (err) {
    console.log("Sem usuário logado");
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
  try {
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
  }
};

async function loadProfile() {
  const { data } = await supabaseClient.auth.getUser()

  if (!data?.user) {
    window.location.href = "/"
    return
  }

  const user = data.user

  document.getElementById("userName").innerText =
    user.user_metadata?.full_name || "Cliente"

  document.getElementById("userEmail").innerText =
    user.email

  const { data: orders } = await supabaseClient
    .from("orders")
    .select("*")
    .eq("customer_email", user.email)
    .order("created_at", { ascending: false })

  const container = document.getElementById("ordersList")

  if (!orders || orders.length === 0) {
    container.innerHTML = "<p>Nenhum pedido ainda</p>"
    return
  }

  container.innerHTML = orders.map(order => `
    <div class="order-card">
      <h3>Pedido #${order.external_reference}</h3>
      <p>Status: ${order.status}</p>
      <p>Total: R$ ${order.total}</p>
    </div>
  `).join("")
}

if (window.location.pathname.includes("profile")) {
  loadProfile()
}

document.addEventListener("DOMContentLoaded", () => {

  const btnLogin = document.getElementById("btnLogin");
  const btnRegister = document.getElementById("btnRegister");

  const loginBox = document.getElementById("loginBox");
  const registerBox = document.getElementById("registerBox");

  if (btnLogin && btnRegister && loginBox && registerBox) {

    btnLogin.onclick = () => {
      btnLogin.classList.add("active");
      btnRegister.classList.remove("active");

      loginBox.classList.add("active");
      registerBox.classList.remove("active");
    };

    btnRegister.onclick = () => {
      btnRegister.classList.add("active");
      btnLogin.classList.remove("active");

      registerBox.classList.add("active");
      loginBox.classList.remove("active");
    };

  }

});

async function saveProfile() {
  const { data } = await supabaseClient.auth.getUser()

  if (!data?.user) {
    alert("Faça login");
    return;
  }

  const user = data.user

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

  alert("Salvo com sucesso 🔥")
}

async function loadProfileData() {
  const { data } = await supabaseClient.auth.getUser()

  if (!data?.user) return

  const user = data.user

  document.getElementById("userName").innerText =
    user.user_metadata?.full_name || "Cliente"

  document.getElementById("userEmail").innerText =
    user.email

  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single()

  if (!profile) return

  document.getElementById("cep").value = profile.cep || ""
  document.getElementById("street").value = profile.street || ""
  document.getElementById("number").value = profile.number || ""
  document.getElementById("city").value = profile.city || ""
  document.getElementById("state").value = profile.state || ""
}

if (window.location.pathname.includes("profile")) {
  loadProfile()
  loadProfileData()
}

document.addEventListener("DOMContentLoaded", () => {

  const tabs = document.querySelectorAll(".tab");
  const contents = document.querySelectorAll(".tab-content");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {

      tabs.forEach(t => t.classList.remove("active"));
      contents.forEach(c => c.classList.remove("active"));

      tab.classList.add("active");

      const target = document.getElementById(tab.dataset.tab);
      if (target) target.classList.add("active");

    });
  });

});

async function updateHeaderUser() {
  const { data } = await supabaseClient.auth.getUser()

  if (!data?.user) return

  const user = data.user

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

  if (userArea) {
    userArea.onclick = (e) => {
      toggleDropdown(e)
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  updateHeaderUser()
})

function toggleDropdown(e) {
  e.stopPropagation()

  const dropdown = document.getElementById("userDropdown")

  if (!dropdown) return

  const isOpen = dropdown.style.display === "flex"

  dropdown.style.display = isOpen ? "none" : "flex"
}

document.addEventListener("click", () => {
  const dropdown = document.getElementById("userDropdown")
  if (dropdown) dropdown.style.display = "none"
})

function goProfile() {
  window.location.href = "/profile.html"
}

function goOrders() {
  window.location.href = "/profile.html#orders"
}

document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("authModal");
  const closeBtn = document.getElementById("closeModal");
  const authBox = document.getElementById("authBox");

  if (modal) {
    modal.classList.remove("active");
    modal.style.display = "";
  }

  if (closeBtn && modal) {
    closeBtn.onclick = () => {
      modal.classList.remove("active");
      document.body.style.overflow = "";
    };
  }

  if (modal && authBox) {
    modal.onclick = (e) => {
      if (!authBox.contains(e.target)) {
        modal.classList.remove("active");
        document.body.style.overflow = "";
      }
    };
  }
});

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

  if (!menu || !menuBtn) return;

  function openMenu() {
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

  menuBtn.addEventListener("click", () => {
    menu.classList.contains("active") ? closeMenu() : openMenu();
  });

  closeBtn?.addEventListener("click", closeMenu);
  backdrop?.addEventListener("click", closeMenu);

  links.forEach(link => {
    link.addEventListener("click", closeMenu);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });
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
    const { data } = await supabaseClient.auth.getUser();

    if (!data?.user) return;

    const user = data.user;

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