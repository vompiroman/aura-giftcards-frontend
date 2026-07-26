export const META_PIXEL_ID = "1048802778090797";
export const META_CONSENT_VERSION = "2026-07-26";

const CONSENT_STORAGE_KEY = "aura_marketing_consent";
const PURCHASE_STORAGE_PREFIX = "meta_purchase_sent_";

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
  if (allowed) initializeMetaPixel();
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
    if (eventId) {
      window.fbq("track", eventName, data, { eventID: eventId });
    } else {
      window.fbq("track", eventName, data);
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
