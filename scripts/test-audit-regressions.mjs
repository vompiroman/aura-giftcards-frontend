import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright-core";
import { orderReference, startInterfaceServer } from "./interface-fixture.mjs";

const chrome = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" };
const evidenceDir = process.env.AURA_TEST_EVIDENCE_DIR;
const userA = {
  id: "fixture-a", email: "camille@example.test", is_admin: false,
  user_metadata: { first_name: "Camille", last_name: "Test", phone: "+213555010101" },
};
const userB = {
  id: "fixture-b", email: "noor@example.test", is_admin: false,
  user_metadata: { first_name: "Noor", last_name: "Test", phone: "+213555010102" },
};
const admin = { ...userA, is_admin: true };
const password = "Fictitious-test-password!";
const token = "fake-recovery-token-for-browser-only";
const recoveryId = "fake-context-id";
const promoDiscount = { subtotal: 1100, discount_amount: 200, total: 900 };
const amounts = { fr: "DA", en: "DZD", ar: "دج" };
const errors = {
  fr: ["Saisis une adresse e-mail valide.", "Le nouveau mot de passe doit contenir 12 à 128 caractères."],
  en: ["Enter a valid email address.", "The new password must contain 12 to 128 characters."],
  ar: ["أدخل بريدًا إلكترونيًا صالحًا.", "يجب أن تتكون كلمة المرور الجديدة من 12 إلى 128 حرفاً."],
};
let server, browser;
const forbidden = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

before(async () => {
  server = await startInterfaceServer({ authenticated: false });
  browser = await chromium.launch(chrome);
  if (evidenceDir) await mkdir(evidenceDir, { recursive: true });
});

after(async () => {
  await browser?.close();
  await server?.close();
});

async function mock(context, state, handle) {
  await context.route("**/*", async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin !== server.origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const path = url.pathname.slice(4);
    if (["/create-order", "/create-invoice", "/partner/wallet/deposits"].includes(path)) {
      forbidden.push(path);
      return route.abort();
    }
    const response = await handle({ req, url, path });
    if (response) return route.fulfill(response);
    if (path === "/session") return route.fulfill({ json: { authenticated: Boolean(state.user), user: state.user } });
    if (path === "/logout") {
      state.user = null;
      return route.fulfill({ status: 204 });
    }
    return route.continue();
  });
}

async function view(page, path) {
  await page.goto(server.origin + path, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(document.body.dataset.route));
  const decline = page.locator("#decline-marketing");
  if (await decline.isVisible()) await decline.click();
}

async function signIn(page, user = userB) {
  await page.locator("#signin-email").fill(user.email);
  await page.locator("#signin-password").fill(password);
  await page.locator("#signin-form button[type=submit]").click();
}

const responseFor = (page, path) => page.waitForResponse(response => new URL(response.url()).pathname === "/api" + path);
const visible = (page, locator) => page.locator(locator).waitFor({ state: "visible" });
const text = async (page, locator) => (await page.locator(locator).textContent()).trim();

async function assertInvalid(page, id, message) {
  assert.equal(await page.locator("#" + id + "-error").textContent(), message);
  assert.equal(await page.locator("#" + id).getAttribute("aria-invalid"), "true");
  assert.ok((await page.locator("#" + id).getAttribute("aria-describedby")).split(" ").includes(id + "-error"));
  assert.equal(await page.locator(":focus").getAttribute("id"), id);
}

async function screenshot(page, name, { width, language }) {
  if (evidenceDir && ((width === 390 && language === "ar") || (width === 1440 && language === "fr"))) {
    await page.screenshot({ path: join(evidenceDir, name + "-" + language + "-" + width + ".png") });
  }
}

async function add(page, service) {
  await page.locator(".product-card[data-service=" + service + "] .add-product").click();
}

async function accountAndCheckout(page, context, options) {
  const state = { user: userA };
  const saves = [];
  let failNext = true;
  let releaseOld;
  const oldResult = new Promise(resolve => { releaseOld = resolve; });
  await mock(context, state, ({ path, req }) => {
    if (path === "/login") {
      const { email, password: supplied } = req.postDataJSON();
      assert.equal(supplied, password);
      assert.equal(email, userB.email);
      state.user = userB;
      return { json: { user: state.user } };
    }
    if (path !== "/update-profile") return;
    const save = { account: state.user?.id, fields: req.postDataJSON() };
    saves.push(save);
    if (save.account === userA.id) return oldResult;
    if (failNext) {
      failNext = false;
      return delay(300).then(() => ({ status: 503, json: { error: "Enregistrement indisponible." } }));
    }
    return delay(450).then(() => ({ json: { user: userB } }));
  });
  try {
    await view(page, "/#products");
    for (const service of ["spotify", "crunchyroll", "snapchat"]) await add(page, service);
    await page.locator("#header-cart-button").click();
    await visible(page, "#spotify-account-email");
    await page.locator("#spotify-account-email").fill("old-spotify@example.test");
    await page.locator("#spotify-account-password").fill(password);
    await page.locator("#crunchyroll-account-email").fill("old-crunchyroll@example.test");
    await page.locator("#crunchyroll-account-password").fill(password);
    await page.locator("#snapchat-username").fill("oldfixture");
    await page.locator("#snapchat-friend-added").check();
    await page.locator("#customer-first-name").fill("Ancien profil");
    await page.locator("#customer-first-name").press("Tab");
    await waitUntil(() => saves.length > 0, "profile save for account A did not start");
    assert.equal(saves[0].account, userA.id);
    if (options.width < 1024) await page.locator("#mobile-menu-toggle").click();
    await page.locator("header .session-signout:visible").click();
    await page.waitForURL(server.origin + "/");
    if (options.width < 1024) await page.locator("#mobile-menu-toggle").click();
    await page.locator("header .account-link:visible").click();
    await signIn(page);
    await page.waitForURL("**/#cart");
    assert.equal(await page.locator("#customer-email").inputValue(), userB.email);
    assert.equal(await page.locator("#customer-first-name").inputValue(), userB.user_metadata.first_name);
    assert.equal(await page.locator("#customer-whatsapp").inputValue(), userB.user_metadata.phone);
    for (const id of ["spotify-account-email", "spotify-account-password", "crunchyroll-account-email",
      "crunchyroll-account-password", "snapchat-username"]) assert.equal(await page.locator("#"+id).inputValue(), "");
    assert.equal(await page.locator("#snapchat-friend-added").isChecked(), false);
    const old = responseFor(page, "/update-profile");
    releaseOld({ json: { user: userA } });
    await (await old).finished();
    assert.equal(await page.locator("#customer-first-name").inputValue(), "Noor");
    await screenshot(page, "compte-isole", options);

    for (const [id, value] of [
      ["spotify-account-email", "new-spotify@example.test"], ["spotify-account-password", password],
      ["crunchyroll-account-email", "new-crunchyroll@example.test"], ["crunchyroll-account-password", password],
      ["snapchat-username", "newfixture"],
    ]) await page.locator("#"+id).fill(value);
    await page.locator("#snapchat-friend-added").check();
    await page.locator("#customer-first-name").fill("Noor Test");
    const first = responseFor(page, "/update-profile");
    await page.locator("#to-payment").dblclick();
    assert.equal((await first).status(), 503);
    await visible(page, "#profile-save-status.text-red-700");
    assert.equal(await page.locator("#checkout-payment").isVisible(), false);
    assert.equal(saves.filter(save => save.account === userB.id).length, 1);
    await page.locator("#to-payment").dblclick();
    await page.locator("#customer-form").evaluate(form => form.requestSubmit());
    await visible(page, "#checkout-payment");
    assert.deepEqual(saves.filter(save => save.account === userB.id).map(save => save.fields), [
      { first_name: "Noor Test", last_name: "Test", phone: userB.user_metadata.phone },
      { first_name: "Noor Test", last_name: "Test", phone: userB.user_metadata.phone },
    ]);
    assert.match(await text(page, "#pay-total"), new RegExp(amounts[options.language] + "$"));
    await page.locator("#back-to-information").click();
    assert.equal(await page.locator("#customer-first-name").inputValue(), "Noor Test");
  } finally {
    releaseOld({ json: {} });
  }
}

async function historyAndPromo(page, context, options) {
  const state = { user: userA };
  const pending = new Map();
  let lastRelease;
  await mock(context, state, ({ path, req }) => {
    if (path !== "/validate-promo") return;
    const { code } = req.postDataJSON();
    if (code === "LATEST") return { json: { ...promoDiscount, discount_amount: 100, total: 1000 } };
    return new Promise(resolve => pending.set(code, resolve));
  });
  async function submit(code) {
    const reply = page.waitForResponse(response => new URL(response.url()).pathname === "/api/validate-promo"
      && response.request().postDataJSON().code === code);
    await page.locator("#promo-code").fill(code);
    await page.locator("#promo-apply").click();
    await waitUntil(() => pending.has(code), "promo validation did not start");
    return { reply, release: pending.get(code) };
  }
  try {
    await view(page, "/netflix-algerie");
    assert.equal(new URL(page.url()).pathname, "/netflix-algerie");
    await page.locator("#view-landing-netflix [data-route=products]").click();
    await page.waitForURL("**/#products");
    await page.locator('.product-card[data-service=netflix] [data-duration="2 mois"]').click();
    await add(page, "netflix");
    await page.locator("#header-cart-button").click();
    await page.goBack();
    await page.waitForURL("**/#products");
    await page.goBack();
    await page.waitForURL("**/netflix-algerie");
    await page.goForward();
    await page.waitForURL("**/#products");
    await page.goForward();
    await page.waitForURL("**/#cart");
    await page.reload();
    await visible(page, "#checkout-items article");
    const initialTotal = await text(page, "#checkout-total");
    let request = await submit("EMPTY");
    lastRelease = request.release;
    await page.locator("#checkout-items .remove-cart").click();
    request.release({ json: promoDiscount });
    await (await request.reply).finished();
    assert.equal(await page.locator("#promo-code").inputValue(), "");
    assert.equal(await page.locator("#promo-feedback").isVisible(), false);

    await view(page, "/#products");
    await page.locator('.product-card[data-service=netflix] [data-duration="2 mois"]').click();
    await add(page, "netflix");
    await page.locator("#header-cart-button").click();
    request = await submit("COMPOSITION");
    lastRelease = request.release;
    await page.locator("#checkout-items .remove-cart").click();
    await page.goBack();
    await page.locator('.product-card[data-service=netflix] [data-duration="1 mois"]').click();
    await add(page, "netflix");
    await add(page, "crunchyroll");
    await page.locator("#header-cart-button").click();
    assert.equal(await text(page, "#checkout-total"), initialTotal);
    request.release({ json: promoDiscount });
    await (await request.reply).finished();
    assert.equal(await page.locator("#promo-code").inputValue(), "");
    assert.equal(await text(page, "#checkout-total"), initialTotal);

    request = await submit("EARLIER");
    lastRelease = request.release;
    const latest = responseFor(page, "/validate-promo");
    await page.locator("#promo-code").fill("LATEST");
    await page.locator("#promo-apply").click();
    await latest;
    await page.waitForFunction(() => document.querySelector("#promo-feedback-message").textContent.includes("LATEST"));
    const latestTotal = await text(page, "#checkout-total");
    assert.notEqual(latestTotal, initialTotal);
    assert.equal(await page.locator("#checkout-glance-total").textContent(), latestTotal);
    request.release({ json: promoDiscount });
    await (await request.reply).finished();
    assert.equal(await text(page, "#checkout-total"), latestTotal);
    assert.equal(await page.locator("#promo-code").inputValue(), "LATEST");
    assert.match(await text(page, "#promo-feedback-message"), /LATEST/);
    await screenshot(page, "code-promo", options);
  } finally {
    lastRelease?.({ json: promoDiscount });
  }
}

async function waitUntil(predicate, message, limit = 3600) {
  const end = Date.now() + limit;
  while (Date.now() < end) {
    if (await predicate()) return;
    await delay(30);
  }
  assert.fail(message);
}

async function recover(page, context, options) {
  const state = { user: null };
  const attempts = [];
  let stage = "fresh";
  await mock(context, state, ({ path, req }) => {
    if (path === "/forgot-password") return { json: { message: "Si cet email existe, un lien de réinitialisation a été envoyé." } };
    if (path === "/login") {
      assert.equal(req.postDataJSON().password, password);
      state.user = userB;
      return { json: { user: userB } };
    }
    if (path !== "/reset-password") return;
    if (req.method() === "PUT") {
      assert.equal(req.postDataJSON().token_hash, token);
      return { headers: { "Set-Cookie": "audit_recovery=opaque; HttpOnly; SameSite=Strict; Path=/api/reset-password" }, json: { recovery_id: recoveryId } };
    }
    if (req.method() === "GET") return req.headerValue("cookie").then(cookie => ({
      json: { recovery_id: cookie?.includes("audit_recovery=opaque") && stage !== "used" ? recoveryId : null },
    }));
    attempts.push(req.postDataJSON());
    if (stage === "fresh") {
      stage = "retry";
      return { status: 503, json: { error: "Service d'authentification indisponible." } };
    }
    stage = "used";
    return { json: { message: "Mot de passe mis à jour. Tu peux te connecter." } };
  });
  await view(page, "/#login");
  await page.locator("#forgot-password-link").click();
  await page.locator("#forgot-email").fill("invalide");
  await page.locator("#forgot-password-form button[type=submit]").click();
  await assertInvalid(page, "forgot-email", errors[options.language][0]);
  await page.locator("#forgot-email").fill(userB.email);
  const mail = responseFor(page, "/forgot-password");
  await page.locator("#forgot-password-form button[type=submit]").click();
  assert.equal((await mail).status(), 200);

  await view(page, "/#type=recovery&token_hash=" + token);
  await visible(page, "#reset-password-form");
  assert.equal(new URL(page.url()).hash, "#reset-password");
  const reload = responseFor(page, "/reset-password");
  await page.reload();
  await reload;
  await visible(page, "#reset-password-form");
  assert.equal(await page.evaluate(value => JSON.stringify(history.state).includes(value)
    || JSON.stringify(sessionStorage).includes(value) || JSON.stringify(localStorage).includes(value)
    || document.cookie.includes("audit_recovery="), token), false);
  await page.locator("#reset-password").pressSequentially("short");
  await page.locator("#reset-password-form button[type=submit]").click();
  await assertInvalid(page, "reset-password", errors[options.language][1]);
  await screenshot(page, "recuperation-localisee", options);
  await page.locator("#reset-password").fill(password);
  const unavailable = responseFor(page, "/reset-password");
  await page.locator("#reset-password-form button[type=submit]").click();
  assert.equal((await unavailable).status(), 503);
  await visible(page, "#auth-feedback");
  const success = responseFor(page, "/reset-password");
  await page.locator("#reset-password-form button[type=submit]").click();
  assert.equal((await success).status(), 200);
  await visible(page, "#signin-form");
  assert.deepEqual(attempts, Array(2).fill({ recovery_id: recoveryId, password }));
  await signIn(page);
  await page.waitForURL("**/#order");
  await view(page, "/#error_code=otp_expired");
  await visible(page, "#forgot-password-form");
  assert.equal(await page.locator("#reset-password-form").isVisible(), false);
}

async function adminAndSession(page, context, options) {
  const state = { user: admin };
  let releaseOrder;
  let resumed = false;
  let retries = 0;
  let reviewStatus = "PENDING";
  const oldOrder = new Promise(resolve => { releaseOrder = resolve; });
  await mock(context, state, ({ path, url, req }) => {
    if (path === "/session" && resumed) {
      retries += 1;
      if (retries === 1) return { status: 503, json: { error: "Indisponible." } };
    }
    if (path === "/partner") return { json: reviewStatus === "APPROVED" ? {
      partner_status: "APPROVED", partner_tier: "LOCKED", has_unlocked_tiers: false,
      minimum_unlock_deposit: 3000, wallet_balance: 1000, total_spent: 0, discount_percent: 0,
    } : { partner_status: "PENDING" } };
    if (path === "/partner/wallet") return { json: { transactions: [
      { kind: "DEPOSIT", status: "CONFIRMED", amount: 1000, balance_after: 1000, confirmed_at: "2026-11-27T10:00:00Z" },
    ] } };
    if (path === "/admin/partner-applications") return { json: { applications: [
      { id: "audit-review", email: userA.email, status: reviewStatus, monthly_volume: "5000_15000",
        sales_channel: "WEB", profile: "INDEPENDENT", quick_contact: "@audit", products: "Netflix" },
    ] } };
    if (path === "/admin/partner-applications/audit-review/review") {
      reviewStatus = req.postDataJSON().status;
      return { json: { ok: true } };
    }
    if (path !== "/admin/all-orders") return;
    const filter = url.searchParams.get("search");
    if (filter === "ancien") return oldOrder;
    if (filter === "nouveau") return { json: { orders: [{ order_id: "CURRENT-RESULT" }], total: 54, total_pages: 3 } };
  });
  try {
    await page.clock.setFixedTime(new Date("2026-11-27T10:00:00Z"));
    await view(page, "/#admin");
    await page.locator("#admin-orders-tab").click();
    await visible(page, "#admin-orders-list article");
    const filter = page.locator("#admin-order-search");
    const submit = page.locator("#admin-order-filters [type=submit]");
    const requested = page.waitForRequest(req => new URL(req.url()).searchParams.get("search") === "ancien");
    await filter.fill("ancien");
    await submit.click();
    await requested;
    await filter.fill("nouveau");
    await submit.click();
    await visible(page, "#admin-orders-list article:has-text('CURRENT-RESULT')");
    const pagination = await text(page, "#admin-orders-page");
    assert.equal(await page.locator("#admin-orders-next").isEnabled(), true);
    const olderResponse = page.waitForResponse(res => new URL(res.url()).searchParams.get("search") === "ancien");
    releaseOrder({ json: { orders: [{ order_id: "OLD-RESULT" }], total: 1, total_pages: 1 } });
    await (await olderResponse).finished();
    assert.equal(await page.locator("#admin-orders-list article:has-text('OLD-RESULT')").count(), 0);
    assert.equal(await text(page, "#admin-orders-page"), pagination);
    assert.equal(await page.locator("#admin-orders-next").isEnabled(), true);
    await screenshot(page, "commandes-filtrees", options);

    await page.locator("#admin-partner-tab").click();
    await page.locator("[data-partner-review] button[value=APPROVED]").click();
    await page.locator("[data-partner-review]").waitFor({ state: "detached" });
    await view(page, "/#partner");
    await visible(page, "#partner-wallet-history li:first-child");
    await view(page, "/#order");
    await visible(page, "#customer-signout");
    const order = page.getByText(orderReference, { exact: true }).first();
    await order.waitFor();
    resumed = true;
    await page.clock.setFixedTime(new Date("2026-11-27T11:05:00Z"));
    const interrupted = responseFor(page, "/session");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    assert.equal((await interrupted).status(), 503);
    assert.equal(await order.isVisible(), true);
    await waitUntil(() => retries >= 2, "session recovery did not retry", 7000);
    assert.equal(await page.locator("#customer-signout").isVisible(), true);
    await order.waitFor();
  } finally {
    releaseOrder({ json: { orders: [] } });
  }
}

for (const width of [320, 390, 1440]) for (const language of ["fr", "en", "ar"]) {
  test(`${width}px ${language} · compte, checkout, historique, promo, récupération, admin, portefeuille et session`, { timeout: 60000 }, async () => {
    for (const scenario of [accountAndCheckout, historyAndPromo, recover, adminAndSession]) {
      const context = await browser.newContext({ viewport: { width, height: 920 }, locale: "fr-FR" });
      await context.addInitScript(({ language, origin }) => {
        if (location.origin === origin) localStorage.setItem("aura_language", language);
      }, { language, origin: server.origin });
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      const runtimeErrors = [];
      page.on("pageerror", error => runtimeErrors.push(error.message));
      try {
        await scenario(page, context, { width, language });
        assert.deepEqual(runtimeErrors, []);
      } finally {
        await context.close();
      }
    }
  });
}

test("un navigateur fermé puis rouvert restaure la session via le cookie fictif", { timeout: 25000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "aura-interface-"));
  let context;
  try {
    async function reopen() {
      const next = await chromium.launchPersistentContext(dir, chrome);
      await mock(next, { user: null }, async ({ path, req }) => {
        if (path === "/login") {
          assert.equal(req.postDataJSON().remember, true);
          return { headers: { "Set-Cookie": "audit_session=test; HttpOnly; Max-Age=1800; Path=/api" }, json: { user: userB } };
        }
        if (path === "/session") {
          const signedIn = (await req.headerValue("cookie"))?.includes("audit_session=test") === true;
          return { json: { authenticated: signedIn, user: signedIn ? userB : null } };
        }
      });
      return next;
    }
    context = await reopen();
    const page = context.pages()[0];
    await view(page, "/#login");
    await page.locator("#remember-me").check();
    await signIn(page);
    await page.waitForURL("**/#order");
    await context.close();
    context = await reopen();
    const reopened = context.pages()[0];
    await view(reopened, "/#order");
    await visible(reopened, "#customer-signout");
  } finally {
    await context?.close();
    assert.equal(dirname(dir), resolve(tmpdir()));
    await rm(dir, { recursive: true, force: true, maxRetries: 3 });
  }
});

test("la redirection de connexion ne laisse pas le formulaire dans l'historique", { timeout: 20000 }, async () => {
  const state = { user: null };
  const context = await browser.newContext({ viewport: { width: 1440, height: 920 } });
  try {
    await mock(context, state, ({ path }) => {
      if (path === "/login") {
        state.user = userB;
        return { json: { user: userB } };
      }
      return undefined;
    });
    const page = await context.newPage();
    await view(page, "/");
    await page.locator("header .account-link:visible").click();
    await page.waitForURL("**/#login");
    await signIn(page);
    await page.waitForURL("**/#order");
    await page.goBack();
    await page.waitForURL(server.origin + "/");
    await page.goForward();
    await page.waitForURL("**/#order");
    await visible(page, "#customer-signout");
  } finally {
    await context.close();
  }
});

test("les tests du navigateur restent avant toute commande ou paiement", () => {
  assert.deepEqual(forbidden, []);
});
