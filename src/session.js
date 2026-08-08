export const AUTH_STORAGE_KEYS = Object.freeze({
  accessToken: "aura_access_token",
  refreshToken: "aura_refresh_token",
  expiresAt: "aura_access_expires_at",
});

const parseExpiry = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};

export function accessTokenExpiry(accessToken) {
  try {
    const payload = String(accessToken || "").split(".")[1];
    if (!payload) return 0;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return parseExpiry(JSON.parse(atob(padded))?.exp);
  } catch {
    return 0;
  }
}

export function loadAuthSession(sessionStore, localStore) {
  for (const [store, remember] of [[sessionStore, false], [localStore, true]]) {
    const accessToken = String(store?.getItem(AUTH_STORAGE_KEYS.accessToken) || "");
    if (!accessToken) continue;
    return {
      accessToken,
      refreshToken: String(store.getItem(AUTH_STORAGE_KEYS.refreshToken) || ""),
      expiresAt: parseExpiry(store.getItem(AUTH_STORAGE_KEYS.expiresAt)) || accessTokenExpiry(accessToken),
      remember,
    };
  }
  return { accessToken: "", refreshToken: "", expiresAt: 0, remember: false };
}

export function clearAuthSession(sessionStore, localStore) {
  for (const store of [sessionStore, localStore]) {
    Object.values(AUTH_STORAGE_KEYS).forEach((key) => store?.removeItem(key));
    store?.removeItem("aura_cached_user");
  }
}

export function saveAuthSession(session, remember, sessionStore, localStore) {
  clearAuthSession(sessionStore, localStore);
  const accessToken = String(session?.access_token || "");
  if (!accessToken) return loadAuthSession(sessionStore, localStore);

  const target = remember ? localStore : sessionStore;
  target.setItem(AUTH_STORAGE_KEYS.accessToken, accessToken);
  if (session?.refresh_token) {
    target.setItem(AUTH_STORAGE_KEYS.refreshToken, String(session.refresh_token));
  }
  const expiresAt = parseExpiry(session?.expires_at) || accessTokenExpiry(accessToken);
  if (expiresAt) target.setItem(AUTH_STORAGE_KEYS.expiresAt, String(expiresAt));
  return { accessToken, refreshToken: String(session?.refresh_token || ""), expiresAt, remember: Boolean(remember) };
}

export function sessionNeedsRefresh(session, nowMs = Date.now(), leewaySeconds = 90) {
  const expiresAt = parseExpiry(session?.expiresAt) || accessTokenExpiry(session?.accessToken);
  if (!expiresAt) return false;
  return expiresAt <= Math.floor(nowMs / 1000) + leewaySeconds;
}
