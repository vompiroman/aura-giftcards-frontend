const JOURNEY_KEY = "aura_checkout_journey";
const CONSENT_KEY = "aura_checkout_measurement";
const OUTBOX_KEY = "aura_checkout_outbox";
const DAY_MS = 86_400_000;
const SERVICES = new Set(["netflix", "spotify", "crunchyroll", "snapchat"]);
const RETRY_DELAYS = [2_000, 5_000, 10_000, 30_000, 60_000];

export function createCheckoutFunnel({
  settings, session, uuid, send, now = Date.now, schedule = setTimeout, cancel = clearTimeout,
}) {
  function read(storage, key) {
    try { return JSON.parse(storage.getItem(key)); } catch { return null; }
  }
  function write(storage, key, value) {
    try {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, JSON.stringify(value));
    } catch { /* Measurement can still work within this document. */ }
  }

  const consent = () => read(settings, CONSENT_KEY);
  let journey = read(session, JOURNEY_KEY);
  const restored = read(session, OUTBOX_KEY);
  let outbox = Array.isArray(restored) ? restored.filter(entry => entry?.expires > now()) : [];
  let pending = null;
  let controller = null;
  let timer = null;
  let failures = 0;

  function saveOutbox() {
    write(session, OUTBOX_KEY, outbox.length ? outbox : null);
  }

  function reset({ discard = false } = {}) {
    journey = null;
    write(session, JOURNEY_KEY, null);
    if (!discard) return;
    if (timer !== null) cancel(timer);
    timer = null;
    failures = 0;
    controller?.abort();
    outbox = [];
    saveOutbox();
  }

  function syncConsent() {
    if (consent() !== true) reset({ discard: true });
  }

  function setConsent(allowed) {
    write(settings, CONSENT_KEY, Boolean(allowed));
    syncConsent();
  }

  function current() {
    if (consent() !== true) return null;
    if (typeof journey?.id !== "string" || !Array.isArray(journey.seen) || !(journey.expires > now())) {
      journey = { id: uuid(), expires: now() + DAY_MS, seen: [] };
      write(session, JOURNEY_KEY, journey);
    }
    return journey;
  }

  function flush() {
    syncConsent();
    if (consent() !== true || pending || timer !== null || !outbox.length) return pending ?? Promise.resolve();
    const attempt = new AbortController();
    controller = attempt;
    pending = (async () => {
      while (outbox.length && consent() === true && !attempt.signal.aborted) {
        const entry = outbox[0];
        if (entry.expires > now()) {
          let sent = false;
          try { sent = await send(entry.event, attempt.signal); } catch { /* Retry after a delay. */ }
          if (attempt.signal.aborted || consent() !== true) return;
          if (!sent) {
            const delay = RETRY_DELAYS[Math.min(failures++, RETRY_DELAYS.length - 1)];
            timer = schedule(() => { timer = null; void flush(); }, delay);
            return;
          }
          failures = 0;
        }
        outbox.shift();
        saveOutbox();
      }
    })().finally(() => {
      pending = null;
      controller = null;
      if (attempt.signal.aborted && outbox.length && consent() === true) void flush();
    });
    return pending;
  }

  function track(stage, products) {
    const active = current();
    if (!active) return;
    const selected = [...new Set(products.map(product => String(product).toLowerCase()))]
      .filter(service => SERVICES.has(service) && !active.seen.includes(stage + ":" + service));
    if (selected.length) {
      outbox.push({
        expires: active.expires,
        event: { journey_id: active.id, stage, services: selected, occurred_at: now() },
      });
      saveOutbox();
      active.seen.push(...selected.map(service => stage + ":" + service));
      write(session, JOURNEY_KEY, active);
    }
    return flush();
  }

  return { consent, setConsent, syncConsent, track, flush, id: () => current()?.id, reset };
}
