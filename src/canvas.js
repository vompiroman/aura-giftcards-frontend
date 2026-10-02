import {
  META_CONSENT_VERSION,
  getMetaMarketingConsent,
  initializeMetaPixel,
  setMetaMarketingConsent,
  trackMeta,
} from "./meta.js";
import { clearAuthSession } from "./session.js";
import { createSessionRecovery } from "./session-recovery.js";
import { authenticatedRequest } from "./authenticated-request.js";
import { formatAlgerianPhoneInput, normalizeAlgerianPhone } from "./phone.js";
import { orderItemPresentation, prioritizeOrder } from "./order-display.js";
import { groupInventoryByAccount, groupedInventoryPayload } from "./inventory-groups.js";
import {
  formatLocalizedDate,
  formatLocalizedNumber,
  getLanguage,
  getLocale,
  initializeI18n,
  t,
} from "./i18n.js";

initializeI18n();

const initialQueryParams = new URLSearchParams(window.location.search);
const initialHash = window.location.hash.replace(/^#/, "");
const initialHashParams = initialHash.includes("=") ? new URLSearchParams(initialHash) : new URLSearchParams();
let capturedRecoveryToken = initialHashParams.get("type") === "recovery"
  ? String(initialHashParams.get("access_token") || "")
  : "";
const recoveryRequested = initialQueryParams.get("type") === "recovery"
  || initialHashParams.get("type") === "recovery"
  || Boolean(capturedRecoveryToken);
const sensitiveTokenInUrl = recoveryRequested
  || ["access_token", "refresh_token", "provider_token", "token"].some((key) => (
    initialQueryParams.has(key) || initialHashParams.has(key)
  ));
if (sensitiveTokenInUrl) {
  window.__auraSensitiveAuthFlow = true;
  window.history.replaceState({}, document.title, `${window.location.pathname}#login`);
}

const views = [...document.querySelectorAll("[data-view]")];
    const navLinks = [...document.querySelectorAll(".nav-link")];
    const mobileMenu = document.getElementById("mobile-menu");
    const mobileToggle = document.getElementById("mobile-menu-toggle");
    const cartCount = document.getElementById("cart-count");
    const headerCartButton = document.getElementById("header-cart-button");
    const toast = document.getElementById("toast");
    const toastMessage = document.getElementById("toast-message");
    const accountLinks = [...document.querySelectorAll(".account-link")];
    const adminLinks = [...document.querySelectorAll(".admin-link")];
    const sessionSignoutButtons = [...document.querySelectorAll(".session-signout")];
const profileSaveStatus = document.getElementById("profile-save-status");
const marketingConsentInput = document.getElementById("marketing-consent");
const marketingConsentBanner = document.getElementById("marketing-consent-banner");
    // Keep authentication same-origin. Vercel and the local Vite server proxy
    // /api to Render, so HttpOnly cookies never become third-party cookies.
    const API_BASE = "/api";
    let clientErrorReportInFlight = false;
    function reportClientError({ event = "runtime", message = "Unexpected client error", source = "browser", line, column } = {}) {
      if (clientErrorReportInFlight) return;
      clientErrorReportInFlight = true;
      const payload = {
        event: String(event).slice(0, 40),
        message: String(message).replace(/[?#].*$/, "").slice(0, 300),
        route: window.location.pathname.slice(0, 160),
        source: String(source).split(/[?#]/)[0].slice(0, 160),
        line: Number.isFinite(Number(line)) ? Number(line) : undefined,
        column: Number.isFinite(Number(column)) ? Number(column) : undefined,
      };
      fetch(`${API_BASE}/client-errors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        keepalive: true,
        body: JSON.stringify(payload),
      }).catch(() => {}).finally(() => { clientErrorReportInFlight = false; });
    }
    window.addEventListener("error", event => reportClientError({
      event: "runtime",
      message: event.message || "Window error",
      source: event.filename || "browser",
      line: event.lineno,
      column: event.colno,
    }));
    window.addEventListener("unhandledrejection", event => reportClientError({
      event: "unhandledrejection",
      message: event.reason instanceof Error ? event.reason.message : "Unhandled promise rejection",
      source: "promise",
    }));
    const authFeedback = document.getElementById("auth-feedback");
    let authRevision = 0;
    let sessionCheckPending = true;
    let paymentReturnHandled = false;
    let activeOrderId = sessionStorage.getItem("aura_order_id") || "";
    let highlightedOrderId = "";
    let currentUser = null;
    const sessionRecovery = createSessionRecovery({
      request: signal => apiRequest("/session", { method: "POST", body: "{}", cache: "no-store", signal }),
      isVisible: () => document.visibilityState === "visible",
      // Cookies are shared across tabs. Serialize rotation so an older response
      // cannot overwrite the token installed by another tab.
      runExclusive: (signal, work) => navigator.locks?.request
        ? navigator.locks.request("aura-auth-session", { signal }, work) : work(),
      onStatus: status => {
        sessionCheckPending = ["checking", "retrying"].includes(status);
        const message = status === "retrying"
          ? "Connexion momentanément indisponible. Nouvelle tentative automatique…"
          : "Restauration de ta connexion…";
        const notice = document.getElementById("session-recovery-status");
        if (notice) {
          notice.textContent = t(message);
          notice.classList.toggle("hidden", !sessionCheckPending || Boolean(currentUser));
        }
        if (!currentUser) {
          accountLinks.forEach(link => { link.textContent = sessionCheckPending ? t("Restauration de ta connexion…") : t("Se connecter"); });
          if (activeRoute === "order") void loadMyOrders();
        }
      },
      onResult: result => {
        setAccountState(result.authenticated ? result.user : null, result.expires_at);
        if (!result.authenticated) {
          adminLoaded = false;
          if (activeRoute === "admin") showRoute("login");
          return;
        }
        if (activeRoute === "admin" && result.user.is_admin === true) void loadAdminDashboard();
        else if (activeRoute === "order") void loadMyOrders();
        if (activeRoute === "login" && !recoveryRequested) {
          showRoute(cart.length ? "cart" : result.user.is_admin === true ? "admin" : "order");
        }
        if (!paymentReturnHandled) { paymentReturnHandled = true; void verifyPaymentReturn(); }
      },
    });
    let lastSavedProfile = "";
let loadedOrders = [];
let activePromo = null;
let activeRenewalOffer = null;
let pendingPaymentAttempt = null;
let adminOrdersPage = 1;
let adminOrdersTotalPages = 1;
let adminLoaded = false;
let adminRevenueReport = null;
let adminInventory = [];
const expandedStockAccounts = new Set();

    // Purge tokens and cached profile data left by pre-cookie deployments.
    clearAuthSession(sessionStorage, localStorage);

    function warmApiConnection() {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 20000);
      fetch(`${API_BASE}/healthz`, {
        method: "GET",
        cache: "no-store",
        credentials: "include",
        signal: controller.signal
      }).catch(() => {}).finally(() => window.clearTimeout(timer));
    }

    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(warmApiConnection, { timeout: 1000 });
    } else {
      window.setTimeout(warmApiConnection, 0);
    }

const storedMarketingConsent = getMetaMarketingConsent();
if (marketingConsentInput) {
  marketingConsentInput.checked = storedMarketingConsent?.status === "granted";
  marketingConsentInput.addEventListener("change", () => {
    setMetaMarketingConsent(marketingConsentInput.checked);
    if (marketingConsentInput.checked) trackLandingView(activeRoute);
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
  trackLandingView(activeRoute);
  if (marketingConsentInput) marketingConsentInput.checked = true;
  marketingConsentBanner?.classList.add("hidden");
});
document.getElementById("decline-marketing")?.addEventListener("click", () => {
  setMetaMarketingConsent(false);
  if (marketingConsentInput) marketingConsentInput.checked = false;
  marketingConsentBanner?.classList.add("hidden");
});

    const CART_STORAGE_KEY = "aura_checkout_cart";
    const RENEWAL_ORDER_STORAGE_KEY = "aura_checkout_renewal_order_id";
    const RENEWAL_OFFER_STORAGE_KEY = "aura_checkout_renewal_offer";
    const allowedCartPrices = new Map([
      ["Snapchat|Snapchat+|3 mois", 2000],
      ["Snapchat|Snapchat+|6 mois", 2500],
      ["Netflix|Netflix Premium|1 mois", 600],
      ["Netflix|Netflix Premium|2 mois", 1100],
      ["Spotify|Spotify Family|1 mois", 800],
      ["Spotify|Spotify Family|1 an", 4000],
      ["Crunchyroll|Crunchyroll Mega Fan|1 mois", 500],
      ["Crunchyroll|Crunchyroll Mega Fan|1 an", 3000],
    ]);

    function loadSavedCart() {
      try {
        const stored = JSON.parse(sessionStorage.getItem(CART_STORAGE_KEY) || "[]");
        if (!Array.isArray(stored)) return [];
        return stored.slice(0, 20).flatMap((item) => {
          const name = String(item?.name || "");
          const service = String(item?.service || "");
          const duration = String(item?.duration || "");
          const price = allowedCartPrices.get(`${service}|${name}|${duration}`);
          return price === undefined ? [] : [{ name, service, duration, price }];
        });
      } catch {
        sessionStorage.removeItem(CART_STORAGE_KEY);
        return [];
      }
    }

    function persistCart() {
      if (cart.length > 0) sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
      else {
        sessionStorage.removeItem(CART_STORAGE_KEY);
        setRenewalOrderId(null);
      }
    }

    function loadSavedRenewalOrderId() {
      const value = String(sessionStorage.getItem(RENEWAL_ORDER_STORAGE_KEY) || "").trim();
      if (/^ORD-[A-Za-z0-9-]{6,40}$/.test(value)) return value;
      sessionStorage.removeItem(RENEWAL_ORDER_STORAGE_KEY);
      return null;
    }

    function normalizeRenewalOffer(value) {
      const percent = Number(value?.discount_percent);
      const subtotal = Number(value?.subtotal);
      const discountAmount = Number(value?.discount_amount);
      const total = Number(value?.total);
      if (
        value?.eligible !== true
        || !Number.isFinite(percent)
        || percent <= 0
        || percent > 100
        || !Number.isFinite(subtotal)
        || subtotal <= 0
        || !Number.isFinite(discountAmount)
        || discountAmount <= 0
        || !Number.isFinite(total)
        || total !== subtotal - discountAmount
      ) return null;
      return { eligible: true, discount_percent: percent, subtotal, discount_amount: discountAmount, total };
    }

    function loadSavedRenewalOffer() {
      try {
        const offer = normalizeRenewalOffer(JSON.parse(sessionStorage.getItem(RENEWAL_OFFER_STORAGE_KEY) || "null"));
        if (offer) return offer;
      } catch {
        // Invalid session data is cleared below.
      }
      sessionStorage.removeItem(RENEWAL_OFFER_STORAGE_KEY);
      return null;
    }

    function setRenewalOffer(value) {
      activeRenewalOffer = normalizeRenewalOffer(value);
      if (activeRenewalOffer) {
        sessionStorage.setItem(RENEWAL_OFFER_STORAGE_KEY, JSON.stringify(activeRenewalOffer));
      } else {
        sessionStorage.removeItem(RENEWAL_OFFER_STORAGE_KEY);
      }
    }

    function setRenewalOrderId(value) {
      renewalOrderId = typeof value === "string" && /^ORD-[A-Za-z0-9-]{6,40}$/.test(value)
        ? value
        : null;
      if (renewalOrderId) sessionStorage.setItem(RENEWAL_ORDER_STORAGE_KEY, renewalOrderId);
      else {
        sessionStorage.removeItem(RENEWAL_ORDER_STORAGE_KEY);
        setRenewalOffer(null);
      }
    }

    let cart = loadSavedCart();
    let renewalOrderId = loadSavedRenewalOrderId();
    activeRenewalOffer = renewalOrderId ? loadSavedRenewalOffer() : null;
    let activeRoute = "home";
    let lastTrackedLanding = "";
    const landingRoutes = {
      "landing-snapchat": {
        path: "/snapchat-plus-algerie",
        title: "Snapchat+ en Algérie — Aura Stream",
        description: "Snapchat+ : 3 mois à 2 000 DA ou 6 mois à 2 500 DA. Renseigne ton nom d’utilisateur et ajoute @aura-stream.",
        product: "Snapchat+", service: "Snapchat", price: 2000,
      },
      "landing-netflix": {
        path: "/netflix-algerie",
        title: "Netflix Premium en Algérie — Aura Stream",
        description: "Accès à un profil Netflix Premium, livré automatiquement après confirmation du paiement.",
        product: "Netflix Premium",
        service: "Netflix",
        price: 600,
      },
      "landing-spotify": {
        path: "/spotify-family-algerie",
        title: "Spotify Family en Algérie — Aura Stream",
        description: "Accès Spotify Family activé sur ton compte avec accompagnement humain en Algérie.",
        product: "Spotify Family",
        service: "Spotify",
        price: 800,
      },
      "landing-crunchyroll": {
        path: "/crunchyroll-mega-fan-algerie",
        title: "Crunchyroll Mega Fan en Algérie — Aura Stream",
        description: "Crunchyroll Mega Fan activé sur ton compte avec suivi et support en Algérie.",
        product: "Crunchyroll Mega Fan",
        service: "Crunchyroll",
        price: 500,
      },
    };
    const contentRoutes = {
      legal: {
        path: "/legal",
        title: "Conditions, confidentialité et remboursements — Aura Stream",
        description: "Consulte les conditions de vente, la politique de confidentialité et les règles de remboursement d’Aura Stream.",
      },
    };
    const routeNames = new Set([
      "home", "products", "cart", "order", "login", "faq", "admin",
      ...Object.keys(landingRoutes),
      ...Object.keys(contentRoutes),
    ]);

    function routeFromLocation() {
      const matchingLanding = Object.entries(landingRoutes).find(([, page]) => page.path === window.location.pathname);
      if (matchingLanding) return matchingLanding[0];
      const matchingContent = Object.entries(contentRoutes).find(([, page]) => page.path === window.location.pathname);
      if (matchingContent) return matchingContent[0];
      const hashRoute = window.location.hash.replace("#", "");
      return routeNames.has(hashRoute) ? hashRoute : "home";
    }

    function updateRouteMetadata(route) {
      const page = landingRoutes[route] || contentRoutes[route];
      const title = t(page?.title || "Aura Stream — Comptes streaming en Algérie");
      const description = t(page?.description || "Aura Stream — Netflix, Spotify et Crunchyroll au meilleur prix en Algérie.");
      const canonicalUrl = `https://www.aura-stream.com${page?.path || "/"}`;
      const privateRoute = ["cart", "order", "login", "admin"].includes(route);
      document.title = title;
      document.querySelector('meta[name="description"]')?.setAttribute("content", description);
      document.querySelector('meta[name="robots"]')?.setAttribute("content", privateRoute ? "noindex,nofollow" : "index,follow");
      document.querySelector('meta[property="og:title"]')?.setAttribute("content", title);
      document.querySelector('meta[property="og:description"]')?.setAttribute("content", description);
      document.querySelector('meta[property="og:url"]')?.setAttribute("content", canonicalUrl);
      document.querySelector('meta[property="og:type"]')?.setAttribute("content", landingRoutes[route] ? "product" : "website");
      document.querySelector('meta[name="twitter:title"]')?.setAttribute("content", title);
      document.querySelector('meta[name="twitter:description"]')?.setAttribute("content", description);
      document.querySelector('link[rel="canonical"]')?.setAttribute("href", canonicalUrl);

      document.querySelectorAll("[data-page-schema], [data-route-schema]").forEach(node => node.remove());
      const landing = landingRoutes[route];
      if (landing) {
        const schema = document.createElement("script");
        schema.type = "application/ld+json";
        schema.dataset.routeSchema = "";
        schema.textContent = JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Product",
          name: landing.product,
          url: canonicalUrl,
          offers: {
            "@type": "Offer",
            priceCurrency: "DZD",
            price: landing.price,
            availability: "https://schema.org/InStock",
            url: canonicalUrl,
            seller: { "@type": "Organization", name: "Aura Stream" },
          },
        });
        document.head.append(schema);
      }
    }

    function trackLandingView(route) {
      const landing = landingRoutes[route];
      if (!landing || lastTrackedLanding === route) return false;
      const tracked = trackMeta("ViewContent", {
        content_name: landing.product,
        content_category: "Streaming",
        content_type: "product",
        content_ids: [landing.product],
        value: landing.price,
        currency: "DZD",
      });
      if (tracked) lastTrackedLanding = route;
      return tracked;
    }

    function updateMobileCartBar() {
      const bar = document.getElementById("mobile-cart-bar");
      if (!bar) return;
      const visibleRoutes = new Set(["home", "products", ...Object.keys(landingRoutes)]);
      const shouldShow = cart.length > 0 && visibleRoutes.has(activeRoute);
      const subtotal = cart.reduce((sum, item) => sum + Number(item.price || 0), 0);
      const discount = activeRenewalOffer
        ? Math.min(Number(activeRenewalOffer.discount_amount || 0), subtotal)
        : activePromo
          ? Math.min(Number(activePromo.discount_amount || 0), subtotal)
          : 0;
      const total = Math.max(0, subtotal - discount);
      const summary = document.getElementById("mobile-cart-summary");
      const totalLabel = document.getElementById("mobile-cart-total");
      if (summary) summary.textContent = `${cart.length} article${cart.length > 1 ? "s" : ""} · ${formatPrice(total)}`;
      if (totalLabel) totalLabel.textContent = discount > 0 ? `Remise incluse · −${formatPrice(discount)}` : "Paiement CIB / Edahabia";
      bar.classList.toggle("hidden", !shouldShow);
      bar.setAttribute("aria-hidden", String(!shouldShow));
      document.body.classList.toggle("has-mobile-cart-bar", shouldShow);
    }

    function setAuthFeedback(message, isError = true) {
      if (!authFeedback) return;
      authFeedback.textContent = t(message);
      authFeedback.classList.remove("hidden", "bg-red-50", "text-red-800", "bg-green-50", "text-green-800");
      authFeedback.classList.add(isError ? "bg-red-50" : "bg-green-50", isError ? "text-red-800" : "text-green-800");
    }

    const publicAuthPaths = new Set([
      "/login",
      "/register",
      "/forgot-password",
      "/reset-password",
      "/refresh-session",
      "/session",
    ]);

    function clearCurrentAuthSession({ redirectToLogin = true } = {}) {
      interruptSessionRestore();
      clearAuthSession(sessionStorage, localStorage);
      setAccountState(null);
      adminLoaded = false;
      adminRevenueReport = null;
      if (redirectToLogin && ["admin", "order"].includes(activeRoute)) showRoute("login");
    }

    async function refreshAuthSession() {
      // Recovery, focus and failed API requests share the same rotation.
      // Only /session's confirmed anonymous result can sign a customer out.
      return sessionRecovery.check({ force: true, throwOnError: true });
    }
    async function apiRequest(path, requestOptions = {}) {
      const usesPublicAuth = publicAuthPaths.has(path);
      const headers = { "Content-Type": "application/json", "Accept-Language": getLanguage(), ...(requestOptions.headers || {}) };
      try {
        const response = await authenticatedRequest({
          publicAuth: usesPublicAuth,
          getRevision: () => authRevision,
          restore: refreshAuthSession,
          request: async () => {
            // Each attempt gets its own deadline. Waiting for a cold-start
            // restoration must not consume the subsequent request's timeout.
            const controller = new AbortController();
            const timeoutId = window.setTimeout(() => controller.abort(), usesPublicAuth ? 65000 : 30000);
            try {
              return await fetch(`${API_BASE}${path}`, {
                ...requestOptions, headers, credentials: "include",
                signal: requestOptions.signal ? AbortSignal.any([requestOptions.signal, controller.signal]) : controller.signal,
              });
            } finally { window.clearTimeout(timeoutId); }
          },
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const message = typeof payload?.error === "string"
            ? payload.error
            : typeof payload?.message === "string" ? payload.message : `Erreur API (${response.status})`;
          throw new Error(t(message));
        }
        return payload;
      } catch (error) {
        if (error?.name === "AbortError") {
          throw new Error("Le service met plus de temps que prévu. Réessaie dans quelques instants.");
        }
        if (error instanceof TypeError) {
          throw new Error("Impossible de joindre le service. Vérifie ta connexion puis réessaie.");
        }
        throw error;
      }
    }
    function apiProductName(item) {
      const names = {
        "Snapchat+|3 mois": "Snapchat+ 3 mois",
        "Snapchat+|6 mois": "Snapchat+ 6 mois",
        "Netflix Premium|1 mois": "Netflix Premium 1 mois",
        "Netflix Premium|2 mois": "Netflix Premium 2 mois",
        "Spotify Family|1 mois": "Spotify Family 1 mois",
        "Spotify Family|1 an": "Spotify Family 1 an",
        "Crunchyroll Mega Fan|1 mois": "Crunchyroll Mega Fan 1 mois",
        "Crunchyroll Mega Fan|1 an": "Crunchyroll Mega Fan 1 an"
      };
      return names[`${item.name}|${item.duration}`] || `${item.service} ${item.duration}`;
    }

    function localizedSubscriptionName(value) {
      return String(value || "")
        .replaceAll("3 mois", t("3 mois"))
        .replaceAll("6 mois", t("6 mois"))
        .replaceAll("2 mois", t("2 mois"))
        .replaceAll("1 mois", t("1 mois"))
        .replaceAll("1 an", t("1 an"));
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

    function setAccountState(user, expiresAt) {
      currentUser = user || null;
      if (currentUser) sessionRecovery.resume({ expiresAt });
      const authenticated = Boolean(currentUser);
      const isAdminUser = authenticated && currentUser.is_admin === true;
      accountLinks.forEach(link => {
        link.dataset.route = authenticated ? "order" : "login";
        link.textContent = authenticated ? "Mes commandes" : "Se connecter";
      });
      sessionSignoutButtons.forEach(button => button.classList.toggle("hidden", !authenticated));
      adminLinks.forEach(link => link.classList.toggle("hidden", !isAdminUser));
      const adminIdentity = document.getElementById("admin-identity");
      if (adminIdentity) adminIdentity.textContent = isAdminUser ? `Connecté en tant que ${currentUser.email || t("administrateur")}` : "";
      syncCheckoutAccess();
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

    const checkoutCredentialFields = {
      spotify: {
        email: "spotify-account-email",
        password: "spotify-account-password",
      },
      crunchyroll: {
        email: "crunchyroll-account-email",
        password: "crunchyroll-account-password",
      },
    };

    function setCheckoutCredentialRequirement(service, enabled) {
      const config = checkoutCredentialFields[service];
      if (!config) return;
      for (const id of Object.values(config)) {
        const input = document.getElementById(id);
        if (!input) continue;
        input.disabled = !enabled;
        input.required = enabled;
        if (!enabled) input.value = "";
      }
    }

    function checkoutActivationCredentials() {
      const payload = {};
      for (const [service, config] of Object.entries(checkoutCredentialFields)) {
        const serviceLabel = service[0].toUpperCase() + service.slice(1);
        if (!cart.some(item => item.service === serviceLabel)) continue;
        payload[service] = {
          email: document.getElementById(config.email)?.value.trim() || "",
          password: document.getElementById(config.password)?.value || "",
        };
      }
      return Object.keys(payload).length > 0 ? payload : undefined;
    }

    async function checkoutPayloadFingerprint(payload) {
      const encoded = new TextEncoder().encode(JSON.stringify(payload));
      if (!globalThis.crypto?.subtle) return `no-cache-${Date.now()}-${Math.random()}`;
      const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
      return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    }

    function clearCheckoutCredentialPasswords() {
      for (const config of Object.values(checkoutCredentialFields)) {
        const input = document.getElementById(config.password);
        if (input) input.value = "";
      }
    }

    async function saveCheckoutProfile({ quiet = false } = {}) {
      if (!currentUser) return false;
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

    function interruptSessionRestore() {
      authRevision += 1;
      sessionRecovery.stop();
    }

    function formatPrice(value) {
      const currency = getLanguage() === "ar" ? "دج" : getLanguage() === "en" ? "DZD" : "DA";
      return `${formatLocalizedNumber(value)} ${currency}`;
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
            : lowerName.includes("snapchat") ? "Snapchat" : null;
      if (!service) return null;

      if (service !== "Snapchat" && /\b(3 mois|6 mois)\b/.test(lowerName)) return null;
      const durationMatch = lowerName.match(/\b(1 an|6 mois|3 mois|2 mois|1 mois)\b/);
      const duration = durationMatch?.[1] || "1 mois";
      const prices = {
        "Snapchat|3 mois": 2000,
        "Snapchat|6 mois": 2500,
        "Netflix|1 mois": 600,
        "Netflix|2 mois": 1100,
        "Spotify|1 mois": 800,
        "Crunchyroll|1 mois": 500,
        "Crunchyroll|1 an": 3000,
        "Spotify|1 an": 4000
      };
      const price = prices[`${service}|${duration}`];
      if (price === undefined) return null;
      return {
        name: service === "Snapchat" ? "Snapchat+" : service === "Netflix" ? "Netflix Premium" : service === "Spotify" ? "Spotify Family" : "Crunchyroll Mega Fan",
        service,
        duration,
        price
      };
    }

    function renewOrder(orderIndex) {
      const order = loadedOrders[orderIndex];
      if (!order) return;
      const offer = normalizeRenewalOffer(order.renewal_offer);
      if (!offer) {
        showToast("Cette offre de renouvellement n’est plus disponible.");
        return;
      }
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
      setRenewalOrderId(String(order.order_id || order.id || ""));
      setRenewalOffer(offer);
      clearPromo();
      updateCart();
      setCheckoutStep(1);
      showRoute("cart");
      showToast("Remise fidélité appliquée au renouvellement");
    }

    async function requestNetflixCode(button) {
      const orderId = button.dataset.orderId;
      const inventoryId = button.dataset.inventoryId;
      const resultContainer = button.closest("article").querySelector(".netflix-code-result");
      const originalLabel = button.innerHTML;
      button.disabled = true;
      button.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2" aria-hidden="true"></i>Recherche du code…';
      resultContainer.classList.add("hidden");
      try {
        const result = await apiRequest("/get-netflix-otp", {
          method: "POST",
          body: JSON.stringify({ order_id: orderId, inventory_id: inventoryId || undefined })
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
          ${safeLink ? `<a class="mt-3 inline-flex min-h-11 items-center rounded-lg bg-[#E50914] px-4 font-bold text-white" href="${escapeHTML(safeLink)}" target="_blank" rel="noopener noreferrer">Ouvrir le lien Netflix</a>` : ""}`;
        resultContainer.classList.remove("hidden");
      } catch (error) {
        resultContainer.textContent = error.message || "Impossible de récupérer le code Netflix.";
        resultContainer.classList.remove("hidden");
      } finally {
        button.disabled = false;
        button.innerHTML = originalLabel;
      }
    }

    const netflixConnectionGuide = document.getElementById("netflix-connection-guide");
    const closeNetflixConnectionGuide = () => {
      if (netflixConnectionGuide?.open) netflixConnectionGuide.close();
    };

    function openNetflixConnectionGuide() {
      if (!netflixConnectionGuide) return;
      netflixConnectionGuide.showModal();
      document.getElementById("netflix-guide-close")?.focus();
    }

    document.getElementById("netflix-guide-close")?.addEventListener("click", closeNetflixConnectionGuide);
    document.getElementById("netflix-guide-understood")?.addEventListener("click", closeNetflixConnectionGuide);
    netflixConnectionGuide?.addEventListener("click", event => {
      if (event.target === netflixConnectionGuide) closeNetflixConnectionGuide();
    });

    async function loadMyOrders() {
      const container = document.getElementById("my-orders-content");
      if (!container) return;
      if (!currentUser) {
        if (sessionCheckPending) {
          container.innerHTML = `<div class="rounded-2xl border border-black/10 bg-white p-8 text-center shadow-soft" role="status"><i class="fa-solid fa-spinner fa-spin text-2xl text-aura" aria-hidden="true"></i><p class="mt-3 text-sm text-black/55">${t("Restauration de ta connexion…")}</p></div>`;
          return;
        }
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
        const orders = prioritizeOrder(Array.isArray(result.orders) ? result.orders : [], highlightedOrderId);
        if (orders.length === 0) {
          container.innerHTML = `
            <div class="rounded-2xl border border-black/10 bg-white p-8 text-center shadow-soft">
              <span class="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-black/5 text-xl text-black/60"><i class="fa-solid fa-box-open" aria-hidden="true"></i></span>
              <h2 class="mt-5 font-title text-xl font-bold">Aucune commande confirmée</h2>
              <p class="mt-2 text-sm text-black/60">Tes commandes payées apparaîtront ici.</p>
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
          const itemNames = items
            .map(item => escapeHTML(localizedSubscriptionName(item.name || item.service || t("Abonnement"))))
            .join(" · ");
          const orderItems = items.map(item => {
            const presentation = orderItemPresentation(item);
            const quantity = Math.max(1, Number(item?.quantity || 1));
            const itemName = localizedSubscriptionName(item.name || item.service || t("Abonnement"));
            return `
              <div class="flex items-center gap-3 rounded-xl border border-black/10 bg-ivory p-3">
                <span class="grid h-11 w-11 shrink-0 place-items-center rounded-xl ${presentation.background}"><img src="${presentation.icon}" alt="${presentation.label}" class="h-6 w-8 object-contain"></span>
                <div class="min-w-0 flex-1"><p class="text-[10px] font-bold uppercase tracking-[0.12em] text-black/60">Service commandé</p><p class="mt-1 truncate font-title text-sm font-bold">${escapeHTML(itemName)}</p></div>
                ${quantity > 1 ? `<span class="rounded-full bg-white px-3 py-1 text-xs font-bold">×${formatLocalizedNumber(quantity)}</span>` : ""}
              </div>`;
          }).join("");
          const hasNetflix = items.some(item => String(item.name || item.service || "").toLowerCase().includes("netflix"));
          const assignedAccounts = Array.isArray(order.accounts) && order.accounts.length > 0
            ? order.accounts
            : order.account
              ? [order.account]
              : [];
          const waitingForStock = Boolean(order.waiting_for_stock) ||
            (order.status === "pending" && order.payment_status === "paid" && hasNetflix && assignedAccounts.length === 0);
          const status = isExpired
            ? { label: "Expiré", style: "bg-red-100 text-red-800" }
            : waitingForStock
            ? { label: "En attente de stock", style: "bg-amber-100 text-amber-800" }
            : ["active", "completed"].includes(order.status)
              ? { label: "Activé", style: "bg-green-100 text-green-800" }
              : { label: "Activation en cours", style: "bg-[#FBF4E9] text-[#8A632E]" };
          const orderId = escapeHTML(order.order_id || order.id || "");
          const isCurrentOrder = Boolean(highlightedOrderId) && String(order.order_id || order.id || "") === highlightedOrderId;
          const date = order.created_at
            ? formatLocalizedDate(order.created_at, { dateStyle: "medium", timeStyle: "short" })
            : "";
          const expiration = hasValidExpiration
            ? formatLocalizedDate(expirationDate, { dateStyle: "long" })
            : t("Définie après l’activation");
          const canGetNetflixCode = hasNetflix && assignedAccounts.length > 0 && !waitingForStock &&
            !["completed", "cancelled"].includes(order.status) && order.payment_status === "paid" && !isExpired;
          const renewalOffer = normalizeRenewalOffer(order.renewal_offer);
          const canRenew = Boolean(renewalOffer);
          const account = assignedAccounts.map((assignedAccount, accountIndex) => `
            <div class="mt-5 rounded-xl bg-green-50 p-4 text-sm text-green-900">
              <p class="font-title font-bold">${assignedAccounts.length > 1 ? `${t("Accès attribué")} ${formatLocalizedNumber(accountIndex + 1)}` : t("Accès attribué")}</p>
              ${assignedAccount.email ? `<p class="mt-2">E-mail : <strong>${escapeHTML(assignedAccount.email)}</strong></p>` : ""}
              ${assignedAccount.profile_name ? `<p>Profil : <strong>${escapeHTML(assignedAccount.profile_name)}</strong></p>` : ""}
              ${assignedAccount.profile_pin ? `<p>PIN : <strong>${escapeHTML(assignedAccount.profile_pin)}</strong></p>` : ""}
            </div>`).join("");
          const netflixCodeButtons = canGetNetflixCode
            ? assignedAccounts.map((assignedAccount, accountIndex) => `<button type="button" class="get-netflix-code min-h-11 rounded-xl bg-[#E50914] px-5 font-title text-sm font-bold text-white transition hover:bg-[#B8070F]" data-order-id="${orderId}" data-inventory-id="${escapeHTML(assignedAccount.id || "")}"><i class="fa-solid fa-key mr-2" aria-hidden="true"></i>${assignedAccounts.length > 1 ? `${t("Obtenir le code")} · ${t("Profil")} ${formatLocalizedNumber(accountIndex + 1)}` : t("Obtenir le code")}</button>`).join("")
            : "";
          const netflixGuideButton = hasNetflix
            ? `<button type="button" class="open-netflix-guide min-h-11 rounded-xl border border-[#E50914]/35 bg-red-50 px-5 font-title text-sm font-bold text-[#B8070F] transition hover:border-[#E50914] hover:bg-red-100"><i class="fa-regular fa-circle-question mr-2" aria-hidden="true"></i>${t("Comment se connecter ?")}</button>`
            : "";
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
                        <input name="whatsapp" type="tel" required autocomplete="tel" value="${escapeHTML(currentUser?.user_metadata?.phone || "")}" class="mt-2 min-h-11 w-full rounded-xl border border-black/15 bg-white px-4 text-sm font-normal outline-none focus:border-aura">
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
                  <div class="flex flex-wrap items-center gap-2"><p class="text-xs font-bold uppercase tracking-[0.12em] text-aura">${orderId}</p>${isCurrentOrder ? `<span class="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-bold uppercase text-aura">${t("Cette commande")}</span>` : ""}</div>
                  <h2 class="mt-2 font-title text-lg font-bold">${itemNames || "Commande Aura Stream"}</h2>
                  <p class="mt-2 text-xs text-black/60">${escapeHTML(date)}</p>
                  <p class="mt-2 text-sm font-semibold ${isExpired ? "text-red-700" : "text-black/65"}"><i class="fa-regular fa-calendar mr-2" aria-hidden="true"></i>Expiration : ${escapeHTML(expiration)}</p>
                </div>
                <div class="flex items-center gap-3 sm:flex-col sm:items-end">
                  ${order.payment_status === "paid" ? `<span class="rounded-full bg-green-100 px-3 py-1.5 text-xs font-bold text-green-800">${t("Paiement confirmé")}</span>` : ""}
                  <span class="rounded-full px-3 py-1.5 text-xs font-bold ${status.style}">${status.label}</span>
                  <strong class="font-title text-lg text-aura">${formatPrice(Number(order.amount || 0))}</strong>
                </div>
              </div>
              ${orderItems ? `<div class="mt-5 grid gap-3 sm:grid-cols-2">${orderItems}</div>` : ""}
              ${account}
              ${items.filter(item => String(item.name || "").toLowerCase().includes("snapchat")).map(item => `<div class="mt-5 rounded-xl bg-yellow-50 p-4 text-sm text-graphite"><p class="font-bold">${t("Ton compte Snapchat")} : <bdi>@${escapeHTML(item.snapchat_username || "")}</bdi></p><p class="mt-2">${t("Ajoute @aura-stream sur Snapchat pour recevoir ton abonnement.")}</p><a class="mt-3 inline-flex min-h-11 items-center rounded-xl bg-graphite px-4 font-bold text-white" href="https://www.snapchat.com/add/aura-stream" target="_blank" rel="noopener noreferrer">${t("Ajouter @aura-stream")}</a></div>`).join("")}
              ${manualActivationForms}
              <div class="mt-5 flex flex-wrap gap-3 border-t border-black/10 pt-5">
                ${netflixGuideButton}
                ${netflixCodeButtons}
                ${canRenew ? `<button type="button" class="renew-order min-h-11 rounded-xl border border-aura px-5 font-title text-sm font-bold text-aura transition hover:bg-aura hover:text-white" data-order-index="${orderIndex}"><i class="fa-solid fa-rotate mr-2" aria-hidden="true"></i>${t("Renouveler avec la remise fidélité")} −${formatLocalizedNumber(renewalOffer.discount_percent)} %</button>` : ""}
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
        container.querySelectorAll(".open-netflix-guide").forEach(button => {
          button.addEventListener("click", openNetflixConnectionGuide);
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
      toastMessage.textContent = t(message);
      toast.classList.add("toast-show");
      window.clearTimeout(showToast.timeout);
      showToast.timeout = window.setTimeout(() => toast.classList.remove("toast-show"), 2600);
    }

    function setPromoFeedback(message = "", isError = false) {
      const feedback = document.getElementById("promo-feedback");
      const feedbackMessage = document.getElementById("promo-feedback-message");
      const removeButton = document.getElementById("promo-remove");
      if (!feedback || !feedbackMessage || !removeButton) return;
      feedback.classList.toggle("hidden", !message);
      feedback.classList.toggle("flex", Boolean(message));
      feedback.classList.toggle("text-red-700", Boolean(message) && isError);
      feedback.classList.toggle("text-green-700", Boolean(message) && !isError);
      feedbackMessage.textContent = t(message);
      removeButton.classList.toggle("hidden", !activePromo);
    }

    function clearPromo(message = "") {
      activePromo = null;
      const input = document.getElementById("promo-code");
      if (input) input.value = "";
      setPromoFeedback(message);
    }

    async function applyPromoCode() {
      const input = document.getElementById("promo-code");
      const button = document.getElementById("promo-apply");
      const code = String(input?.value || "").trim().toUpperCase();
      if (renewalOrderId && activeRenewalOffer) {
        setPromoFeedback("La remise fidélité ne peut pas être cumulée avec un code promo.", true);
        return;
      }
      if (!currentUser) {
        setPromoFeedback("Connecte-toi pour utiliser un code promo.", true);
        showRoute("login");
        return;
      }
      if (!cart.length) {
        setPromoFeedback("Ajoute d’abord un abonnement au panier.", true);
        return;
      }
      if (!code) {
        setPromoFeedback("Saisis un code promo.", true);
        return;
      }
      const originalLabel = button?.textContent || "Appliquer";
      if (button) {
        button.disabled = true;
        button.textContent = "Vérification…";
      }
      try {
        const result = await apiRequest("/validate-promo", {
          method: "POST",
          body: JSON.stringify({
            code,
            items: cart.map(item => ({ name: apiProductName(item), quantity: 1 }))
          })
        });
        activePromo = {
          code,
          subtotal: Number(result.subtotal || 0),
          discount_amount: Number(result.discount_amount || 0),
          total: Number(result.total || 0)
        };
        if (input) input.value = code;
        updateCart();
        setPromoFeedback(`${code} appliqué : −${formatPrice(activePromo.discount_amount)}`);
      } catch (error) {
        activePromo = null;
        updateCart();
        setPromoFeedback(error.message || "Ce code promo n’est pas valide.", true);
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = originalLabel;
        }
      }
    }

    function showRoute(route, scrollTarget) {
      if (!routeNames.has(route)) route = "home";
      if (route === "products") applyProductFilter("all");
      if (route === "login" && !recoveryRequested) showAuthPanel("signin");
      if (
        ["login", "order", "admin"].includes(route)
        && window.__metaPixelInitialized
        && !window.__auraSensitiveAuthFlow
      ) {
        window.__auraSensitiveAuthFlow = true;
        persistCart();
        const privateUrl = new URL(window.location.origin + window.location.pathname);
        privateUrl.searchParams.set("account", "1");
        privateUrl.hash = route;
        window.location.replace(privateUrl.toString());
        return;
      }
      if (route === "admin" && currentUser && currentUser.is_admin !== true) {
        showToast("Accès administrateur requis");
        route = "home";
      }
      const selected = document.querySelector(`[data-view="${route}"]`) || document.querySelector('[data-view="home"]');
      views.forEach(view => view.classList.toggle("hidden", view !== selected));
      navLinks.forEach(link => {
        const isCurrent = link.dataset.route === route;
        link.setAttribute("aria-current", isCurrent ? "page" : "false");
      });
      mobileMenu.classList.add("hidden");
      mobileToggle.setAttribute("aria-expanded", "false");
      activeRoute = route;
      document.body.dataset.route = route;
      const landing = landingRoutes[route];
      const content = contentRoutes[route];
      const nextUrl = landing?.path || content?.path || (route === "home" ? "/" : `/#${route}`);
      window.history.replaceState({ route }, "", nextUrl);
      updateRouteMetadata(route);
      updateMobileCartBar();

      trackLandingView(route);
      if (route === "order") loadMyOrders();
      if (route === "cart") setCheckoutStep(1);
      if (route === "admin" && currentUser?.is_admin === true) loadAdminDashboard();

      if (scrollTarget) {
        requestAnimationFrame(() => {
          const target = document.getElementById(scrollTarget);
          if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }

    document.addEventListener("click", event => {
      const link = event.target.closest(".route-link");
      if (!link) return;
      event.preventDefault();
      showRoute(link.dataset.route, link.dataset.scroll);
      if (link.dataset.authPanelTarget) showAuthPanel(link.dataset.authPanelTarget);
    });

    document.getElementById("home-tracking-example-button")?.addEventListener("click", () => {
      const example = document.getElementById("order-tracking-example");
      if (!example) return;
      example.classList.remove("tracking-example-highlight");
      requestAnimationFrame(() => {
        example.classList.add("tracking-example-highlight");
        example.scrollIntoView({ behavior: "smooth", block: "center" });
        example.focus({ preventScroll: true });
      });
      window.setTimeout(() => example.classList.remove("tracking-example-highlight"), 1400);
    });

    window.addEventListener("hashchange", () => {
      showRoute(routeFromLocation());
    });

    window.addEventListener("popstate", () => showRoute(routeFromLocation()));

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
        const formattedPrice = formatPrice(Number(button.dataset.price));
        const separator = formattedPrice.lastIndexOf(" ");
        const amount = separator > 0 ? formattedPrice.slice(0, separator) : formattedPrice;
        const currency = separator > 0 ? formattedPrice.slice(separator + 1) : "";
        card.querySelector(".price-value").innerHTML = `${escapeHTML(amount)} <span class="text-sm">${escapeHTML(currency)}</span>`;
      });
    });

    function closeCustomSelect(root, { restoreFocus = false } = {}) {
      const trigger = root.querySelector(".custom-select-trigger");
      const options = root.querySelector(".custom-select-options");
      trigger?.setAttribute("aria-expanded", "false");
      options?.classList.add("hidden");
      if (restoreFocus) trigger?.focus();
    }

    function syncCustomSelectLabels() {
      document.querySelectorAll("[data-custom-select]").forEach(root => {
        const input = root.querySelector('input[type="hidden"]');
        const triggerLabel = root.querySelector(".custom-select-trigger span");
        const options = [...root.querySelectorAll('[role="option"]')];
        if (!input || !triggerLabel || options.length === 0) return;

        const selected = options.find(option => (option.dataset.value || "") === input.value) || options[0];
        options.forEach(option => option.setAttribute("aria-selected", String(option === selected)));
        triggerLabel.textContent = selected.textContent.trim();
      });
    }

    document.querySelectorAll("[data-custom-select]").forEach(root => {
      const trigger = root.querySelector(".custom-select-trigger");
      const options = root.querySelector(".custom-select-options");
      const input = root.querySelector('input[type="hidden"]');
      if (!trigger || !options || !input) return;

      trigger.addEventListener("click", () => {
        const willOpen = trigger.getAttribute("aria-expanded") !== "true";
        document.querySelectorAll("[data-custom-select]").forEach(other => {
          if (other !== root) closeCustomSelect(other);
        });
        trigger.setAttribute("aria-expanded", String(willOpen));
        options.classList.toggle("hidden", !willOpen);
        if (willOpen) {
          const selected = options.querySelector('[role="option"][aria-selected="true"]');
          selected?.focus();
        }
      });

      options.querySelectorAll('[role="option"]').forEach(option => {
        option.addEventListener("click", () => {
          options.querySelectorAll('[role="option"]').forEach(item => item.setAttribute("aria-selected", "false"));
          option.setAttribute("aria-selected", "true");
          input.value = option.dataset.value || "";
          trigger.querySelector("span").textContent = option.textContent.trim();
          input.dispatchEvent(new Event("change", { bubbles: true }));
          closeCustomSelect(root, { restoreFocus: true });
        });
      });

      root.addEventListener("keydown", event => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeCustomSelect(root, { restoreFocus: true });
        }
      });
    });

    document.addEventListener("click", event => {
      document.querySelectorAll("[data-custom-select]").forEach(root => {
        if (!root.contains(event.target)) closeCustomSelect(root);
      });
    });

    function applyProductFilter(filter) {
      document.querySelectorAll(".filter-btn").forEach(button => {
        button.setAttribute("aria-pressed", String(button.dataset.filter === filter));
      });
      document.querySelectorAll("#product-grid .product-card").forEach(card => {
        card.classList.toggle("hidden", filter !== "all" && card.dataset.service !== filter);
      });
    }

    document.querySelectorAll(".filter-btn").forEach(button => {
      button.addEventListener("click", () => applyProductFilter(button.dataset.filter));
    });

    function addItemToCart(item, button) {
      setRenewalOrderId(null);
      cart.push(item);
      clearPromo();
      updateCart();
      showToast(`${item.name} ajouté au panier`);
      trackMeta("AddToCart", {
        value: item.price,
        currency: "DZD",
        content_type: "product",
        content_ids: [apiProductName(item)],
        contents: [{ id: apiProductName(item), quantity: 1 }],
      });
      if (button) {
        const original = button.textContent;
        button.textContent = "Ajouté !";
        window.setTimeout(() => button.textContent = original, 1500);
      }
    }

    document.querySelectorAll(".add-product").forEach(button => {
      button.addEventListener("click", () => {
        const card = button.closest(".product-card");
        const activeDuration = card.querySelector('.duration-btn[aria-pressed="true"]');
        addItemToCart({
          name: card.dataset.product,
          service: card.dataset.service[0].toUpperCase() + card.dataset.service.slice(1),
          duration: activeDuration.dataset.duration,
          price: Number(activeDuration.dataset.price)
        }, button);
      });
    });

    document.querySelectorAll(".landing-add-product").forEach(button => {
      button.addEventListener("click", () => {
        addItemToCart({
          name: button.dataset.product,
          service: button.dataset.service,
          duration: button.dataset.duration,
          price: Number(button.dataset.price),
        }, button);
      });
    });

    function updateCart() {
      persistCart();
      cartCount.textContent = String(cart.length);
      if (headerCartButton) headerCartButton.setAttribute("aria-label", `${t("Panier")} (${cart.length})`);
      const hasNetflix = cart.some(item => item.service === "Netflix");
      const hasSpotify = cart.some(item => item.service === "Spotify");
      const hasCrunchyroll = cart.some(item => item.service === "Crunchyroll");
      const hasSnapchat = cart.some(item => item.service === "Snapchat");
      const hasManualActivation = hasSpotify || hasCrunchyroll || hasSnapchat;
      document.getElementById("snapchat-activation-panel").classList.toggle("hidden", !hasSnapchat);
      for (const id of ["snapchat-username", "snapchat-friend-added"]) {
        const input = document.getElementById(id);
        input.disabled = !hasSnapchat;
        input.required = hasSnapchat;
        if (!hasSnapchat) { input.value = ""; input.checked = false; }
      }
      document.getElementById("spotify-credentials-panel").classList.toggle(
        "hidden",
        !hasSpotify
      );
      document.getElementById("crunchyroll-credentials-panel").classList.toggle(
        "hidden",
        !hasCrunchyroll
      );
      setCheckoutCredentialRequirement("spotify", hasSpotify);
      setCheckoutCredentialRequirement("crunchyroll", hasCrunchyroll);
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
        itemsContainer.innerHTML = '<p class="py-8 text-center text-sm text-black/60">Ton panier est vide.</p>';
      } else {
        itemsContainer.innerHTML = cart.map((item, index) => `
          <article class="flex items-start gap-3 py-4 first:pt-0">
            <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-black/5 text-sm font-extrabold">${item.service[0]}</span>
            <div class="min-w-0 flex-1">
              <h3 class="truncate font-title text-sm font-bold">${item.name}</h3>
              <p class="mt-1 text-xs text-black/60">${item.duration}</p>
            </div>
            <div class="text-right">
              <p class="font-title text-sm font-extrabold">${formatPrice(item.price)}</p>
              <button class="remove-cart mt-1 inline-flex min-h-11 items-center text-xs font-semibold text-aura hover:underline" data-index="${index}">Supprimer</button>
            </div>
          </article>
        `).join("");
      }

      const subtotal = cart.reduce((sum, item) => sum + item.price, 0);
      if (activeRenewalOffer && Number(activeRenewalOffer.subtotal) !== subtotal) {
        setRenewalOrderId(null);
      }
      if (activePromo && Number(activePromo.subtotal) !== subtotal) activePromo = null;
      const discount = activeRenewalOffer
        ? Math.min(Number(activeRenewalOffer.discount_amount || 0), subtotal)
        : activePromo
          ? Math.min(Number(activePromo.discount_amount || 0), subtotal)
          : 0;
      const total = Math.max(0, subtotal - discount);
      document.getElementById("subtotal-value").textContent = formatPrice(subtotal);
      document.getElementById("checkout-total").textContent = formatPrice(total);
      document.getElementById("pay-total").textContent = formatPrice(total);
      const discountRow = document.getElementById("promo-discount-row");
      const discountValue = document.getElementById("promo-discount-value");
      const discountLabel = document.getElementById("discount-label");
      discountRow?.classList.toggle("hidden", discount <= 0);
      discountRow?.classList.toggle("flex", discount > 0);
      if (discountValue) discountValue.textContent = `−${formatPrice(discount)}`;
      if (discountLabel) discountLabel.textContent = activeRenewalOffer
        ? `${t("Remise fidélité")} (−${formatLocalizedNumber(activeRenewalOffer.discount_percent)} %)`
        : t("Réduction");
      document.getElementById("promo-remove")?.classList.toggle("hidden", !activePromo);
      const promoInput = document.getElementById("promo-code");
      const promoButton = document.getElementById("promo-apply");
      if (promoInput) promoInput.disabled = Boolean(activeRenewalOffer);
      if (promoButton) promoButton.disabled = Boolean(activeRenewalOffer);
      if (activeRenewalOffer) {
        setPromoFeedback("Remise fidélité appliquée automatiquement.");
      } else if (!activePromo && document.getElementById("promo-feedback-message")?.textContent === t("Remise fidélité appliquée automatiquement.")) {
        setPromoFeedback();
      }

      document.querySelectorAll(".remove-cart").forEach(removeButton => {
        removeButton.addEventListener("click", () => {
          setRenewalOrderId(null);
          cart.splice(Number(removeButton.dataset.index), 1);
          clearPromo();
          updateCart();
          showToast("Article retiré du panier");
        });
      });
      updateMobileCartBar();
      syncCheckoutAccess();
    }

    document.getElementById("mobile-cart-button")?.addEventListener("click", () => {
      showRoute("cart");
      setCheckoutStep(1);
    });

    document.getElementById("promo-apply")?.addEventListener("click", applyPromoCode);
    document.getElementById("promo-code")?.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        applyPromoCode();
      }
    });
    document.getElementById("promo-remove")?.addEventListener("click", () => {
      clearPromo("Code promo retiré.");
      updateCart();
    });

    let currentCheckoutStep = 1;

    function syncCheckoutAccess() {
      const requiresAuthentication = !currentUser && cart.length > 0;
      document.getElementById("checkout-auth-gate")?.classList.toggle("hidden", !requiresAuthentication);
      document.querySelectorAll("[data-checkout-panel]").forEach(panel => {
        panel.classList.toggle("hidden", requiresAuthentication || Number(panel.dataset.checkoutPanel) !== currentCheckoutStep);
      });
    }

    function setCheckoutStep(step) {
      currentCheckoutStep = step;
      syncCheckoutAccess();
      document.querySelectorAll("[data-step-indicator]").forEach(indicator => {
        indicator.classList.toggle("opacity-40", Number(indicator.dataset.stepIndicator) > step);
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    document.getElementById("to-payment").addEventListener("click", async () => {
      const form = document.getElementById("customer-form");
      if (!form.reportValidity()) return;
      if (!currentUser) {
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
      const profileSaved = await saveCheckoutProfile({ quiet: true });
      if (!profileSaved) {
        showToast(profileSaveStatus?.textContent || "Impossible d’enregistrer ces informations.");
        return;
      }
      trackMeta("InitiateCheckout", {
        value: activeRenewalOffer?.total ?? activePromo?.total ?? cart.reduce((sum, item) => sum + item.price, 0),
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
      if (!currentUser) {
        showRoute("login");
        setAuthFeedback("Connecte-toi pour lancer le paiement.");
        return;
      }
      if (cart.length === 0) {
        showToast("Ton panier est vide");
        showRoute("products");
        return;
      }
      const checkoutForm = document.getElementById("customer-form");
      if (!checkoutForm.reportValidity()) {
        setCheckoutStep(1);
        return;
      }
      const originalLabel = button.innerHTML;
      button.disabled = true;
      button.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2" aria-hidden="true"></i>Préparation…';
      try {
        const orderPayload = {
          items: cart.map(item => ({ name: apiProductName(item), quantity: 1 })),
          marketing_consent: marketingConsentInput?.checked === true,
          marketing_consent_version: marketingConsentInput?.checked === true ? META_CONSENT_VERSION : undefined,
          promo_code: activePromo?.code || undefined,
          customer_whatsapp: document.getElementById("customer-whatsapp")?.value.trim() || undefined,
          activation_credentials: checkoutActivationCredentials(),
          snapchat_username: cart.some(item => item.service === "Snapchat") ? document.getElementById("snapchat-username").value.trim() : undefined,
          snapchat_friend_added: cart.some(item => item.service === "Snapchat") ? document.getElementById("snapchat-friend-added").checked : undefined,
          renewal_order_id: renewalOrderId || undefined
        };
        const fingerprint = await checkoutPayloadFingerprint(orderPayload);
        if (pendingPaymentAttempt?.fingerprint === fingerprint && pendingPaymentAttempt.orderId) {
          activeOrderId = pendingPaymentAttempt.orderId;
        } else {
          const order = await apiRequest("/create-order", {
            method: "POST",
            body: JSON.stringify(orderPayload)
          });
          activeOrderId = order.order_id || order.id;
          if (activeOrderId) pendingPaymentAttempt = { fingerprint, orderId: activeOrderId };
        }
        if (!activeOrderId) throw new Error("La commande n’a pas reçu d’identifiant.");
        sessionStorage.setItem("aura_order_id", activeOrderId);

        const invoice = await apiRequest("/create-invoice", {
          method: "POST",
          body: JSON.stringify({ order_id: activeOrderId })
        });
        if (!invoice?.payment_url) throw new Error("Le prestataire de paiement n’a pas renvoyé de lien.");
        clearCheckoutCredentialPasswords();
        window.location.assign(invoice.payment_url);
      } catch (error) {
        reportClientError({
          event: "checkout",
          message: error instanceof Error ? error.message : "Checkout preparation failed",
          source: "payment",
        });
        showToast(error.message || "Impossible de préparer le paiement");
        button.disabled = false;
        button.innerHTML = originalLabel;
      }
    });

    function setAdminFeedback(message = "", isError = true) {
      const box = document.getElementById("admin-global-feedback");
      if (!box) return;
      box.textContent = t(message);
      box.classList.toggle("hidden", !message);
      box.classList.toggle("border-red-200", Boolean(message) && isError);
      box.classList.toggle("bg-red-50", Boolean(message) && isError);
      box.classList.toggle("text-red-800", Boolean(message) && isError);
      box.classList.toggle("border-green-200", Boolean(message) && !isError);
      box.classList.toggle("bg-green-50", Boolean(message) && !isError);
      box.classList.toggle("text-green-800", Boolean(message) && !isError);
    }

    function formatDateTime(value) {
      if (!value) return "—";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "—";
      return formatLocalizedDate(date, {
        dateStyle: "medium",
        timeStyle: "short"
      });
    }

    function adminPaymentStatusLabel(status) {
      return t(({
        paid: "Payé",
        unpaid: "Non payé",
        failed: "Échoué"
      })[status] || "Statut de paiement inconnu");
    }

    function formatRevenueChartDate(value) {
      const date = new Date(`${value}T12:00:00`);
      if (Number.isNaN(date.getTime())) return String(value || "—");
      return new Intl.DateTimeFormat(getLocale(), {
        day: "2-digit",
        month: "short"
      }).format(date).replace(".", "");
    }

    function localDateInputValue(date = new Date()) {
      const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
      return localDate.toISOString().slice(0, 10);
    }

    function initializeAdminRevenueRange() {
      const startInput = document.getElementById("admin-revenue-start");
      const endInput = document.getElementById("admin-revenue-end");
      if (!startInput || !endInput) return;
      const today = new Date();
      const firstDay = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
      const maximum = localDateInputValue(today);
      startInput.max = maximum;
      endInput.max = maximum;
      if (!startInput.value) startInput.value = localDateInputValue(firstDay);
      if (!endInput.value) endInput.value = maximum;
    }

    function selectedAdminRevenueRange() {
      initializeAdminRevenueRange();
      const startDate = document.getElementById("admin-revenue-start")?.value || "";
      const endDate = document.getElementById("admin-revenue-end")?.value || "";
      const startTime = Date.parse(`${startDate}T00:00:00Z`);
      const endTime = Date.parse(`${endDate}T00:00:00Z`);
      const days = Math.floor((endTime - startTime) / (24 * 60 * 60 * 1000)) + 1;
      if (!startDate || !endDate || !Number.isFinite(days)) {
        throw new Error("Sélectionnez une date de début et une date de fin.");
      }
      if (days < 1) throw new Error("La date de fin doit être postérieure à la date de début.");
      if (days > 366) throw new Error("La période ne peut pas dépasser 366 jours.");
      return { startDate, endDate, days };
    }

    function formatRevenuePeriod(startDate, endDate) {
      const formatter = new Intl.DateTimeFormat(getLocale(), { day: "numeric", month: "short", year: "numeric" });
      const start = formatter.format(new Date(`${startDate}T12:00:00`));
      const end = formatter.format(new Date(`${endDate}T12:00:00`));
      if (getLanguage() === "ar") return `من ${start} إلى ${end}`;
      if (getLanguage() === "en") return `From ${start} to ${end}`;
      return `Du ${start} au ${end}`;
    }

    function setAdminRevenueFeedback(message = "", isError = false) {
      const feedback = document.getElementById("admin-revenue-feedback");
      if (!feedback) return;
      feedback.textContent = t(message);
      feedback.classList.toggle("hidden", !message);
      feedback.classList.toggle("text-red-700", Boolean(message) && isError);
      feedback.classList.toggle("text-green-700", Boolean(message) && !isError);
    }

    function csvCell(value) {
      return `"${String(value ?? "").replaceAll('"', '""')}"`;
    }

    function parseCsvRow(row) {
      const cells = [];
      let value = "";
      let quoted = false;
      for (let index = 0; index < row.length; index += 1) {
        const character = row[index];
        if (character === '"' && quoted && row[index + 1] === '"') {
          value += '"';
          index += 1;
        } else if (character === '"') {
          quoted = !quoted;
        } else if (character === ";" && !quoted) {
          cells.push(value);
          value = "";
        } else {
          value += character;
        }
      }
      cells.push(value);
      return cells;
    }

    function localizeCsv(csv) {
      if (getLanguage() === "fr") return csv;
      const withoutBom = String(csv || "").replace(/^\uFEFF/, "");
      const rows = withoutBom.split(/\r?\n/).map(row => (
        parseCsvRow(row).map(cell => csvCell(t(cell))).join(";")
      ));
      return `\uFEFF${rows.join("\r\n")}`;
    }

    function downloadAdminRevenueExport() {
      if (!adminRevenueReport) return;
      const daily = Array.isArray(adminRevenueReport.daily) ? adminRevenueReport.daily : [];
      const totalRevenue = daily.reduce((sum, row) => sum + Number(row.revenue || 0), 0);
      const totalSales = daily.reduce((sum, row) => sum + Number(row.sales || 0), 0);
      const rows = [
        [t("Rapport Aura Stream — Revenus encaissés")],
        [t("Date de début"), adminRevenueReport.startDate],
        [t("Date de fin"), adminRevenueReport.endDate],
        [t("Généré le"), new Date().toLocaleString(getLocale())],
        [],
        [t("Date"), t("Ventes payées"), t("Revenus encaissés (DA)")],
        ...daily.map(row => [row.date, Number(row.sales || 0), Number(row.revenue || 0)]),
        [],
        ["TOTAL", totalSales, totalRevenue]
      ];
      const csv = `\uFEFF${rows.map(row => row.map(csvCell).join(";")).join("\r\n")}`;
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `revenus-aura-${adminRevenueReport.startDate}-${adminRevenueReport.endDate}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast("Le fichier Excel est prêt");
    }

    function adminOrderStatusLabel(status) {
      return ({
        pending: "En attente",
        active: "Activé",
        completed: "Terminé",
        cancelled: "Annulé"
      })[status] || status || "Inconnu";
    }

    function adminOrderFollowUp(order) {
      if (order.payment_status !== "paid") {
        return { label: "Paiement non confirmé", className: "bg-amber-50 text-amber-700", disconnect: false };
      }
      if (order.status === "completed") {
        return { label: "Déconnecté / clôturé", className: "bg-black/5 text-black/55", disconnect: false };
      }
      if (order.status === "cancelled") {
        return { label: "Annulé", className: "bg-red-50 text-red-700", disconnect: false };
      }
      if (order.status === "pending") {
        return { label: "Activation en attente", className: "bg-amber-50 text-amber-700", disconnect: false };
      }
      const expiresAt = new Date(order.expires_at || "");
      if (!Number.isFinite(expiresAt.getTime())) {
        return { label: "Date à vérifier", className: "bg-amber-50 text-amber-700", disconnect: false };
      }
      const remaining = expiresAt.getTime() - Date.now();
      if (remaining <= 0) {
        const hasNetflix = Array.isArray(order.items)
          && order.items.some(item => orderItemPresentation(item).key === "netflix");
        return { label: hasNetflix ? "À déconnecter" : "Expiré", className: "bg-red-50 text-red-700", disconnect: hasNetflix };
      }
      if (remaining <= 3 * 24 * 60 * 60 * 1000) {
        return { label: "Expire sous 3 jours", className: "bg-amber-50 text-amber-700", disconnect: false };
      }
      return { label: "Actif", className: "bg-green-50 text-green-700", disconnect: false };
    }

    function adminOrdersPageLabel(total) {
      if (getLanguage() === "ar") {
        const count = total === 1 ? "طلب واحد" : total === 2 ? "طلبان" : total >= 11 ? `${total} طلباً` : `${total} طلبات`;
        return `الصفحة ${adminOrdersPage} من ${adminOrdersTotalPages} · ${count}`;
      }
      if (getLanguage() === "en") {
        return `Page ${adminOrdersPage} of ${adminOrdersTotalPages} · ${total} order${total === 1 ? "" : "s"}`;
      }
      return `Page ${adminOrdersPage} sur ${adminOrdersTotalPages} · ${total} commande${total === 1 ? "" : "s"}`;
    }

    function activateAdminTab(name) {
      document.querySelectorAll(".admin-tab").forEach(button => {
        const active = button.dataset.adminTab === name;
        button.setAttribute("aria-selected", String(active));
        button.classList.toggle("bg-graphite", active);
        button.classList.toggle("text-white", active);
        button.classList.toggle("text-black/55", !active);
      });
      document.querySelectorAll("[data-admin-panel]").forEach(panel => {
        panel.classList.toggle("hidden", panel.dataset.adminPanel !== name);
      });
      if (name === "orders") loadAdminOrders();
      if (name === "stock") loadAdminInventory();
      if (name === "promos") loadAdminPromos();
      if (name === "activity") loadAdminAudit();
    }

    async function loadAdminOverview() {
      const range = selectedAdminRevenueRange();
      const exportButton = document.getElementById("admin-revenue-export");
      const chart = document.getElementById("admin-revenue-chart");
      adminRevenueReport = null;
      if (exportButton) exportButton.disabled = true;
      setAdminRevenueFeedback("");
      if (chart) {
        chart.innerHTML = '<p class="grid min-h-56 place-items-center text-sm font-semibold text-black/60"><i class="fa-solid fa-spinner fa-spin mr-2 text-aura" aria-hidden="true"></i>Calcul des revenus…</p>';
      }
      const params = new URLSearchParams({
        start_date: range.startDate,
        end_date: range.endDate
      });
      const result = await apiRequest(`/admin/dashboard?${params}`);
      const summary = result.summary || {};
      document.getElementById("admin-revenue-total").textContent = formatPrice(Number(summary.revenue_total || 0));
      document.getElementById("admin-revenue-period").textContent = formatPrice(Number(summary.revenue_period || 0));
      document.getElementById("admin-paid-orders").textContent = String(Number(summary.paid_orders_total || 0));
      document.getElementById("admin-pending-orders").textContent = String(Number(summary.activation_pending || 0));
      document.getElementById("admin-average-order").textContent = `Panier moyen : ${formatPrice(Number(summary.average_order || 0))}`;
      document.getElementById("admin-payment-alerts").textContent =
        `Non payées : ${Number(summary.unpaid_orders || 0)} · Échouées : ${Number(summary.failed_payments || 0)}`;
      document.getElementById("admin-generated-at").textContent = `Mis à jour ${formatDateTime(result.generated_at)}`;
      document.getElementById("admin-period-label").textContent = formatRevenuePeriod(
        result.period_start || range.startDate,
        result.period_end || range.endDate
      );

      const daily = Array.isArray(result.revenue_by_day) ? result.revenue_by_day : [];
      const maxRevenue = Math.max(1, ...daily.map(row => Number(row.revenue || 0)));
      const chartDays = daily.map(row => {
        const revenue = Number(row.revenue || 0);
        const sales = Number(row.sales || 0);
        const height = revenue > 0 ? Math.max(8, Math.round((revenue / maxRevenue) * 100)) : 3;
        const dateLabel = formatRevenueChartDate(row.date);
        const priceLabel = formatPrice(revenue);
        const salesLabel = getLanguage() === "ar"
          ? sales === 1
            ? "عملية بيع واحدة"
            : sales === 2
              ? "عمليتا بيع"
              : `${sales} مبيعات`
          : getLanguage() === "en"
            ? `${sales} sale${sales === 1 ? "" : "s"}`
            : `${sales} vente${sales === 1 ? "" : "s"}`;
        return `<article class="revenue-chart-day" role="listitem" aria-label="${escapeHTML(`${dateLabel} : ${priceLabel}, ${salesLabel}`)}" title="${escapeHTML(`${dateLabel} · ${priceLabel} · ${salesLabel}`)}">
          <span class="revenue-chart-value">${escapeHTML(priceLabel)}</span>
          <span class="revenue-chart-track" aria-hidden="true"><span class="revenue-chart-bar" style="height:${height}%"></span></span>
          <span class="revenue-chart-date">${escapeHTML(dateLabel)}<small class="revenue-chart-sales">${escapeHTML(salesLabel)}</small></span>
        </article>`;
      }).join("");
      chart.innerHTML = chartDays
        ? `<div class="revenue-chart-inner" role="list" style="--revenue-days:${daily.length}">${chartDays}</div>`
        : '<p class="grid min-h-56 place-items-center text-sm text-black/60">Aucune vente sur cette période.</p>';
      adminRevenueReport = {
        startDate: result.period_start || range.startDate,
        endDate: result.period_end || range.endDate,
        daily
      };
      if (exportButton) exportButton.disabled = false;

      const stock = (Array.isArray(result.stock) ? result.stock : []).filter(
        item => String(item?.service || "").trim().toLowerCase() === "netflix",
      );
      document.getElementById("admin-stock-summary").innerHTML = stock.map(item => {
        const available = Number(item.available || 0);
        const warning = available <= 2;
        return `<article class="flex items-center justify-between rounded-xl border border-black/10 p-4">
          <div><p class="font-title text-sm font-bold capitalize">${escapeHTML(item.service)}</p><p class="mt-1 text-xs text-black/60">${Number(item.assigned || 0)} attribué(s)</p></div>
          <span class="rounded-full px-3 py-1.5 text-xs font-extrabold ${warning ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}">${available} disponible(s)</span>
        </article>`;
      }).join("");
    }

    async function loadAdminOrders() {
      const list = document.getElementById("admin-orders-list");
      if (!list || currentUser?.is_admin !== true) return;
      list.innerHTML = '<p class="py-8 text-center text-sm text-black/60"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Chargement…</p>';
      const params = new URLSearchParams({
        page: String(adminOrdersPage),
        limit: "25",
        search: document.getElementById("admin-order-search")?.value.trim() || "",
        service: document.getElementById("admin-order-service")?.value || "",
        status: document.getElementById("admin-order-status")?.value || ""
      });
      try {
        const result = await apiRequest(`/admin/all-orders?${params}`);
        const orders = Array.isArray(result.orders) ? result.orders : [];
        adminOrdersTotalPages = Math.max(1, Number(result.total_pages || 1));
        document.getElementById("admin-orders-page").textContent = adminOrdersPageLabel(Number(result.total || 0));
        document.getElementById("admin-orders-prev").disabled = adminOrdersPage <= 1;
        document.getElementById("admin-orders-next").disabled = adminOrdersPage >= adminOrdersTotalPages;
        list.innerHTML = orders.map(order => {
          const rawItems = Array.isArray(order.items) ? order.items : [];
          const items = rawItems
            .map(item => escapeHTML(localizedSubscriptionName(item.name || item.service || t("Abonnement"))))
            .join(" · ");
          const activationCredentials = rawItems
            .filter(item => (item?.client_credentials && typeof item.client_credentials === "object") || item?.snapchat_username)
            .map(item => {
              if (item.snapchat_username) return `<div class="mt-3 rounded-xl bg-yellow-50 p-4 text-sm text-graphite"><strong>Snapchat+</strong><p>${t("Ton compte Snapchat")} : <bdi>@${escapeHTML(item.snapchat_username)}</bdi></p><p>${t("Ajout de @aura-stream confirmé")}</p></div>`;
              const credentials = item.client_credentials;
              const serviceName = localizedSubscriptionName(item.name || item.service || t("Abonnement"));
              return `<details class="mt-3 rounded-xl border border-aura/15 bg-[#FFF7F3] p-3" open>
                <summary class="cursor-pointer font-title text-xs font-bold text-graphite">Identifiants d’activation · ${escapeHTML(serviceName)}</summary>
                <div class="mt-3 grid gap-2 text-xs text-black/65 sm:grid-cols-2">
                  <p><span class="font-bold text-graphite">E-mail :</span> ${escapeHTML(credentials.email || "—")}</p>
                  <p><span class="font-bold text-graphite">WhatsApp :</span> ${escapeHTML(credentials.whatsapp || order.customer_whatsapp || "—")}</p>
                  <p class="sm:col-span-2"><span class="font-bold text-graphite">Mot de passe temporaire :</span> <code class="rounded bg-white px-2 py-1 font-mono text-graphite">${escapeHTML(credentials.password || "—")}</code></p>
                </div>
              </details>`;
            }).join("");
          const whatsapp = String(order.customer_whatsapp || "").trim();
          const whatsappDigits = whatsapp.replace(/\D/g, "");
          const paymentClass = order.payment_status === "paid"
            ? "bg-green-50 text-green-700"
            : order.payment_status === "failed"
              ? "bg-red-50 text-red-700"
              : "bg-amber-50 text-amber-700";
          const followUp = adminOrderFollowUp(order);
          return `<article class="rounded-2xl border border-black/10 p-4 sm:p-5">
            <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2"><strong class="font-title text-sm">${escapeHTML(order.order_id)}</strong><span class="rounded-full px-2.5 py-1 text-[10px] font-bold ${paymentClass}">${escapeHTML(adminPaymentStatusLabel(order.payment_status || "unpaid"))}</span></div>
                <p class="mt-2 truncate text-sm text-black/65">${escapeHTML(order.assigned_email || "Sans e-mail")}</p>
                ${whatsapp ? `<a class="mt-1 inline-flex items-center gap-2 text-sm font-bold text-[#148A45] hover:underline" href="https://wa.me/${escapeHTML(whatsappDigits)}" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i>${escapeHTML(whatsapp)}</a>` : '<p class="mt-1 text-xs text-black/60">WhatsApp non renseigné</p>'}
                <p class="mt-1 text-xs text-black/60">${items || "Aucun article"} · ${formatDateTime(order.created_at)}</p>
                <div class="mt-2 flex flex-wrap items-center gap-2"><span class="rounded-full px-2.5 py-1 text-[10px] font-bold ${followUp.className}">${followUp.label}</span>${order.expires_at ? `<span class="text-xs text-black/60">Expiration : ${formatDateTime(order.expires_at)}</span>` : ""}</div>
                ${activationCredentials}
              </div>
              <div class="flex flex-wrap items-center gap-3">
                <strong class="font-title text-lg">${formatPrice(Number(order.amount || 0))}</strong>
                ${followUp.disconnect ? `<button class="admin-mark-disconnected min-h-11 rounded-xl bg-aura px-3 text-xs font-bold text-white transition hover:bg-[#BE2E3D]" type="button" data-order-id="${escapeHTML(order.order_id)}">Marquer déconnecté</button>` : ""}
                <select class="admin-order-status-select min-h-11 rounded-xl border border-black/15 bg-white px-3 text-xs font-bold" data-order-id="${escapeHTML(order.order_id)}">
                  ${["pending", "active", "completed", "cancelled"].map(status =>
                    `<option value="${status}" ${order.status === status ? "selected" : ""}>${adminOrderStatusLabel(status)}</option>`
                  ).join("")}
                </select>
              </div>
            </div>
          </article>`;
        }).join("") || '<p class="py-10 text-center text-sm text-black/60">Aucune commande ne correspond aux filtres.</p>';
        list.querySelectorAll(".admin-order-status-select").forEach(select => {
          select.addEventListener("change", async () => {
            select.disabled = true;
            try {
              await apiRequest("/admin/update-order-status", {
                method: "POST",
                body: JSON.stringify({ order_id: select.dataset.orderId, status: select.value })
              });
              showToast("Statut de la commande mis à jour");
              await Promise.all([loadAdminOrders(), loadAdminOverview(), loadAdminAudit()]);
            } catch (error) {
              showToast(error.message || "Mise à jour impossible");
              await loadAdminOrders();
            }
          });
        });
        list.querySelectorAll(".admin-mark-disconnected").forEach(button => {
          button.addEventListener("click", async () => {
            const confirmed = window.confirm(t("Confirmer que l’accès a bien été retiré avant de clôturer cette commande ?"));
            if (!confirmed) return;
            button.disabled = true;
            try {
              await apiRequest("/admin/update-order-status", {
                method: "POST",
                body: JSON.stringify({ order_id: button.dataset.orderId, status: "completed" })
              });
              showToast("Commande marquée comme déconnectée");
              await Promise.all([loadAdminOrders(), loadAdminOverview(), loadAdminAudit()]);
            } catch (error) {
              button.disabled = false;
              showToast(error.message || "Mise à jour impossible");
            }
          });
        });
      } catch (error) {
        list.innerHTML = `<p class="rounded-xl bg-red-50 p-4 text-sm text-red-800">${escapeHTML(error.message || "Chargement impossible.")}</p>`;
      }
    }

    async function downloadAdminOrdersExport() {
      const button = document.getElementById("admin-orders-export");
      if (!button || currentUser?.is_admin !== true) return;
      const originalLabel = button.innerHTML;
      button.disabled = true;
      button.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2" aria-hidden="true"></i>Préparation…';
      try {
        const requestExport = () => fetch(`${API_BASE}/admin/orders-export.csv`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
          headers: { "Accept-Language": getLanguage() },
        });
        let response = await requestExport();
        if (response.status === 401 && await refreshAuthSession()) {
          response = await requestExport();
        }
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "Export impossible.");
        }
        const blob = new Blob([localizeCsv(await response.text())], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `suivi-abonnements-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        showToast("Le fichier Excel est prêt");
        loadAdminAudit();
      } catch (error) {
        showToast(error.message || "Export impossible");
      } finally {
        button.disabled = false;
        button.innerHTML = originalLabel;
      }
    }

    async function loadAdminInventory() {
      const list = document.getElementById("admin-inventory-list");
      if (!list || currentUser?.is_admin !== true) return;
      try {
        const result = await apiRequest("/admin/inventory");
        adminInventory = (Array.isArray(result.inventory) ? result.inventory : []).filter(
          item => String(item?.service || "").trim().toLowerCase() === "netflix",
        );
        document.getElementById("admin-stock-count").textContent = `${adminInventory.filter(item => !item.is_used).length} disponible(s)`;
        list.innerHTML = groupInventoryByAccount(adminInventory).map((group, groupIndex) => {
          const accountKey = group.email || String(group.profiles[0].id);
          const isExpanded = expandedStockAccounts.has(accountKey);
          const profilesId = `admin-stock-account-profiles-${groupIndex}`;
          const available = group.profiles.filter(item => !item.is_used).length;
          const header = `<article class="overflow-hidden rounded-2xl border border-black/10 bg-white"><header class="flex flex-col gap-3 bg-ivory p-4 sm:p-5"><div class="flex flex-wrap items-center gap-2"><strong class="font-title text-sm">Netflix Premium</strong><span class="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">${t("Connexion OTP")}</span><span class="rounded-full bg-green-50 px-2.5 py-1 text-[10px] font-bold text-green-700">${formatLocalizedNumber(available)} / ${formatLocalizedNumber(group.profiles.length)} ${t("Profils disponibles")}</span></div><p class="break-all text-sm font-semibold text-black/70" dir="ltr">${escapeHTML(group.email)}</p><div class="flex flex-wrap gap-2"><button class="admin-test-stock-mailbox min-h-11 rounded-xl border border-sand/70 bg-[#FFF8EE] px-4 text-xs font-bold text-[#7A4B20] transition hover:bg-sand/25" type="button" data-stock-id="${escapeHTML(group.profiles[0].id)}"><i class="fa-regular fa-envelope mr-2" aria-hidden="true"></i>${t("Tester la boîte")}</button><button class="admin-add-profiles-to-account min-h-11 rounded-xl border border-black/15 px-4 text-xs font-bold" type="button" data-account-email="${escapeHTML(group.email)}">${t("Ajouter des profils")}</button><button class="admin-toggle-stock-profiles min-h-11 rounded-xl border border-black/15 bg-white px-4 text-xs font-bold" type="button" aria-expanded="${isExpanded}" aria-controls="${profilesId}" data-account-key="${escapeHTML(accountKey)}"><span>${t(isExpanded ? "Masquer les profils" : "Afficher les profils")}</span><i class="fa-solid fa-chevron-down ml-2 ${isExpanded ? "rotate-180" : ""}" aria-hidden="true"></i></button></div></header><div id="${profilesId}" class="divide-y divide-black/10 ${isExpanded ? "" : "hidden"}">`;
          const profiles = group.profiles.map(item => {
          const deletionRequiresDisconnect = Boolean(item.is_used && item.releasable);
          const deleteButton = item.is_used && !item.releasable
            ? `<button class="min-h-11 cursor-not-allowed rounded-xl border border-black/10 px-4 text-xs font-bold text-black/30" type="button" disabled title="${escapeHTML(t("L'abonnement est encore actif. La suppression sera disponible après son expiration."))}"><i class="fa-regular fa-trash-can mr-2" aria-hidden="true"></i>Supprimer</button>`
            : `<button class="admin-delete-stock min-h-11 rounded-xl border border-red-200 px-4 text-xs font-bold text-red-700 transition hover:bg-red-50" type="button" data-stock-id="${escapeHTML(item.id)}" data-confirm-disconnected="${deletionRequiresDisconnect}"><i class="fa-regular fa-trash-can mr-2" aria-hidden="true"></i>Supprimer</button>`;
          const manualAssignButton = !item.is_used
            ? `<button class="admin-manual-assign-stock min-h-11 rounded-xl border border-blue-200 bg-blue-50 px-4 text-xs font-bold text-blue-800 transition hover:bg-blue-100" type="button" data-stock-id="${escapeHTML(item.id)}"><i class="fa-solid fa-link mr-2" aria-hidden="true"></i>Attribution manuelle</button>`
            : "";
          return `<div class="p-4 sm:p-5" data-profile-id="${escapeHTML(item.id)}">
          <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><strong class="font-title text-sm">${escapeHTML(item.profile_name || t("Profil non renseigné"))}</strong><span class="rounded-full px-2.5 py-1 text-[10px] font-bold ${item.is_used ? "bg-sand/20 text-[#7A4B20]" : "bg-green-50 text-green-700"}">${item.is_used ? "Attribué" : "Disponible"}</span>${item.releasable ? '<span class="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800">À libérer</span>' : ""}</div><p class="mt-1 text-xs leading-5 text-black/60">${item.profile_pin ? `PIN <bdi>${escapeHTML(item.profile_pin)}</bdi> · ` : ""}${t("Ajouté")} ${formatDateTime(item.created_at)}</p>${item.assigned_order_id ? `<p class="mt-1 break-all text-[11px] text-black/60">Commande : ${escapeHTML(item.assigned_order_id)}${item.order_status ? ` · ${escapeHTML(item.order_status)}` : ""}${item.order_expires_at ? ` · expiration ${formatDateTime(item.order_expires_at)}` : ""}</p>` : ""}</div>
            <div class="flex flex-wrap gap-2"><button class="admin-edit-stock min-h-11 rounded-xl border border-black/15 px-4 text-xs font-bold transition hover:border-graphite hover:bg-graphite hover:text-white" type="button" data-stock-id="${escapeHTML(item.id)}"><i class="fa-solid fa-pen mr-2" aria-hidden="true"></i>Modifier</button>${manualAssignButton}${item.releasable ? `<button class="admin-release-stock min-h-11 rounded-xl border border-amber-300 bg-amber-50 px-4 text-xs font-bold text-amber-900 transition hover:bg-amber-100" type="button" data-stock-id="${escapeHTML(item.id)}"><i class="fa-solid fa-rotate mr-2" aria-hidden="true"></i>Libérer</button>` : ""}${deleteButton}</div>
          </div>
        </div>`;
          }).join("");
          return `${header}${profiles}</div></article>`;
        }).join("") || '<p class="py-10 text-center text-sm text-black/60">Aucun compte en stock.</p>';
        list.querySelectorAll(".admin-toggle-stock-profiles").forEach(button => {
          button.addEventListener("click", () => {
            const expanded = button.getAttribute("aria-expanded") !== "true";
            const profiles = document.getElementById(button.getAttribute("aria-controls"));
            button.setAttribute("aria-expanded", String(expanded));
            button.querySelector("span").textContent = t(expanded ? "Masquer les profils" : "Afficher les profils");
            button.querySelector("i").classList.toggle("rotate-180", expanded);
            profiles.classList.toggle("hidden", !expanded);
            if (expanded) expandedStockAccounts.add(button.dataset.accountKey);
            else expandedStockAccounts.delete(button.dataset.accountKey);
          });
        });
        list.querySelectorAll(".admin-add-profiles-to-account").forEach(button => {
          button.addEventListener("click", () => {
            const form = document.getElementById("admin-stock-form");
            form.elements.account_email.value = button.dataset.accountEmail;
            form.scrollIntoView({ behavior: "smooth", block: "start" });
            form.querySelector('[name="profile_name"]')?.focus({ preventScroll: true });
          });
        });
        list.querySelectorAll(".admin-edit-stock").forEach(button => {
          button.addEventListener("click", () => openAdminStockEditor(button.dataset.stockId));
        });
        list.querySelectorAll(".admin-manual-assign-stock").forEach(button => {
          button.addEventListener("click", () => openAdminManualAssignment(button.dataset.stockId));
        });
        list.querySelectorAll(".admin-test-stock-mailbox").forEach(button => {
          button.addEventListener("click", async () => {
            const original = button.innerHTML;
            button.disabled = true;
            button.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-2" aria-hidden="true"></i>Test en cours';
            try {
              const result = await apiRequest(`/admin/inventory/${encodeURIComponent(button.dataset.stockId)}/test-mailbox`, { method: "POST" });
              showToast(`Boîte connectée · ${formatLocalizedNumber(Number(result.messages || 0))} message(s)`);
            } catch (error) {
              showToast(error.message || "Connexion à la boîte impossible");
            } finally {
              button.disabled = false;
              button.innerHTML = original;
            }
          });
        });
        list.querySelectorAll(".admin-delete-stock").forEach(button => {
          button.addEventListener("click", async () => {
            const confirmDisconnected = button.dataset.confirmDisconnected === "true";
            const confirmationMessage = confirmDisconnected
              ? t("Confirme que l'ancien client a été déconnecté. Ce profil sera supprimé définitivement du stock.")
              : t("Supprimer ce compte non attribué du stock ?");
            if (!window.confirm(confirmationMessage)) return;
            button.disabled = true;
            try {
              await apiRequest(`/admin/inventory/${encodeURIComponent(button.dataset.stockId)}`, {
                method: "DELETE",
                body: JSON.stringify({ confirm_disconnected: confirmDisconnected })
              });
              showToast("Compte retiré du stock");
              await Promise.all([loadAdminInventory(), loadAdminOverview(), loadAdminAudit()]);
            } catch (error) {
              showToast(error.message || "Suppression impossible");
              button.disabled = false;
            }
          });
        });
        list.querySelectorAll(".admin-release-stock").forEach(button => {
          button.addEventListener("click", async () => {
            if (!window.confirm(t("Confirme que l’ancien client a été déconnecté de ce profil. Le profil pourra être réattribué immédiatement à la plus ancienne commande payée en attente."))) return;
            button.disabled = true;
            try {
              const result = await apiRequest(`/admin/inventory/${encodeURIComponent(button.dataset.stockId)}/release`, {
                method: "POST",
                body: JSON.stringify({ confirm_disconnected: true })
              });
              const fulfilled = Number(result.stock_reconciliation?.fulfilled || 0);
              showToast(fulfilled > 0 ? "Profil libéré et réattribué à une commande payée" : "Profil libéré et remis en stock");
              await Promise.all([loadAdminInventory(), loadAdminOverview(), loadAdminAudit(), loadAdminOrders()]);
            } catch (error) {
              showToast(error.message || "Libération impossible");
              button.disabled = false;
            }
          });
        });
      } catch (error) {
        list.innerHTML = `<p class="rounded-xl bg-red-50 p-4 text-sm text-red-800">${escapeHTML(error.message || "Chargement impossible.")}</p>`;
      }
    }

    async function openAdminManualAssignment(stockId) {
      const dialog = document.getElementById("admin-assignment-dialog");
      const form = document.getElementById("admin-assignment-form");
      const select = document.getElementById("admin-assignment-order");
      const empty = document.getElementById("admin-assignment-empty");
      const feedback = document.getElementById("admin-assignment-feedback");
      const submit = document.getElementById("admin-assignment-submit");
      if (!dialog || !form || !select || !empty || !submit) return;
      form.elements.inventory_id.value = stockId;
      select.innerHTML = `<option value="">${escapeHTML(t("Chargement des commandes…"))}</option>`;
      select.disabled = true;
      submit.disabled = true;
      empty.classList.add("hidden");
      if (feedback) feedback.className = "mt-4 hidden rounded-xl px-4 py-3 text-sm";
      dialog.showModal();
      try {
        const result = await apiRequest(`/admin/inventory/${encodeURIComponent(stockId)}/assignment-options`);
        const orders = Array.isArray(result.orders) ? result.orders : [];
        select.innerHTML = orders.map(order => {
          const items = Array.isArray(order.items) ? order.items : [];
          const summary = items.map(item => `${item.name || item.service || "Netflix"} x${Number(item.quantity || 1)}`).join(", ");
          return `<option value="${escapeHTML(order.order_id)}">${escapeHTML(order.order_id)} · ${escapeHTML(order.assigned_email || "")} · ${escapeHTML(summary)}</option>`;
        }).join("");
        if (orders.length === 0) {
          select.innerHTML = `<option value="">${escapeHTML(t("Aucune commande Netflix payée n’attend actuellement ce profil."))}</option>`;
          empty.classList.remove("hidden");
        } else {
          submit.disabled = false;
        }
      } catch (error) {
        select.innerHTML = `<option value="">${escapeHTML(t("Impossible de charger les commandes."))}</option>`;
        if (feedback) {
          feedback.textContent = error.message || t("Impossible de charger les commandes.");
          feedback.className = "mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800";
        }
      } finally {
        select.disabled = false;
      }
    }

    const adminAssignmentDialog = document.getElementById("admin-assignment-dialog");
    const closeAdminAssignmentDialog = () => adminAssignmentDialog?.open && adminAssignmentDialog.close();
    document.getElementById("admin-assignment-dialog-close")?.addEventListener("click", closeAdminAssignmentDialog);
    document.getElementById("admin-assignment-dialog-cancel")?.addEventListener("click", closeAdminAssignmentDialog);
    adminAssignmentDialog?.addEventListener("click", event => {
      if (event.target === adminAssignmentDialog) closeAdminAssignmentDialog();
    });
    document.getElementById("admin-assignment-form")?.addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = document.getElementById("admin-assignment-submit");
      const feedback = document.getElementById("admin-assignment-feedback");
      const inventoryId = String(form.elements.inventory_id.value || "");
      const orderId = String(form.elements.order_id.value || "");
      if (!inventoryId || !orderId || !button) return;
      button.disabled = true;
      try {
        await apiRequest(`/admin/inventory/${encodeURIComponent(inventoryId)}/assign`, {
          method: "POST",
          body: JSON.stringify({ order_id: orderId }),
        });
        showToast(t("Profil attribué à la commande"));
        closeAdminAssignmentDialog();
        await Promise.all([loadAdminInventory(), loadAdminOverview(), loadAdminOrders(), loadAdminAudit()]);
      } catch (error) {
        if (feedback) {
          feedback.textContent = error.message || t("Attribution impossible.");
          feedback.className = "mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800";
        }
        button.disabled = false;
      }
    });

    function openAdminStockEditor(stockId) {
      const item = adminInventory.find(entry => String(entry.id) === String(stockId));
      const dialog = document.getElementById("admin-stock-dialog");
      const form = document.getElementById("admin-stock-edit-form");
      if (!item || !dialog || !form) return;
      form.reset();
      form.elements.id.value = item.id;
      form.elements.account_email.value = item.account_email || "";
      form.elements.profile_name.value = item.profile_name || "";
      form.elements.profile_pin.value = item.profile_pin || "";
      const feedback = document.getElementById("admin-stock-edit-feedback");
      if (feedback) feedback.className = "mt-4 hidden rounded-xl px-4 py-3 text-sm";
      dialog.showModal();
    }

    async function loadAdminPromos() {
      const list = document.getElementById("admin-promos-list");
      if (!list || currentUser?.is_admin !== true) return;
      try {
        const result = await apiRequest("/admin/promo-codes");
        const promos = Array.isArray(result.promo_codes) ? result.promo_codes : [];
        list.innerHTML = promos.map(promo => `<article class="rounded-2xl border border-black/10 p-5">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div><div class="flex flex-wrap items-center gap-2"><strong class="font-title text-lg tracking-[0.12em]">${escapeHTML(promo.masked_code)}</strong><span class="rounded-full px-2.5 py-1 text-[10px] font-bold ${promo.active ? "bg-green-50 text-green-700" : "bg-black/5 text-black/60"}">${promo.active ? "Actif" : "Inactif"}</span></div><p class="mt-2 text-sm text-black/60">${Number(promo.discount_value || 0)} % · ${(promo.services || []).map(escapeHTML).join(", ") || "Toute la boutique"}</p></div>
            <button class="admin-toggle-promo min-h-11 rounded-xl border border-black/15 px-4 text-xs font-bold hover:border-aura hover:text-aura" type="button" data-promo-id="${escapeHTML(promo.id)}" data-active="${promo.active}">${promo.active ? "Désactiver" : "Réactiver"}</button>
          </div>
          <div class="mt-5 grid grid-cols-2 gap-3 border-t border-black/10 pt-5 sm:grid-cols-4">
            <div><p class="text-[10px] font-bold uppercase tracking-wide text-black/60">Ventes</p><p class="mt-1 font-title text-xl font-extrabold">${Number(promo.sales_count || 0)}</p></div>
            <div><p class="text-[10px] font-bold uppercase tracking-wide text-black/60">Revenu généré</p><p class="mt-1 font-title text-xl font-extrabold">${formatPrice(Number(promo.revenue_amount || 0))}</p></div>
            <div><p class="text-[10px] font-bold uppercase tracking-wide text-black/60">Réductions</p><p class="mt-1 font-title text-xl font-extrabold">${formatPrice(Number(promo.discount_total || 0))}</p></div>
            <div><p class="text-[10px] font-bold uppercase tracking-wide text-black/60">Dernière vente</p><p class="mt-1 text-xs font-semibold">${formatDateTime(promo.last_used_at)}</p></div>
          </div>
        </article>`).join("") || '<p class="py-10 text-center text-sm text-black/60">Aucun code promo créé.</p>';
        list.querySelectorAll(".admin-toggle-promo").forEach(button => {
          button.addEventListener("click", async () => {
            button.disabled = true;
            try {
              await apiRequest(`/admin/promo-codes/${encodeURIComponent(button.dataset.promoId)}`, {
                method: "PATCH",
                body: JSON.stringify({ active: button.dataset.active !== "true" })
              });
              await Promise.all([loadAdminPromos(), loadAdminAudit()]);
            } catch (error) {
              showToast(error.message || "Modification impossible");
              button.disabled = false;
            }
          });
        });
      } catch (error) {
        list.innerHTML = `<p class="rounded-xl bg-red-50 p-4 text-sm text-red-800">${escapeHTML(error.message || "Chargement impossible.")}</p>`;
      }
    }

    function adminAuditActionLabel(action) {
      const labels = {
        admin_login: "Connexion administrateur",
        admin_orders_export: "Export du suivi des commandes",
        admin_order_status_update: "Mise à jour du statut d’une commande",
        admin_inventory_create: "Ajout de comptes au stock",
        admin_inventory_delete: "Suppression d’un compte du stock",
        admin_inventory_update: "Modification d’un compte en stock",
        admin_inventory_release: "Libération et réattribution d’un profil Netflix",
        admin_inventory_mailbox_test: "Test de connexion de la boîte Netflix",
        admin_promo_create: "Création d’un code promo",
        admin_promo_update: "Modification d’un code promo",
        admin_promo_deactivate: "Désactivation d’un code promo",
      };
      return t(labels[action] || "Action administrative");
    }

    function adminAuditTargetLabel(targetType) {
      const labels = {
        auth: "Authentification",
        orders: "Commandes",
        order: "Commande",
        inventory: "Stock",
        promo_code: "Code promo",
      };
      return t(labels[targetType] || "Système");
    }

    async function loadAdminAudit() {
      const list = document.getElementById("admin-audit-list");
      if (!list || currentUser?.is_admin !== true) return;
      try {
        const result = await apiRequest("/admin/audit-logs?limit=50");
        const events = Array.isArray(result.events) ? result.events : [];
        list.innerHTML = events.map(event => `<article class="flex gap-4 rounded-2xl border border-black/10 p-4">
          <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-black/5 text-black/55"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i></span>
          <div class="min-w-0"><p class="font-title text-sm font-bold">${escapeHTML(adminAuditActionLabel(event.action))}</p><p class="mt-1 truncate text-xs text-black/60">${escapeHTML(adminAuditTargetLabel(event.target_type))}${event.target_id ? ` · <bdi dir="ltr">${escapeHTML(event.target_id)}</bdi>` : ""}</p><p class="mt-1 text-[11px] text-black/60">${formatDateTime(event.created_at)}</p></div>
        </article>`).join("") || '<p class="py-10 text-center text-sm text-black/60">Aucune activité récente.</p>';
      } catch (error) {
        list.innerHTML = `<p class="rounded-xl bg-red-50 p-4 text-sm text-red-800">${escapeHTML(error.message || "Chargement impossible.")}</p>`;
      }
    }

    async function loadAdminDashboard({ refresh = false } = {}) {
      if (currentUser?.is_admin !== true) return;
      if (adminLoaded && !refresh) return;
      adminLoaded = true;
      setAdminFeedback("");
      const results = await Promise.allSettled([
        loadAdminOverview(),
        loadAdminOrders(),
        loadAdminInventory(),
        loadAdminPromos(),
        loadAdminAudit()
      ]);
      if (results.some(result => result.status === "rejected")) {
        setAdminFeedback("Certaines données n’ont pas pu être actualisées. Réessaie dans quelques instants.");
      }
    }

    document.querySelectorAll(".admin-tab").forEach(button => {
      button.addEventListener("click", () => activateAdminTab(button.dataset.adminTab));
    });
    document.querySelectorAll(".admin-open-tab").forEach(button => {
      button.addEventListener("click", () => activateAdminTab(button.dataset.targetTab));
    });
    document.getElementById("admin-refresh")?.addEventListener("click", async event => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await loadAdminDashboard({ refresh: true });
        showToast("Tableau de bord actualisé");
      } finally {
        button.disabled = false;
      }
    });
    document.getElementById("admin-revenue-filter")?.addEventListener("submit", async event => {
      event.preventDefault();
      const button = document.getElementById("admin-revenue-apply");
      if (button) button.disabled = true;
      try {
        await loadAdminOverview();
        setAdminRevenueFeedback("Période actualisée.");
      } catch (error) {
        setAdminRevenueFeedback(error.message || "Impossible de charger cette période.", true);
        const chart = document.getElementById("admin-revenue-chart");
        if (chart) chart.innerHTML = '<p class="grid min-h-56 place-items-center text-sm text-red-700">Impossible de charger les revenus.</p>';
      } finally {
        if (button) button.disabled = false;
      }
    });
    ["admin-revenue-start", "admin-revenue-end"].forEach((id) => {
      document.getElementById(id)?.addEventListener("input", () => {
        adminRevenueReport = null;
        const exportButton = document.getElementById("admin-revenue-export");
        if (exportButton) exportButton.disabled = true;
        setAdminRevenueFeedback("Cliquez sur Afficher pour appliquer cette période.");
      });
    });
    document.getElementById("admin-revenue-export")?.addEventListener("click", downloadAdminRevenueExport);
    document.getElementById("admin-order-filters")?.addEventListener("submit", event => {
      event.preventDefault();
      adminOrdersPage = 1;
      loadAdminOrders();
    });
    document.getElementById("admin-orders-export")?.addEventListener("click", downloadAdminOrdersExport);
    document.getElementById("admin-orders-prev")?.addEventListener("click", () => {
      if (adminOrdersPage <= 1) return;
      adminOrdersPage -= 1;
      loadAdminOrders();
    });
    document.getElementById("admin-orders-next")?.addEventListener("click", () => {
      if (adminOrdersPage >= adminOrdersTotalPages) return;
      adminOrdersPage += 1;
      loadAdminOrders();
    });
    const stockProfiles = document.getElementById("admin-stock-profiles");
    const addStockProfileButton = document.getElementById("admin-add-stock-profile");
    function syncStockProfileRows() {
      const rows = [...stockProfiles.querySelectorAll("[data-stock-profile]")];
      addStockProfileButton.disabled = rows.length >= 5;
      rows.forEach((row, index) => {
        row.querySelector("[data-profile-number]").textContent = `${t("Profil")} ${formatLocalizedNumber(index + 1)}`;
        row.querySelector("[data-remove-stock-profile]").disabled = rows.length === 1;
      });
    }
    function addStockProfileRow() {
      if (!stockProfiles || stockProfiles.children.length >= 5) return;
      const row = document.createElement("div");
      row.dataset.stockProfile = "";
      row.className = "min-w-0 rounded-xl border border-white/15 p-3";
      row.innerHTML = `<div class="mb-3 flex items-center justify-between gap-2"><span data-profile-number class="text-xs font-bold"></span><button data-remove-stock-profile type="button" class="min-h-11 px-2 text-xs text-ivory/60 disabled:opacity-30">${t("Retirer le profil")}</button></div><div class="grid min-w-0 gap-3 sm:grid-cols-2"><label class="grid min-w-0 gap-2 text-xs font-bold">${t("Nom du profil")}<input name="profile_name" required maxlength="80" autocomplete="off" class="min-h-11 min-w-0 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-sm font-normal text-white outline-none focus:border-aura" type="text"></label><label class="grid min-w-0 gap-2 text-xs font-bold">PIN<input name="profile_pin" required inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8" autocomplete="off" class="min-h-11 min-w-0 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-sm font-normal text-white outline-none focus:border-aura" type="password"></label></div>`;
      stockProfiles.append(row);
      syncStockProfileRows();
    }
    function resetStockProfileRows() {
      stockProfiles.replaceChildren();
      addStockProfileRow();
    }
    addStockProfileButton?.addEventListener("click", addStockProfileRow);
    stockProfiles?.addEventListener("click", event => {
      const button = event.target.closest("[data-remove-stock-profile]");
      if (!button || stockProfiles.children.length <= 1) return;
      button.closest("[data-stock-profile]").remove();
      syncStockProfileRows();
    });
    if (stockProfiles) resetStockProfileRows();

    document.getElementById("admin-stock-form")?.addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      const feedback = document.getElementById("admin-stock-form-feedback");
      button.disabled = true;
      try {
        const profiles = [...stockProfiles.querySelectorAll("[data-stock-profile]")].map(row => ({
          profile_name: row.querySelector('[name="profile_name"]').value.trim(),
          profile_pin: row.querySelector('[name="profile_pin"]').value.trim(),
        }));
        const values = groupedInventoryPayload(form.elements.account_email.value, profiles, form.elements.manual_assignment.checked);
        const result = await apiRequest("/admin/inventory", { method: "POST", body: JSON.stringify(values) });
        const accountEmail = String(values.account_email || "");
        form.reset();
        resetStockProfileRows();
        const emailInput = form.elements.namedItem("account_email");
        if (emailInput) emailInput.value = accountEmail;
        const fulfilled = Number(result.stock_reconciliation?.fulfilled || 0);
        feedback.textContent = result.manual_assignment
          ? t("Profils ajoutés au stock. Choisis les commandes avec Attribution manuelle.")
          : fulfilled > 0
          ? t("Profils ajoutés au stock. Les commandes payées en attente ont été traitées.")
          : t("Profils ajoutés au stock.");
        feedback.className = "mt-3 text-xs text-green-300";
        await Promise.all([loadAdminInventory(), loadAdminOverview(), loadAdminAudit()]);
      } catch (error) {
        feedback.textContent = error.message || "Ajout impossible.";
        feedback.className = "mt-3 text-xs text-red-300";
      } finally {
        button.disabled = false;
      }
    });
    const adminStockDialog = document.getElementById("admin-stock-dialog");
    const closeAdminStockDialog = () => adminStockDialog?.open && adminStockDialog.close();
    document.getElementById("admin-stock-dialog-close")?.addEventListener("click", closeAdminStockDialog);
    document.getElementById("admin-stock-dialog-cancel")?.addEventListener("click", closeAdminStockDialog);
    adminStockDialog?.addEventListener("click", event => {
      if (event.target === adminStockDialog) closeAdminStockDialog();
    });
    document.getElementById("admin-stock-edit-form")?.addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      const feedback = document.getElementById("admin-stock-edit-feedback");
      const values = Object.fromEntries(new FormData(form));
      const stockId = String(values.id || "");
      delete values.id;
      button.disabled = true;
      if (feedback) feedback.className = "mt-4 hidden rounded-xl px-4 py-3 text-sm";
      try {
        await apiRequest(`/admin/inventory/${encodeURIComponent(stockId)}`, {
          method: "PUT",
          body: JSON.stringify(values),
        });
        if (feedback) {
          feedback.textContent = "Compte mis à jour.";
          feedback.className = "mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-800";
        }
        await Promise.all([loadAdminInventory(), loadAdminOverview(), loadAdminAudit()]);
        window.setTimeout(closeAdminStockDialog, 450);
      } catch (error) {
        if (feedback) {
          feedback.textContent = error.message || "Modification impossible.";
          feedback.className = "mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800";
        }
      } finally {
        button.disabled = false;
      }
    });
    document.getElementById("admin-promo-form")?.addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      const feedback = document.getElementById("admin-promo-form-feedback");
      const data = new FormData(form);
      const payload = {
        code: String(data.get("code") || "").trim().toUpperCase(),
        discount_type: "percentage",
        discount_value: Number(data.get("discount_value")),
        max_uses: data.get("max_uses") ? Number(data.get("max_uses")) : null,
        max_uses_per_client: data.get("max_uses_per_client") ? Number(data.get("max_uses_per_client")) : null,
        starts_at: data.get("starts_at") ? new Date(String(data.get("starts_at"))).toISOString() : null,
        ends_at: data.get("ends_at") ? new Date(String(data.get("ends_at"))).toISOString() : null,
        services: data.getAll("services")
      };
      button.disabled = true;
      try {
        const result = await apiRequest("/admin/promo-codes", { method: "POST", body: JSON.stringify(payload) });
        form.reset();
        feedback.textContent = `Code créé : ${result.code}. Copie-le maintenant, il ne sera plus réaffiché.`;
        feedback.className = "mt-3 text-xs font-bold text-green-300";
        await Promise.all([loadAdminPromos(), loadAdminAudit()]);
      } catch (error) {
        feedback.textContent = error.message || "Création impossible.";
        feedback.className = "mt-3 text-xs text-red-300";
      } finally {
        button.disabled = false;
      }
    });
    async function signOutCurrentSession(button) {
      interruptSessionRestore();
      if (button) button.disabled = true;
      try {
        if (currentUser) await apiRequest("/logout", { method: "POST" });
      } catch {
        // Local sign-out still completes if the API is temporarily unavailable.
      } finally {
        clearCurrentAuthSession({ redirectToLogin: false });
        sessionStorage.removeItem("aura_order_id");
        activeOrderId = "";
        showRoute("home");
      }
    }

    [
      document.getElementById("admin-signout"),
      document.getElementById("customer-signout"),
      ...sessionSignoutButtons
    ].filter(Boolean).forEach((button) => {
      button.addEventListener("click", (event) => {
        void signOutCurrentSession(event.currentTarget);
      });
    });

    function showAuthPanel(name) {
      document.querySelectorAll(".auth-tab").forEach(tab => {
        const selected = tab.dataset.auth === name;
        tab.setAttribute("aria-selected", String(selected));
        tab.classList.toggle("bg-white", selected);
        tab.classList.toggle("shadow-sm", selected);
        tab.classList.toggle("text-black/60", !selected);
      });
      document.querySelectorAll("[data-auth-panel]").forEach(panel => {
        panel.classList.toggle("hidden", panel.dataset.authPanel !== name);
      });
      document.getElementById("forgot-password-link")?.classList.toggle("hidden", name !== "signin");
    }

    document.querySelectorAll(".auth-tab").forEach(tab => {
      tab.addEventListener("click", () => showAuthPanel(tab.dataset.auth));
    });
    document.getElementById("forgot-password-link")?.addEventListener("click", () => showAuthPanel("forgot"));
    document.getElementById("back-to-signin-from-forgot")?.addEventListener("click", () => showAuthPanel("signin"));

    document.querySelectorAll(".faq-question").forEach(button => {
      button.addEventListener("click", () => {
        const item = button.closest(".faq-item");
        const isOpen = item.dataset.open === "true";
        item.dataset.open = String(!isOpen);
        button.setAttribute("aria-expanded", String(!isOpen));
      });
    });

    function normalizeSearch(value) {
      const normalized = value
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
        .toLowerCase();
      return normalized
        .split(/\s+/)
        .map(token => token.startsWith("ال") && token.length > 3 ? token.slice(2) : token)
        .join(" ");
    }

    function filterFaq(term) {
      const tokens = normalizeSearch(term).split(/\s+/).filter(token => token.length > 1);
      document.querySelectorAll(".faq-item").forEach(item => {
        const haystack = normalizeSearch(`${item.textContent} ${item.dataset.keywords}`);
        item.classList.toggle("hidden", tokens.length > 0 && !tokens.every(token => haystack.includes(token)));
      });
    }

    const faqCategories = [...document.querySelectorAll(".faq-category")];

    function setFaqCategoryState(term = "") {
      const selected = normalizeSearch(term);
      faqCategories.forEach(button => {
        button.setAttribute("aria-pressed", String(Boolean(selected) && normalizeSearch(button.dataset.filter || button.textContent) === selected));
      });
    }

    document.getElementById("faq-search").addEventListener("input", event => {
      setFaqCategoryState("");
      filterFaq(event.target.value);
    });
    faqCategories.forEach(button => {
      button.addEventListener("click", () => {
        const filter = button.dataset.filter || button.textContent.trim();
        document.getElementById("faq-search").value = button.textContent.trim();
        setFaqCategoryState(filter);
        filterFaq(filter);
      });
    });

    function recoveryAccessToken() {
      return capturedRecoveryToken;
    }

    document.getElementById("forgot-password-form")?.addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        const result = await apiRequest("/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email: document.getElementById("forgot-email").value.trim() })
        });
        setAuthFeedback(result.message || "Si cet email existe, un lien a été envoyé.", false);
      } catch (error) {
        setAuthFeedback(error.message || "Impossible d'envoyer le lien.");
      } finally {
        button.disabled = false;
      }
    });

    document.getElementById("reset-password-form")?.addEventListener("submit", async event => {
      event.preventDefault();
      const token = recoveryAccessToken();
      const password = document.getElementById("reset-password").value;
      if (!token) {
        setAuthFeedback("Le lien de réinitialisation est invalide ou expiré.");
        return;
      }
      const button = event.currentTarget.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        const result = await apiRequest("/reset-password", {
          method: "POST",
          body: JSON.stringify({ token, password })
        });
        capturedRecoveryToken = "";
        setAuthFeedback(result.message || "Mot de passe mis à jour. Tu peux te connecter.", false);
        showAuthPanel("signin");
        window.history.replaceState({}, document.title, `${window.location.pathname}#login`);
      } catch (error) {
        setAuthFeedback(error.message || "Lien de réinitialisation invalide ou expiré.");
      } finally {
        button.disabled = false;
      }
    });

    document.getElementById("signin-form").addEventListener("submit", async event => {
      event.preventDefault();
      interruptSessionRestore();
      const form = event.currentTarget;
      const submitButton = form.querySelector('button[type="submit"]');
      const originalLabel = submitButton.textContent;
      submitButton.disabled = true;
      submitButton.textContent = "Connexion…";
      try {
        const remember = document.getElementById("remember-me").checked;
        const result = await apiRequest("/login", {
          method: "POST",
          body: JSON.stringify({
            email: document.getElementById("signin-email").value.trim(),
            password: document.getElementById("signin-password").value,
            remember,
          })
        });
        setAccountState(result.user, result.expires_at);
        setAuthFeedback("Connexion réussie. Tu peux maintenant finaliser ta commande.", false);
        showToast("Connexion réussie");
        const nextRoute = cart.length
          ? "cart"
          : result.user?.is_admin === true
            ? "admin"
            : "order";
        showRoute(nextRoute);
        if (nextRoute === "cart") setCheckoutStep(1);
      } catch (error) {
        setAuthFeedback(error.message || "Connexion impossible.");
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = originalLabel;
      }
    });

    document.getElementById("signup-form").addEventListener("submit", async event => {
      event.preventDefault();
      interruptSessionRestore();
      const form = event.currentTarget;
      const submitButton = form.querySelector('button[type="submit"]');
      const originalLabel = submitButton.textContent;
      submitButton.disabled = true;
      submitButton.textContent = "Création…";
      try {
        const firstName = document.getElementById("signup-first-name").value.trim();
        const lastName = document.getElementById("signup-last-name").value.trim();
        const phone = normalizeAlgerianPhone(document.getElementById("signup-phone").value);
        const result = await apiRequest("/register", {
          method: "POST",
          body: JSON.stringify({
            email: document.getElementById("signup-email").value.trim(),
            password: document.getElementById("signup-password").value,
            full_name: `${firstName} ${lastName}`.trim(),
            first_name: firstName,
            last_name: lastName,
            phone,
          })
        });
        if (result.authenticated === true && result.user) {
          setAccountState(result.user, result.expires_at);
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

    const signupPhoneInput = document.getElementById("signup-phone");
    const formatSignupPhone = () => {
      signupPhoneInput.value = formatAlgerianPhoneInput(signupPhoneInput.value);
    };
    signupPhoneInput.addEventListener("input", formatSignupPhone);
    signupPhoneInput.addEventListener("blur", formatSignupPhone);
    formatSignupPhone();

    document.getElementById("support-form").addEventListener("submit", event => {
      event.preventDefault();
      const name = document.getElementById("support-name").value.trim();
      const email = document.getElementById("support-email").value.trim();
      const message = document.getElementById("support-message").value.trim();
      const text = getLanguage() === "ar"
        ? `مرحباً Aura Stream،\n\nالاسم: ${name}\nالبريد الإلكتروني: ${email}\n\nطلبي:\n${message}`
        : getLanguage() === "en"
          ? `Hello Aura Stream,\n\nName: ${name}\nEmail: ${email}\n\nMy request:\n${message}`
          : `Bonjour Aura Stream,\n\nNom : ${name}\nE-mail : ${email}\n\nMa demande :\n${message}`;
      window.open(`https://wa.me/213557828812?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
      showToast("WhatsApp est ouvert avec ton message prêt à envoyer.");
    });

    ["customer-first-name", "customer-last-name", "customer-whatsapp"].forEach(id => {
      document.getElementById(id).addEventListener("change", () => saveCheckoutProfile());
    });

    async function verifyPaymentReturn() {
      const params = new URLSearchParams(window.location.search);
      const orderId = params.get("order_id") || params.get("orderId");
      if (!orderId || !currentUser) return;
      activeOrderId = orderId;
      highlightedOrderId = orderId;
      sessionStorage.setItem("aura_order_id", orderId);
      try {
        await apiRequest("/verify-payment", { method: "POST", body: JSON.stringify({ order_id: orderId }) });
        cart = [];
        setRenewalOrderId(null);
        activePromo = null;
        setRenewalOffer(null);
        updateCart();
        showRoute("order");
        showToast("Paiement vérifié — finalise l’activation dans Mes commandes si nécessaire");
      } catch {
        showRoute("order");
        showToast("Paiement en cours de vérification");
      }
    }

    document.addEventListener("aura:languagechange", () => {
      updateRouteMetadata(activeRoute);
      updateCart();
      syncCustomSelectLabels();
      if (stockProfiles) syncStockProfileRows();
      if (activeRoute === "order" && currentUser) loadMyOrders();
      if (activeRoute === "admin" && currentUser?.is_admin === true) loadAdminDashboard({ refresh: true });
    });

    updateCart();
    const recoveryMode = recoveryRequested;
    const initialRoute = recoveryMode ? "login" : routeFromLocation();
    showRoute(initialRoute);
    if (recoveryMode) showAuthPanel("reset");
    void sessionRecovery.check();
    window.addEventListener("online", () => { void sessionRecovery.check({ force: true }); });
    window.addEventListener("focus", () => { void sessionRecovery.check(); });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void sessionRecovery.check();
    });
