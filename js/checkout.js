import { supabaseClient } from "./supabase.js";
import { showToast, safeText, isValidEmail, debugLog } from "./ui.js";
import { cartState, isValidCheckoutCart } from "./cart.js";
import { formatPrice } from "./ui.js";
import { getSessionUser, getProfileDataFromMetadata, firstFilledValue, upsertProfileForUser } from "./auth.js";

// =====================
// ESTADO DO CHECKOUT
// =====================

export const checkoutData = {
  customer: { name: "", email: "" },
  shipping: {
    zip: "",
    street: "",
    number: "",
    neighborhood: "",
    city: "",
    state: "",
    complement: "",
  },
};

let checkoutStep = 1;

// =====================
// VALIDAÇÕES
// =====================

function isValidCheckoutCustomer() {
  const name = safeText(checkoutData.customer?.name).trim();
  const email = safeText(checkoutData.customer?.email).trim();

  if (!name) { showToast("Digite seu nome"); return false; }
  if (!isValidEmail(email)) { showToast("Digite um e-mail válido"); return false; }
  return true;
}

function isValidCheckoutShipping() {
  const s = checkoutData.shipping || {};
  if (!safeText(s.zip).trim() || !safeText(s.street).trim() || !safeText(s.number).trim()) {
    showToast("Preencha CEP, rua e número");
    return false;
  }
  if (!safeText(s.city).trim() || !safeText(s.state).trim()) {
    showToast("Preencha cidade e estado");
    return false;
  }
  return true;
}

// =====================
// FLUXO DE CHECKOUT
// =====================

/**
 * Abre o modal de checkout e carrega dados do usuário logado.
 */
export async function openCheckoutFlow() {
  const modal = document.getElementById("checkoutModal");
  if (!modal) return;

  await hydrateCheckoutFromUser();
  checkoutStep = 1;
  renderCheckoutStep();
  modal.classList.add("active");
  document.body.style.overflow = "hidden";
}

export function closeCheckoutFlow() {
  const modal = document.getElementById("checkoutModal");
  if (!modal) return;
  modal.classList.remove("active");
  document.body.style.overflow = "";
}

/**
 * Pré-preenche os dados de checkout com os dados do usuário logado.
 */
async function hydrateCheckoutFromUser() {
  try {
    const user = await getSessionUser({ context: "checkout-hydrate", reloadOnFailure: false });
    if (!user) return;

    const metadataShipping = getProfileDataFromMetadata(user);

    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    checkoutData.customer = {
      name: firstFilledValue(user.user_metadata?.full_name, user.user_metadata?.name, checkoutData.customer.name),
      email: firstFilledValue(user.email, checkoutData.customer.email),
    };

    checkoutData.shipping = {
      zip: firstFilledValue(profile?.cep, metadataShipping.zip, checkoutData.shipping.zip),
      street: firstFilledValue(profile?.street, metadataShipping.street, checkoutData.shipping.street),
      number: firstFilledValue(profile?.number, metadataShipping.number, checkoutData.shipping.number),
      neighborhood: firstFilledValue(profile?.neighborhood, metadataShipping.neighborhood, checkoutData.shipping.neighborhood),
      city: firstFilledValue(profile?.city, metadataShipping.city, checkoutData.shipping.city),
      state: firstFilledValue(profile?.state, metadataShipping.state, checkoutData.shipping.state),
      complement: firstFilledValue(profile?.complement, metadataShipping.complement, checkoutData.shipping.complement),
    };

    debugLog("CHECKOUT HYDRATE", { customer: checkoutData.customer, shipping: checkoutData.shipping });
  } catch (err) {
    console.warn("Erro ao hidratar checkout:", err);
  }
}

// =====================
// STEPS
// =====================

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

function syncCheckoutInputsFromState() {
  if (checkoutStep === 1) {
    const nameInput = document.getElementById("checkoutName");
    const emailInput = document.getElementById("checkoutEmail");
    if (nameInput) nameInput.value = safeText(checkoutData.customer.name);
    if (emailInput) emailInput.value = safeText(checkoutData.customer.email);
    return;
  }

  if (checkoutStep === 2) {
    const fieldMap = [
      ["checkoutZip", checkoutData.shipping.zip],
      ["checkoutStreet", checkoutData.shipping.street],
      ["checkoutNumber", checkoutData.shipping.number],
      ["checkoutNeighborhood", checkoutData.shipping.neighborhood],
      ["checkoutCity", checkoutData.shipping.city],
      ["checkoutState", checkoutData.shipping.state],
      ["checkoutComplement", checkoutData.shipping.complement],
    ];
    fieldMap.forEach(([id, value]) => {
      const input = document.getElementById(id);
      if (input) input.value = safeText(value);
    });
  }
}

function updateCheckoutProgress() {
  const progress = document.getElementById("checkoutProgress");
  const steps = document.querySelectorAll(".progress-steps .step");
  if (!progress) return;

  const widths = { 1: 33, 2: 66, 3: 100 };
  progress.style.width = (widths[checkoutStep] || 33) + "%";
  steps.forEach((el, i) => el.classList.toggle("active", i < checkoutStep));
}

export function renderCheckoutStep() {
  const title = document.getElementById("checkoutStepTitle");
  const content = document.getElementById("checkoutStepContent");
  const prevBtn = document.getElementById("checkoutPrevBtn");
  const nextBtn = document.getElementById("checkoutNextBtn");
  const confirmBtn = document.getElementById("checkoutConfirmBtn");

  updateCheckoutProgress();
  if (!content) return;

  const titles = { 1: "Dados do cliente", 2: "Endereço de entrega", 3: "Revisão do pedido" };
  if (title) title.textContent = titles[checkoutStep] || "";

  if (prevBtn) prevBtn.style.display = checkoutStep === 1 ? "none" : "inline-flex";
  if (nextBtn) nextBtn.style.display = checkoutStep === 3 ? "none" : "inline-flex";
  if (confirmBtn) confirmBtn.style.display = checkoutStep === 3 ? "inline-flex" : "none";

  if (checkoutStep === 1) {
    content.innerHTML = `
      <div class="checkout-fields">
        <input id="checkoutName" type="text" placeholder="Nome completo" autocomplete="name" value="${safeText(checkoutData.customer.name)}" />
        <input id="checkoutEmail" type="email" placeholder="Seu e-mail" autocomplete="email" value="${safeText(checkoutData.customer.email)}" />
      </div>
    `;
    requestAnimationFrame(syncCheckoutInputsFromState);
    return;
  }

  if (checkoutStep === 2) {
    content.innerHTML = `
      <div class="checkout-fields">
        <input id="checkoutZip" data-field="zip" type="text" placeholder="CEP" autocomplete="postal-code" value="${safeText(checkoutData.shipping.zip)}" />
        <input id="checkoutStreet" data-field="street" type="text" placeholder="Rua" autocomplete="address-line1" value="${safeText(checkoutData.shipping.street)}" />
        <input id="checkoutNumber" data-field="number" type="text" placeholder="Número" autocomplete="address-line2" value="${safeText(checkoutData.shipping.number)}" />
        <input id="checkoutNeighborhood" data-field="neighborhood" type="text" placeholder="Bairro" value="${safeText(checkoutData.shipping.neighborhood)}" />
        <input id="checkoutCity" data-field="city" type="text" placeholder="Cidade" autocomplete="address-level2" value="${safeText(checkoutData.shipping.city)}" />
        <input id="checkoutState" data-field="state" type="text" placeholder="Estado" autocomplete="address-level1" value="${safeText(checkoutData.shipping.state)}" />
        <input id="checkoutComplement" type="text" placeholder="Complemento" value="${safeText(checkoutData.shipping.complement)}" />
      </div>
    `;

    requestAnimationFrame(() => {
      syncCheckoutInputsFromState();
      const cepInput = document.getElementById("checkoutZip");
      if (!cepInput || cepInput.dataset.bound === "true") return;

      const addressFields = ["checkoutStreet", "checkoutNeighborhood", "checkoutCity", "checkoutState"];

      // Desabilita campos preenchíveis pelo CEP apenas se não há endereço pré-existente
      const hasExistingAddress =
        checkoutData.shipping.street ||
        checkoutData.shipping.city ||
        checkoutData.shipping.state;

      if (!hasExistingAddress) {
        addressFields.forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.disabled = true;
        });
      }

      // Quando o usuário digitar um novo CEP, habilita os campos para receber dados da API
      cepInput.addEventListener("input", () => {
        const onlyCep = cepInput.value.replace(/\D/g, "");
        if (onlyCep.length > 0) {
          addressFields.forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.disabled = false;
          });
        }
      });

      cepInput.addEventListener("blur", (e) => buscarCEP(e.target.value));
      cepInput.dataset.bound = "true";
    });
    return;
  }

  if (checkoutStep === 3) {
    const totalValue = cartState.cart.reduce(
      (acc, item) => acc + Number(item.price) * Number(item.quantity),
      0
    );

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
          ${cartState.cart
            .map(
              (item) => `
            <div class="checkout-review-item">
              <span>${item.name} x${item.quantity}</span>
              <strong>${formatPrice(Number(item.price) * Number(item.quantity))}</strong>
            </div>
          `
            )
            .join("")}

          <div class="checkout-review-total">
            <span>Total</span>
            <strong>${formatPrice(totalValue)}</strong>
          </div>
        </div>

      </div>
    </div>
  `;
  }
}

function validateCheckoutStep() {
  persistCheckoutStep();
  if (checkoutStep === 1) return isValidCheckoutCustomer();
  if (checkoutStep === 2) return isValidCheckoutShipping();
  return true;
}

export function nextCheckoutStep() {
  if (!validateCheckoutStep()) return;
  if (checkoutStep < 3) {
    checkoutStep += 1;
    renderCheckoutStep();
  }
}

export function prevCheckoutStep() {
  persistCheckoutStep();
  if (checkoutStep > 1) {
    checkoutStep -= 1;
    renderCheckoutStep();
  }
}

// =====================
// SUBMISSÃO
// =====================

async function saveCheckoutProfile() {
  try {
    const user = await getSessionUser({ context: "save-checkout-profile", reloadOnFailure: false });
    if (!user) return;

    await upsertProfileForUser(user, {
      name: checkoutData.customer.name,
      zip: checkoutData.shipping.zip,
      street: checkoutData.shipping.street,
      number: checkoutData.shipping.number,
      neighborhood: checkoutData.shipping.neighborhood,
      city: checkoutData.shipping.city,
      state: checkoutData.shipping.state,
      complement: checkoutData.shipping.complement,
    });
  } catch (err) {
    // Não bloqueia o checkout — é melhoria de UX apenas
    console.warn("Erro ao salvar perfil no checkout:", err);
  }
}

export async function confirmCheckout() {
  persistCheckoutStep();

  const btn = document.getElementById("checkoutConfirmBtn");
  if (!btn) return;

  btn.classList.add("loading");
  btn.textContent = "Processando...";
  btn.disabled = true;

  if (!isValidCheckoutCart() || !isValidCheckoutCustomer() || !isValidCheckoutShipping()) {
    btn.classList.remove("loading");
    btn.textContent = "Ir para pagamento";
    btn.disabled = false;
    return;
  }

  try {
    await saveCheckoutProfile();

    const requestBody = {
      cart: cartState.cart,
      customer: checkoutData.customer,
      shipping: checkoutData.shipping,
    };

    debugLog("CHECKOUT REQUEST", requestBody);

    const res = await fetch("/api/create-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Erro na API de checkout");
    }

    const data = await res.json();

    if (!data.init_point) throw new Error("Pagamento não gerado");

    window.location.href = data.init_point;
  } catch (err) {
    console.error("Erro checkout:", err);
    showToast("Erro ao iniciar pagamento");
  } finally {
    btn.classList.remove("loading");
    btn.textContent = "Ir para pagamento";
    btn.disabled = false;
  }
}

// =====================
// INICIALIZAÇÃO
// =====================

export function initCheckoutFlow() {
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

// =====================
// CEP
// =====================

export async function buscarCEP(cep) {
  try {
    cep = cep.replace(/\D/g, "");
    if (cep.length !== 8) return;

    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await res.json();

    if (data.erro) return;

    // Habilita inputs para poder definir o valor
    ["checkoutStreet", "checkoutNeighborhood", "checkoutCity", "checkoutState"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.disabled = false;
    });

    const streetInput = document.querySelector('input[data-field="street"]');
    const neighborhoodInput = document.querySelector('input[data-field="neighborhood"]');
    const cityInput = document.querySelector('input[data-field="city"]');
    const stateInput = document.querySelector('input[data-field="state"]');

    if (streetInput) streetInput.value = data.logradouro || "";
    if (neighborhoodInput) neighborhoodInput.value = data.bairro || "";
    if (cityInput) cityInput.value = data.localidade || "";
    if (stateInput) stateInput.value = data.uf || "";

    // Sincroniza com o estado
    checkoutData.shipping.street = data.logradouro || "";
    checkoutData.shipping.neighborhood = data.bairro || "";
    checkoutData.shipping.city = data.localidade || "";
    checkoutData.shipping.state = data.uf || "";
  } catch (err) {
    console.warn("Erro ao buscar CEP:", err);
  }
}
