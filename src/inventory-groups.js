export function groupInventoryByAccount(inventory) {
  const groups = new Map();
  for (const item of Array.isArray(inventory) ? inventory : []) {
    const email = String(item.account_email || "").trim().toLowerCase();
    // Legacy entries without an email must keep their separate identity.
    const key = email || String(item.id);
    if (!groups.has(key)) groups.set(key, { email, profiles: [] });
    groups.get(key).profiles.push(item);
  }
  return [...groups.values()];
}

export function groupedInventoryPayload(email, profiles, manualAssignment) {
  if (!profiles.length || profiles.length > 5) throw new Error("Ajoute entre 1 et 5 profils Netflix pour ce compte.");
  const names = new Set();
  for (const profile of profiles) {
    const name = String(profile.profile_name || "").trim().toLowerCase();
    if (names.has(name)) throw new Error("Chaque profil doit avoir un nom différent.");
    names.add(name);
  }
  return { service: "netflix", account_email: email.trim(), profiles, manual_assignment: Boolean(manualAssignment) };
}
