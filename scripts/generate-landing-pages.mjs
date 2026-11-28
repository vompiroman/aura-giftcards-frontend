import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defaultTreeAdapter as dom, parse, serialize } from "parse5";
import { contentRoutes, localizedPath, productSchema, seoAlternates, seoRoutes, siteLanguages, siteOrigin } from "../src/catalog.js";
import { TRANSLATED_ATTRIBUTES, translateForLanguage } from "../src/i18n.js";

const dist = resolve(import.meta.dirname, "../dist");
const source = await readFile(resolve(dist, "index.html"), "utf8");
const pages = [
  ...Object.entries(seoRoutes).flatMap(([view, page]) => siteLanguages.map(language => ({ view, page, language, hasAlternates: true }))),
  ...Object.entries(contentRoutes).map(([view, page]) => ({ view, page, language: "fr", hasAlternates: false })),
];

const get = (node, name) => node.attrs?.find(attr => attr.name === name)?.value;
function set(node, name, value) {
  const attr = node.attrs.find(attr => attr.name === name);
  if (attr) attr.value = value;
  else node.attrs.push({ name, value });
}
function find(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node.childNodes || []) {
    const match = find(child, predicate);
    if (match) return match;
  }
}
function add(parent, tag, attrs, text) {
  const node = dom.createElement(tag, "http://www.w3.org/1999/xhtml", Object.entries(attrs).map(([name, value]) => ({ name, value })));
  if (text) dom.insertText(node, text);
  dom.appendChild(parent, node);
}
function walk(node, visit) {
  if (visit(node) === false) return;
  for (const child of node.childNodes || []) walk(child, visit);
}

function localizeVisibleText(body, view, language) {
  if (language === "fr") return;
  const translate = value => translateForLanguage(language, value);
  walk(body, element => {
    if (["script", "style", "dialog", "noscript", "svg"].includes(element.tagName)
      || get(element, "data-i18n-ignore") !== undefined) return false;
    const section = get(element, "data-view");
    if (section && section !== view) return false;
    if (!element.attrs) return;
    const text = [];
    (element.childNodes || []).forEach((child, index) => {
      if (child.nodeName !== "#text" || !child.value.trim()) return;
      const original = child.value;
      const localized = translate(original);
      if (localized === original.trim().replace(/\s+/g, " ")) return;
      text.push([index, original]);
      child.value = original.match(/^\s*/)[0] + localized + original.match(/\s*$/)[0];
    });
    const attributes = [];
    for (const name of TRANSLATED_ATTRIBUTES) {
      const original = get(element, name);
      if (original === undefined) continue;
      const localized = translate(original);
      if (localized === original) continue;
      attributes.push([name, original]);
      set(element, name, localized);
    }
    if (text.length || attributes.length) set(element, "data-i18n-original", JSON.stringify({ text, attributes }));
  });
}

for (const { view, page, language, hasAlternates } of pages) {
  const path = localizedPath(page.path, language);
  const url = siteOrigin + path;
  const translate = value => translateForLanguage(language, value);
  const document = parse(source);
  const html = find(document, n => n.tagName === "html");
  const head = find(html, n => n.tagName === "head");
  const body = find(html, n => n.tagName === "body");
  set(html, "lang", language);
  set(html, "dir", language === "ar" ? "rtl" : "ltr");
  set(html, "data-seo-document", "");
  const title = find(head, n => n.tagName === "title");
  title.childNodes[0].value = translate(page.title);
  set(find(head, n => get(n, "rel") === "canonical"), "href", url);

  for (const [type, key, content] of [
    ["name", "description", translate(page.description)],
    ["property", "og:title", translate(page.title)],
    ["property", "og:description", translate(page.description)],
    ["property", "og:type", page.product ? "product" : "website"],
    ["property", "og:url", url],
    ["property", "og:locale", { fr: "fr_DZ", en: "en_DZ", ar: "ar_DZ" }[language]],
    ["name", "twitter:title", translate(page.title)],
    ["name", "twitter:description", translate(page.description)],
  ]) {
    const tag = find(head, n => get(n, type) === key);
    if (tag) set(tag, "content", content);
    else add(head, "meta", { [type]: key, content });
  }

  if (hasAlternates) {
    for (const [hreflang, href] of seoAlternates(page.path)) {
      add(head, "link", { rel: "alternate", hreflang, href, "data-seo-alternate": "" });
    }
  }

  const buttons = [];
  walk(body, node => {
    const viewName = get(node, "data-view");
    if (viewName) {
      const classes = get(node, "class").split(/\s+/).filter(x => x !== "hidden");
      if (viewName !== view) classes.push("hidden");
      set(node, "class", classes.join(" "));
    }
    if (get(node, "data-product") === page.product && node.tagName === "button" && get(node, "data-duration")) {
      buttons.push([get(node, "data-duration"), Number(get(node, "data-price"))]);
    }
    if (node.tagName === "a" && seoRoutes[get(node, "data-route")]) {
      const anchor = get(node, "data-scroll");
      set(node, "href", localizedPath(seoRoutes[get(node, "data-route")].path, language) + (anchor ? "#" + anchor : ""));
    }
    const targetLanguage = get(node, "data-seo-language");
    if (targetLanguage) {
      set(node, "href", localizedPath(hasAlternates ? page.path : "/", targetLanguage));
      if (language === targetLanguage && hasAlternates) set(node, "aria-current", "page");
    }
    if (get(node, "data-language-current") !== undefined) {
      node.childNodes[0].value = { fr: "Français", en: "English", ar: "العربية" }[language];
    }
    if (get(node, "data-language-code") !== undefined) node.childNodes[0].value = language.toUpperCase();
  });

  if (page.product) {
    if (JSON.stringify(buttons) !== JSON.stringify(page.offers)) {
      throw new Error("Landing offers differ from the catalogue for " + page.service);
    }
    add(head, "script", { type: "application/ld+json", "data-page-schema": "" },
      JSON.stringify(productSchema(page, url, { translate })).replaceAll("<", "\\u003c"));
  }
  localizeVisibleText(body, view, language);
  const directory = resolve(dist, path.slice(1));
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, "index.html"), serialize(document), "utf8");
}

const entries = pages.map(({ page, language }) => "  <url><loc>" + siteOrigin + localizedPath(page.path, language) + "</loc></url>");
await writeFile(resolve(dist, "sitemap.xml"), [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...entries,
  "</urlset>",
  "",
].join("\n"), "utf8");

console.log("Generated " + pages.length + " crawlable pages and their sitemap.");
