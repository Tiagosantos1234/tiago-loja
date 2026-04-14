/**
 * header.js — Injeta o header em qualquer página do site.
 * Logo sempre aponta para index.html (correto em subpáginas).
 */

function getLogoHref() {
  // Sempre aponta para a raiz, independente da página atual
  const depth = window.location.pathname.split("/").filter(Boolean).length;
  return depth > 0 ? "index.html" : "/";
}

function getStoreHeaderMarkup() {
  const logo = getLogoHref();
  return `
    <div class="mobile-menu" id="mobileMenu">
      <div class="mobile-menu-backdrop" id="mobileMenuBackdrop"></div>
      <div class="mobile-menu-inner">
        <div class="mobile-menu-top">
          <div class="mobile-menu-label">Menu</div>
          <button class="close-menu" id="closeMenu" type="button">&times;</button>
        </div>
        <nav class="mobile-nav">
          <a href="index.html#drop">Drop</a>
          <a href="index.html#editorial">Editorial</a>
          <a href="index.html#story">Manifesto</a>
          <a href="produtos.html">Todos os produtos</a>
          <a href="index.html#newsletter">Drop List</a>
        </nav>
      </div>
    </div>

    <header class="topbar" id="topbar">
      <div class="container topbar-inner">
        <nav class="nav-left" aria-label="Menu principal">
          <a href="index.html#drop" class="nav-link">Drop</a>
          <a href="index.html#editorial" class="nav-link">Editorial</a>
          <a href="produtos.html" class="nav-link">Coleção</a>
        </nav>

        <a href="${logo}" class="brand-mark" aria-label="Voltar ao início">
          <img src="logo.png" alt="RESPEITA" />
        </a>

        <div class="nav-right">
          <a href="produtos.html" class="nav-link nav-mobile">Coleção</a>
          <a href="index.html#newsletter" class="nav-link">Drop List</a>

          <div class="header-actions">
            <button class="icon-btn" id="loginToggle" aria-label="Área do cliente">
              <span>&#128100;</span>
            </button>

            <button class="icon-btn" id="cartToggle" aria-label="Carrinho">
              <span>&#128722;</span>
              <span class="cart-count" id="cartCount">0</span>
            </button>

            <button class="icon-btn menu-toggle" id="menuBtn" aria-label="Abrir menu" type="button">
              <span class="line l1"></span>
              <span class="line l2"></span>
            </button>
          </div>

          <div id="userContainer">
            <div id="userArea" class="user-area app-user" style="display:none;">
              <button id="userTrigger" class="user-trigger" type="button">
                <img id="userAvatar" class="user-avatar" alt="Avatar do usuário" />
                <div class="user-meta">
                  <strong id="userNameHeader">Usuário</strong>
                  <small id="userEmailHeader"></small>
                </div>
                <span class="user-chevron">&#9662;</span>
              </button>

              <div id="userDropdown" class="dropdown app-dropdown">
                <button type="button" onclick="goProfile()"><span>&#128100;</span> Perfil</button>
                <button type="button" onclick="goOrders()"><span>&#128230;</span> Pedidos</button>
                <button type="button" onclick="logout()"><span>&#128682;</span> Sair</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  `;
}

function getAppHeaderMarkup() {
  const logo = getLogoHref();
  return `
    <header class="topbar" id="topbar">
      <a href="${logo}" class="back-store-btn">← Loja</a>
      <div class="container topbar-inner">
        <nav class="nav-left" aria-label="Menu principal">
          <a href="index.html#drop" class="nav-link">Drop</a>
          <a href="produtos.html" class="nav-link">Coleção</a>
        </nav>

        <a href="${logo}" class="brand-mark" aria-label="Voltar ao início">
          <img src="logo.png" alt="RESPEITA" />
        </a>

        <div class="nav-right">
          <div class="header-actions">
            <button class="icon-btn" id="loginToggle" aria-label="Área do cliente">
              <span>&#128100;</span>
            </button>

            <button class="icon-btn" id="cartToggle" aria-label="Carrinho">
              <span>&#128722;</span>
              <span class="cart-count" id="cartCount">0</span>
            </button>

            <button class="icon-btn menu-toggle" id="menuBtn" aria-label="Abrir menu" type="button">
              <span class="line l1"></span>
              <span class="line l2"></span>
            </button>
          </div>

          <div id="userContainer">
            <div id="userArea" class="user-area" style="display:none;">
              <img id="userAvatar" alt="Avatar do usuário" />
              <span id="userNameHeader"></span>

              <div id="userDropdown" class="dropdown">
                <button onclick="goProfile()"><span>&#128100;</span> Perfil</button>
                <button onclick="goOrders()"><span>&#128230;</span> Pedidos</button>
                <button onclick="logout()"><span>&#128682;</span> Sair</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>

    <div class="mobile-menu" id="mobileMenu">
      <div class="mobile-menu-content">
        <a href="${logo}" class="mobile-back">&#8592; Voltar para loja</a>
        <button onclick="switchTab('profile')">&#128100; Perfil</button>
        <button onclick="switchTab('address')">&#128205; Endereço</button>
        <button onclick="switchTab('orders')">&#128230; Pedidos</button>
        <button onclick="logout()">&#128682; Sair</button>
      </div>
    </div>
  `;
}

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("topbar") || document.getElementById("mobileMenu")) {
    return;
  }

  if (document.body.classList.contains("app")) {
    document.body.insertAdjacentHTML("afterbegin", getAppHeaderMarkup());
    return;
  }

  const cartOverlay = document.getElementById("cartOverlay");
  const overlay = document.getElementById("overlay");
  const anchor = cartOverlay || overlay;

  if (anchor) {
    anchor.insertAdjacentHTML("afterend", getStoreHeaderMarkup());
    return;
  }

  document.body.insertAdjacentHTML("afterbegin", getStoreHeaderMarkup());
});
