export function createAdminSecurity({ api, t, onVerified }) {
  const panel = document.getElementById("admin-security");
  if (!panel) return { load: async () => false, reset() {} };

  const tabs = document.getElementById("admin-tabs");
  const data = document.getElementById("admin-data");
  const enroll = panel.querySelector("[data-admin-enroll]");
  const setup = panel.querySelector("[data-admin-setup]");
  const qr = panel.querySelector("[data-admin-qr]");
  const secret = panel.querySelector("[data-admin-mfa-secret]");
  const form = panel.querySelector("[data-admin-verify]");
  const factorRow = panel.querySelector("[data-admin-factor-row]");
  const select = panel.querySelector("[data-admin-factor]");
  const code = panel.querySelector("[data-admin-mfa-code]");
  const status = panel.querySelector("[data-admin-mfa-status]");
  const submit = form.querySelector("[type=submit]");
  let decision, request, enrollmentId, revision = 0;

  function showAccess(verified) {
    tabs.classList.toggle("hidden", !verified);
    data.classList.toggle("hidden", !verified);
    panel.classList.toggle("hidden", verified);
  }

  function clearSetup() {
    enrollmentId = null;
    qr.removeAttribute("src");
    secret.textContent = "";
    code.value = "";
    setup.classList.add("hidden");
  }

  function reset() {
    revision++;
    decision = undefined;
    request = null;
    clearSetup();
    select.replaceChildren();
    enroll.classList.add("hidden");
    form.classList.add("hidden");
    factorRow.classList.add("hidden");
    status.textContent = "";
    showAccess(false);
    panel.classList.add("hidden");
  }

  function load({ refresh = false } = {}) {
    if (request) return request;
    if (decision !== undefined && (!refresh || enrollmentId)) return Promise.resolve(decision);
    const current = revision;
    status.textContent = t("Chargement…");
    showAccess(decision === true);
    request = (async () => {
      try {
        const result = await api("/admin/security");
        if (current !== revision) return false;
        decision = result.verified === true;
        const factors = Array.isArray(result.factors) ? result.factors : [];
        select.replaceChildren(...factors.map((factor, index) => new Option(
          factor.name || `${t("Application d’authentification")} ${index + 1}`, factor.id,
        )));
        enroll.classList.toggle("hidden", decision || factors.length > 0);
        form.classList.toggle("hidden", decision || factors.length === 0);
        factorRow.classList.toggle("hidden", factors.length <= 1);
        status.textContent = "";
        showAccess(decision);
        return decision;
      } catch (error) {
        if (current !== revision) return false;
        // Compatibility during rollout to the API that introduces this endpoint.
        decision = error.status === 404 ? true : undefined;
        status.textContent = decision ? "" : t(error.message);
        showAccess(decision === true);
        return decision === true;
      } finally {
        if (current === revision) request = null;
      }
    })();
    return request;
  }

  enroll.addEventListener("click", async () => {
    enroll.disabled = true;
    const current = revision;
    try {
      const result = await api("/admin/security/enroll", { method: "POST", body: "{}" });
      if (current !== revision) return;
      enrollmentId = result.id;
      secret.textContent = result.secret;
      const qrCode = typeof result.qr_code === "string" && result.qr_code.startsWith("data:image/svg+xml;utf-8,");
      if (qrCode) qr.src = result.qr_code;
      qr.classList.toggle("hidden", !qrCode);
      setup.classList.remove("hidden");
      enroll.classList.add("hidden");
      form.classList.remove("hidden");
      factorRow.classList.add("hidden");
      status.textContent = "";
      code.focus();
    } catch (error) {
      if (current === revision) status.textContent = t(error.message);
    } finally {
      enroll.disabled = false;
    }
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    submit.disabled = true;
    const current = revision;
    try {
      await api("/admin/security/verify", {
        method: "POST",
        body: JSON.stringify({ factor_id: enrollmentId || select.value, code: code.value }),
      });
      if (current !== revision) return;
      clearSetup();
      status.textContent = "";
      decision = true;
      showAccess(true);
      onVerified();
    } catch (error) {
      if (current === revision) {
        status.textContent = t(error.message);
        code.select();
      }
    } finally {
      submit.disabled = false;
    }
  });
  return { load, reset };
}
