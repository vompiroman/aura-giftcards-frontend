// A route's 401 is not proof that the browser's current session is gone.
// Restore from cookies, retry once, and confirm before changing identity.
export async function authenticatedRequest({ request, restore, getRevision, publicAuth = false }) {
  const revision = getRevision();
  let response = await request();
  if (publicAuth || response.status !== 401 || revision !== getRevision()) return response;
  if (!await restore() || revision !== getRevision()) return response;
  response = await request();
  if (response.status === 401 && revision === getRevision()) await restore();
  return response;
}
