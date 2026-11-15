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

export const recoveryRouteHash = "#reset-password";

export function readRecoveryLocation({ hash, search }, currentToken = null) {
  const fragment = new URLSearchParams(hash.slice(1));
  const query = new URLSearchParams(search);
  const recoveryLink = fragment.get("type") === "recovery" || query.get("type") === "recovery";
  const expired = fragment.get("error_code") === "otp_expired" || query.get("error_code") === "otp_expired";
  const cleanRoute = hash === recoveryRouteHash;
  const recovery = recoveryLink || expired || cleanRoute;
  let token = cleanRoute ? currentToken : null;
  if (recoveryLink && !expired && !cleanRoute) {
    if (fragment.get("token_hash")) token = { token_hash: fragment.get("token_hash") };
    else if (fragment.get("access_token")) token = { token: fragment.get("access_token") };
  }
  const sensitive = recovery
    || ["access_token", "refresh_token", "provider_token", "token", "token_hash"]
      .some(key => query.has(key) || fragment.has(key));
  return { recovery, token, sensitive };
}
