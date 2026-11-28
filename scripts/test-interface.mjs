import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium } from "playwright-core";
import { auditReference, orderReference, startInterfaceServer } from "./interface-fixture.mjs";

let browser, admin, guest;
before(async () => {
  // CHROME_PATH also supports running against an explicitly installed Chromium.
  browser = await chromium.launch(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : { channel: "chrome" });
  admin = await startInterfaceServer();
  guest = await startInterfaceServer({ authenticated: false });
});
after(async () => {
  await browser?.close();
  await Promise.all([admin?.close(), guest?.close()]);
});

const languages = {
  fr: {
    service: "Filtrer par service", status: "Filtrer par statut", order: "Statut de la commande",
    edit: "Modifier le compte", assign: "Attribution manuelle",
    required: "Renseigne ce champ.", email: "Saisis une adresse e-mail valide.",
    snapchatName: "Saisis un nom d’utilisateur Snapchat valide.",
    snapchatConfirmation: "Confirme l’ajout de @aura-stream.",
    applicationPending: "Candidature en cours d’examen",
  },
  en: {
    service: "Filter by service", status: "Filter by status", order: "Order status for",
    edit: "Edit account", assign: "Manual assignment",
    required: "Fill in this field.", email: "Enter a valid email address.",
    snapchatName: "Enter a valid Snapchat username.",
    snapchatConfirmation: "Confirm that you added @aura-stream.",
    applicationPending: "Application under review",
  },
  ar: {
    service: "التصفية حسب الخدمة", status: "التصفية حسب الحالة", order: "حالة الطلب",
    edit: "تعديل الحساب", assign: "تخصيص يدوي",
    required: "املأ هذا الحقل.", email: "أدخل بريدًا إلكترونيًا صالحًا.",
    snapchatName: "أدخل اسم مستخدم صالحًا على Snapchat.",
    snapchatConfirmation: "أكّد أنك أضفت \u2066@aura-stream\u2069.",
    applicationPending: "الطلب قيد المراجعة",
  },
};

async function focused(locator) {
  await locator.and(locator.page().locator(":focus")).waitFor({ state: "attached" });
}

async function open(page, origin, path = "/") {
  const url = origin + path;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(document.body.dataset.route));
}

async function hasIcons(page, view) {
  const icons = await page.locator(view).evaluate(async element => {
    await document.fonts.ready;
    return [...element.querySelectorAll("i:is(.fa-solid, .fa-regular, .fa-brands)")]
      .filter(icon => icon.getClientRects().length && getComputedStyle(icon).visibility === "visible")
      .map(icon => {
        const style = getComputedStyle(icon, "::before");
        return {
          classes: icon.className,
          loaded: style.content !== "none" && style.content !== "normal"
            && style.fontFamily.includes("Aura Stream Icons")
            && document.fonts.check(style.fontWeight + ' 16px ' + style.fontFamily, style.content.slice(1, -1))
            && icon.getBoundingClientRect().width > 0,
        };
      });
  });
  assert.ok(icons.length, "expected rendered icons in " + view);
  assert.deepEqual(icons.filter(icon => !icon.loaded), []);
}

async function contrastFor(locator, placeholder = false) {
  return locator.evaluate((element, isPlaceholder) => {
    const style = getComputedStyle(element, isPlaceholder ? "::placeholder" : null);
    const channels = color => color.match(/[\d.]+/g).map(Number);
    let background;
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      background = channels(getComputedStyle(ancestor).backgroundColor);
      if (background.length === 3) break;
    }
    const luminance = color => color.slice(0, 3)
      .map(value => value / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
      .reduce((total, value, i) => total + [0.2126, 0.7152, 0.0722][i] * value, 0);
    const values = [luminance(channels(style.color)), luminance(background)].sort((a, b) => b - a);
    return { ratio: (values[0] + 0.05) / (values[1] + 0.05), opacity: Number(style.opacity) };
  }, placeholder);
}

async function checkInvalidField(page, id, message) {
  const field = page.locator("#" + id);
  await focused(field);
  assert.equal(await field.getAttribute("aria-invalid"), "true");
  assert.ok((await field.getAttribute("aria-describedby")).split(" ").includes(id + "-error"));
  assert.equal(await page.locator("#" + id + "-error").textContent(), message);
}

async function checkBidirectionalText(page) {
  const order = await page.locator("#view-landing-snapchat").evaluate(view => {
    function position(fragment, first, second) {
      const container = [...view.querySelectorAll("h1, p, li, a")]
        .find(node => node.textContent.includes("\u2066" + fragment + "\u2069"));
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const offset = node.textContent.indexOf(fragment);
        if (offset < 0) continue;
        const x = index => {
          const range = document.createRange();
          range.setStart(node, offset + index);
          range.setEnd(node, offset + index + 1);
          return range.getBoundingClientRect().left;
        };
        return x(first) < x(second);
      }
      return false;
    }
    return [position("Snapchat+", 0, 8), position("@aura-stream", 0, 1)];
  });
  assert.deepEqual(order, [true, true]);
}

async function checkDialog(page, opener, id, title) {
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: title, exact: true });
  await dialog.waitFor();
  await hasIcons(page, "#" + id);
  const close = page.locator("#" + id + "-close");
  await focused(close);
  if (id === "admin-assignment-dialog") {
    await page.waitForFunction(() => !document.querySelector("#admin-assignment-order").disabled);
  }
  await page.keyboard.press("Tab");
  assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true);
  await page.keyboard.press("Shift+Tab");
  await focused(close);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await focused(opener);
}

for (const width of [320, 390, 1440]) {
  for (const [language, copy] of Object.entries(languages)) {
    test(width + " px / " + language + " — skip, forms, admin, RTL, icons and partner application", { timeout: 45000 }, async () => {
      const context = await browser.newContext({ viewport: { width, height: 900 }, locale: "fr-FR" });
      const errors = [];
      let application;
      await context.addInitScript(language => localStorage.setItem("aura_language", language), language);
      await context.route("**/*", route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === admin.origin) {
          if (url.pathname === "/api/partner/applications" && request.method() === "POST") {
            application = request.postDataJSON();
            return route.fulfill({ status: 201, json: {} });
          }
          if (url.pathname === "/api/partner" && application) {
            return route.fulfill({ json: { partner_status: "PENDING" } });
          }
        }
        if ([admin.origin, guest.origin].includes(url.origin)) return route.continue();
        return route.abort();
      });
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      page.on("pageerror", error => errors.push(error.message));
      try {
        for (const hash of ["#products", "#cart"]) {
          await open(page, admin.origin, "/" + hash);
          const decline = page.locator("#decline-marketing");
          if (await decline.isVisible()) await decline.click();
          // A fresh document keeps the skip link first in sequential navigation.
          await page.reload();
          await page.waitForFunction(() => Boolean(document.body.dataset.route));
          await page.keyboard.press("Tab");
          await focused(page.locator("#skip-to-content"));
          await page.keyboard.press("Enter");
          assert.equal(new URL(page.url()).hash, hash);
          await focused(page.locator("#main-content"));
          await page.keyboard.press("Tab");
          assert.equal(await page.locator("main").evaluate(main => main.contains(document.activeElement)), true);
        }

        await open(page, guest.origin, "/#login");
        const signInTab = page.locator('.auth-tab[data-auth="signin"]');
        const signUpTab = page.locator('.auth-tab[data-auth="signup"]');
        assert.equal(await signInTab.getAttribute("aria-pressed"), "true");
        await signUpTab.press("Enter");
        assert.equal(await signUpTab.getAttribute("aria-pressed"), "true");
        assert.equal(await signInTab.getAttribute("aria-pressed"), "false");
        assert.equal(await page.locator("#signup-form").isVisible(), true);
        await signInTab.press("Enter");
        await page.locator("#signin-email").focus();
        await page.keyboard.press("Tab");
        const password = page.locator("#signin-password");
        await focused(password);
        assert.equal(await password.evaluate(element => getComputedStyle(element).outlineStyle), "solid");
        for (const name of ["signin-email", "signin-password"]) {
          const color = await contrastFor(page.locator("#" + name), true);
          assert.equal(color.opacity, 1);
          assert.ok(color.ratio >= 4.5, name + " contrast " + color.ratio);
        }
        const submit = page.locator("#signin-form [type=submit]");
        await submit.press("Enter");
        await checkInvalidField(page, "signin-email", copy.required);
        await page.locator("#signin-email").fill("incorrect");
        await checkInvalidField(page, "signin-email", copy.email);
        await page.locator("#signin-email").fill("client@example.test");
        assert.equal(await page.locator("#signin-email-error").count(), 0);

        await open(page, admin.origin, "/");
        assert.ok((await contrastFor(page.locator(".support-strip-link"))).ratio >= 4.5);
        assert.equal(await page.locator('.nav-link[aria-current="page"]').count(), 1);
        await open(page, admin.origin, "/#products");
        await hasIcons(page, "#view-products");
        assert.ok((await contrastFor(page.locator("#view-products p.text-aura").first())).ratio >= 4.5);
        const snapchat = language === "ar" ? "\u2066Snapchat+\u2069" : "Snapchat+";
        assert.equal((await page.locator(".filter-btn[data-filter=snapchat]").textContent()).trim(), snapchat);
        await page.locator('.product-card[data-service=netflix] .add-product').click();
        await page.locator('.product-card[data-service=snapchat] .add-product').first().click();
        await page.locator("#header-cart-button").click();
        const steps = page.locator(".checkout-step");
        assert.equal(await page.locator('.checkout-step[aria-current="step"]').getAttribute("data-step-indicator"), "1");
        for (const step of await steps.all()) {
          assert.ok((await contrastFor(step.locator("p"))).ratio >= 4.5);
        }
        const phone = page.locator("#customer-whatsapp");
        await phone.waitFor();
        assert.deepEqual(await phone.inputValue(), "+213555010100");
        for (const selector of ["#customer-first-name", "#customer-last-name", "#customer-email", "#customer-whatsapp", "#snapchat-username", "#promo-code"]) {
          const color = await contrastFor(page.locator(selector), true);
          assert.equal(color.opacity, 1);
          assert.ok(color.ratio >= 4.5, selector + " contrast " + color.ratio);
        }
        await hasIcons(page, "#view-cart");
        await page.locator("#customer-first-name").fill("");
        await page.locator("#to-payment").press("Enter");
        await checkInvalidField(page, "customer-first-name", copy.required);
        await page.locator("#customer-first-name").fill("Camille");
        assert.ok((await page.locator("#checkout-items h3").allTextContents()).includes(snapchat));
        await page.locator("#snapchat-username").fill("1invalide");
        await page.locator("#to-payment").press("Enter");
        await checkInvalidField(page, "snapchat-username", copy.snapchatName);
        await page.locator("#snapchat-username").fill("aura.ui_test");
        await page.locator("#to-payment").press("Enter");
        await checkInvalidField(page, "snapchat-friend-added", copy.snapchatConfirmation);
        await page.locator("#snapchat-friend-added").check();
        await page.locator("#to-payment").press("Enter");
        await page.locator("#checkout-payment").waitFor();
        assert.equal(await page.locator("#checkout-payment").isVisible(), true);
        assert.equal(await page.locator('.checkout-step[aria-current="step"]').getAttribute("data-step-indicator"), "2");

        await open(page, admin.origin, "/#admin");
        const overview = page.locator("#admin-overview-tab");
        const orders = page.locator("#admin-orders-tab");
        await overview.waitFor();
        await overview.focus();
        await page.keyboard.press(language === "ar" ? "ArrowLeft" : "ArrowRight");
        await focused(orders);
        assert.equal(await overview.getAttribute("aria-selected"), "true");
        assert.equal(await orders.evaluate(element => getComputedStyle(element).outlineStyle), "solid");
        await page.keyboard.press("Enter");
        assert.equal(await orders.getAttribute("aria-selected"), "true");
        await page.keyboard.press("Tab");
        await focused(page.locator("#admin-orders-panel"));
        await page.keyboard.press("Shift+Tab");
        await focused(orders);

        const serviceFilter = page.getByRole("combobox", { name: copy.service, exact: true });
        const statusFilter = page.getByRole("combobox", { name: copy.status, exact: true });
        await serviceFilter.waitFor();
        await statusFilter.waitFor();
        assert.equal(await serviceFilter.locator('option[value=Snapchat]').textContent(), snapchat);
        const row = page.getByRole("combobox", { name: copy.order + " " + orderReference, exact: true });
        await row.waitFor();
        assert.equal(await row.inputValue(), "active");
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
        await serviceFilter.focus();
        await page.keyboard.press("Space");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");
        assert.equal(await serviceFilter.inputValue(), "Netflix");
        await statusFilter.focus();
        await page.keyboard.press("Space");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");
        assert.equal(await statusFilter.inputValue(), "pending");
        const filteredOrders = page.waitForResponse(response => {
          const url = new URL(response.url());
          return url.pathname === "/api/admin/all-orders" && url.searchParams.get("service") === "Netflix"
            && url.searchParams.get("status") === "pending";
        });
        await page.locator("#admin-order-filters [type=submit]").click();
        assert.ok((await filteredOrders).ok());
        await hasIcons(page, "#admin-orders-panel");

        await orders.focus();
        await page.keyboard.press("End");
        await focused(page.locator("#admin-partner-tab"));
        await page.keyboard.press("Home");
        await focused(overview);
        const railFits = await page.locator("#admin-tabs [role=tablist]").evaluate(rail =>
          rail.scrollWidth === rail.clientWidth && [...rail.querySelectorAll('[role="tab"]:not(.hidden)')]
            .every(tab => {
              const rectangle = tab.getBoundingClientRect();
              return rectangle.left >= 0 && rectangle.right <= document.documentElement.clientWidth
                && rectangle.height >= 44;
            }));
        assert.equal(railFits, true);

        await page.locator("#admin-stock-tab").click();
        await page.locator(".admin-toggle-stock-profiles").click();
        await hasIcons(page, "#admin-stock-panel");
        const editStock = page.locator(".admin-edit-stock");
        const assignStock = page.locator(".admin-manual-assign-stock");
        await checkDialog(page, editStock, "admin-stock-dialog", copy.edit);
        await checkDialog(page, assignStock, "admin-assignment-dialog", copy.assign);
        await editStock.press("Enter");
        await page.locator("#admin-stock-dialog[open]").waitFor();
        const nextButtonKeptFocus = await assignStock.evaluate(next => new Promise(resolve => {
          const dialog = document.getElementById("admin-stock-dialog");
          dialog.addEventListener("close", () => resolve(document.activeElement === next), { once: true });
          dialog.close();
          next.focus();
        }));
        assert.equal(nextButtonKeptFocus, true, "closing a dialog must preserve subsequent focus movement");

        const auditResponse = page.waitForResponse(response =>
          new URL(response.url()).pathname === "/api/admin/audit-logs");
        await page.locator("#admin-activity-tab").click();
        assert.ok((await auditResponse).ok());
        const target = page.locator("#admin-audit-list bdi");
        await target.waitFor();
        await hasIcons(page, "#admin-activity-panel");
        assert.equal(await target.textContent(), auditReference);
        const layout = await page.evaluate(async () => {
          await document.fonts.ready;
          const element = document.querySelector("#admin-audit-list bdi");
          const range = document.createRange();
          range.selectNodeContents(element);
          const rects = [...range.getClientRects()];
          const viewWidth = document.documentElement.clientWidth;
          return {
            lines: new Set(rects.map(rect => Math.round(rect.top))).size,
            inside: rects.every(rect => rect.left >= 0 && rect.right <= viewWidth),
            over: document.documentElement.scrollWidth - viewWidth,
            width: element.getBoundingClientRect().width,
            wrap: getComputedStyle(element).overflowWrap,
          };
        });
        assert.equal(layout.over, 0);
        assert.equal(layout.inside, true, JSON.stringify(layout));
        if (width <= 390) assert.ok(layout.lines > 1, JSON.stringify(layout));

        if (width < 1024) {
          const menuButton = page.locator("#mobile-menu-toggle");
          await menuButton.focus();
          await page.keyboard.press("Enter");
          assert.equal(await menuButton.getAttribute("aria-expanded"), "true");
          await page.keyboard.press("Tab");
          await focused(page.locator('[aria-controls="mobile-language-options"]'));
          await page.keyboard.press("Escape");
          assert.equal(await menuButton.getAttribute("aria-expanded"), "false");
          await focused(menuButton);
        }

        await open(page, admin.origin, "/snapchat-plus-algerie");
        if (language === "ar") await checkBidirectionalText(page);
        await open(page, admin.origin, "/#partner");
        const partnerFields = page.locator("#partner-application-form select");
        await partnerFields.first().waitFor();
        assert.equal(await partnerFields.count(), 3);
        assert.equal(await partnerFields.evaluateAll(fields => fields.every(field =>
          field.labels.length && Math.round(field.getBoundingClientRect().height) >= 44)), true);

        const formMenu = width < 1024 ? "mobile" : "desktop";
        if (formMenu === "mobile") await page.locator("#mobile-menu-toggle").click();
        const languageButton = page.locator('[aria-controls="' + formMenu + '-language-options"]');
        const visibleLanguage = (await languageButton.locator("[data-language-current]").textContent()).trim();
        const languageLabel = await languageButton.getAttribute("aria-label");
        assert.ok(languageLabel.startsWith(visibleLanguage + " " + language.toUpperCase()));
        await languageButton.press("Enter");
        const options = page.locator("#" + formMenu + "-language-options [role=option]");
        await options.first().waitFor();
        await page.keyboard.press("End");
        await focused(options.last());
        assert.equal(await options.last().evaluate(element => getComputedStyle(element).outlineStyle), "solid");
        await page.keyboard.press("Escape");
        await focused(languageButton);
        await languageButton.press("Enter");
        const otherLanguage = { fr: "en", en: "ar", ar: "fr" }[language];
        await page.locator("#" + formMenu + '-language-options [data-language-option="' + otherLanguage + '"]').press("Enter");
        assert.equal(await page.locator("html").getAttribute("lang"), otherLanguage);
        assert.equal(await partnerFields.count(), 3);
        if (formMenu === "mobile" && await page.locator("#mobile-menu-toggle").getAttribute("aria-expanded") === "true") {
          await page.locator("#mobile-menu-toggle").click();
        }
        const partnerForm = page.locator("#partner-application-form");
        const answers = {
          monthly_volume: "5000_15000", sales_channel: "WEB", profile: "INDEPENDENT",
          products: "Netflix et Snapchat+", quick_contact: "@aura_ui_test", additional_info: "Candidature fictive",
        };
        for (const [name, value] of Object.entries(answers)) {
          const field = partnerForm.locator(`[name="${name}"]`);
          if (await field.evaluate(element => element.tagName === "SELECT")) await field.selectOption(value);
          else await field.fill(value);
        }
        await partnerForm.locator('[type="submit"]').click();
        await page.getByRole("heading", { name: languages[otherLanguage].applicationPending, exact: true }).waitFor();
        assert.deepEqual(application, answers);
        assert.equal(await partnerForm.count(), 0);
        assert.deepEqual(errors, []);
      } finally {
        await context.close();
      }
    });
  }
}

test("browser scenarios stop before sign-in or payment requests", () => {
  assert.equal(guest.apiRequests.some(request => request.pathname === "/api/login"), false);
  assert.equal(admin.apiRequests.some(request => /\/(?:create-order|create-invoice|wallet\/purchase|assign)$/.test(request.pathname)), false);
});
