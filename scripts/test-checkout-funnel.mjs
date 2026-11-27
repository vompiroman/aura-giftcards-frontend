import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createCheckoutFunnel } from "../src/checkout-funnel.js";

function storage() {
  const data = new Map();
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key),
  };
}

test("consentement, réponse temporairement perdue, reprise et déduplication", async () => {
  const settings = storage(), session = storage();
  const calls = [];
  const now = () => 1795816800000;
  const setup = { settings, session, now, uuid: randomUUID, schedule: () => 1 };
  const first = createCheckoutFunnel({ ...setup, send: async event => { calls.push(event); return false; } });
  await first.track("product_view", ["Netflix"]);
  assert.equal(calls.length, 0);
  first.setConsent(true);
  await first.track("product_view", ["Netflix", "Netflix"]);
  await first.track("add_to_cart", ["Netflix"]);
  assert.equal(calls.length, 1);
  const restarted = createCheckoutFunnel({ ...setup, send: async event => { calls.push(event); return true; } });
  await restarted.track("product_view", ["netflix"]);
  await restarted.flush();
  assert.deepEqual(calls.map(event => event.stage), ["product_view", "product_view", "add_to_cart"]);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[2].journey_id, calls[0].journey_id);
  assert.equal(session.getItem("aura_checkout_outbox"), null);
  await restarted.track("add_to_cart", ["netflix"]);
  assert.equal(calls.length, 3);
});

test("la révocation depuis un autre onglet interrompt l’envoi et vide la file", async () => {
  const settings = storage(), session = storage();
  let signal;
  const first = createCheckoutFunnel({
    settings, session, uuid: randomUUID,
    send: (_event, abortSignal) => {
      signal = abortSignal;
      return new Promise(resolve => signal.addEventListener("abort", () => resolve(false)));
    },
  });
  first.setConsent(true);
  const sending = first.track("product_view", ["netflix"]);
  const anotherTab = createCheckoutFunnel({ settings, session: storage(), uuid: randomUUID });
  anotherTab.setConsent(false);
  first.syncConsent();
  assert.equal(signal.aborted, true);
  await sending;
  assert.equal(session.getItem("aura_checkout_outbox"), null);
  assert.equal(first.id(), undefined);
});
