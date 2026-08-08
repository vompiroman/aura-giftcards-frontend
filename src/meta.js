export const META_PIXEL_ID = "1048802778090797";
export const META_CONSENT_VERSION = "2026-07-26";

const CONSENT_STORAGE_KEY = "aura_marketing_consent";
const PURCHASE_STORAGE_PREFIX = "meta_purchase_sent_";
const ATTRIBUTION_STORAGE_KEY = "aura_marketing_attribution";
const ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
];

const attributionFromUrl = () => {
  const params = new URLSearchParams(window.location.search || "");
  return Object.fromEntries(
    ATTRIBUTION_KEYS.flatMap((key) => {
      const value = String(params.get(key) || "").trim().slice(0, 240);
      return value ? [[key, value]] : [];
    }),
  );
};

// Kept in memory until consent is granted. This preserves attribution without
// writing marketing identifiers to storage before the visitor chooses.
const pendingAttribution = attributionFromUrl();

const hasSensitiveAuthFragment = () =>
  /(?:^|[&#])(access_token|refresh_token|provider_token|type=recovery)=/i.test(
    window.location.hash || "",
  );

export const getMetaMarketingConsent = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY) || "null");
    if (
      stored &&
      stored.version === META_CONSENT_VERSION &&
      ["granted", "denied"].includes(stored.status)
    ) {
      return stored;
    }
  } catch {
    // An invalid or obsolete preference must be requested again.
  }
  return null;
};

const marketingAllowed = () => {
  const consent = getMetaMarketingConsent();
  return consent?.status === "granted";
};

export const getMarketingAttribution = () => {
  if (!marketingAllowed()) return {};
  try {
    const stored = JSON.parse(localStorage.getItem(ATTRIBUTION_STORAGE_KEY) || "null");
    const capturedAt = Date.parse(stored?.captured_at || "");
    if (!Number.isFinite(capturedAt) || Date.now() - capturedAt > ATTRIBUTION_TTL_MS) {
      localStorage.removeItem(ATTRIBUTION_STORAGE_KEY);
      return {};
    }
    return Object.fromEntries(
      ATTRIBUTION_KEYS.flatMap((key) => {
        const value = String(stored?.[key] || "").trim().slice(0, 240);
        return value ? [[key, value]] : [];
      }),
    );
  } catch {
    localStorage.removeItem(ATTRIBUTION_STORAGE_KEY);
    return {};
  }
};

export const captureMarketingAttribution = () => {
  if (!marketingAllowed()) return {};
  const current = attributionFromUrl();
  const attribution = Object.keys(current).length ? current : pendingAttribution;
  if (Object.keys(attribution).length) {
    localStorage.setItem(
      ATTRIBUTION_STORAGE_KEY,
      JSON.stringify({ ...attribution, captured_at: new Date().toISOString() }),
    );
  }
  return getMarketingAttribution();
};

const installMetaQueue = () => {
  if (window.fbq) return;

  const fbq = function (...args) {
    if (fbq.callMethod) {
      fbq.callMethod(...args);
    } else {
      fbq.queue.push(args);
    }
  };

  window.fbq = fbq;
  window._fbq = fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
};

export const initializeMetaPixel = () => {
  if (window.__metaPixelInitialized) return true;
  if (!marketingAllowed() || hasSensitiveAuthFragment()) return false;

  installMetaQueue();
  captureMarketingAttribution();
  window.__metaPixelInitialized = true;
  window.fbq("init", META_PIXEL_ID);

  if (!window.__metaPageViewTracked) {
    window.__metaPageViewTracked = true;
    window.fbq("track", "PageView");
  }

  return true;
};

export const setMetaMarketingConsent = (allowed) => {
  const consent = {
    status: allowed ? "granted" : "denied",
    version: META_CONSENT_VERSION,
    updated_at: new Date().toISOString(),
  };
  localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consent));

  if (window.fbq) {
    window.fbq("consent", allowed ? "grant" : "revoke");
  }
  if (allowed) {
    captureMarketingAttribution();
    initializeMetaPixel();
  } else {
    localStorage.removeItem(ATTRIBUTION_STORAGE_KEY);
  }
  return consent;
};

export const metaContents = (items) =>
  (Array.isArray(items) ? items : [])
    .map((item) => ({
      id: item.name || item.type || item.id,
      quantity: Number(item.quantity || 1),
    }))
    .filter((item) => item.id);

export const trackMeta = (eventName, data = {}, eventId = null) => {
  try {
    if (!initializeMetaPixel() || !window.fbq) return false;
    const payload = { ...data, ...captureMarketingAttribution() };
    if (eventId) {
      window.fbq("track", eventName, payload, { eventID: eventId });
    } else {
      window.fbq("track", eventName, payload);
    }
    return true;
  } catch {
    return false;
  }
};

export const trackMetaPurchase = ({ orderId, amount, items }) => {
  const normalizedOrderId = String(orderId || "").trim();
  const normalizedAmount = Number(amount);
  if (!normalizedOrderId || !Number.isFinite(normalizedAmount) || normalizedAmount < 0) {
    return false;
  }

  const sentKey = `${PURCHASE_STORAGE_PREFIX}${normalizedOrderId}`;
  if (localStorage.getItem(sentKey)) return false;

  const normalizedItems = Array.isArray(items) ? items : [];
  const sent = trackMeta(
    "Purchase",
    {
      value: normalizedAmount,
      currency: "DZD",
      content_type: "product",
      content_ids: normalizedItems.map((item) => item.name || item.id).filter(Boolean),
      contents: metaContents(normalizedItems),
      num_items: normalizedItems.reduce(
        (sum, item) => sum + Number(item.quantity || 1),
        0,
      ),
    },
    `purchase_${normalizedOrderId}`,
  );

  if (sent) localStorage.setItem(sentKey, "1");
  return sent;
};

window.initializeMetaPixel = initializeMetaPixel;
window.setMetaMarketingConsent = setMetaMarketingConsent;
