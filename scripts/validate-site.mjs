import { readFile, readdir } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const [html, app, meta, session, vercel, robots, sitemap, distHtml, distCss] = await Promise.all([
  read("../index.html"),
  read("../src/canvas.js"),
  read("../src/meta.js"),
  read("../src/session.js"),
  read("../vercel.json"),
  read("../public/robots.txt"),
  read("../public/sitemap.xml"),
  read("../dist/index.html"),
  read("../dist/canvas.css"),
]);

const source = [html, app, meta, session, vercel, robots, sitemap].join("\n");
const mojibake = /Ã.|Â.|â€|ðŸ|ï¿½|\uFFFD/;
if (mojibake.test(source)) throw new Error("Texte mal encodé détecté");

for (const marker of [
  "activation-credentials-form",
  "waiting_for_stock",
  "InitiateCheckout",
  "AddToCart",
  "ViewContent",
  "mobile-cart-bar",
  "landing-netflix",
  "landing-spotify",
  "landing-crunchyroll",
  "aura_marketing_attribution",
  "marketing_consent_version",
  "META_CONSENT_VERSION",
  "forgot-password-form",
  "reset-password-form",
  "data-custom-select",
  "warmApiConnection",
  "refreshAuthSession",
  "aura_refresh_token",
  "capturedRecoveryToken",
  'apiRequest("/logout"',
  'src="/netflix.svg"',
  'src="/spotify.svg"',
  'src="/crunchyroll.svg"',
  'src="/aura-logo-dark.png"',
  "session-signout",
  "revenue-chart-inner",
  "grid min-w-0 gap-6",
]) {
  if (!source.includes(marker)) throw new Error(`Marqueur applicatif absent: ${marker}`);
}

for (const offer of [
  '"Spotify|1 mois": 500',
  '"Spotify|1 an": 4000',
  '"Crunchyroll|1 mois": 500',
  '"Crunchyroll|1 an": 3000',
]) {
  if (!app.includes(offer)) throw new Error(`Offre officielle absente: ${offer}`);
}
if (/\b(3 mois|6 mois)\b/i.test(html)) {
  throw new Error("Une ancienne durée de 3 ou 6 mois est encore visible");
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
for (const forbidden of ["authToken", "loadAuthSession", "saveAuthSession", 'credentials: "omit"']) {
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
for (const landingUrl of [
  "https://www.aura-stream.com/netflix-algerie",
  "https://www.aura-stream.com/spotify-family-algerie",
  "https://www.aura-stream.com/crunchyroll-mega-fan-algerie",
]) {
  if (!sitemap.includes(landingUrl) || !serializedVercel.includes(new URL(landingUrl).pathname)) {
    throw new Error(`Landing page absente du sitemap ou des rewrites: ${landingUrl}`);
  }
}
if (!distHtml.includes('type="module" crossorigin src="/assets/')) {
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
