import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createSessionRecovery } from "../src/session-recovery.js";
import { authenticatedRequest } from "../src/authenticated-request.js";

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

function recoveryHarness(request, options = {}) {
  const timers = new Map();
  const results = [];
  const statuses = [];
  let id = 0;
  let time = 0;
  const recovery = createSessionRecovery({ request,
    onResult: result => results.push(result), onStatus: status => statuses.push(status),
    schedule: (callback, delay) => { timers.set(++id, { callback, delay }); return id; },
    cancel: timer => timers.delete(timer), now: () => time,
    ...options,
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
assert.equal(temporaryFailure.timers.size, 0, "A durable session does not need browser token timers");

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

const returning = recoveryHarness(async () => ({ authenticated: true, user: savedUser }));
await returning.recovery.check();
returning.advance(7 * 24 * 3600_000);
await returning.recovery.check();
assert.equal(returning.results.length, 2, "Returning after a week restores from the stable cookie");
assert.equal(returning.timers.size, 0, "No refresh polling while inactive");
const failingRenewal = recoveryHarness(async () => { throw new Error("Render waking up"); });
await assert.rejects(failingRenewal.recovery.check({ force: true, throwOnError: true }), /Render/);
assert.equal(failingRenewal.results.length, 0, "A failed renewal never confirms logout");
assert.equal(failingRenewal.timers.size, 1);

let restored = 0;
let apiCalls = 0;
const renewedResponse = await authenticatedRequest({
  getRevision: () => 0,
  request: async () => ({ status: ++apiCalls === 1 ? 401 : 200 }),
  restore: async () => { restored++; return true; },
});
assert.equal(renewedResponse.status, 200);
assert.equal(restored, 1, "Expired access is restored before retrying the request");

restored = 0;
const routeRejection = await authenticatedRequest({
  getRevision: () => 0, request: async () => ({ status: 401 }),
  restore: async () => { restored++; return true; },
});
assert.equal(routeRejection.status, 401);
assert.equal(restored, 2, "A repeated route rejection is checked against the current session");

let revision = 0;
restored = 0;
await authenticatedRequest({
  getRevision: () => revision,
  request: async () => { revision++; return { status: 401 }; },
  restore: async () => { restored++; return true; },
});
assert.equal(restored, 0, "An old response cannot affect a later login or explicit logout");

assert.equal(app.includes("navigator.locks"), false, "Rotation is owned by the durable server session");
console.log("Purge des anciens jetons, restauration automatique, reprise réseau et interruption de session vérifiées.");
