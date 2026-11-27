const JOURNEY_KEY = "aura_checkout_journey";
const CONSENT_KEY = "aura_checkout_measurement";
const DAY_MS = 86_400_000;
const services = ["netflix", "spotify", "crunchyroll", "snapchat"];

export function createCheckoutFunnel({ settings, session, uuid, send, now = Date.now }) {
  const read = (storage, key) => {
    try { return JSON.parse(storage.getItem(key)); } catch { return null; }
  };
  const write = (storage, key, value) => {
    try {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, JSON.stringify(value));
    } catch { /* Storage may be unavailable. */ }
  };
  let consent = read(settings, CONSENT_KEY);
  let journey = read(session, JOURNEY_KEY);
  const pending = new Set();
  let queued = Promise.resolve();

  function reset() {
    journey = null;
    write(session, JOURNEY_KEY, null);
  }

  function setConsent(allowed) {
    consent = Boolean(allowed);
    write(settings, CONSENT_KEY, consent);
    if (!consent) reset();
  }

  function current() {
    if (consent !== true) return null;
    if (typeof journey?.id !== "string" || !Array.isArray(journey.seen) || !(journey.expires > now())) {
      journey = { id: uuid(), expires: now() + DAY_MS, seen: [] };
      write(session, JOURNEY_KEY, journey);
    }
    return journey;
  }

  function track(stage, products) {
    const active = current();
    if (!active) return queued;
    const selected = [...new Set(products.map(product => String(product).toLowerCase()))]
      .filter(service => services.includes(service))
      .filter(service => !active.seen.includes(`${stage}:${service}`)
        && !pending.has(`${active.id}:${stage}:${service}`));
    if (!selected.length) return queued;
    const keys = selected.map(service => `${stage}:${service}`);
    for (const key of keys) pending.add(`${active.id}:${key}`);
    queued = queued.then(async () => {
      try {
        if (consent !== true || journey !== active) return;
        if (await send({ journey_id: active.id, stage, services: selected }) && journey === active) {
          active.seen.push(...keys);
          write(session, JOURNEY_KEY, active);
        }
      } catch { /* A future visit to the same step can retry. */ }
      finally { for (const key of keys) pending.delete(`${active.id}:${key}`); }
    });
    return queued;
  }

  return { consent: () => consent, setConsent, track, id: () => current()?.id, reset };
}
