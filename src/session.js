// Remove tokens written by versions predating server-owned HttpOnly sessions.
// The browser must never persist, inspect or expose authentication tokens again.
export const LEGACY_AUTH_STORAGE_KEYS = Object.freeze([
  "aura_access_token",
  "aura_refresh_token",
  "aura_access_expires_at",
  "aura_cached_user",
]);

export function clearAuthSession(sessionStore, localStore) {
  for (const store of [sessionStore, localStore]) {
    LEGACY_AUTH_STORAGE_KEYS.forEach((key) => store?.removeItem(key));
  }
}
