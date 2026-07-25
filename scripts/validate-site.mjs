import { readFile } from "node:fs/promises";

const [html, headers, robots, sitemap] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../_headers", import.meta.url), "utf8"),
  readFile(new URL("../robots.txt", import.meta.url), "utf8"),
  readFile(new URL("../sitemap.xml", import.meta.url), "utf8"),
]);

const requiredHtml = [
  "payment_status === 'paid'",
  "function SuccessPage",
  "InitiateCheckout",
  "ViewContent",
  "purchase_${orderId}",
  "application/ld+json",
  "rel=\"canonical\"",
];

for (const marker of requiredHtml) {
  if (!html.includes(marker)) throw new Error(`Marqueur obligatoire absent: ${marker}`);
}

const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
if (!jsonLdMatch) throw new Error("JSON-LD absent");
JSON.parse(jsonLdMatch[1]);

if (!headers.includes("Content-Security-Policy") || !headers.includes("connect.facebook.net")) {
  throw new Error("En-têtes de sécurité ou autorisation Meta absents");
}
if (!robots.includes("Sitemap:")) throw new Error("robots.txt ne référence pas le sitemap");
if (!sitemap.includes("https://aura-stream.netlify.app/")) throw new Error("URL principale absente du sitemap");

console.log("Validation statique du site réussie.");
