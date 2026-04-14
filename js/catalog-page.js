/**
 * catalog-page.js
 * Lógica da página de listagem completa de produtos (produtos.html).
 */

import { supabaseClient } from "./supabase.js";
import { getSessionUser, checkUser, loadUserUI, login, register, logout, loginWithGoogle, goProfile, goOrders, initAuthUI, syncProfileFromMetadata } from "./auth.js";
import { cartState, renderCart, initCartUI, removeFromCart, openCart, closeCart, increaseCartItemQuantity, decreaseCartItemQuantity } from "./cart.js";
import { openCheckoutFlow, initCheckoutFlow } from "./checkout.js";
import { buildProductCard, getProductName, getProductPrice, getProductCategory } from "./products.js";
import { safeText, formatPrice, showToast } from "./ui.js";

// =====================
// FUNÇÕES GLOBAIS
// =====================
window.login = login;
window.register = register;
window.logout = logout;
window.loginWithGoogle = loginWithGoogle;
window.goProfile = goProfile;
window.goOrders = goOrders;
window.startCheckout = () => {
  if (!cartState.cart.length) { showToast("Carrinho vazio"); return; }
  openCheckoutFlow();
};
window.__removeFromCart = (k) => removeFromCart(decodeURIComponent(k));
window.__cartIncQty  = (k) => increaseCartItemQuantity(decodeURIComponent(k));
window.__cartDecQty  = (k) => decreaseCartItemQuantity(decodeURIComponent(k));

// =====================
// ESTADO
// =====================
let allProducts = [];
let activeCategory = "all";
let activeSize = "all";
let activeSort = "default";
let viewMode = "grid"; // "grid" | "list"

// =====================
// CARREGAR
// =====================
async function loadCatalog() {
  try {
    const { data, error } = await supabaseClient.from("products").select("*");
    if (error) throw error;
    allProducts = data || [];
    updateCount();
    renderCatalog();
  } catch (err) {
    console.error("Erro ao carregar catálogo:", err);
    const grid = document.getElementById("catalogGrid");
    if (grid) grid.innerHTML = `<p style="padding:20px;color:var(--muted);grid-column:1/-1">Erro ao carregar produtos.</p>`;
  }
}

// =====================
// FILTRAR + ORDENAR
// =====================
function getFiltered() {
  let list = [...allProducts];

  // Categoria
  if (activeCategory !== "all") {
    list = list.filter(p => getProductCategory(p) === activeCategory);
  }

  // Tamanho — filtra produtos que têm esse tamanho nos dados do banco
  // (funciona se sizes for array, ou aceita todos se não tiver dados)
  if (activeSize !== "all") {
    list = list.filter(p => {
      if (!p.sizes) return true; // sem dado de tamanho → mostra sempre
      if (Array.isArray(p.sizes)) return p.sizes.includes(activeSize);
      return true;
    });
  }

  // Ordenar
  switch (activeSort) {
    case "price-asc":
      list.sort((a, b) => getProductPrice(a) - getProductPrice(b));
      break;
    case "price-desc":
      list.sort((a, b) => getProductPrice(b) - getProductPrice(a));
      break;
    case "name-az":
      list.sort((a, b) => getProductName(a).localeCompare(getProductName(b)));
      break;
    default:
      break;
  }

  return list;
}

// =====================
// RENDERIZAR CATÁLOGO
// =====================
function renderCatalog() {
  const grid = document.getElementById("catalogGrid");
  const empty = document.getElementById("catalogEmpty");
  const label = document.getElementById("catalogResultLabel");

  if (!grid) return;

  const filtered = getFiltered();

  if (!filtered.length) {
    grid.innerHTML = "";
    if (empty) empty.style.display = "";
    if (label) label.textContent = "0 produtos encontrados";
    return;
  }

  if (empty) empty.style.display = "none";
  if (label) label.textContent = `${filtered.length} produto${filtered.length !== 1 ? "s" : ""}`;

  // Passa full=true para remover o wrapper .product-slide
  grid.innerHTML = filtered.map(p => buildProductCard(p, true)).join("");

  // Aplica classe de view mode
  grid.className = `catalog-grid catalog-grid--${viewMode}`;
}

function updateCount() {
  const el = document.getElementById("productCount");
  if (el) el.textContent = allProducts.length;
}

// =====================
// FILTROS
// =====================
function initCatalogFilters() {
  // Categoria
  document.querySelectorAll("[data-filter='category']").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-filter='category']").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeCategory = btn.dataset.value;
      renderCatalog();
    });
  });

  // Tamanho
  document.querySelectorAll(".filter-size-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-size-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeSize = btn.dataset.value;
      renderCatalog();
    });
  });

  // Ordenação
  document.querySelectorAll("[data-sort]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-sort]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeSort = btn.dataset.sort;
      renderCatalog();
    });
  });

  // Limpar filtros
  document.getElementById("clearFilters")?.addEventListener("click", () => {
    activeCategory = "all";
    activeSize = "all";
    activeSort = "default";
    document.querySelectorAll("[data-filter='category']").forEach(b => b.classList.remove("active"));
    document.querySelector("[data-filter='category'][data-value='all']")?.classList.add("active");
    document.querySelectorAll(".filter-size-btn").forEach(b => b.classList.remove("active"));
    document.querySelector(".filter-size-btn[data-value='all']")?.classList.add("active");
    document.querySelectorAll("[data-sort]").forEach(b => b.classList.remove("active"));
    document.querySelector("[data-sort='default']")?.classList.add("active");
    renderCatalog();
  });

  // View toggle
  document.getElementById("viewGrid")?.addEventListener("click", () => {
    viewMode = "grid";
    document.getElementById("viewGrid")?.classList.add("active");
    document.getElementById("viewList")?.classList.remove("active");
    renderCatalog();
  });

  document.getElementById("viewList")?.addEventListener("click", () => {
    viewMode = "list";
    document.getElementById("viewList")?.classList.add("active");
    document.getElementById("viewGrid")?.classList.remove("active");
    renderCatalog();
  });

  // Mobile sidebar accordion
  const toggle = document.getElementById("sidebarToggle");
  const filters = document.getElementById("sidebarFilters");
  const icon = document.getElementById("sidebarToggleIcon");

  toggle?.addEventListener("click", () => {
    const isOpen = filters?.classList.toggle("open");
    if (icon) icon.style.transform = isOpen ? "rotate(180deg)" : "";
  });
}

// =====================
// HEADER SCROLL
// =====================
function initHeaderScroll() {
  const header = document.querySelector(".topbar");
  if (!header) return;
  let last = 0;
  window.addEventListener("scroll", () => {
    const curr = window.pageYOffset;
    header.classList.toggle("scrolled", curr > 40);
    header.classList.toggle("hide", curr > last && curr > 80);
    last = curr;
  }, { passive: true });
}

function initUserDropdown() {
  const userTrigger = document.getElementById("userTrigger") || document.getElementById("userArea");
  const dropdown = document.getElementById("userDropdown");
  if (!userTrigger || !dropdown || userTrigger.dataset.bound === "true") return;
  userTrigger.addEventListener("click", e => { e.stopPropagation(); dropdown.classList.toggle("show"); });
  dropdown.addEventListener("click", e => e.stopPropagation());
  document.addEventListener("click", () => dropdown.classList.remove("show"));
  userTrigger.dataset.bound = "true";
}

function initMobileMenu() {
  const menu = document.getElementById("mobileMenu");
  const menuBtn = document.getElementById("menuBtn");
  const closeBtn = document.getElementById("closeMenu");
  const backdrop = document.getElementById("mobileMenuBackdrop");
  if (!menu || !menuBtn || menuBtn.dataset.mobileMenuBound === "true") return;
  const open = () => { menu.classList.add("active"); document.body.style.overflow = "hidden"; };
  const close = () => { menu.classList.remove("active"); document.body.style.overflow = ""; };
  menuBtn.addEventListener("click", () => menu.classList.contains("active") ? close() : open());
  closeBtn?.addEventListener("click", close);
  backdrop?.addEventListener("click", close);
  document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
  menuBtn.dataset.mobileMenuBound = "true";
}

// =====================
// INICIALIZAÇÃO
// =====================
document.addEventListener("DOMContentLoaded", async () => {
  initHeaderScroll();
  initCartUI();
  renderCart();
  initAuthUI();
  initCheckoutFlow();
  initUserDropdown();
  initMobileMenu();
  initCatalogFilters();
  await loadCatalog();
});

window.addEventListener("load", async () => {
  try {
    document.body.classList.add("loaded");
    const user = await getSessionUser({ context: "catalog", reloadOnFailure: false });
    if (user) {
      await checkUser(user);
      await loadUserUI(user);
      await syncProfileFromMetadata(user);
      initUserDropdown();
    }
  } catch (_) {}
});
