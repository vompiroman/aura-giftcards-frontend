import {
  META_CONSENT_VERSION,
  getMetaMarketingConsent,
  initializeMetaPixel,
  setMetaMarketingConsent,
  trackMeta,
} from "./meta.js";

const views = [...document.querySelectorAll("[data-view]")];
    const routeLinks = [...document.querySelectorAll(".route-link")];
    const navLinks = [...document.querySelectorAll(".nav-link")];
    const mobileMenu = document.getElementById("mobile-menu");
    const mobileToggle = document.getElementById("mobile-menu-toggle");
    const cartCount = document.getElementById("cart-count");
    const toast = document.getElementById("toast");
    const toastMessage = document.getElementById("toast-message");
    const accountLinks = [...document.querySelectorAll(".account-link")];
const profileSaveStatus = document.getElementById("profile-save-status");
const marketingConsentInput = document.getElementById("marketing-consent");
const marketingConsentBanner = document.getElementById("marketing-consent-banner");
    const API_BASE = "/api";
    const authFeedback = document.getElementById("auth-feedback");
    let authToken = sessionStorage.getItem("aura_access_token") || localStorage.getItem("aura_access_token") || "";
    let activeOrderId = sessionStorage.getItem("aura_order_id") || "";
    let currentUser = null;
    let lastSavedProfile = "";
let loadedOrders = [];

const storedMarketingConsent = getMetaMarketingConsent();
if (marketingConsentInput) {
  marketingConsentInput.checked = storedMarketingConsent?.status === "granted";
  marketingConsentInput.addEventListener("change", () => {
    setMetaMarketingConsent(marketingConsentInput.checked);
    marketingConsentBanner?.classList.add("hidden");
  });
}
if (storedMarketingConsent) {
  initializeMetaPixel();
} else {
  marketingConsentBanner?.classList.remove("hidden");
}
document.getElementById("accept-marketing")?.addEventListener("click", () => {
  setMetaMarketingConsent(true);
  if (marketingConsentInput) marketingConsentInput.checked = true;
  marketingConsentBanner?.classList.add("hidden");
});
document.getElementById("decline-marketing")?.addEventListener("click", () => {
  setMetaMarketingConsent(false);
  if (marketingConsentInput) marketingConsentInput.checked = false;
  marketingConsentBanner?.classList.add("hidden");
});

    let cart = [];

    function pendingCredentialsKey(orderId) {
      return `aura_pending_credentials_${orderId}`;
    }

    function savePendingCredentials(orderId, credentials) {
      if (!orderId || credentials.length === 0) return;
      sessionStorage.setItem(pendingCredentialsKey(orderId), JSON.stringify(credentials));
    }

    async function submitPendingCredentials(orderId) {
      const key = pendingCredentialsKey(orderId);
      const raw = sessionStorage.getItem(key);
      if (!raw) return false;
      let credentials = [];
      try {
        credentials = JSON.parse(raw);
      } catch {
        sessionStorage.removeItem(key);
        return false;
      }
      while (credentials.length > 0) {
        const credential = credentials[0];
        await apiRequest("/client-credentials", {
          method: "POST",
          body: JSON.stringify({ order_id: orderId, ...credential })
        });
        credentials.shift();
        if (credentials.length > 0) {
          sessionStorage.setItem(key, JSON.stringify(credentials));
        }
      }
      sessionStorage.removeItem(key);
      return true;
    }

    function setAuthFeedback(message, isError = true) {
      if (!authFeedback) return;
      authFeedback.textContent = message;
      authFeedback.classList.remove("hidden", "bg-red-50", "text-red-800", "bg-green-50", "text-green-800");
      authFeedback.classList.add(isError ? "bg-red-50" : "bg-green-50", isError ? "text-red-800" : "text-green-800");
    }

    async function apiRequest(path, options = {}) {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 45000);
      const slowRequestId = window.setTimeout(() => {
        showToast(path === "/login"
          ? "Connexion en cours — le serveur se réveille…"
          : "Le serveur se réveille — encore quelques secondes…");
      }, 8000);
      const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
      if (authToken) headers.Authorization = `Bearer ${authToken}`;
      try {
        const response = await fetch(`${API_BASE}${path}`, {
          ...options,
          headers,
          credentials: "omit",
          signal: options.signal || controller.signal
        });
        let payload = null;
        try { payload = await response.json(); } catch { payload = null; }
        if (!response.ok) {
          if (response.status === 401) {
            authToken = "";
            sessionStorage.removeItem("aura_access_token");
            localStorage.removeItem("aura_access_token");
          }
          const message = typeof payload?.error === "string"
            ? payload.error
            : typeof payload?.message === "string"
              ? payload.message
              : `Erreur API (${response.status})`;
          throw new Error(message);
        }
        return payload;
      } catch (error) {
        if (error?.name === "AbortError") {
          throw new Error("Le serveur met trop de temps à répondre. Réessaie dans quelques secondes.");
        }
        if (error instanceof TypeError) {
          throw new Error("Impossible de joindre le serveur. Vérifie ta connexion puis réessaie.");
        }
        throw error;
      } finally {
        window.clearTimeout(timeoutId);
        window.clearTimeout(slowRequestId);
      }
    }

    function apiProductName(item) {
      const names = {
        "Netflix Premium|1 mois": "Netflix Premium 1 mois",
        "Spotify Family|1 mois": "Spotify Family 1 mois",
        "Spotify Family|1 an": "Spotify Family 1 an",
        "Crunchyroll Mega Fan|1 mois": "Crunchyroll Mega Fan 1 mois",
        "Crunchyroll Mega Fan|1 an": "Crunchyroll Mega Fan 1 an"
      };
      return names[`${item.name}|${item.duration}`] || `${item.service} ${item.duration}`;
    }

    function saveAuthToken(token, remember) {
      authToken = token || "";
      sessionStorage.removeItem("aura_access_token");
      localStorage.removeItem("aura_access_token");
      if (authToken) (remember ? localStorage : sessionStorage).setItem("aura_access_token", authToken);
    }

    function profileNames(metadata = {}) {
      let firstName = String(metadata.first_name || "").trim();
      let lastName = String(metadata.last_name || "").trim();
      const fullName = String(metadata.full_name || "").trim();
      if ((!firstName || !lastName) && fullName) {
        const parts = fullName.split(/\s+/);
        if (!firstName) firstName = parts.shift() || "";
        if (!lastName) lastName = parts.join(" ");
      }
      return { firstName, lastName };
    }

    function setAccountState(user) {
      currentUser = user || null;
      const authenticated = Boolean(currentUser && authToken);
      accountLinks.forEach(link => {
        link.dataset.route = authenticated ? "order" : "login";
        link.textContent = authenticated ? "Mes commandes" : "Se connecter";
      });
      if (!authenticated) return;

      const metadata = currentUser.user_metadata || {};
      const { firstName, lastName } = profileNames(metadata);
      const fields = {
        "customer-first-name": firstName,
        "customer-last-name": lastName,
        "customer-email": currentUser.email || "",
        "customer-whatsapp": metadata.phone || ""
      };
      Object.entries(fields).forEach(([id, value]) => {
        const input = document.getElementById(id);
        if (input && !input.value.trim() && value) input.value = value;
      });
      lastSavedProfile = JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        phone: String(metadata.phone || "").trim()
      });
    }

    function checkoutProfileData() {
      return {
        first_name: document.getElementById("customer-first-name").value.trim(),
        last_name: document.getElementById("customer-last-name").value.trim(),
        phone: document.getElementById("customer-whatsapp").value.trim()
      };
    }

    async function saveCheckoutProfile({ quiet = false } = {}) {
      if (!authToken || !currentUser) return false;
      const profile = checkoutProfileData();
      if (!profile.first_name && !profile.last_name && !profile.phone) return false;
      const signature = JSON.stringify(profile);
      if (signature === lastSavedProfile) return true;

      profileSaveStatus.textContent = "Enregistrement dans ton compte…";
      profileSaveStatus.classList.remove("hidden", "text-green-700", "text-red-700");
      try {
        await apiRequest("/update-profile", {
          method: "POST",
          body: JSON.stringify(profile)
        });
        currentUser.user_metadata = { ...(currentUser.user_metadata || {}), ...profile };
        lastSavedProfile = signature;
        profileSaveStatus.textContent = "Informations enregistrées dans ton compte.";
        profileSaveStatus.classList.add("text-green-700");
        return true;
      } catch (error) {
        profileSaveStatus.textContent = error.message || "Impossible d’enregistrer ces informations.";
        profileSaveStatus.classList.add("text-red-700");
        if (!quiet) showToast(profileSaveStatus.textContent);
        return false;
      }
    }

    async function restoreSession() {
      if (!authToken) {
        setAccountState(null);
        return false;
      }
      try {
        const result = await apiRequest("/me");
        setAccountState(result.user);
        const loginView = document.querySelector('[data-view="login"]');
        if (loginView && !loginView.classList.contains("hidden")) showRoute("order");
        return true;
      } catch {
        setAccountState(null);
        return false;
      }
    }

    function formatPrice(value) {
      return new Intl.NumberFormat("fr-DZ").format(value) + " DA";
    }

    function escapeHTML(value) {
      return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[character]);
    }

    function renewalCartItem(item) {
      const rawName = String(item?.name || item?.service || "").trim();
      const lowerName = rawName.toLowerCase();
      const service = lowerName.includes("netflix")
        ? "Netflix"
        : lowerName.includes("spotify")
          ? "Spotify"
          : lowerName.includes("crunchyroll")
            ? "Crunchyroll"
            : null;
      if (!service) return null;

      if (/\b(3 mois|6 mois)\b/.test(lowerName)) return null;
      const durationMatch = lowerName.match(/\b(1 an|1 mois)\b/);
      const duration = durationMatch?.[1] || "1 mois";
      const prices = {
        "Netflix|1 mois": 600,
        "Spotify|1 mois": 500,
        "Crunchyroll|1 mois": 500,
        "Crunchyroll|1 an": 3000,
        "Spotify|1 an": 4000
      };
      const price = prices[`${service}|${duration}`];
      if (price === undefined) return null;
      return {
        name: service === "Netflix" ? "Netflix Premium" : service === "Spotify" ? "Spotify Family" : "Crunchyroll Mega Fan",
        service,
        duration,
        price
      };
    }

    function renewOrder(orderIndex) {
      const order = loadedOrders[orderIndex];
      if (!order) return;
      const renewedItems = [];
      (Array.isArray(order.items) ? order.items : []).forEach(item => {
        const renewed = renewalCartItem(item);
        const quantity = Math.min(Math.max(Number(item?.quantity || 1), 1), 20);
        if (renewed && renewed.price > 0) {
          for (let index = 0; index < quantity; index += 1) renewedItems.push({ ...renewed });
        }
      });
      if (renewedItems.length === 0) {
        showToast("Impossible de reconstruire cette commande.");
        return;
      }
      cart = renewedItems;
      updateCart();
      setCheckoutStep(1);
      showRoute("cart");
      showToast("Abonnement ajouté pour renouvellement");
    }

    async function requestNetflixCode(button) {
      const orderId = button.dataset.orderId;
      const resultContainer = button.closest("article").querySelector(".netflix-code-result");
      const originalLabel = button.innerHTML;
      button.disabled = true;
      button.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2" aria-hidden="true"></i>Recherche du code…';
      resultContainer.classList.add("hidden");
      try {
        const result = await apiRequest("/get-netflix-otp", {
          method: "POST",
          body: JSON.stringify({ order_id: orderId })
        });
        let safeLink = "";
        if (result.link) {
          try {
            const parsedLink = new URL(result.link);
            if (parsedLink.protocol === "https:" && /(^|\.)netflix\.com$/i.test(parsedLink.hostname)) safeLink = parsedLink.href;
          } catch {}
        }
        if (!result.code && !safeLink) throw new Error("Aucun code Netflix récent n’a été trouvé.");
        resultContainer.innerHTML = `
          ${result.code ? `<p>Code Netflix : <strong class="ml-2 font-title text-xl tracking-[0.2em]">${escapeHTML(result.code)}</strong></p>` : ""}
          ${safeLink ? `<a class="mt-3 inline-flex min-h-10 items-center rounded-lg bg-[#E50914] px-4 font-bold text-white" href="${escapeHTML(safeLink)}" target="_blank" rel="noopener noreferrer">Ouvrir le lien Netflix</a>` : ""}`;
        resultContainer.classList.remove("hidden");
      } catch (error) {
        resultContainer.textContent = error.message || "Impossible de récupérer le code Netflix.";
        resultContainer.classList.remove("hidden");
      } finally {
        button.disabled = false;
        button.innerHTML = originalLabel;
      }
    }

    async function loadMyOrders() {
      const container = document.getElementById("my-orders-content");
      if (!container) return;
      if (!authToken) {
        container.innerHTML = `
          <div class="rounded-2xl border border-black/10 bg-white p-8 text-center shadow-soft">
            <h2 class="font-title text-xl font-bold">Connecte-toi pour voir tes commandes</h2>
            <button type="button" class="route-link mt-5 min-h-11 rounded-xl bg-aura px-5 font-title text-sm font-bold text-white" data-route="login">Se connecter</button>
          </div>`;
        container.querySelector(".route-link").addEventListener("click", event => showRoute(event.currentTarget.dataset.route));
        return;
      }

      container.innerHTML = `
        <div class="rounded-2xl border border-black/10 bg-white p-8 text-center shadow-soft">
          <i class="fa-solid fa-spinner fa-spin text-2xl text-aura" aria-hidden="true"></i>
          <p class="mt-3 text-sm text-black/55">Chargement de tes commandes…</p>
        </div>`;
      try {
        const result = await apiRequest("/my-orders");
        const orders = Array.isArray(result.orders) ? result.orders : [];
        if (orders.length === 0) {
          container.innerHTML = `
            <div class="rounded-2xl border border-black/10 bg-white p-8 text-center shadow-soft">
              <span class="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-black/5 text-xl text-black/40"><i class="fa-solid fa-box-open" aria-hidden="true"></i></span>
              <h2 class="mt-5 font-title text-xl font-bold">Aucune commande confirmée</h2>
              <p class="mt-2 text-sm text-black/50">Tes commandes payées apparaîtront ici.</p>
              <button type="button" class="route-link mt-6 min-h-11 rounded-xl bg-aura px-5 font-title text-sm font-bold text-white" data-route="products">Voir les offres</button>
            </div>`;
          container.querySelector(".route-link").addEventListener("click", event => showRoute(event.currentTarget.dataset.route));
          return;
        }

        loadedOrders = orders;
        container.innerHTML = `<div class="grid gap-5">${orders.map((order, orderIndex) => {
          const expirationDate = order.expires_at ? new Date(order.expires_at) : null;
          const hasValidExpiration = expirationDate && !Number.isNaN(expirationDate.getTime());
          const isExpired = hasValidExpiration && expirationDate.getTime() <= Date.now();
          const items = Array.isArray(order.items) ? order.items : [];
          const itemNames = items.map(item => escapeHTML(item.name || item.service || "Abonnement")).join(" · ");
          const hasNetflix = items.some(item => String(item.name || item.service || "").toLowerCase().includes("netflix"));
          const waitingForStock = Boolean(order.waiting_for_stock) ||
            (order.payment_status === "paid" && hasNetflix && !order.account);
          const status = isExpired
            ? { label: "Expiré", style: "bg-red-100 text-red-800" }
            : waitingForStock
            ? { label: "En attente de stock", style: "bg-amber-100 text-amber-800" }
            : ["active", "completed"].includes(order.status)
              ? { label: "Activé", style: "bg-green-100 text-green-800" }
              : { label: "Activation en cours", style: "bg-[#FBF4E9] text-[#8A632E]" };
          const orderId = escapeHTML(order.order_id || order.id || "");
          const date = order.created_at
            ? new Intl.DateTimeFormat("fr-DZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(order.created_at))
            : "";
          const expiration = hasValidExpiration
            ? new Intl.DateTimeFormat("fr-DZ", { dateStyle: "long" }).format(expirationDate)
            : "Définie après l’activation";
          const canGetNetflixCode = hasNetflix && Boolean(order.account) && !waitingForStock &&
            order.status === "active" && order.payment_status === "paid" && !isExpired;
          const canRenew = hasValidExpiration && !isExpired &&
            expirationDate.getTime() - Date.now() <= 3 * 24 * 60 * 60 * 1000;
          const account = order.account ? `
            <div class="mt-5 rounded-xl bg-green-50 p-4 text-sm text-green-900">
              <p class="font-title font-bold">Accès attribué</p>
              ${order.account.email ? `<p class="mt-2">E-mail : <strong>${escapeHTML(order.account.email)}</strong></p>` : ""}
              ${order.account.profile_name ? `<p>Profil : <strong>${escapeHTML(order.account.profile_name)}</strong></p>` : ""}
              ${order.account.profile_pin ? `<p>PIN : <strong>${escapeHTML(order.account.profile_pin)}</strong></p>` : ""}
            </div>` : "";
          const manualActivationForms = order.payment_status === "paid" && !isExpired &&
            !["active", "completed"].includes(order.status)
            ? items.filter(item => {
                const name = String(item.name || item.service || "").toLowerCase();
                return (name.includes("spotify") || name.includes("crunchyroll")) &&
                  !item.client_credentials_submitted;
              }).map(item => {
                const name = String(item.name || item.service || "").toLowerCase();
                const service = name.includes("spotify") ? "spotify" : "crunchyroll";
                const label = service === "spotify" ? "Spotify" : "Crunchyroll";
                return `
                  <form class="activation-credentials-form mt-5 rounded-2xl border border-black/10 bg-[#FBF4E9] p-5" data-order-id="${orderId}" data-service="${service}">
                    <h3 class="font-title text-sm font-bold">Finaliser l’activation ${label}</h3>
                    <p class="mt-1 text-xs leading-5 text-black/55">Utilise un mot de passe temporaire unique. Il sera chiffré côté serveur puis supprimé après l’activation.</p>
                    <div class="mt-4 grid gap-3 sm:grid-cols-2">
                      <label class="text-xs font-bold">E-mail du compte
                        <input name="email" type="email" required autocomplete="username" class="mt-2 min-h-11 w-full rounded-xl border border-black/15 bg-white px-4 text-sm font-normal outline-none focus:border-aura">
                      </label>
                      <label class="text-xs font-bold">Mot de passe temporaire
                        <input name="password" type="password" required autocomplete="current-password" class="mt-2 min-h-11 w-full rounded-xl border border-black/15 bg-white px-4 text-sm font-normal outline-none focus:border-aura">
                      </label>
                      <label class="text-xs font-bold sm:col-span-2">Numéro WhatsApp
                        <input name="whatsapp" type="tel" required autocomplete="tel" value="${escapeHTML(currentUser?.phone || "")}" class="mt-2 min-h-11 w-full rounded-xl border border-black/15 bg-white px-4 text-sm font-normal outline-none focus:border-aura">
                      </label>
                    </div>
                    <button type="submit" class="mt-4 min-h-11 rounded-xl bg-aura px-5 font-title text-sm font-bold text-white transition hover:bg-[#BE2E3D]">Envoyer mes informations ${label}</button>
                  </form>`;
              }).join("")
            : "";
          return `
            <article class="rounded-2xl border border-black/10 bg-white p-5 shadow-soft sm:p-7">
              <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p class="text-xs font-bold uppercase tracking-[0.12em] text-aura">${orderId}</p>
                  <h2 class="mt-2 font-title text-lg font-bold">${itemNames || "Commande Aura Stream"}</h2>
                  <p class="mt-2 text-xs text-black/45">${escapeHTML(date)}</p>
                  <p class="mt-2 text-sm font-semibold ${isExpired ? "text-red-700" : "text-black/65"}"><i class="fa-regular fa-calendar mr-2" aria-hidden="true"></i>Expiration : ${escapeHTML(expiration)}</p>
                </div>
                <div class="flex items-center gap-3 sm:flex-col sm:items-end">
                  <span class="rounded-full px-3 py-1.5 text-xs font-bold ${status.style}">${status.label}</span>
                  <strong class="font-title text-lg text-aura">${formatPrice(Number(order.amount || 0))}</strong>
                </div>
              </div>
              ${account}
              ${manualActivationForms}
              <div class="mt-5 flex flex-wrap gap-3 border-t border-black/10 pt-5">
                ${canGetNetflixCode ? `<button type="button" class="get-netflix-code min-h-11 rounded-xl bg-[#E50914] px-5 font-title text-sm font-bold text-white transition hover:bg-[#B8070F]" data-order-id="${orderId}"><i class="fa-solid fa-key mr-2" aria-hidden="true"></i>Obtenir le code</button>` : ""}
                ${canRenew ? `<button type="button" class="renew-order min-h-11 rounded-xl border border-aura px-5 font-title text-sm font-bold text-aura transition hover:bg-aura hover:text-white" data-order-index="${orderIndex}"><i class="fa-solid fa-rotate mr-2" aria-hidden="true"></i>Renouveler</button>` : ""}
              </div>
              <div class="netflix-code-result mt-4 hidden rounded-xl bg-[#FFF1F2] p-4 text-sm text-[#8F0A16]" role="status" aria-live="polite"></div>
            </article>`;
        }).join("")}</div>`;
        container.querySelectorAll(".renew-order").forEach(button => {
          button.addEventListener("click", () => renewOrder(Number(button.dataset.orderIndex)));
        });
        container.querySelectorAll(".get-netflix-code").forEach(button => {
          button.addEventListener("click", () => requestNetflixCode(button));
        });
        container.querySelectorAll(".activation-credentials-form").forEach(form => {
          form.addEventListener("submit", async event => {
            event.preventDefault();
            if (!form.reportValidity()) return;
            const button = form.querySelector('button[type="submit"]');
            const originalLabel = button.textContent;
            button.disabled = true;
            button.textContent = "Envoi sécurisé…";
            const data = new FormData(form);
            try {
              await apiRequest("/client-credentials", {
                method: "POST",
                body: JSON.stringify({
                  order_id: form.dataset.orderId,
                  service: form.dataset.service,
                  email: String(data.get("email") || "").trim(),
                  password: String(data.get("password") || ""),
                  whatsapp: String(data.get("whatsapp") || "").trim()
                })
              });
              showToast("Informations transmises en toute sécurité");
              await loadMyOrders();
            } catch (error) {
              showToast(error.message || "Impossible d’envoyer les informations");
              button.disabled = false;
              button.textContent = originalLabel;
            }
          });
        });
      } catch (error) {
        container.innerHTML = `
          <div class="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-red-800">
            <h2 class="font-title text-lg font-bold">Impossible de charger les commandes</h2>
            <p class="mt-2 text-sm">${escapeHTML(error.message || "Réessaie dans quelques instants.")}</p>
          </div>`;
      }
    }

    function showToast(message) {
      toastMessage.textContent = message;
      toast.classList.add("toast-show");
      window.clearTimeout(showToast.timeout);
      showToast.timeout = window.setTimeout(() => toast.classList.remove("toast-show"), 2600);
    }

    function showRoute(route, scrollTarget) {
      const selected = document.querySelector(`[data-view="${route}"]`) || document.querySelector('[data-view="home"]');
      views.forEach(view => view.classList.toggle("hidden", view !== selected));
      navLinks.forEach(link => {
        const isCurrent = link.dataset.route === route;
        link.setAttribute("aria-current", isCurrent ? "page" : "false");
      });
      mobileMenu.classList.add("hidden");
      mobileToggle.setAttribute("aria-expanded", "false");
      window.history.replaceState(null, "", "#" + route);
      if (route === "order") loadMyOrders();
      if (route === "cart") setCheckoutStep(1);

      if (scrollTarget) {
        requestAnimationFrame(() => {
          const target = document.getElementById(scrollTarget);
          if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }

    routeLinks.forEach(link => {
      link.addEventListener("click", () => showRoute(link.dataset.route, link.dataset.scroll));
    });

    mobileToggle.addEventListener("click", () => {
      const expanded = mobileToggle.getAttribute("aria-expanded") === "true";
      mobileToggle.setAttribute("aria-expanded", String(!expanded));
      mobileMenu.classList.toggle("hidden", expanded);
    });

    document.querySelectorAll(".duration-btn").forEach(button => {
      button.addEventListener("click", () => {
        const card = button.closest(".product-card");
        card.querySelectorAll(".duration-btn").forEach(item => item.setAttribute("aria-pressed", "false"));
        button.setAttribute("aria-pressed", "true");
        card.querySelector(".price-value").innerHTML = `${formatPrice(Number(button.dataset.price)).replace(" DA", "")} <span class="text-sm">DA</span>`;
      });
    });

    document.querySelectorAll(".filter-btn").forEach(button => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".filter-btn").forEach(item => item.setAttribute("aria-pressed", "false"));
        button.setAttribute("aria-pressed", "true");
        const filter = button.dataset.filter;
        document.querySelectorAll(".product-card").forEach(card => {
          card.classList.toggle("hidden", filter !== "all" && card.dataset.service !== filter);
        });
      });
    });

    document.querySelectorAll(".add-product").forEach(button => {
      button.addEventListener("click", () => {
        const card = button.closest(".product-card");
        const activeDuration = card.querySelector('.duration-btn[aria-pressed="true"]');
        const item = {
          name: card.dataset.product,
          service: card.dataset.service[0].toUpperCase() + card.dataset.service.slice(1),
          duration: activeDuration.dataset.duration,
          price: Number(activeDuration.dataset.price)
        };
      cart.push(item);
      updateCart();
      showToast(`${item.name} ajouté au panier`);
      trackMeta("AddToCart", {
        value: item.price,
        currency: "DZD",
        content_type: "product",
        content_ids: [apiProductName(item)],
        contents: [{ id: apiProductName(item), quantity: 1 }],
      });
        const original = button.textContent;
        button.textContent = "Ajouté !";
        window.setTimeout(() => button.textContent = original, 1500);
      });
    });

    function updateCart() {
      cartCount.textContent = String(cart.length);
      const hasNetflix = cart.some(item => item.service === "Netflix");
      const hasSpotify = cart.some(item => item.service === "Spotify");
      const hasCrunchyroll = cart.some(item => item.service === "Crunchyroll");
      const hasManualActivation = hasSpotify || hasCrunchyroll;
      document.getElementById("spotify-credentials-panel").classList.toggle(
        "hidden",
        !hasSpotify
      );
      document.getElementById("crunchyroll-credentials-panel").classList.toggle(
        "hidden",
        !hasCrunchyroll
      );
      ["spotify-email", "spotify-password"].forEach(id => {
        document.getElementById(id).required = hasSpotify;
      });
      ["crunchyroll-email", "crunchyroll-password"].forEach(id => {
        document.getElementById(id).required = hasCrunchyroll;
      });
      document.getElementById("netflix-delivery-note")?.classList.toggle("hidden", !hasNetflix);
      const customerInfoDescription = document.getElementById("customer-info-description");
      if (customerInfoDescription) {
        customerInfoDescription.textContent = hasNetflix && hasManualActivation
          ? "Ton profil Netflix sera envoyé à cette adresse. Les autres activations seront confirmées sur WhatsApp."
          : hasNetflix
            ? "Ton profil Netflix sera envoyé à cette adresse après confirmation du paiement."
            : hasManualActivation
              ? "La confirmation d’activation sera transmise à cette adresse et sur WhatsApp."
              : "Tes informations servent à rattacher la commande à ton compte et à te prévenir sur WhatsApp.";
      }
      const itemsContainer = document.getElementById("checkout-items");
      if (!itemsContainer) return;

      if (cart.length === 0) {
        itemsContainer.innerHTML = '<p class="py-8 text-center text-sm text-black/50">Ton panier est vide.</p>';
      } else {
        itemsContainer.innerHTML = cart.map((item, index) => `
          <article class="flex items-start gap-3 py-4 first:pt-0">
            <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-black/5 text-sm font-extrabold">${item.service[0]}</span>
            <div class="min-w-0 flex-1">
              <h3 class="truncate font-title text-sm font-bold">${item.name}</h3>
              <p class="mt-1 text-xs text-black/45">${item.duration}</p>
            </div>
            <div class="text-right">
              <p class="font-title text-sm font-extrabold">${formatPrice(item.price)}</p>
              <button class="remove-cart mt-1 text-xs font-semibold text-aura hover:underline" data-index="${index}">Supprimer</button>
            </div>
          </article>
        `).join("");
      }

      const total = cart.reduce((sum, item) => sum + item.price, 0);
      document.getElementById("subtotal-value").textContent = formatPrice(total);
      document.getElementById("checkout-total").textContent = formatPrice(total);
      document.getElementById("pay-total").textContent = formatPrice(total);

      document.querySelectorAll(".remove-cart").forEach(removeButton => {
        removeButton.addEventListener("click", () => {
          cart.splice(Number(removeButton.dataset.index), 1);
          updateCart();
          showToast("Article retiré du panier");
        });
      });
    }

    function setCheckoutStep(step) {
      document.querySelectorAll("[data-checkout-panel]").forEach(panel => {
        panel.classList.toggle("hidden", Number(panel.dataset.checkoutPanel) !== step);
      });
      document.querySelectorAll("[data-step-indicator]").forEach(indicator => {
        indicator.classList.toggle("opacity-40", Number(indicator.dataset.stepIndicator) > step);
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    document.getElementById("to-payment").addEventListener("click", async () => {
      const form = document.getElementById("customer-form");
      if (!form.reportValidity()) return;
      if (!authToken) {
        showToast("Connecte-toi avant de continuer");
        showRoute("login");
        setAuthFeedback("Connecte-toi pour associer cette commande à ton compte.");
        return;
      }
      if (cart.length === 0) {
        showToast("Ton panier est vide");
        showRoute("products");
        return;
      }
      await saveCheckoutProfile({ quiet: true });
      trackMeta("InitiateCheckout", {
        value: cart.reduce((sum, item) => sum + item.price, 0),
        currency: "DZD",
        content_type: "product",
        content_ids: cart.map(apiProductName),
        num_items: cart.length,
      });
      setCheckoutStep(2);
    });

    document.getElementById("back-to-information").addEventListener("click", () => {
      setCheckoutStep(1);
    });

    document.getElementById("pay-button").addEventListener("click", async event => {
      const button = event.currentTarget;
      if (!authToken) {
        showRoute("login");
        setAuthFeedback("Connecte-toi pour lancer le paiement.");
        return;
      }
      if (cart.length === 0) {
        showToast("Ton panier est vide");
        showRoute("products");
        return;
      }
      const originalLabel = button.innerHTML;
      button.disabled = true;
      button.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2" aria-hidden="true"></i>Préparation…';
      try {
        const spotify = cart.find(item => item.service === "Spotify");
        const crunchyroll = cart.find(item => item.service === "Crunchyroll");
        const spotifyEmail = document.getElementById("spotify-email").value.trim();
        const spotifyPassword = document.getElementById("spotify-password").value;
        const crunchyrollEmail = document.getElementById("crunchyroll-email").value.trim();
        const crunchyrollPassword = document.getElementById("crunchyroll-password").value;
        const whatsapp = document.getElementById("customer-whatsapp").value.trim();
        if (spotify && (!spotifyEmail || !spotifyPassword || !whatsapp)) {
          throw new Error("Renseigne les identifiants Spotify et ton numéro WhatsApp avant de payer.");
        }
        if (crunchyroll && (!crunchyrollEmail || !crunchyrollPassword || !whatsapp)) {
          throw new Error("Renseigne les identifiants Crunchyroll et ton numéro WhatsApp avant de payer.");
        }
        const order = await apiRequest("/create-order", {
          method: "POST",
          body: JSON.stringify({
            items: cart.map(item => ({ name: apiProductName(item), quantity: 1 })),
          marketing_consent: marketingConsentInput?.checked === true,
          marketing_consent_version: marketingConsentInput?.checked === true ? META_CONSENT_VERSION : undefined
          })
        });
        activeOrderId = order.order_id || order.id;
        if (!activeOrderId) throw new Error("La commande n’a pas reçu d’identifiant.");
        sessionStorage.setItem("aura_order_id", activeOrderId);

        const pendingCredentials = [];
        if (spotify) {
          pendingCredentials.push({ service: "spotify", email: spotifyEmail, password: spotifyPassword, whatsapp });
        }
        if (crunchyroll) {
          pendingCredentials.push({ service: "crunchyroll", email: crunchyrollEmail, password: crunchyrollPassword, whatsapp });
        }
        savePendingCredentials(activeOrderId, pendingCredentials);

        const invoice = await apiRequest("/create-invoice", {
          method: "POST",
          body: JSON.stringify({ order_id: activeOrderId })
        });
        if (!invoice?.payment_url) throw new Error("Le prestataire de paiement n’a pas renvoyé de lien.");
        window.location.assign(invoice.payment_url);
      } catch (error) {
        if (activeOrderId) sessionStorage.removeItem(pendingCredentialsKey(activeOrderId));
        showToast(error.message || "Impossible de préparer le paiement");
        button.disabled = false;
        button.innerHTML = originalLabel;
      }
    });

    document.getElementById("toggle-password").addEventListener("click", () => {
      const input = document.getElementById("spotify-password");
      const visible = input.type === "text";
      input.type = visible ? "password" : "text";
      document.getElementById("toggle-password").setAttribute("aria-label", visible ? "Afficher le mot de passe" : "Masquer le mot de passe");
    });

    document.querySelectorAll(".auth-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".auth-tab").forEach(item => {
          const selected = item === tab;
          item.setAttribute("aria-selected", String(selected));
          item.classList.toggle("bg-white", selected);
          item.classList.toggle("shadow-sm", selected);
          item.classList.toggle("text-black/45", !selected);
        });
        document.querySelectorAll("[data-auth-panel]").forEach(panel => {
          panel.classList.toggle("hidden", panel.dataset.authPanel !== tab.dataset.auth);
        });
      });
    });

    document.querySelectorAll(".faq-question").forEach(button => {
      button.addEventListener("click", () => {
        const item = button.closest(".faq-item");
        const isOpen = item.dataset.open === "true";
        item.dataset.open = String(!isOpen);
        button.setAttribute("aria-expanded", String(!isOpen));
      });
    });

    function normalizeSearch(value) {
      return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/gi, " ")
        .trim()
        .toLowerCase();
    }

    function filterFaq(term) {
      const tokens = normalizeSearch(term).split(/\s+/).filter(token => token.length > 1);
      document.querySelectorAll(".faq-item").forEach(item => {
        const haystack = normalizeSearch(`${item.textContent} ${item.dataset.keywords}`);
        item.classList.toggle("hidden", tokens.length > 0 && !tokens.every(token => haystack.includes(token)));
      });
    }

    document.getElementById("faq-search").addEventListener("input", event => filterFaq(event.target.value));
    document.querySelectorAll(".faq-category").forEach(button => {
      button.addEventListener("click", () => {
        const term = button.textContent.trim();
        document.getElementById("faq-search").value = term;
        filterFaq(term);
      });
    });

    document.getElementById("signin-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const submitButton = form.querySelector('button[type="submit"]');
      const originalLabel = submitButton.textContent;
      submitButton.disabled = true;
      submitButton.textContent = "Connexion…";
      try {
        const result = await apiRequest("/login", {
          method: "POST",
          body: JSON.stringify({
            email: document.getElementById("signin-email").value.trim(),
            password: document.getElementById("signin-password").value
          })
        });
        saveAuthToken(result.access_token, document.getElementById("remember-me").checked);
        setAccountState(result.user);
        setAuthFeedback("Connexion réussie. Tu peux maintenant finaliser ta commande.", false);
        showToast("Connexion réussie");
        showRoute("cart");
        setCheckoutStep(1);
      } catch (error) {
        setAuthFeedback(error.message || "Connexion impossible.");
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = originalLabel;
      }
    });

    document.getElementById("signup-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const submitButton = form.querySelector('button[type="submit"]');
      const originalLabel = submitButton.textContent;
      submitButton.disabled = true;
      submitButton.textContent = "Création…";
      try {
        const firstName = document.getElementById("signup-first-name").value.trim();
        const lastName = document.getElementById("signup-last-name").value.trim();
        const result = await apiRequest("/register", {
          method: "POST",
          body: JSON.stringify({
            email: document.getElementById("signup-email").value.trim(),
            password: document.getElementById("signup-password").value,
            full_name: `${firstName} ${lastName}`.trim()
          })
        });
        if (result.access_token) {
          saveAuthToken(result.access_token, true);
          setAccountState(result.user);
          showRoute("cart");
          setCheckoutStep(1);
          showToast("Compte créé");
        } else {
          setAuthFeedback("Compte créé. Vérifie ton e-mail puis connecte-toi pour continuer.", false);
          showToast("Vérifie ton e-mail");
        }
      } catch (error) {
        setAuthFeedback(error.message || "Création du compte impossible.");
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = originalLabel;
      }
    });

    document.getElementById("support-form").addEventListener("submit", event => {
      event.preventDefault();
      const name = document.getElementById("support-name").value.trim();
      const email = document.getElementById("support-email").value.trim();
      const message = document.getElementById("support-message").value.trim();
      const text = `Bonjour Aura Stream,\n\nNom : ${name}\nE-mail : ${email}\n\nMa demande :\n${message}`;
      window.open(`https://wa.me/213557828812?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
      showToast("WhatsApp est ouvert avec ton message prêt à envoyer.");
    });

    ["customer-first-name", "customer-last-name", "customer-whatsapp"].forEach(id => {
      document.getElementById(id).addEventListener("change", () => saveCheckoutProfile());
    });

    async function verifyPaymentReturn() {
      const params = new URLSearchParams(window.location.search);
      const orderId = params.get("order_id") || params.get("orderId");
      if (!orderId || !authToken) return;
      activeOrderId = orderId;
      sessionStorage.setItem("aura_order_id", orderId);
      try {
        await apiRequest("/verify-payment", { method: "POST", body: JSON.stringify({ order_id: orderId }) });
        showRoute("order");
        try {
          const credentialsSubmitted = await submitPendingCredentials(orderId);
          showToast(credentialsSubmitted ? "Paiement vérifié et activation transmise" : "Paiement vérifié");
        } catch {
          showToast("Paiement vérifié — finalise l’activation dans Mes commandes");
        }
      } catch {
        showRoute("order");
        showToast("Paiement en cours de vérification");
      }
    }

    updateCart();
    const initialRoute = window.location.hash.replace("#", "");
    if (["home", "products", "cart", "order", "login", "faq"].includes(initialRoute)) {
      showRoute(initialRoute);
    }
    restoreSession().then(() => verifyPaymentReturn());
