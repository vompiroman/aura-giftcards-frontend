import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const {
  LEGACY_AUTH_STORAGE_KEYS,
  clearAuthSession,
} = await import("../src/session.js");

const makeStore = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    values,
  };
};

const sessionStore = makeStore();
const localStore = makeStore();

for (const key of LEGACY_AUTH_STORAGE_KEYS) {
  sessionStore.setItem(key, `session-${key}`);
  localStore.setItem(key, `local-${key}`);
}
sessionStore.setItem("aura_checkout_cart", "[]");

clearAuthSession(sessionStore, localStore);
for (const key of LEGACY_AUTH_STORAGE_KEYS) {
  assert.equal(sessionStore.getItem(key), null);
  assert.equal(localStore.getItem(key), null);
}
assert.equal(sessionStore.getItem("aura_checkout_cart"), "[]");

const app = await readFile(new URL("../src/canvas.js", import.meta.url), "utf8");
for (const forbidden of [
  "authToken",
  "loadAuthSession",
  "saveAuthSession",
  "sessionNeedsRefresh",
  'credentials: "omit"',
  "headers.Authorization",
]) {
  assert.equal(app.includes(forbidden), false, `Jeton navigateur encore présent: ${forbidden}`);
}
assert.equal(app.includes('const API_BASE = "/api"'), true);
assert.equal(app.includes('credentials: "include"'), true);
assert.equal(app.includes("remember,"), true);

console.log("Tests de purge des anciens jetons et de session HttpOnly réussis.");
