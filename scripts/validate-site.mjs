import { readFile, readdir } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const [html, app, meta, vercel, robots, sitemap, distHtml, distCss] = await Promise.all([
  read("../index.html"),
  read("../src/canvas.js"),
  read("../src/meta.js"),
  read("../vercel.json"),
  read("../public/robots.txt"),
  read("../public/sitemap.xml"),
  read("../dist/index.html"),
  read("../dist/canvas.css"),
]);

const source = [html, app, meta, vercel, robots, sitemap].join("\n");
const mojibake = /Ã.|Â.|â€|ðŸ|ï¿½|\uFFFD/;
if (mojibake.test(source)) throw new Error("Texte mal encodé détecté");

for (const marker of [
  "submitPendingCredentials",
  "activation-credentials-form",
  "waiting_for_stock",
  "InitiateCheckout",
  "AddToCart",
  "marketing_consent_version",
  "META_CONSENT_VERSION",
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

if (!robots.includes("https://www.aura-stream.com/sitemap.xml")) {
  throw new Error("robots.txt ne référence pas le sitemap de production");
}
if (!sitemap.includes("https://www.aura-stream.com/")) {
  throw new Error("URL principale absente du sitemap");
}
if (!distHtml.includes('type="module" crossorigin src="/assets/')) {
  throw new Error("Bundle Vite absent de dist/index.html");
}
if (!distHtml.includes('href="/canvas.css"') || distCss.length < 10_000) {
  throw new Error("CSS Tailwind compilé absent ou incomplet");
}

const distAssets = await readdir(new URL("../dist/assets/", import.meta.url));
if (!distAssets.some((name) => name.endsWith(".js"))) throw new Error("Bundle JS absent");

console.log("Validation du build, du catalogue, de l’UTF-8, du SEO et des en-têtes réussie.");
