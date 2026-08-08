import assert from "node:assert/strict";

globalThis.atob = (value) => Buffer.from(value, "base64").toString("utf8");

const {
  AUTH_STORAGE_KEYS,
  accessTokenExpiry,
  clearAuthSession,
  loadAuthSession,
  saveAuthSession,
  sessionNeedsRefresh,
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

const jwt = (exp) => {
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `header.${payload}.signature`;
};

const sessionStore = makeStore();
const localStore = makeStore();
const expiresAt = 1_800_000_000;

assert.equal(accessTokenExpiry(jwt(expiresAt)), expiresAt);
const saved = saveAuthSession({
  access_token: jwt(expiresAt),
  refresh_token: "rotating-refresh-token",
  expires_at: expiresAt,
}, true, sessionStore, localStore);
assert.equal(saved.remember, true);
assert.equal(loadAuthSession(sessionStore, localStore).refreshToken, "rotating-refresh-token");
assert.equal(localStore.getItem(AUTH_STORAGE_KEYS.expiresAt), String(expiresAt));
assert.equal(sessionNeedsRefresh(saved, (expiresAt - 60) * 1000), true);
assert.equal(sessionNeedsRefresh(saved, (expiresAt - 600) * 1000), false);

saveAuthSession({
  access_token: jwt(expiresAt + 3600),
  refresh_token: "new-refresh-token",
  expires_at: expiresAt + 3600,
}, false, sessionStore, localStore);
assert.equal(localStore.getItem(AUTH_STORAGE_KEYS.accessToken), null);
assert.equal(sessionStore.getItem(AUTH_STORAGE_KEYS.refreshToken), "new-refresh-token");

clearAuthSession(sessionStore, localStore);
assert.equal(loadAuthSession(sessionStore, localStore).accessToken, "");

console.log("Tests de persistance, expiration et rotation de session réussis.");
