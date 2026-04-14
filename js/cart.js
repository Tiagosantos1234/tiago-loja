import { supabaseClient } from "./supabase.js";
import { showToast, formatPrice, safeText, animateToCart } from "./ui.js";

// =====================
// ESTADO DO CARRINHO
// =====================

/**
 * Lê o carrinho do localStorage com tratamento de erros.
 * Migra itens legados (sem cor/tamanho) automaticamente.
 * @returns {Array}
 */
function readStoredCart() {
  try {
    const raw = localStorage.getItem("tl_cart_v2");
    if (!raw) {
      // Migra carrinho v1 se existir
      const legacy = localStorage.getItem("tl_cart_v1");
      if (legacy) {
        const parsed = JSON.parse(legacy);
        if (Array.isArray(parsed)) {
          const migrated = parsed.map((item) => ({
            ...item,
            color: item.color || null,
            size: item.size || null,
            image: item.image || null,
            variantKey: buildVariantKey(item.id, item.color || null, item.size || null),
          }));
          localStorage.setItem("tl_cart_v2", JSON.stringify(migrated));
          localStorage.removeItem("tl_cart_v1");
          return migrated;
        }
      }
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("Carrinho local inválido, resetando:", err);
    localStorage.removeItem("tl_cart_v2");
    return [];
  }
}

/**
 * Gera chave única para variação: id + cor + tamanho
 */
function buildVariantKey(id, color, size) {
  return `${id}__${color || ""}__${size || ""}`;
}

export const cartState = {
  cart: readStoredCart(),
};

/**
 * Persiste o carrinho atual no localStorage.
 */
export function persistCart() {
  localStorage.setItem("tl_cart_v2", JSON.stringify(cartState.cart));
}

// =====================
// AÇÕES DO CARRINHO
// =====================

/**
 * Adiciona um produto ao carrinho com suporte a cor, tamanho e quantidade.
 * @param {string} id - ID do produto
 * @param {Array} products - Lista de produtos carregados
 * @param {object} options - { color, size, quantity, image }
 */
export function addToCart(id, products, options = {}) {
  const product = products.find((p) => String(p.id) === String(id));
  if (!product) {
    showToast("Produto não encontrado");
    return;
  }

  const color = options.color || null;
  const size = options.size || null;
  const quantity = Math.max(1, Number(options.quantity) || 1);
  const image = options.image || getFirstImage(product);
  const variantKey = buildVariantKey(id, color, size);

  const existing = cartState.cart.find((item) => item.variantKey === variantKey);

  if (existing) {
    existing.quantity += quantity;
  } else {
    cartState.cart.push({
      id: product.id,
      variantKey,
      name: safeText(product?.nome || product?.name, "Produto"),
      price: Number(product?.price || product?.preco || 0),
      quantity,
      color,
      size,
      image,
    });
  }

  persistCart();
  renderCart();
  showToast("Adicionado ao carrinho ✓");
  openCart();
}

/**
 * Remove um item do carrinho pela chave de variação.
 * @param {string} variantKey
 */
export function removeFromCart(variantKey) {
  cartState.cart = cartState.cart.filter((item) => item.variantKey !== variantKey);
  persistCart();
  renderCart();
  showToast("Item removido");
}

/**
 * Aumenta a quantidade de um item.
 * @param {string} variantKey
 */
export function increaseCartItemQuantity(variantKey) {
  const item = cartState.cart.find((i) => i.variantKey === variantKey);
  if (item) {
    item.quantity += 1;
    persistCart();
    renderCart();
  }
}

/**
 * Diminui a quantidade de um item (remove se chegar a 0).
 * @param {string} variantKey
 */
export function decreaseCartItemQuantity(variantKey) {
  const item = cartState.cart.find((i) => i.variantKey === variantKey);
  if (!item) return;

  if (item.quantity <= 1) {
    removeFromCart(variantKey);
  } else {
    item.quantity -= 1;
    persistCart();
    renderCart();
  }
}

/**
 * Calcula os totais do carrinho.
 * @returns {{ total: number, totalItems: number }}
 */
export function calculateCartTotals() {
  const totalItems = cartState.cart.reduce((acc, item) => acc + item.quantity, 0);
  const total = cartState.cart.reduce(
    (acc, item) => acc + Number(item.price) * Number(item.quantity),
    0
  );
  return { total, totalItems };
}

// =====================
// HELPERS
// =====================

function getFirstImage(product) {
  if (!product || !product.image_url) return null;
  if (Array.isArray(product.image_url)) return product.image_url[0] || null;
  try {
    const parsed = JSON.parse(product.image_url);
    if (Array.isArray(parsed) && parsed.length) return parsed[0];
  } catch {
    return product.image_url;
  }
  return product.image_url;
}

function escapeKey(key) {
  return encodeURIComponent(key);
}

// =====================
// RENDERIZAÇÃO
// =====================

/**
 * Atualiza a UI do carrinho com os itens atuais.
 */
export function updateCartUI() {
  renderCart();
}

/**
 * Renderiza o carrinho lateral com os itens atuais.
 */
export function renderCart() {
  const cartItemsEl = document.getElementById("cartItems");
  const countEl = document.getElementById("cartCount");
  const subtotalEl = document.getElementById("subtotal");
  const totalEl = document.getElementById("total");

  if (!cartItemsEl) return;

  const { total, totalItems } = calculateCartTotals();

  if (countEl) {
    countEl.textContent = String(totalItems);
    countEl.style.display = totalItems > 0 ? "" : "none";
  }
  if (subtotalEl) subtotalEl.textContent = formatPrice(total);
  if (totalEl) totalEl.textContent = formatPrice(total);

  if (!cartState.cart.length) {
    cartItemsEl.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon">🛒</div>
        <p>Seu carrinho está vazio</p>
        <small>Adicione produtos para continuar</small>
      </div>`;
    return;
  }

  cartItemsEl.innerHTML = cartState.cart
    .map((item) => {
      const subtotal = Number(item.price) * Number(item.quantity);
      const key = escapeKey(item.variantKey);
      const imgHtml = item.image
        ? `<div class="cart-item-media"><img src="${item.image}" alt="${safeText(item.name)}" loading="lazy" /></div>`
        : `<div class="cart-item-media cart-item-no-img"><span>📦</span></div>`;

      const variantInfo = [item.color, item.size].filter(Boolean).join(" · ");

      return `
        <div class="cart-item" data-variant="${key}">
          ${imgHtml}
          <div class="cart-item-body">
            <h4 class="cart-item-name">${safeText(item.name, "Produto")}</h4>
            ${variantInfo ? `<div class="cart-item-variant">${variantInfo}</div>` : ""}
            <div class="cart-item-price">${formatPrice(item.price)}</div>

            <div class="cart-item-controls">
              <div class="qty-ctrl">
                <button
                  class="qty-btn qty-dec"
                  onclick="window.__cartDecQty('${key}')"
                  aria-label="Diminuir quantidade"
                  type="button">−</button>
                <span class="qty-num">${item.quantity}</span>
                <button
                  class="qty-btn qty-inc"
                  onclick="window.__cartIncQty('${key}')"
                  aria-label="Aumentar quantidade"
                  type="button">+</button>
              </div>

              <div class="cart-item-right">
                <strong class="cart-item-subtotal">${formatPrice(subtotal)}</strong>
                <button
                  class="cart-item-remove"
                  onclick="window.__removeFromCart('${key}')"
                  aria-label="Remover item"
                  type="button">✕</button>
              </div>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

// =====================
// DRAWER DO CARRINHO
// =====================

export function openCart() {
  const cartDrawer = document.getElementById("cartDrawer");
  const overlay = document.getElementById("cartOverlay");
  if (!cartDrawer) return;
  cartDrawer.classList.add("active");
  if (overlay) overlay.classList.add("active");
  document.body.style.overflow = "hidden";
  renderCart();
}

export function closeCart() {
  const cartDrawer = document.getElementById("cartDrawer");
  const overlay = document.getElementById("cartOverlay");
  if (!cartDrawer) return;
  cartDrawer.classList.remove("active");
  if (overlay) overlay.classList.remove("active");
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

  // Fechar ao clicar no overlay dedicado do carrinho
  const cartOverlay = document.getElementById("cartOverlay");
  if (cartOverlay) {
    cartOverlay.addEventListener("click", closeCart);
  }

  // Fechar ao clicar no overlay genérico (compatibilidade)
  const overlay = document.getElementById("overlay");
  if (overlay) {
    overlay.addEventListener("click", () => {
      const profileMenu = document.getElementById("profileMenu");
      profileMenu?.classList.remove("active");
      overlay.classList.remove("active");
    });
  }

  // Fechar com ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const cartDrawer = document.getElementById("cartDrawer");
      if (cartDrawer?.classList.contains("active")) {
        closeCart();
      }
    }
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
