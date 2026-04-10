import { supabaseClient } from "./supabase.js";
import { showToast, formatPrice, safeText, animateToCart } from "./ui.js";

// =====================
// ESTADO DO CARRINHO
// =====================

/**
 * Lê o carrinho do localStorage com tratamento de erros.
 * @returns {Array}
 */
function readStoredCart() {
  try {
    const raw = localStorage.getItem("tl_cart_v1");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("Carrinho local inválido, resetando:", err);
    localStorage.removeItem("tl_cart_v1");
    return [];
  }
}

export const cartState = {
  cart: readStoredCart(),
};

/**
 * Persiste o carrinho atual no localStorage.
 */
export function persistCart() {
  localStorage.setItem("tl_cart_v1", JSON.stringify(cartState.cart));
}

// =====================
// AÇÕES DO CARRINHO
// =====================

/**
 * Adiciona um produto ao carrinho pelo ID.
 * @param {string} id
 * @param {Array} products Lista de produtos carregados
 */
export function addToCart(id, products) {
  const product = products.find((p) => String(p.id) === String(id));
  if (!product) {
    showToast("Produto não encontrado");
    return;
  }

  const existing = cartState.cart.find((item) => String(item.id) === String(id));

  if (existing) {
    existing.quantity += 1;
  } else {
    cartState.cart.push({
      id: product.id,
      name: safeText(product?.nome || product?.name, "Produto"),
      price: Number(product?.price || product?.preco || 0),
      quantity: 1,
    });
  }

  persistCart();
  renderCart();
  showToast("Produto adicionado ao carrinho");
  openCart();
}

/**
 * Remove um produto do carrinho pelo ID.
 * @param {string} id
 */
export function removeFromCart(id) {
  cartState.cart = cartState.cart.filter((item) => String(item.id) !== String(id));
  persistCart();
  renderCart();
  showToast("Produto removido");
}

// =====================
// RENDERIZAÇÃO
// =====================

/**
 * Renderiza o carrinho lateral com os itens atuais.
 */
export function renderCart() {
  const cartItemsEl = document.getElementById("cartItems");
  const countEl = document.getElementById("cartCount");
  const subtotalEl = document.getElementById("subtotal");
  const totalEl = document.getElementById("total");

  if (!cartItemsEl) return;

  const totalItems = cartState.cart.reduce((acc, item) => acc + item.quantity, 0);
  const subtotal = cartState.cart.reduce(
    (acc, item) => acc + Number(item.price) * Number(item.quantity),
    0
  );

  if (countEl) countEl.textContent = String(totalItems);
  if (subtotalEl) subtotalEl.textContent = formatPrice(subtotal);
  if (totalEl) totalEl.textContent = formatPrice(subtotal);

  if (!cartState.cart.length) {
    cartItemsEl.innerHTML = `<div class="cart-empty">Seu carrinho está vazio</div>`;
    return;
  }

  cartItemsEl.innerHTML = cartState.cart
    .map(
      (item) => `
      <div class="cart-item">
        <div>
          <h4>${safeText(item.name, "Produto")}</h4>
          <div class="cart-meta">${item.quantity}x &bull; ${formatPrice(item.price)}</div>
        </div>
        <div class="cart-row">
          <strong>${formatPrice(Number(item.price) * Number(item.quantity))}</strong>
          <button onclick="window.__removeFromCart('${item.id}')" class="remove-btn">
            Remover
          </button>
        </div>
      </div>
    `
    )
    .join("");
}

// =====================
// DRAWER DO CARRINHO
// =====================

export function openCart() {
  const cartDrawer = document.getElementById("cartDrawer");
  const overlay = document.getElementById("overlay");
  cartDrawer?.classList.add("active");
  overlay?.classList.add("active");
  document.body.style.overflow = "hidden";
}

export function closeCart() {
  const cartDrawer = document.getElementById("cartDrawer");
  const overlay = document.getElementById("overlay");
  cartDrawer?.classList.remove("active");
  overlay?.classList.remove("active");
  document.body.style.overflow = "";
}

/**
 * Inicializa os eventos do carrinho lateral.
 */
export function initCartUI() {
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

// =====================
// VALIDAÇÕES
// =====================

/**
 * Valida se o carrinho está em condições de checkout.
 * @returns {boolean}
 */
export function isValidCheckoutCart() {
  if (!Array.isArray(cartState.cart) || !cartState.cart.length) {
    showToast("Carrinho vazio");
    return false;
  }

  const hasInvalidItem = cartState.cart.some((item) => {
    const productId = safeText(item?.id).trim();
    const num = Number(item?.quantity);
    return !productId || !Number.isInteger(num) || num <= 0;
  });

  if (hasInvalidItem) {
    showToast("Carrinho inválido. Atualize a página e tente novamente.");
    return false;
  }

  return true;
}
