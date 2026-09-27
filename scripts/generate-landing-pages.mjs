import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = await readFile(resolve(root, "dist/index.html"), "utf8");
const baseUrl = "https://www.aura-stream.com";

const pages = [
  {
    slug: "netflix-algerie",
    view: "landing-netflix",
    title: "Netflix Premium en Algérie — Aura Stream",
    description: "Accès à un profil Netflix Premium avec livraison automatique après confirmation du paiement.",
    product: { name: "Netflix Premium", price: 600 },
  },
  {
    slug: "spotify-family-algerie",
    view: "landing-spotify",
    title: "Spotify Family en Algérie — Aura Stream",
    description: "Spotify Family activé sur ton propre compte avec accompagnement humain en Algérie.",
    product: { name: "Spotify Family", price: 800 },
  },
  {
    slug: "crunchyroll-mega-fan-algerie",
    view: "landing-crunchyroll",
    title: "Crunchyroll Mega Fan en Algérie — Aura Stream",
    description: "Crunchyroll Mega Fan activé sur ton compte avec suivi et support en Algérie.",
    product: { name: "Crunchyroll Mega Fan", price: 500 },
  },
  {
    slug: "legal",
    view: "legal",
    title: "Conditions, confidentialité et remboursements — Aura Stream",
    description: "Consulte les conditions de vente, la politique de confidentialité et les règles de remboursement d’Aura Stream.",
  },
];

function setMeta(html, selector, value) {
  const escaped = value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  const pattern = new RegExp(`(<meta ${selector} content=")[^"]*(">)`);
  return html.replace(pattern, `$1${escaped}$2`);
}

for (const page of pages) {
  const url = `${baseUrl}/${page.slug}`;
  let html = source
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${page.title}</title>`)
    .replace(/<link rel="canonical" href="[^"]+">/, `<link rel="canonical" href="${url}">`)
    .replace('<section id="view-home" class="page-view"', '<section id="view-home" class="page-view hidden"');

  html = setMeta(html, 'name="description"', page.description);
  html = setMeta(html, 'property="og:title"', page.title);
  html = setMeta(html, 'property="og:description"', page.description);
  html = setMeta(html, 'property="og:type"', page.product ? "product" : "website");
  html = setMeta(html, 'property="og:url"', url);
  html = setMeta(html, 'name="twitter:title"', page.title);
  html = setMeta(html, 'name="twitter:description"', page.description);
  html = html.replace(
    new RegExp(`(<section id="view-${page.view}" class="[^"]*)\\bhidden\\s*`),
    "$1",
  );

  if (page.product) {
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: page.product.name,
      url,
      brand: { "@type": "Brand", name: page.product.name.split(" ")[0] },
      offers: {
        "@type": "Offer",
        priceCurrency: "DZD",
        price: page.product.price,
        availability: "https://schema.org/InStock",
        url,
        seller: { "@type": "Organization", name: "Aura Stream" },
      },
    };
    html = html.replace("</head>", `  <script type="application/ld+json" data-page-schema>${JSON.stringify(jsonLd)}</script>\n</head>`);
  }

  const directory = resolve(root, "dist", page.slug);
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, "index.html"), html, "utf8");
}

console.log(`Generated ${pages.length} crawlable landing pages.`);
