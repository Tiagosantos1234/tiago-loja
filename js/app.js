/**
 * app.js — Orquestrador principal da aplicação.
 *
 * Responsável por:
 * - Inicializar todos os módulos
 * - Expor funções globais necessárias para atributos onclick no HTML
 * - Executar lógica específica por página
 */

import { getSessionUser, checkUser, loadUserUI, login, register, logout, loginWithGoogle, goProfile, goOrders, initAuthUI, syncProfileFromMetadata } from "./auth.js";
import { cartState, renderCart, initCartUI, removeFromCart, openCart } from "./cart.js";
import { products, loadProducts, renderProducts, initFilters, scrollCarousel, renderFeaturedProduct, getImages, getProductName } from "./products.js";
import { addToCart } from "./cart.js";
import { openCheckoutFlow, initCheckoutFlow } from "./checkout.js";
import { initProfilePage, saveProfile, switchTab } from "./profile.js";
import { showToast, showSkeleton, animateToCart } from "./ui.js";

// =====================
// FUNÇÕES GLOBAIS (chamadas por onclick no HTML)
// =====================
window.login = login;
window.register = register;
window.logout = logout;
window.loginWithGoogle = loginWithGoogle;
window.goProfile = goProfile;
window.goOrders = goOrders;
window.saveProfile = saveProfile;
window.switchTab = switchTab;
window.startCheckout = () => {
  if (!cartState.cart.length) {
    showToast("Carrinho vazio");
    return;
  }
  openCheckoutFlow();
};
window.scrollCarousel = scrollCarousel;

// removeFromCart é chamado dinamicamente em innerHTML do carrinho
window.__removeFromCart = removeFromCart;

// =====================
// INICIALIZAÇÃO DO HEADER
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

// =====================
// REVEAL / SMOOTH SCROLL
// =====================

function initReveal() {
  const els = document.querySelectorAll(".reveal");
  if (!els.length) return;

  const observer = new IntersectionObserver(
    (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("is-visible"); }),
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
// DROPDOWN DO USUÁRIO
// =====================

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
    if (window.innerWidth <= 768 && isAppPage) {
      dropdown.classList.remove("show");
      return;
    }
    mobileMenu?.classList.remove("active");
    dropdown.classList.toggle("show");
  });

  dropdown.addEventListener("click", (e) => e.stopPropagation());

  document.addEventListener("click", () => dropdown.classList.remove("show"));

  window.addEventListener("resize", () => {
    if (window.innerWidth <= 768) dropdown.classList.remove("show");
  });

  userTrigger.dataset.bound = "true";
}

// =====================
// MENU MOBILE
// =====================

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

  const isMobile = () => window.innerWidth <= 768;

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
    if (!isMobile()) return;
    menu.classList.contains("active") ? closeMenu() : openMenu();
  });

  closeBtn?.addEventListener("click", closeMenu);
  backdrop?.addEventListener("click", closeMenu);
  links.forEach((link) => link.addEventListener("click", closeMenu));

  menuPanel?.addEventListener("click", (e) => e.stopPropagation());
  menuContent?.querySelectorAll("button, a").forEach((item) => item.addEventListener("click", closeMenu));

  document.addEventListener("click", (e) => {
    if (!menu.classList.contains("active")) return;
    if (menuBtn.contains(e.target)) return;
    if (menuPanel?.contains(e.target)) return;
    closeMenu();
  });

  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
  window.addEventListener("resize", () => { if (!isMobile()) closeMenu(); });

  menuBtn.dataset.mobileMenuBound = "true";
}

// =====================
// NEWSLETTER
// =====================

import { supabaseClient } from "./supabase.js";

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
        .upsert([{ email, created_at: new Date().toISOString() }], { onConflict: "email" });

      if (error) throw error;
      form.reset();
      showToast("E-mail cadastrado com sucesso");
    } catch (err) {
      console.error("Erro ao salvar lead:", err);
      showToast("Erro ao salvar e-mail");
    }
  });
}

// =====================
// EVENTOS DE PRODUTO
// =====================

function initProductEvents() {
  // Botão "Comprar" na grade de produtos
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".add-to-cart");
    if (!btn) return;

    const id = btn.dataset.id;
    const card = btn.closest(".product-card");
    const img = card?.querySelector(".product-img");
    if (img) animateToCart(img);

    addToCart(id, products);
  });

  // Botão "Comprar agora" no produto em destaque
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("featured-buy")) {
      const id = e.target.dataset.id;
      addToCart(id, products);
    }
  });
}

// =====================
// INICIALIZAÇÃO PRINCIPAL
// =====================

document.addEventListener("DOMContentLoaded", async () => {
  initHeader();
  initReveal();
  initSmoothScroll();
  initCartUI();
  initFilters();
  initAuthUI();
  initCheckoutFlow();
  initNewsletter();
  renderCart();
  initUserDropdown();
  initMobileMenu();
  initProductEvents();

  // Só carrega produtos na página principal
  if (!window.location.pathname.includes("profile.html")) {
    showSkeleton();
    loadProducts();
  }

  // Inicializa a página de perfil
  if (window.location.pathname.includes("profile.html")) {
    initProfilePage();
  }
});

window.addEventListener("load", async () => {
  try {
    document.body.classList.add("loaded");

    const user = await getSessionUser({ context: "app-load", reloadOnFailure: false });

    if (user) {
      await checkUser(user);
      await loadUserUI(user);
      // Sincroniza perfil do banco com o user_metadata (cobre caso de primeiro login após confirmação de email)
      await syncProfileFromMetadata(user);
      initUserDropdown();
    }
  } catch (err) {
    // Silencioso — usuário pode não estar logado
  }
});

// =====================
// LIMPA CARRINHO NA PÁGINA DE SUCESSO
// =====================

if (window.location.pathname.includes("sucesso.html")) {
  localStorage.removeItem("tl_cart_v1");
}
