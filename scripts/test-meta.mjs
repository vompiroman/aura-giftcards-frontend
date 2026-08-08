import assert from "node:assert/strict";

const values = new Map();
const sessionValues = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};
globalThis.sessionStorage = {
  getItem: (key) => sessionValues.get(key) ?? null,
  setItem: (key, value) => sessionValues.set(key, String(value)),
  removeItem: (key) => sessionValues.delete(key),
};

const appendedScripts = [];
globalThis.document = {
  createElement: () => ({}),
  head: {
    appendChild: (node) => appendedScripts.push(node),
  },
};
globalThis.window = {
  location: {
    hash: "",
    search: "?utm_source=meta&utm_medium=paid_social&utm_campaign=launch&fbclid=test-click",
  },
};

const {
  META_CONSENT_VERSION,
  getMarketingAttribution,
  getMetaMarketingConsent,
  initializeMetaPixel,
  setMetaMarketingConsent,
  trackMetaPurchase,
} = await import("../src/meta.js");

assert.equal(initializeMetaPixel(), false, "Le Pixel ne doit pas démarrer sans consentement");
assert.equal(appendedScripts.length, 0, "Aucune requête Meta ne doit partir sans consentement");

const denied = setMetaMarketingConsent(false);
assert.equal(denied.status, "denied");
assert.equal(denied.version, META_CONSENT_VERSION);
assert.ok(denied.updated_at);
assert.equal(initializeMetaPixel(), false);
assert.equal(appendedScripts.length, 0, "Le refus doit produire zéro requête Meta");

sessionValues.set("aura_access_token", "authenticated-user-token");
const granted = setMetaMarketingConsent(true);
assert.equal(granted.status, "granted");
assert.equal(getMetaMarketingConsent().version, META_CONSENT_VERSION);
assert.equal(appendedScripts.length, 0, "Meta doit rester absent tant qu'une session utilisateur est ouverte");
sessionValues.delete("aura_access_token");
initializeMetaPixel();
assert.equal(appendedScripts.length, 1, "Le consentement doit charger Meta une seule fois");
assert.deepEqual(getMarketingAttribution(), {
  utm_source: "meta",
  utm_medium: "paid_social",
  utm_campaign: "launch",
  fbclid: "test-click",
});
initializeMetaPixel();
assert.equal(appendedScripts.length, 1, "L’initialisation doit rester unique");

assert.equal(
  trackMetaPurchase({
    orderId: "ORD-test",
    amount: 800,
    items: [{ name: "Netflix 1 mois", quantity: 1 }],
  }),
  true,
);
assert.equal(values.get("meta_purchase_sent_ORD-test"), "1");
assert.equal(
  trackMetaPurchase({
    orderId: "ORD-test",
    amount: 800,
    items: [{ name: "Netflix 1 mois", quantity: 1 }],
  }),
  false,
  "Purchase doit être dédupliqué après le premier envoi",
);

const purchaseCall = window.fbq.queue.find(
  ([command, event]) => command === "track" && event === "Purchase",
);
assert.ok(purchaseCall, "Purchase absent de la file Meta");
assert.equal(purchaseCall[2].value, 800);
assert.equal(purchaseCall[2].utm_source, "meta");
assert.equal(purchaseCall[2].utm_campaign, "launch");
assert.equal(purchaseCall[2].fbclid, "test-click");
assert.equal(purchaseCall[3].eventID, "purchase_ORD-test");

console.log("Tests Meta consentement et déduplication réussis.");
