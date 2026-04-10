// =====================
// UTILITÁRIOS DE UI
// =====================

/**
 * Formata um valor monetário em BRL.
 * @param {number} value
 * @returns {string}
 */
export function formatPrice(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Converte qualquer valor para string segura, com fallback.
 * @param {unknown} value
 * @param {string} fallback
 * @returns {string}
 */
export function safeText(value, fallback = "") {
  return value == null ? fallback : String(value);
}

/**
 * Valida email com regex.
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeText(email));
}

/**
 * Exibe um toast de feedback.
 * @param {string} message
 */
export function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}

/**
 * Exibe skeleton de carregamento na grade de produtos.
 */
export function showSkeleton() {
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

/**
 * Coloca um botão em estado de carregamento.
 * @param {HTMLButtonElement|null} button
 * @param {string} label
 */
export function setButtonBusy(button, label) {
  if (!button) return;
  button.dataset.originalText = button.dataset.originalText || button.textContent;
  button.textContent = label;
  button.disabled = true;
}

/**
 * Restaura um botão do estado de carregamento.
 * @param {HTMLButtonElement|null} button
 */
export function resetButtonBusy(button) {
  if (!button) return;
  button.textContent = button.dataset.originalText || button.textContent;
  button.disabled = false;
}

/**
 * Anima uma imagem voando até o ícone do carrinho.
 * @param {HTMLElement} imgElement
 */
export function animateToCart(imgElement) {
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

  setTimeout(() => clone.remove(), 700);
}

/**
 * Retorna o valor de um input dentro de um escopo.
 * @param {Element} scope
 * @param {string} selector
 * @returns {string}
 */
export function getScopedInputValue(scope, selector) {
  return scope?.querySelector(selector)?.value?.trim() || "";
}

/**
 * Retorna a data/hora em texto para debug.
 * @param {string} label
 * @param {unknown} payload
 */
export function debugLog(label, payload) {
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    console.debug(`[DEBUG] ${label}`, payload);
  }
}
