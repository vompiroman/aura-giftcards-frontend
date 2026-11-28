import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { chromium } from "playwright-core";
import { startInterfaceServer } from "./interface-fixture.mjs";
import { landingRoutes, localizedPath, seoAlternates, seoRoutes, siteLanguages, siteOrigin } from "../src/catalog.js";
import { translateForLanguage } from "../src/i18n.js";

let server, browser;
const evidence = [];
const labels = {
  fr: ["Abonnements streaming en Algérie", "Un profil Netflix Premium en Algérie",
    "Ton accès Spotify Family, activé sur ton compte.", "Crunchyroll Mega Fan, activé sur ton compte.",
    "Ton abonnement Snapchat+ sur ton propre compte."],
  en: ["Streaming subscriptions in Algeria", "A Netflix Premium profile in Algeria",
    "Your Spotify Family access, activated on your account.", "Crunchyroll Mega Fan, activated on your account.",
    "Your Snapchat+ subscription on your own account."],
  ar: ["اشتراكات البث في الجزائر", "ملف شخصي على Netflix Premium في الجزائر",
    "اشتراك Spotify Family مفعّل على حسابك.", "Crunchyroll Mega Fan مفعّل على حسابك.",
    "اشتراك Snapchat+ على حسابك الشخصي."],
};

before(async () => {
  server = await startInterfaceServer({ authenticated: false });
  browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" });
});
after(async () => {
  await browser?.close();
  await server?.close();
  if (process.env.AURA_SEO_EVIDENCE) await writeFile(process.env.AURA_SEO_EVIDENCE, JSON.stringify(evidence, null, 2));
});

async function readPage(page) {
  return page.evaluate(() => {
    const getAttr = (selector, name) => document.querySelector(selector)?.getAttribute(name);
    const isVisible = node => node.getClientRects().length > 0;
    const seen = selector => [...document.querySelectorAll(selector)].filter(isVisible);
    const visibleText = node => node.innerText.replace(/[\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim();
    return {
      title: document.title.replace(/[\u2066-\u2069]/g, ""),
      headings: seen("h1").map(visibleText),
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      canonical: getAttr('link[rel="canonical"]', "href"),
      description: getAttr('meta[name="description"]', "content")?.replace(/[\u2066-\u2069]/g, ""),
      socialDescription: getAttr('meta[property="og:description"]', "content")?.replace(/[\u2066-\u2069]/g, ""),
      robots: getAttr('meta[name="robots"]', "content"),
      alternates: [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map(node => [node.hreflang, node.href]),
      languageLinks: seen("a[data-seo-language]").map(node => [node.hreflang, node.getAttribute("href")]),
      productLinks: seen("#view-home a[data-route^=landing]").map(node => node.getAttribute("href")),
      offerLabels: seen(".landing-add-product").map(visibleText),
      displayedPrices: seen(".page-view:not(.hidden)[data-view^='landing'] [data-partner-public-price]").map(node =>
        Number(visibleText(node).replace(/\D/g, ""))),
      schema: [...document.querySelectorAll('script[type="application/ld+json"]')].map(node => JSON.parse(node.textContent)),
      viewport: window.innerWidth,
      pageWidth: document.documentElement.scrollWidth,
    };
  });
}

for (const javascript of [false, true]) {
  test("métadonnées, langues, maillage et offres " + (javascript ? "après JavaScript" : "dans le HTML initial"), async () => {
    for (const language of siteLanguages) {
      const context = await browser.newContext({
        javaScriptEnabled: javascript, locale: "fr-FR", viewport: { width: 390, height: 844 },
      });
      await context.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.origin !== server.origin) return route.abort();
        if (url.pathname === "/api/catalog/netflix-availability") return route.fulfill({ json: { available: true } });
        return route.continue();
      });
      const page = await context.newPage();
      try {
        for (const [index, [route, offer]] of Object.entries(seoRoutes).entries()) {
          const path = localizedPath(offer.path, language);
          const status = (await page.goto(server.origin + path, { waitUntil: "load" })).status();
          assert.equal(status, 200, path);
          if (javascript) {
            await page.waitForFunction(view => document.body.dataset.route === view, route);
            if (route === "landing-netflix") {
              await page.waitForFunction(() => document.querySelector("[data-route-schema]")?.textContent.includes("InStock"));
            }
          }
          const data = await readPage(page);
          const clean = value => value.replace(/[\u2066-\u2069]/g, "");
          assert.equal(data.title, clean(translateForLanguage(language, offer.title)), path);
          assert.equal(data.description, clean(translateForLanguage(language, offer.description)), path);
          assert.equal(data.socialDescription, data.description, path);
          assert.deepEqual(data.headings, [labels[language][index]], path);
          assert.equal(data.lang, language, path);
          assert.equal(data.dir, language === "ar" ? "rtl" : "ltr", path);
          assert.equal(data.canonical, siteOrigin + path, path);
          assert.equal(data.robots, "index,follow", path);
          assert.deepEqual(data.alternates, seoAlternates(offer.path), path);
          assert.deepEqual(data.languageLinks, siteLanguages.map(lang => [lang, localizedPath(offer.path, lang)]), path);
          assert.equal(data.pageWidth, data.viewport, path);
          const schema = data.schema.filter(item => item["@type"] === "Product");
          if (offer.product) {
            assert.equal(schema.length, 1, path);
            assert.equal(schema[0].url, data.canonical, path);
            assert.equal(clean(schema[0].description), data.description, path);
            assert.equal(schema[0].image, siteOrigin + offer.image, path);
            const prices = offer.offers.map(([, price]) => price);
            assert.deepEqual(data.displayedPrices, prices, path);
            assert.deepEqual(schema[0].offers.map(o => [o.price, o.priceCurrency]), prices.map(price => [price, "DZD"]), path);
            assert.deepEqual(schema[0].offers.map(o => o.name), offer.offers.map(([duration]) => translateForLanguage(language, duration)), path);
            const expected = route === "landing-netflix" && !javascript ? undefined : "https://schema.org/InStock";
            assert.ok(schema[0].offers.every(o => o.availability === expected), path);
          } else {
            assert.equal(schema.length, 0, path);
            assert.ok(data.schema.some(item => item["@type"] === "OnlineStore"), path);
            assert.deepEqual(new Set(data.productLinks), new Set(Object.values(landingRoutes).map(item => localizedPath(item.path, language))), path);
          }
          evidence.push({ mode: javascript ? "rendu" : "HTML initial", path, status, ...data });
        }
      } finally {
        await context.close();
      }
    }
  });
}

test("changer de langue conserve les liens, le panier et les formulaires du parcours", async () => {
  const context = await browser.newContext({ locale: "fr-FR", viewport: { width: 390, height: 844 } });
  await context.route("**/*", route => new URL(route.request().url()).origin === server.origin ? route.continue() : route.abort());
  const page = await context.newPage();
  try {
    await page.goto(server.origin + "/en/netflix-algerie");
    if (await page.locator("#decline-marketing").isVisible()) await page.locator("#decline-marketing").click();
    await page.locator("a[data-seo-language=ar]").click();
    await page.waitForURL("**/ar/netflix-algerie");
    assert.equal((await readPage(page)).headings[0], labels.ar[1]);
    await page.locator("a[data-seo-language=fr]").click();
    await page.waitForURL("**/netflix-algerie");
    assert.equal((await readPage(page)).headings[0], labels.fr[1]);
    await page.locator("a[data-seo-language=en]").click();
    await page.waitForURL("**/en/netflix-algerie");
    await page.locator(".landing-add-product:visible").last().click();
    await page.locator("#header-cart-button").click();
    await page.waitForURL("**/en#cart");
    assert.equal(await page.locator("#cart-count").innerText(), "1");
    assert.equal((await readPage(page)).robots, "noindex,nofollow");
    await page.goBack();
    await page.waitForURL("**/en/netflix-algerie");
    assert.equal((await readPage(page)).title, "Netflix Premium in Algeria — Aura Stream");
    await page.goForward();
    await page.waitForURL("**/en#cart");
    await page.locator("#checkout-auth-gate [data-auth-panel-target=signin]").click();
    await page.waitForURL("**/en#login");
    await page.locator("#signin-form").waitFor();
    assert.equal(await page.locator("#cart-count").innerText(), "1");
    assert.equal((await readPage(page)).alternates.length, 0);
  } finally {
    await context.close();
  }
});

test("le HTML français reste français pour une nouvelle session anglophone", async () => {
  const context = await browser.newContext({ locale: "en-US" });
  await context.route("**/*", route => new URL(route.request().url()).origin === server.origin ? route.continue() : route.abort());
  try {
    const page = await context.newPage();
    await page.goto(server.origin + "/snapchat-plus-algerie");
    await page.waitForFunction(() => document.body.dataset.route === "landing-snapchat");
    const data = await readPage(page);
    assert.equal(data.lang, "fr");
    assert.equal(data.title, "Snapchat+ en Algérie — Aura Stream");
  } finally {
    await context.close();
  }
});
