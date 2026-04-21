/**
 * product-page.js
 * Lógica completa da página de produto individual.
 * Gerencia: carregamento, galeria, cor, tamanho, quantidade, carrinho, relacionados.
 */

import { supabaseClient } from "./supabase.js";
import { getSessionUser, checkUser, loadUserUI, login, register, logout, loginWithGoogle, goProfile, goOrders, initAuthUI, syncProfileFromMetadata } from "./auth.js";
import {
  cartState,
  renderCart,
  initCartUI,
  removeFromCart,
  openCart,
  closeCart,
  addToCart,
  increaseCartItemQuantity,
  decreaseCartItemQuantity,
  persistCart,
} from "./cart.js";
import { openCheckoutFlow, initCheckoutFlow } from "./checkout.js";
import { formatPrice, safeText, showToast } from "./ui.js";

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
window.__removeFromCart = (variantKey) => removeFromCart(decodeURIComponent(variantKey));
window.__cartIncQty = (variantKey) => increaseCartItemQuantity(decodeURIComponent(variantKey));
window.__cartDecQty = (variantKey) => decreaseCartItemQuantity(decodeURIComponent(variantKey));

// =====================
// ESTADO LOCAL
// =====================
let currentProduct = null;
let allProducts = [];
let selectedColor = null;
let selectedSize = null;
let quantity = 1;

// Configurações de variações (customizáveis por produto — poderá vir do banco futuramente)
const DEFAULT_COLORS = [
  { label: "Preto", value: "Preto", hex: "#111111" },
  { label: "Branco", value: "Branco", hex: "#F5F2EB" },
  { label: "Areia", value: "Areia", hex: "#C4A882" },
  { label: "Cinza", value: "Cinza", hex: "#8A8A8A" },
];

const DEFAULT_SIZES = ["PP", "P", "M", "G", "GG", "XGG"];

// =====================
// HELPERS
// =====================

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function getImages(product) {
  if (!product || !product.image_url) return ["img/bg.png"];
  if (Array.isArray(product.image_url)) return product.image_url.length ? product.image_url : ["img/bg.png"];
  try {
    const parsed = JSON.parse(product.image_url);
    if (Array.isArray(parsed) && parsed.length) return parsed;
    return [product.image_url];
  } catch {
    return [product.image_url];
  }
}

function getProductName(p) { return safeText(p?.nome || p?.name, "Produto"); }
function getProductPrice(p) { return Number(p?.price || p?.preco || 0); }
function getProductDesc(p) { return safeText(p?.description || p?.descricao, ""); }
function getProductCategory(p) { return safeText(p?.category, "").toLowerCase(); }

// =====================
// CARREGAR PRODUTO
// =====================

async function loadProduct() {
  const id = getParam("id");
  if (!id) {
    showError();
    return;
  }

  try {
    // P1 FIX: busca apenas o produto pelo ID em vez de select("*") sem filtro
    const { data: product, error } = await supabaseClient
      .from("products")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;

    if (!product) {
      showError();
      return;
    }

    currentProduct = product;
    renderProduct(currentProduct);

    // Relacionados carregados em paralelo — não bloqueia o render do produto principal
    supabaseClient
      .from("products")
      .select("*")
      .neq("id", id)
      .limit(8)
      .then(({ data }) => {
        allProducts = data || [];
        renderRelated(currentProduct);
      })
      .catch((err) => console.warn("[product-page] Erro ao carregar relacionados:", err?.message));

  } catch (err) {
    console.error("Erro ao carregar produto:", err);
    showError();
  }
}

// =====================
// RENDERIZAR PRODUTO
// =====================

function renderProduct(product) {
  // Atualiza título da página e breadcrumb
  const name = getProductName(product);
  document.title = `${name} — RESPEITA`;

  const bcName = document.getElementById("bcProductName");
  if (bcName) bcName.textContent = name;

  // Nome, preço, kicker
  const nameEl = document.getElementById("productPageName");
  const priceEl = document.getElementById("productPagePrice");
  const kickerEl = document.getElementById("productKicker");
  const shortDescEl = document.getElementById("productShortDesc");
  const fullDescEl = document.getElementById("productFullDesc");

  if (nameEl) nameEl.textContent = name;
  if (priceEl) priceEl.textContent = formatPrice(getProductPrice(product));
  if (kickerEl) kickerEl.textContent = getProductCategory(product) ? getProductCategory(product).charAt(0).toUpperCase() + getProductCategory(product).slice(1) : "Coleção RESPEITA";

  const desc = getProductDesc(product);
  if (shortDescEl) shortDescEl.textContent = desc || "Peça premium com acabamento high-end e design autoral da RESPEITA.";
  if (fullDescEl) fullDescEl.textContent = desc || "Peça desenvolvida com materiais selecionados para garantir conforto, durabilidade e estilo. Cada detalhe foi pensado para valorizar quem veste, unindo qualidade premium com identidade visual forte da marca RESPEITA.";

  // Galeria
  const images = getImages(product);
  renderGallery(images);

  // Variações — usa dados do produto se existirem, senão usa defaults
  const colors = Array.isArray(product.colors) && product.colors.length
    ? product.colors.map((c) => typeof c === "string" ? { label: c, value: c, hex: "#888" } : c)
    : DEFAULT_COLORS;

  const sizes = Array.isArray(product.sizes) && product.sizes.length
    ? product.sizes
    : DEFAULT_SIZES;

  renderColors(colors);
  renderSizes(sizes);

  // Mostra layout, esconde loading
  const loadingEl = document.getElementById("productLoading");
  const layoutEl = document.getElementById("productLayout");
  if (loadingEl) loadingEl.style.display = "none";
  if (layoutEl) layoutEl.style.display = "";

  initProductActions();
  initTabs();
}

// =====================
// GALERIA
// =====================

function renderGallery(images) {
  const mainImg = document.getElementById("galleryMainImg");
  const thumbsEl = document.getElementById("galleryThumbs");

  if (mainImg) {
    mainImg.src = images[0];
    mainImg.alt = currentProduct ? getProductName(currentProduct) : "Produto";
  }

  if (thumbsEl) {
    thumbsEl.innerHTML = images.map((src, i) => `
      <button
        class="gallery-thumb ${i === 0 ? "active" : ""}"
        data-src="${src}"
        data-index="${i}"
        type="button"
        aria-label="Imagem ${i + 1}"
      >
        <img src="${src}" alt="Imagem ${i + 1}" loading="lazy" />
      </button>
    `).join("");

    thumbsEl.querySelectorAll(".gallery-thumb").forEach((btn) => {
      btn.addEventListener("click", () => {
        const src = btn.dataset.src;
        if (mainImg) {
          mainImg.style.opacity = "0";
          setTimeout(() => {
            mainImg.src = src;
            mainImg.style.opacity = "1";
          }, 150);
        }
        thumbsEl.querySelectorAll(".gallery-thumb").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      });
    });
  }

  // Zoom
  const zoomBtn = document.getElementById("galleryZoomBtn");
  const zoomModal = document.getElementById("galleryZoomModal");
  const zoomImg = document.getElementById("zoomImg");
  const zoomClose = document.getElementById("zoomClose");
  const zoomBackdrop = document.getElementById("zoomBackdrop");

  zoomBtn?.addEventListener("click", () => {
    if (mainImg && zoomImg) zoomImg.src = mainImg.src;
    zoomModal?.classList.add("active");
    document.body.style.overflow = "hidden";
  });

  const closeZoom = () => {
    zoomModal?.classList.remove("active");
    document.body.style.overflow = "";
  };

  zoomClose?.addEventListener("click", closeZoom);
  zoomBackdrop?.addEventListener("click", closeZoom);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeZoom(); });
}

// =====================
// CORES
// =====================

function renderColors(colors) {
  const colorGroup = document.getElementById("colorGroup");
  const swatchesEl = document.getElementById("colorSwatches");
  const colorSelected = document.getElementById("colorSelected");

  if (!swatchesEl) return;

  if (!colors || !colors.length) {
    if (colorGroup) colorGroup.style.display = "none";
    return;
  }

  swatchesEl.innerHTML = colors.map((c) => `
    <button
      class="color-swatch"
      data-color="${c.value}"
      data-label="${c.label}"
      title="${c.label}"
      type="button"
      style="background-color: ${c.hex || "#888"}; border-color: ${c.hex || "#888"};"
      aria-label="Cor ${c.label}"
    >
      <span class="color-swatch-check">✓</span>
    </button>
  `).join("");

  swatchesEl.querySelectorAll(".color-swatch").forEach((btn) => {
    btn.addEventListener("click", () => {
      swatchesEl.querySelectorAll(".color-swatch").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedColor = btn.dataset.color;
      if (colorSelected) colorSelected.textContent = btn.dataset.label;
    });
  });
}

// =====================
// TAMANHOS
// =====================

function renderSizes(sizes) {
  const sizeGroup = document.getElementById("sizeGroup");
  const sizeGrid = document.getElementById("sizeGrid");
  const sizeSelected = document.getElementById("sizeSelected");

  if (!sizeGrid) return;

  if (!sizes || !sizes.length) {
    if (sizeGroup) sizeGroup.style.display = "none";
    return;
  }

  sizeGrid.innerHTML = sizes.map((s) => `
    <button
      class="size-btn"
      data-size="${s}"
      type="button"
      aria-label="Tamanho ${s}"
    >${s}</button>
  `).join("");

  sizeGrid.querySelectorAll(".size-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      sizeGrid.querySelectorAll(".size-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedSize = btn.dataset.size;
      if (sizeSelected) sizeSelected.textContent = selectedSize;
    });
  });
}

// =====================
// QUANTIDADE
// =====================

function updateQtyDisplay() {
  const display = document.getElementById("qtyDisplay");
  if (display) display.textContent = String(quantity);
}

// =====================
// AÇÕES DO PRODUTO
// =====================

function initProductActions() {
  // Quantidade
  document.getElementById("qtyInc")?.addEventListener("click", () => {
    quantity = Math.min(99, quantity + 1);
    updateQtyDisplay();
  });

  document.getElementById("qtyDec")?.addEventListener("click", () => {
    quantity = Math.max(1, quantity - 1);
    updateQtyDisplay();
  });

  // Adicionar ao carrinho
  document.getElementById("btnAddToCart")?.addEventListener("click", () => {
    if (!validateVariants()) return;

    const image = document.getElementById("galleryMainImg")?.src || null;

    addToCart(currentProduct.id, [currentProduct], {
      color: selectedColor,
      size: selectedSize,
      quantity,
      image,
    });
  });

  // Comprar agora
  document.getElementById("btnBuyNow")?.addEventListener("click", () => {
    if (!validateVariants()) return;

    const image = document.getElementById("galleryMainImg")?.src || null;

    addToCart(currentProduct.id, [currentProduct], {
      color: selectedColor,
      size: selectedSize,
      quantity,
      image,
    });

    setTimeout(() => {
      closeCart();
      openCheckoutFlow();
    }, 600);
  });
}

function validateVariants() {
  const colorGroup = document.getElementById("colorGroup");
  const sizeGroup = document.getElementById("sizeGroup");
  const colorVisible = colorGroup && colorGroup.style.display !== "none";
  const sizeVisible = sizeGroup && sizeGroup.style.display !== "none";

  if (colorVisible && !selectedColor) {
    showToast("⚠️ Selecione uma cor");
    document.getElementById("colorGroup")?.classList.add("shake");
    setTimeout(() => document.getElementById("colorGroup")?.classList.remove("shake"), 500);
    return false;
  }

  if (sizeVisible && !selectedSize) {
    showToast("⚠️ Selecione um tamanho");
    document.getElementById("sizeGroup")?.classList.add("shake");
    setTimeout(() => document.getElementById("sizeGroup")?.classList.remove("shake"), 500);
    return false;
  }

  return true;
}

// =====================
// TABS
// =====================

function initTabs() {
  const tabs = document.querySelectorAll(".ptab");
  const contents = document.querySelectorAll(".ptab-content");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      contents.forEach((c) => c.classList.remove("active"));

      tab.classList.add("active");
      const target = document.getElementById(`tab-${tab.dataset.tab}`);
      if (target) target.classList.add("active");
    });
  });
}

// =====================
// PRODUTOS RELACIONADOS
// =====================

function renderRelated(product) {
  const section = document.getElementById("relatedSection");
  const grid = document.getElementById("relatedGrid");
  if (!section || !grid || !allProducts.length) return;

  const cat = getProductCategory(product);
  const related = allProducts
    .filter((p) => String(p.id) !== String(product.id) && (cat ? getProductCategory(p) === cat : true))
    .slice(0, 4);

  if (!related.length) return;

  section.style.display = "";
  grid.innerHTML = related.map((p) => {
    const images = getImages(p);
    const img = images[0] || "img/bg.png";
    return `
      <article class="related-card" onclick="window.location.href='produto.html?id=${p.id}'">
        <div class="related-media">
          <img src="${img}" alt="${getProductName(p)}" loading="lazy" />
        </div>
        <div class="related-body">
          <h4>${getProductName(p)}</h4>
          <div class="related-price">${formatPrice(getProductPrice(p))}</div>
          <a href="produto.html?id=${p.id}" class="related-cta">Ver produto</a>
        </div>
      </article>
    `;
  }).join("");
}

// =====================
// ERRO
// =====================

function showError() {
  const loadingEl = document.getElementById("productLoading");
  const errorEl = document.getElementById("productError");
  if (loadingEl) loadingEl.style.display = "none";
  if (errorEl) errorEl.style.display = "";
}

// =====================
// HEADER SCROLL
// =====================

function initHeaderScroll() {
  const header = document.querySelector(".topbar");
  if (!header) return;

  let lastScroll = 0;
  window.addEventListener("scroll", () => {
    const curr = window.pageYOffset;
    header.classList.toggle("scrolled", curr > 40);
    header.classList.toggle("hide", curr > lastScroll && curr > 80);
    lastScroll = curr;
  }, { passive: true });
}

// =====================
// DROPDOWN DO USUÁRIO
// =====================

function initUserDropdown() {
  const userTrigger = document.getElementById("userTrigger") || document.getElementById("userArea");
  const dropdown = document.getElementById("userDropdown");
  if (!userTrigger || !dropdown || userTrigger.dataset.bound === "true") return;

  userTrigger.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("show");
  });
  dropdown.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", () => dropdown.classList.remove("show"));
  userTrigger.dataset.bound = "true";
}

// =====================
// MOBILE MENU
// =====================

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
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
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

  await loadProduct();
});

window.addEventListener("load", async () => {
  try {
    document.body.classList.add("loaded");
    const user = await getSessionUser({ context: "product-page", reloadOnFailure: false });
    if (user) {
      await checkUser(user);
      await loadUserUI(user);
      await syncProfileFromMetadata(user);
      initUserDropdown();
    }
  } catch (_) {}
});
