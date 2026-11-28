import { readFile, readdir } from "node:fs/promises";
import { parse } from "parse5";
import { contentRoutes, localizedPath, productSchema, seoAlternates, seoRoutes, siteLanguages, siteOrigin } from "../src/catalog.js";
import { translateForLanguage } from "../src/i18n.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const [html, app, styles, session, catalog, vercel, robots, sitemap, distHtml, distCss] = await Promise.all([
  read("../index.html"),
  read("../src/canvas.js"),
  read("../src/canvas.css"),
  read("../src/session.js"),
  read("../src/catalog.js"),
  read("../vercel.json"),
  read("../public/robots.txt"),
  read("../dist/sitemap.xml"),
  read("../dist/index.html"),
  read("../dist/canvas.css"),
]);

const source = [html, app, styles, session, catalog, vercel, robots, sitemap].join("\n");
if (/connect\.facebook\.net|graph\.facebook\.com|facebook\.com\/tr\b/i.test(source)) {
  throw new Error("Transport marketing tiers réintroduit");
}
const indexedPages = [
  ...Object.values(seoRoutes).flatMap(page => siteLanguages.map(language => ({ page, language, alternate: true }))),
  ...Object.values(contentRoutes).map(page => ({ page, language: "fr", alternate: false })),
];
const productSection = html.match(/<section id="view-products"[\s\S]*?<\/section>/)?.[0] || "";
if (!productSection.includes('data-service="snapchat"')) throw new Error("Snapchat doit être dans la boutique");
const mojibake = /Ã.|Â.|â€|ðŸ|ï¿½|\uFFFD/;
if (mojibake.test(source)) throw new Error("Texte mal encodé détecté");

for (const marker of [
  "activation-credentials-form",
  "waiting_for_stock",
  "mobile-cart-bar",
  "landing-netflix",
  "landing-spotify",
  "landing-crunchyroll",
  "forgot-password-form",
  "reset-password-form",
  '<select id="admin-order-service"',
  '<select id="admin-order-status"',
  "warmApiConnection",
  "refreshAuthSession",
  "aura_refresh_token",
  "capturedRecoveryToken",
  'apiRequest("/logout"',
  'src="/netflix.svg"',
  'src="/spotify.svg"',
  'src="/crunchyroll.svg"',
  'src="/aura-logo-mark.png"',
  "session-signout",
  "revenue-chart-inner",
  "grid min-w-0 gap-6",
  "admin-revenue-start",
  "admin-revenue-end",
  "admin-revenue-export",
  'showRoute("home", undefined, { replace: true })',
  "home-tracking-example-button",
  "order-tracking-example",
  "tracking-step-line",
  "left-[12.5%] right-[12.5%] top-4 z-0",
  "tracking-step relative text-center",
  "tracking-step-marker",
  "box-shadow: 0 0 0 4px #fff",
  "tracking-example-highlight",
  'data-view="legal"',
  'path: "/legal"',
  "document.body.dataset.route",
  'event.target.closest(".route-link")',
  'document.getElementById("signup-phone")',
  'value="+213 "',
  'pattern="[+]213 [5-7]( [0-9]{2}){4}"',
  "formatAlgerianPhoneInput",
  "normalizeAlgerianPhone",
  "currentUser?.user_metadata?.phone",
  "grid cursor-pointer grid-cols-[auto_auto_minmax(0,1fr)]",
  '.admin-tab:focus-visible',
  '.faq-category[aria-pressed="true"]',
  'body[data-route="admin"] .whatsapp-float',
  "pendingPaymentAttempt",
  "spotify-account-email",
  "spotify-account-password",
  "crunchyroll-account-email",
  "crunchyroll-account-password",
  "activation_credentials",
  "checkoutPayloadFingerprint",
  "clearCheckoutCredentialPasswords",
  "setCheckoutCredentialRequirement",
  "const attempt = saveCheckoutProfile",
  "Array.isArray(order.accounts)",
  'id="netflix-connection-guide"',
  "open-netflix-guide",
  "openNetflixConnectionGuide",
  'data-duration="2 mois" data-price="1100"',
  "orderItemPresentation",
  "prioritizeOrder",
  "Service commandé",
  "Cette commande",
  "RENEWAL_OFFER_STORAGE_KEY",
  "Renouveler avec la remise fidélité",
  "Remise fidélité appliquée automatiquement.",
  'id="discount-label"',
]) {
  if (!source.includes(marker)) throw new Error(`Marqueur applicatif absent: ${marker}`);
}

for (const offer of [
  '"Snapchat|3 mois": 2000',
  '"Snapchat|6 mois": 2500',
  '"Netflix|1 mois": 600',
  '"Netflix|2 mois": 1100',
  '"Spotify|1 mois": 800',
  '"Spotify|1 an": 4000',
  '"Crunchyroll|1 mois": 500',
  '"Crunchyroll|1 an": 3000',
]) {
  if (!app.includes(offer)) throw new Error(`Offre officielle absente: ${offer}`);
}
for (const card of html.matchAll(/<article[^>]+data-service="(netflix|spotify|crunchyroll)"[\s\S]*?<\/article>/g)) {
  if (/data-duration="(3 mois|6 mois)"/.test(card[0])) throw new Error("Ancienne durée réintroduite pour " + card[1]);
}
for (const marker of ['id="snapchat-username"', 'id="snapchat-friend-added"', 'data-price="2000" data-duration="3 mois"', 'data-price="2500" data-duration="6 mois"', "https://www.snapchat.com/add/aura-stream"]) {
  if (!html.includes(marker)) throw new Error("Snapchat incomplet : " + marker);
}

for (const forbidden of [
  "tailwindcss.com",
  "data:image/png;base64",
  "text/babel",
  "babel-standalone",
  "unsafe-eval",
  "aura-stream.netlify.app",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "aura_pending_credentials_",
  "upload.wikimedia.org",
  "commons.wikimedia.org",
  "/aura-logo-dark.png",
  "window.location.replace(window.location.origin + window.location.pathname)",
  'data-route="order">Voir un exemple de suivi',
  'href="#"',
  'currentUser?.phone || ""',
  "Après confirmation du paiement, tu transmettras tes informations depuis « Mes commandes ».",
  "Tu renseignes ton compte Spotify après le paiement.",
  "order-demo-content",
  "Activation Spotify en cours — confirmation sur WhatsApp.",
]) {
  if (source.includes(forbidden)) throw new Error(`Ancien marqueur interdit présent: ${forbidden}`);
}

const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
if (!jsonLdMatch) throw new Error("JSON-LD absent");
JSON.parse(jsonLdMatch[1]);

if (!html.includes('href="https://www.aura-stream.com/"')) {
  throw new Error("URL canonique de production absente");
}

const vercelConfig = JSON.parse(vercel);
const serializedVercel = JSON.stringify(vercelConfig);
for (const header of ["Content-Security-Policy", "X-Frame-Options", "max-age=31536000"]) {
  if (!serializedVercel.includes(header)) throw new Error(`En-tête Vercel absent: ${header}`);
}
if (serializedVercel.includes("unsafe-inline") || serializedVercel.includes("unsafe-eval")) {
  throw new Error("La CSP Vercel autorise encore du JavaScript ou CSS inline");
}
if (!serializedVercel.includes("https://aura-giftcards-api.onrender.com/api/:path*")) {
  throw new Error("Le proxy API Vercel est absent");
}
if (!app.includes('const API_BASE = "/api"')) {
  throw new Error("Le frontend ne passe pas par le proxy API de même origine");
}
for (const forbidden of ["authToken", "loadAuthSession", "saveAuthSession"]) {
  if (app.includes(forbidden)) throw new Error(`Ancienne session navigateur encore présente: ${forbidden}`);
}

if (!robots.includes("https://www.aura-stream.com/sitemap.xml")) {
  throw new Error("robots.txt ne référence pas le sitemap de production");
}
if (!sitemap.includes("https://www.aura-stream.com/")) {
  throw new Error("URL principale absente du sitemap");
}
if (/serveur se r[eé]veille/i.test(source)) {
  throw new Error("Un message trompeur de réveil serveur est encore présent");
}
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
function* nodes(node) {
  yield node;
  for (const child of node.childNodes || []) yield* nodes(child);
}
const advertisedUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, href]) => href);
const canonicalUrls = indexedPages.map(({ page, language }) => siteOrigin + localizedPath(page.path, language));
if (JSON.stringify(advertisedUrls) !== JSON.stringify(canonicalUrls)) throw new Error("Le sitemap diffère des URL canoniques générées");

for (const { page, language, alternate } of indexedPages) {
  const path = localizedPath(page.path, language);
  const canonical = siteOrigin + path;
  const tree = [...nodes(parse(await read(`../dist${path === "/" ? "" : path}/index.html`)))];
  const find = (tag, key, val) => tree.find(node => node.tagName === tag && (key === undefined || attr(node, key) === val));
  const localize = value => translateForLanguage(language, value);
  const rootNode = find("html");
  if (attr(rootNode, "lang") !== language || attr(rootNode, "dir") !== (language === "ar" ? "rtl" : "ltr")) {
    throw new Error(`Langue HTML incorrecte pour ${path}`);
  }
  if (attr(find("link", "rel", "canonical"), "href") !== canonical
    || attr(find("meta", "property", "og:url"), "content") !== canonical
    || find("title").childNodes[0].value !== localize(page.title)
    || attr(find("meta", "name", "description"), "content") !== localize(page.description)
    || attr(find("meta", "name", "robots"), "content") !== "index,follow") {
    throw new Error(`Métadonnées de référencement incohérentes pour ${path}`);
  }
  const hreflang = tree.filter(node => node.tagName === "link" && attr(node, "hreflang"))
    .map(node => [attr(node, "hreflang"), attr(node, "href")]);
  if (JSON.stringify(hreflang) !== JSON.stringify(alternate ? seoAlternates(page.path) : [])) {
    throw new Error(`Alternatives linguistiques incohérentes pour ${path}`);
  }
  if (page.product) {
    const schema = find("script", "data-page-schema", "");
    if (!schema || JSON.stringify(JSON.parse(schema.childNodes[0].value)) !== JSON.stringify(productSchema(page, canonical, { translate: localize }))) {
      throw new Error(`Données structurées incohérentes pour ${path}`);
    }
  }
}
for (const destination of [
  "/snapchat-plus-algerie/index.html",
  "/netflix-algerie/index.html",
  "/spotify-family-algerie/index.html",
  "/crunchyroll-mega-fan-algerie/index.html",
  "/legal/index.html",
]) {
  if (!serializedVercel.includes(destination)) throw new Error(`Destination SEO absente: ${destination}`);
}
if (!/<script\b[^>]*type="module"[^>]*src="\/assets\//.test(distHtml)) {
  throw new Error("Bundle Vite absent de dist/index.html");
}
if (!distHtml.includes('href="/canvas.css"') || distCss.length < 10_000) {
  throw new Error("CSS Tailwind compilé absent ou incomplet");
}
if (!distCss.includes(".revenue-chart-scroll") || !distCss.includes(".revenue-chart-inner")) {
  throw new Error("Styles du graphique administrateur absents");
}

const distAssets = await readdir(new URL("../dist/assets/", import.meta.url));
if (!distAssets.some((name) => name.endsWith(".js"))) throw new Error("Bundle JS absent");

console.log("Validation du build, du catalogue, de l’UTF-8, du SEO et des en-têtes réussie.");
