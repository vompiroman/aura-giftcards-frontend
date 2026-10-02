import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createSessionRecovery } from "../src/session-recovery.js";

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
assert.equal(
  app.includes("clearCurrentAuthSession({ redirectToLogin: false });"),
  true,
  "La déconnexion doit ignorer la page de connexion intermédiaire.",
);
assert.equal(
  app.includes('window.location.replace(window.location.origin + window.location.pathname)'),
  false,
  "La déconnexion ne doit plus recharger la page avant le retour à l’accueil.",
);

function recoveryHarness(request) {
  const timers = new Map();
  const results = [];
  const statuses = [];
  let id = 0;
  let time = 0;
  const recovery = createSessionRecovery({ request,
    onResult: result => results.push(result), onStatus: status => statuses.push(status),
    schedule: (callback, delay) => { timers.set(++id, { callback, delay }); return id; },
    cancel: timer => timers.delete(timer), now: () => time,
  });
  return { recovery, results, statuses, timers,
    async retry() {
      const [timer, task] = timers.entries().next().value;
      timers.delete(timer); time += task.delay; task.callback();
      await new Promise(resolve => setImmediate(resolve));
    },
    advance: ms => { time += ms; },
  };
}

const savedUser = { id: "returning-customer", email: "client@example.com" };
let attempts = 0;
const temporaryFailure = recoveryHarness(async () => {
  if (++attempts === 1) throw new TypeError("Offline");
  return { authenticated: true, user: savedUser };
});
assert.equal(await temporaryFailure.recovery.check(), false);
assert.deepEqual(temporaryFailure.results, [], "A temporary outage must never sign the customer out");
assert.equal(temporaryFailure.statuses.at(-1), "retrying");
await temporaryFailure.retry();
assert.deepEqual(temporaryFailure.results, [{ authenticated: true, user: savedUser }]);
assert.equal(temporaryFailure.timers.size, 0);

const signedOut = recoveryHarness(async () => ({ authenticated: false, user: null }));
await signedOut.recovery.check();
assert.equal(signedOut.statuses.at(-1), "anonymous");
assert.equal(signedOut.timers.size, 0, "An anonymous visitor should not repeatedly renew");

let finish;
const lateResponse = recoveryHarness(() => new Promise(resolve => { finish = resolve; }));
const first = lateResponse.recovery.check();
assert.equal(lateResponse.recovery.check(), first, "Focus events should share the current request");
lateResponse.recovery.stop();
finish({ authenticated: true, user: savedUser });
await first;
assert.deepEqual(lateResponse.results, [], "A late restoration cannot undo voluntary logout or a new login");
assert.equal(await lateResponse.recovery.check({ force: true }), false);

let checks = 0;
const resume = recoveryHarness(async () => { checks++; return { authenticated: true, user: savedUser }; });
await resume.recovery.check();
await resume.recovery.check();
assert.equal(checks, 1);
resume.advance(31_000);
await resume.recovery.check();
assert.equal(checks, 2, "Returning to an older tab should restore the current cookies");

const interruptedRetry = recoveryHarness(async () => { throw new Error("503"); });
await interruptedRetry.recovery.check();
interruptedRetry.recovery.stop();
assert.equal(interruptedRetry.timers.size, 0);
console.log("Purge des anciens jetons, restauration automatique, reprise réseau et interruption de session vérifiées.");
