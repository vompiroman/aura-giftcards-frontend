import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium } from "playwright-core";
import { startInterfaceServer } from "./interface-fixture.mjs";

let browser, server;
before(async () => {
  server = await startInterfaceServer({ authenticated: false });
  browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" });
});
after(async () => {
  await browser?.close();
  await server?.close();
});

test("mesure consentie seule, persistante au rechargement et révocable", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const events = [];
  let signedIn = false;
  const user = { id: "funnel-fixture", email: "fiction@example.invalid", user_metadata: {
    first_name: "Camille", last_name: "Test", phone: "+213555010100",
  } };
  await context.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== server.origin) return route.abort();
    if (url.pathname === "/api/checkout-funnel") {
      assert.equal((await request.allHeaders()).cookie, undefined);
      assert.equal((await request.allHeaders()).origin, server.origin);
      events.push(request.postDataJSON());
      return route.fulfill({ status: 204 });
    }
    if (url.pathname === "/api/session") return route.fulfill({ json: signedIn
      ? { authenticated: true, user } : { authenticated: false } });
    if (url.pathname === "/api/login") {
      signedIn = true;
      return route.fulfill({ json: { user } });
    }
    if (url.pathname === "/api/update-profile") return route.fulfill({ json: { user } });
    if (url.pathname === "/api/catalog/netflix-availability") return route.fulfill({ json: { available: true } });
    return route.continue();
  });
  const page = await context.newPage();
  try {
    await page.goto(server.origin + "/netflix-algerie");
    const accept = page.locator("#accept-marketing");
    await accept.waitFor();
    assert.equal(events.length, 0);
    await page.locator("#preferences-checkout").check();
    await accept.click();
    await page.locator(".landing-add-product:visible").first().dblclick();
    await page.locator("#header-cart-button").click();
    await page.locator("#checkout-auth-gate [data-auth-panel-target=signin]").click();
    await page.reload();
    await page.locator("#signin-email").fill(user.email);
    await page.locator("#signin-password").fill("Fixture password");
    await page.locator("#signin-form button[type=submit]").click();
    await page.locator("#to-payment").click();
    await page.locator("#checkout-payment").waitFor();
    await page.locator("#back-to-information").click();
    await page.locator("#to-payment").click();
    await page.locator("#checkout-payment").waitFor();
    await page.waitForFunction(() => !sessionStorage.getItem("aura_checkout_outbox"));
    assert.deepEqual(events.map(event => event.stage), [
      "product_view", "add_to_cart", "cart_view", "login_view", "customer_info", "summary_view",
    ]);
    assert.equal(new Set(events.map(event => event.journey_id)).size, 1);
    assert.ok(events.every(event => Object.keys(event).length === 4
      && Number.isInteger(event.occurred_at) && event.services.join() === "netflix"));
    await page.locator("#open-cookie-preferences").click();
    await page.locator("#decline-marketing").click();
    assert.equal(await page.evaluate(() => sessionStorage.getItem("aura_checkout_journey")), null);
    await page.goto(server.origin + "/spotify-family-algerie");
    await page.locator(".landing-add-product:visible").first().click();
    assert.equal(events.length, 6);
  } finally {
    await context.close();
  }
});

test("aucun transport Meta, aucune étape créée sur les pages privées et reprise après 503", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    localStorage.setItem("aura_marketing_consent", JSON.stringify({ status: "granted", version: "2026-07-26" }));
    localStorage.setItem("aura_checkout_measurement", "true");
  });
  const attempts = [], external = [];
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin !== server.origin) {
      external.push(url.hostname);
      return route.abort();
    }
    if (url.pathname === "/api/checkout-funnel") {
      attempts.push(route.request().postDataJSON());
      return route.fulfill({ status: attempts.length === 1 ? 503 : 204 });
    }
    if (url.pathname === "/api/reset-password") return route.fulfill({ status: 400, json: {} });
    return route.continue();
  });
  try {
    const page = await context.newPage();
    await page.goto(server.origin + "/netflix-algerie?utm_content=fixture%40example.invalid");
    await page.locator(".landing-add-product:visible").first().click();
    await page.waitForFunction(() => JSON.parse(sessionStorage.getItem("aura_checkout_outbox"))?.length === 2);
    await page.reload();
    await page.waitForFunction(() => !sessionStorage.getItem("aura_checkout_outbox"));
    assert.deepEqual(attempts.map(e => e.stage), ["product_view", "product_view", "add_to_cart"]);
    assert.deepEqual(attempts[0], attempts[1]);
    for (const path of ["/#login", "/#order", "/#partner", "/#admin", "/?token_hash=fake-recovery-token&type=recovery"]) {
      await page.goto(server.origin + path);
      await page.waitForFunction(() => Boolean(document.body.dataset.route));
    }
    assert.equal(attempts.length, 3);
    assert.deepEqual(external, []);
    assert.equal(await page.evaluate(() => typeof window.fbq), "undefined");
    assert.equal(await page.evaluate(() => localStorage.getItem("aura_marketing_consent")), null);
    assert.doesNotMatch(JSON.stringify(attempts), /@|email|password|token_hash/);
  } finally {
    await context.close();
  }
});

test("les deux durées Netflix décrivent le stock réel sans modifier le prix du panier", async () => {
  for (const available of [true, false, null]) {
    const context = await browser.newContext({ locale: "ar-DZ", viewport: { width: 320, height: 844 } });
    await context.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.origin !== server.origin) return route.abort();
      if (url.pathname === "/api/catalog/netflix-availability") return route.fulfill(available === null
        ? { status: 503 } : { json: { available } });
      return route.continue();
    });
    try {
      const page = await context.newPage();
      await page.goto(server.origin + "/netflix-algerie");
      await page.locator("#decline-marketing").click();
      const expected = available === null ? null : "https://schema.org/" + (available ? "InStock" : "BackOrder");
      await page.waitForFunction(wanted => {
        const element = document.querySelector("[data-route-schema]");
        if (!element) return false;
        return JSON.parse(element.textContent).offers.every(offer => (offer.availability ?? null) === wanted);
      }, expected);
      assert.deepEqual(await page.locator("[data-route-schema]").evaluate(element =>
        JSON.parse(element.textContent).offers.map(offer => offer.price)), [600, 1100]);
      assert.equal(await page.locator("#netflix-stock-notice").isVisible(), available === false);
      const button = page.locator(".landing-add-product:visible").last();
      assert.equal((await button.innerText()).trim(), "أضف شهرين إلى السلة");
      await button.click();
      await page.locator("#header-cart-button").click();
      assert.equal((await page.locator("#checkout-total").innerText()).replace(/\D/g, ""), "1100");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320);
    } finally {
      await context.close();
    }
  }
});

test("l’admin voit les étapes et les paiements rapprochés sans débordement en arabe", async () => {
  const context = await browser.newContext({ locale: "ar-DZ", viewport: { width: 320, height: 844 } });
  const measurementRequests = [];
  await context.addInitScript(() => {
    localStorage.setItem("aura_marketing_consent", JSON.stringify({ status: "granted", version: "2026-07-26" }));
    localStorage.setItem("aura_checkout_measurement", "true");
  });
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin !== server.origin || url.pathname === "/api/checkout-funnel") {
      measurementRequests.push(url.pathname);
      return route.abort();
    }
    if (url.pathname === "/api/session") {
      return route.fulfill({ json: { authenticated: true, user: {
        id: "admin-fixture", email: "admin@example.invalid", is_admin: true,
      } } });
    }
    if (url.pathname === "/api/admin/checkout-funnel") return route.fulfill({ json: {
      from: "2026-10-26", through: "2026-11-24", all_paid_orders: 11, tracked_paid_orders: 5,
      stages: [{ service: "netflix", stage: "login_view", reached: 9, continued: 5 }],
    } });
    return route.continue();
  });
  try {
    const page = await context.newPage();
    await page.goto(server.origin + "/#admin");
    await page.locator("#admin-funnel-results h3").waitFor();
    assert.match(await page.locator("#admin-funnel-results").innerText(), /Netflix Premium[\s\S]*5 \/ 9/);
    assert.match(await page.locator("#admin-funnel-status").innerText(), /5 \/ 11/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320);
    assert.deepEqual(measurementRequests, []);
  } finally {
    await context.close();
  }
});
