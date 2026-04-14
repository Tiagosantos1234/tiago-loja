import { supabaseClient } from "./supabase.js";
import { safeText, formatPrice } from "./ui.js";
import { addToCart } from "./cart.js";

// =====================
// ESTADO DE PRODUTOS
// =====================

/** Lista de produtos carregados do banco de dados. */
export let products = [];
let currentCategory = "all";

// =====================
// HELPERS DE PRODUTO
// =====================

export function getProductName(product) {
  return safeText(product?.nome || product?.name, "Produto");
}

export function getProductDescription(product) {
  return safeText(product?.description || product?.descricao, "");
}

export function getProductPrice(product) {
  return Number(product?.price || product?.preco || 0);
}

export function getProductCategory(product) {
  return safeText(product?.category, "").toLowerCase();
}

/**
 * Extrai as imagens de um produto (suporta string, JSON ou array).
 * @param {object} product
 * @returns {string[]}
 */
export function getImages(product) {
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

// =====================
// CARREGAMENTO
// =====================

/**
 * Carrega os produtos do Supabase e renderiza a grade.
 */
export async function loadProducts() {
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

// =====================
// RENDERIZAÇÃO
// =====================

/**
 * Renderiza a grade de produtos com filtro ativo.
 */
export function renderProducts() {
  const grid = document.getElementById("productsGrid");
  if (!grid) return;

  const filtered =
    currentCategory === "all"
      ? products
      : products.filter((p) => getProductCategory(p) === currentCategory);

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
            <a href="produto.html?id=${p.id}" class="product-media-link" aria-label="Ver ${getProductName(p)}">
              <div class="product-media">
                <img src="${img1}" alt="${getProductName(p)}" class="product-img main" loading="lazy" />
                <img src="${img2}" alt="${getProductName(p)}" class="product-img hover" loading="lazy" />
                <div class="product-badge-new">Novo</div>
              </div>
            </a>

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
                <a href="produto.html?id=${p.id}" class="btn-dark go-to-product" data-id="${p.id}">
                  Ver produto
                </a>
              </div>
            </div>
          </article>
        </div>
      `;
    })
    .join("");
}

/**
 * Renderiza o produto em destaque na seção hero.
 */
export function renderFeaturedProduct() {
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

// =====================
// FILTROS E CARROSSEL
// =====================

/**
 * Inicializa os chips de filtro de categoria.
 */
export function initFilters() {
  document.querySelectorAll(".chip").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((b) => b.classList.remove("active"));
      button.classList.add("active");
      currentCategory = safeText(button.dataset.filter, "all").toLowerCase();
      renderProducts();
    });
  });
}

/**
 * Rola o carrossel de produtos.
 * @param {number} direction -1 (esquerda) ou 1 (direita)
 */
export function scrollCarousel(direction) {
  const container = document.querySelector(".products-carousel");
  const slide = document.querySelector(".product-slide");
  if (!container || !slide) return;

  const width = slide.offsetWidth + 22;
  container.scrollBy({ left: direction * width, behavior: "smooth" });
}
