// Temporary network failures leave the session unknown, not signed out.
export function createSessionRecovery({ request, onResult, onStatus,
  schedule = setTimeout, cancel = clearTimeout, now = Date.now }) {
  let enabled = true;
  let generation = 0;
  let pending = null;
  let controller = null;
  let timer = null;
  let failures = 0;
  let lastChecked = -Infinity;

  function clearRetry() {
    if (timer !== null) cancel(timer);
    timer = null;
  }

  function check({ force = false, throwOnError = false } = {}) {
    if (!enabled) return Promise.resolve(false);
    if (pending) return pending;
    if (!force && now() - lastChecked < 30_000) return Promise.resolve(false);
    clearRetry();
    const revision = generation;
    const attemptController = new AbortController();
    controller = attemptController;
    onStatus("checking");
    pending = (async () => {
      try {
        const result = await request(attemptController.signal);
        if (revision !== generation) return false;
        if (typeof result?.authenticated !== "boolean" || (result.authenticated && !result.user)) {
          throw new Error("Invalid session response");
        }
        failures = 0;
        lastChecked = now();
        onStatus(result.authenticated ? "authenticated" : "anonymous");
        onResult(result);
        return result.authenticated;
      } catch (error) {
        if (revision !== generation) return false;
        failures += 1;
        onStatus("retrying");
        const delay = [2_000, 5_000, 10_000, 30_000, 60_000][Math.min(failures - 1, 4)];
        timer = schedule(() => { timer = null; void check({ force: true }); }, delay);
        if (throwOnError) throw error;
        return false;
      } finally {
        if (revision === generation) { pending = null; controller = null; }
      }
    })();
    return pending;
  }

  return {
    check,
    stop() {
      enabled = false;
      generation += 1;
      clearRetry();
      controller?.abort();
      controller = null;
      pending = null;
      onStatus("stopped");
    },
    resume() {
      enabled = true; failures = 0; lastChecked = now();
    },
  };
}
