import { readFile, readdir } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const [html, app, meta, headers, vercel, robots, sitemap, distHtml] = await Promise.all([
  read("../index.html"),
  read("../src/main.jsx"),
  read("../src/meta.js"),
  read("../public/_headers"),
  read("../vercel.json"),
  read("../public/robots.txt"),
  read("../public/sitemap.xml"),
  read("../dist/index.html"),
]);

const source = [html, app, meta, headers, vercel, robots, sitemap].join("\n");
const mojibake = /Ã.|Â.|â€|ðŸ|ï¿½|\uFFFD/;
if (mojibake.test(source)) throw new Error("Texte mal encodé détecté");

for (const marker of [
  "payment_status === 'paid'",
  "function SuccessPage",
  "InitiateCheckout",
  "ViewContent",
  "trackMetaPurchase",
  "marketing_consent_version",
  "function MarketingConsent",
]) {
  if (!app.includes(marker)) throw new Error(`Marqueur applicatif absent: ${marker}`);
}

const homeSection = app.match(/\{page === 'home' && \([\s\S]*?\n\s*\)\}/)?.[0] || "";
const shopSection = app.match(/\{page === 'shop' && \([\s\S]*?\n\s*\)\}/)?.[0] || "";
if (homeSection.includes("<ProductsSection")) {
  throw new Error("La page d'accueil ne doit pas afficher les cartes produits");
}
if (!shopSection.includes("<ProductsSection")) {
  throw new Error("La page boutique doit conserver les cartes produits");
}
if (!app.includes("HeroSection onShopClick={() => handleNavigate('shop')}")) {
  throw new Error("Le CTA Hero ne navigue plus vers la boutique");
}

for (const forbidden of [
  "text/babel",
  "babel-standalone",
  "react.production.min.js",
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
if (!headers.includes("Content-Security-Policy") || !headers.includes("/assets/*")) {
  throw new Error("En-têtes Netlify de sécurité/cache incomplets");
}

const vercelConfig = JSON.parse(vercel);
const serializedVercel = JSON.stringify(vercelConfig);
if (
  !serializedVercel.includes("Content-Security-Policy") ||
  !serializedVercel.includes("max-age=31536000")
) {
  throw new Error("En-têtes Vercel de sécurité/cache incomplets");
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

const distAssets = await readdir(new URL("../dist/assets/", import.meta.url));
if (!distAssets.some((name) => name.endsWith(".js"))) throw new Error("Bundle JS absent");
if (!distAssets.some((name) => name.endsWith(".css"))) throw new Error("Bundle CSS absent");

console.log("Validation du build, de l’UTF-8, du SEO et des en-têtes réussie.");
