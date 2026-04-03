// =====================
// CONFIG
// =====================
const SUPABASE_URL = "https://nmosbabyarqnmihihalu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_RrPDyew7vfhihy3WvrNr6w_zZJ3kLql";

window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseClient = window.supabaseClient;

// =====================
// STATE
// =====================
const state = {
  cart: JSON.parse(localStorage.getItem("tl_cart_v1") || "[]"),
};

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

  renderCart();
  showSkeleton();
  loadProducts();
  checkUser();
});

window.addEventListener("load", async () => {
  document.body.classList.add("loaded");

  await checkUser();
  await loadUserUI();
  await updateHeaderUser();

  const { data } = await supabaseClient.auth.getSession();

  if (data?.session?.user) {
    checkUser();
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

// =====================
// HEADER / HERO
// =====================

function initHeader() {
  const header = document.querySelector(".topbar");
  const heroBg = document.getElementById("heroBg");

  window.addEventListener(
    "scroll",
    () => {
      header?.classList.toggle("scrolled", window.scrollY > 40);

      if (heroBg) {
        heroBg.style.transform = `scale(1.1) translateY(${window.scrollY * 0.25}px)`;
      }
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
                <button class="btn-dark" onclick="addToCart('${p.id}')">
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
  `;
}

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
  const overlay = document.getElementById("overlay");

  cartToggle?.addEventListener("click", () => {
    renderCart();
    openCart();
  });

  closeCartBtn?.addEventListener("click", closeCart);
  continueBtn?.addEventListener("click", closeCart);
  overlay?.addEventListener("click", closeCart);

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

// =====================
// AUTH UI BÁSICA
// =====================
function initAuthUI() {
  const authModal = document.getElementById("authModal");
  const loginToggle = document.getElementById("loginToggle");
  const authClose = document.getElementById("authClose");
  const authTabs = document.querySelectorAll(".auth-tab");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");

  loginToggle?.addEventListener("click", () => {
    authModal?.classList.add("active");
  });

  authClose?.addEventListener("click", () => {
    authModal?.classList.remove("active");
  });

  authModal?.addEventListener("click", (e) => {
    if (e.target === authModal) {
      authModal.classList.remove("active");
    }
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

    if (error) {
      console.error("Erro ao buscar usuário:", error);
      return;
    }

    if (!data?.user) return;

    const user = data.user;

    const { error: upsertError } = await supabaseClient.from("users").upsert(
      [
        {
          id: user.id,
          email: user.email,
          name: user.user_metadata?.full_name || user.user_metadata?.name || "",
          created_at: new Date().toISOString(),
        },
      ],
      { onConflict: "id" }
    );

    if (upsertError) {
      console.error("Erro ao salvar usuário:", upsertError);
    }
  } catch (err) {
    console.error("Erro inesperado em checkUser:", err);
  }
}

async function loadUserUI() {
  const { data } = await supabaseClient.auth.getUser()

  if (!data?.user) return

  const userArea = document.getElementById("userArea")
  const userName = document.getElementById("userName")
  const userEmail = document.getElementById("userEmail")

  if (userArea) userArea.style.display = "block"
  if (userName) {
    userName.innerText =
      data.user.user_metadata?.full_name || "Cliente"
  }
  if (userEmail) {
    userEmail.innerText = data.user.email
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

  try {
    const res = await fetch("/api/create-checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cart: state.cart }),
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
  }
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

  // 🔥 BUSCAR PEDIDOS
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

  // 🔥 ESCONDER FORTE (não só display)
  if (loginBtn) {
    loginBtn.style.display = "none"
    loginBtn.remove() // remove completamente
  }

  // mostrar usuário
  if (userArea) userArea.style.display = "flex"

  // nome (primeiro nome)
  if (userName) {
    const name =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      "Cliente"

    userName.innerText = name.split(" ")[0]
  }

  // avatar
  if (userAvatar) {
    userAvatar.src =
      user.user_metadata?.avatar_url ||
      "https://i.pravatar.cc/150"
  }

  // clique
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