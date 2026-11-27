import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentRoutes, landingRoutes, productSchema } from "../src/catalog.js";

const root = resolve(import.meta.dirname, "..");
const source = await readFile(resolve(root, "dist/index.html"), "utf8");
const baseUrl = "https://www.aura-stream.com";

const pages = Object.entries({ ...landingRoutes, ...contentRoutes });

function setMeta(html, selector, value) {
  const escaped = value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  const pattern = new RegExp(`(<meta ${selector} content=")[^"]*(">)`);
  return html.replace(pattern, `$1${escaped}$2`);
}

for (const [view, page] of pages) {
  const url = baseUrl + page.path;
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
    new RegExp(`(<section id="view-${view}" class="[^"]*)\\bhidden\\s*`),
    "$1",
  );

  if (page.product) {
    const buttons = [...source.matchAll(/<button\b[^>]*class="[^"]*\blanding-add-product\b[^"]*"[^>]*>/g)]
      .map(([tag]) => Object.fromEntries([...tag.matchAll(/data-(service|product|duration|price)="([^"]*)"/g)]
        .map(([, key, value]) => [key, value])))
      .filter(button => button.service === page.service && button.product === page.product);
    if (buttons.length !== page.offers.length || page.offers.some(([duration, price]) =>
      !buttons.some(button => button.duration === duration && Number(button.price) === price)
    )) throw new Error(`Landing page offers do not match the catalogue for ${page.service}.`);
    const jsonLd = productSchema(page, url);
    html = html.replace("</head>", `  <script type="application/ld+json" data-page-schema>${JSON.stringify(jsonLd)}</script>\n</head>`);
  }

  const directory = resolve(root, "dist", page.path.slice(1));
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, "index.html"), html, "utf8");
}

console.log(`Generated ${pages.length} crawlable landing pages.`);
