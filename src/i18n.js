import { TRANSLATIONS } from "./translations.js";

const STORAGE_KEY = "aura_language";
const SUPPORTED_LANGUAGES = new Set(["fr", "en", "ar"]);
const TRANSLATED_ATTRIBUTES = ["aria-label", "aria-description", "placeholder", "title"];
const LOCALES = { fr: "fr-DZ", en: "en-DZ", ar: "ar-DZ-u-nu-latn" };
const LANGUAGE_NAMES = {
  fr: { fr: "Français", en: "French", ar: "الفرنسية" },
  en: { fr: "Anglais", en: "English", ar: "الإنجليزية" },
  ar: { fr: "Arabe", en: "Arabic", ar: "العربية" },
};

const textSources = new WeakMap();
const attributeSources = new WeakMap();
let observer = null;
let initialized = false;

function preferredLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (SUPPORTED_LANGUAGES.has(stored)) return stored;
  } catch {
    // The site still works when storage is disabled.
  }
  const browserLanguage = String(typeof navigator === "undefined" ? "fr" : navigator.language || "fr").slice(0, 2).toLowerCase();
  return SUPPORTED_LANGUAGES.has(browserLanguage) ? browserLanguage : "fr";
}

let currentLanguage = preferredLanguage();

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function preserveWhitespace(source, translation) {
  const leading = source.match(/^\s*/)?.[0] || "";
  const trailing = source.match(/\s*$/)?.[0] || "";
  return `${leading}${translation}${trailing}`;
}

const dynamicPatterns = {
  en: [
    [/^([0-9][0-9\s]*) DA$/, "$1 DZD"],
    [/^−([0-9][0-9\s]*) DA$/, "−$1 DZD"],
    [/^(\d+) article$/, "$1 item"],
    [/^(\d+) articles$/, "$1 items"],
    [/^(\d+) article · (.+)$/, "$1 item · $2"],
    [/^(\d+) articles · (.+)$/, "$1 items · $2"],
    [/^Remise incluse · (.+)$/, "Discount included · $1"],
    [/^Page (\d+) sur (\d+)$/, "Page $1 of $2"],
    [/^Expire le (.+)$/, "Expires on $1"],
    [/^Expire aujourd’hui$/, "Expires today"],
    [/^Expire demain$/, "Expires tomorrow"],
    [/^Expire dans (\d+) jours?$/, "Expires in $1 days"],
    [/^Expiration : (.+)$/, "Expiry: $1"],
    [/^Du (.+) au (.+)$/, "From $1 to $2"],
    [/^Panier moyen : (.+)$/, "Average order: $1"],
    [/^Paiements à surveiller : (\d+)$/, "Payments to monitor: $1"],
    [/^1 résultats?$/, "1 result"],
    [/^(\d+) résultats?$/, "$1 results"],
    [/^Ajouté le (.+)$/, "Added on $1"],
    [/^Utilisé (\d+) fois$/, "Used $1 times"],
    [/^Utilisé (\d+) \/ (\d+)$/, "Used $1 / $2"],
    [/^Valable jusqu’au (.+)$/, "Valid until $1"],
    [/^Montant : (.+)$/, "Amount: $1"],
    [/^Commande (.+)$/, "Order $1"],
    [/^Profil : (.+)$/, "Profile: $1"],
    [/^PIN : (.+)$/, "PIN: $1"],
    [/^(.+) ajouté au panier$/, "$1 added to cart"],
    [/^(.+) appliqué : (.+)$/, "$1 applied: $2"],
    [/^Page (\d+) sur (\d+) · (\d+) commande\(s\)$/, "Page $1 of $2 · $3 orders"],
    [/^Non payées : (\d+) · Échouées : (\d+)$/, "Unpaid: $1 · Failed: $2"],
    [/^(\d+) disponible\(s\)$/, "$1 available"],
    [/^(\d+) attribué\(s\)$/, "$1 assigned"],
    [/^(\d+) ventes?$/, "$1 sales"],
    [/^Mis à jour (.+)$/, "Updated $1"],
    [/^Code créé : (.+)\. Copie-le maintenant, il ne sera plus réaffiché\.$/, "Code created: $1. Copy it now; it will not be shown again."],
    [/^Envoyer mes informations (.+)$/, "Submit my $1 information"],
    [/^Finaliser l’activation (.+)$/, "Complete $1 activation"],
    [/^(.+) disponible\(s\) · (.+) attribué\(s\)$/, "$1 available · $2 assigned"],
    [/^Connecté en tant que (.+)$/, "Signed in as $1"],
    [/^(.+) · Ajouté (.+)$/, "$1 · Added $2"],
    [/^([0-9]+) % · Toute la boutique$/, "$1% · Entire shop"],
    [/^(.+) : (.+), ([0-9]+) ventes?$/, "$1: $2, $3 sales"],
  ],
  ar: [
    [/^([0-9][0-9\s]*) DA$/, "$1 دج"],
    [/^−([0-9][0-9\s]*) DA$/, "−$1 دج"],
    [/^(\d+) article$/, "$1 عنصر"],
    [/^(\d+) articles$/, "$1 عناصر"],
    [/^(\d+) article · (.+)$/, "$1 عنصر · $2"],
    [/^(\d+) articles · (.+)$/, "$1 عناصر · $2"],
    [/^Remise incluse · (.+)$/, "التخفيض مشمول · $1"],
    [/^Page (\d+) sur (\d+)$/, "الصفحة $1 من $2"],
    [/^Expire le (.+)$/, "ينتهي في $1"],
    [/^Expire aujourd’hui$/, "ينتهي اليوم"],
    [/^Expire demain$/, "ينتهي غداً"],
    [/^Expire dans (\d+) jours?$/, "ينتهي خلال $1 أيام"],
    [/^Expiration : (.+)$/, "تاريخ الانتهاء: $1"],
    [/^Du (.+) au (.+)$/, "من $1 إلى $2"],
    [/^Panier moyen : (.+)$/, "متوسط الطلب: $1"],
    [/^Paiements à surveiller : (\d+)$/, "مدفوعات قيد المراقبة: $1"],
    [/^1 résultats?$/, "نتيجة واحدة"],
    [/^2 résultats?$/, "نتيجتان"],
    [/^(\d+) résultats?$/, "$1 نتائج"],
    [/^Ajouté le (.+)$/, "أضيف في $1"],
    [/^Utilisé (\d+) fois$/, "استُخدم $1 مرات"],
    [/^Utilisé (\d+) \/ (\d+)$/, "استُخدم $1 / $2"],
    [/^Valable jusqu’au (.+)$/, "صالح حتى $1"],
    [/^Montant : (.+)$/, "المبلغ: $1"],
    [/^Commande (.+)$/, "الطلب $1"],
    [/^Profil : (.+)$/, "الملف: $1"],
    [/^PIN : (.+)$/, "الرمز: $1"],
    [/^(.+) ajouté au panier$/, "تمت إضافة $1 إلى السلة"],
    [/^(.+) appliqué : (.+)$/, "تم تطبيق $1: $2"],
    [/^Page (\d+) sur (\d+) · (\d+) commande\(s\)$/, "الصفحة $1 من $2 · $3 طلبات"],
    [/^Non payées : (\d+) · Échouées : (\d+)$/, "غير مدفوعة: $1 · فاشلة: $2"],
    [/^(\d+) disponible\(s\)$/, "$1 متوفر"],
    [/^(\d+) attribué\(s\)$/, "$1 مخصّص"],
    [/^(\d+) ventes?$/, "$1 مبيعات"],
    [/^Mis à jour (.+)$/, "تم التحديث $1"],
    [/^Code créé : (.+)\. Copie-le maintenant, il ne sera plus réaffiché\.$/, "تم إنشاء الرمز: $1. انسخه الآن، فلن يُعرض مجدداً."],
    [/^Envoyer mes informations (.+)$/, "إرسال معلومات $1"],
    [/^Finaliser l’activation (.+)$/, "إكمال تفعيل $1"],
    [/^(.+) disponible\(s\) · (.+) attribué\(s\)$/, "$1 متوفر · $2 مخصّص"],
    [/^Connecté en tant que (.+)$/, "تم تسجيل الدخول باسم $1"],
    [/^(.+) · Ajouté (.+)$/, "$1 · أضيف في $2"],
    [/^([0-9]+) % · Toute la boutique$/, "$1% · كل المتجر"],
    [/^(.+) : (.+), ([0-9]+) ventes?$/, "$1: $2، $3 مبيعات"],
  ],
};

const fragmentPhrases = [
  ["En attente de paiement", "Awaiting payment", "في انتظار الدفع"],
  ["Paiement confirmé", "Payment confirmed", "تم تأكيد الدفع"],
  ["Activation en cours", "Activation in progress", "التفعيل جارٍ"],
  ["En attente de stock", "Waiting for stock", "في انتظار المخزون"],
  ["Livraison automatique", "Automatic delivery", "تسليم تلقائي"],
  ["Activation manuelle", "Manual activation", "تفعيل يدوي"],
  ["mot de passe temporaire", "temporary password", "كلمة مرور مؤقتة"],
  ["adresse e-mail", "email address", "البريد الإلكتروني"],
  ["numéro de commande", "order number", "رقم الطلب"],
];

export function getLanguage() {
  return currentLanguage;
}

export function getLocale() {
  return LOCALES[currentLanguage];
}

export function t(value, variables = {}) {
  const source = normalize(value);
  if (!source || currentLanguage === "fr") return interpolate(source, variables);

  const exact = TRANSLATIONS[currentLanguage]?.get(source);
  if (exact) return interpolate(exact, variables);

  for (const [pattern, replacement] of dynamicPatterns[currentLanguage] || []) {
    if (pattern.test(source)) return interpolate(source.replace(pattern, replacement), variables);
  }

  let translated = source;
  for (const [fr, en, ar] of fragmentPhrases) {
    const replacement = currentLanguage === "ar" ? ar : en;
    translated = translated.replaceAll(fr, replacement);
  }
  return interpolate(translated, variables);
}

function interpolate(value, variables) {
  return String(value).replace(/\{(\w+)\}/g, (_, key) => String(variables[key] ?? `{${key}}`));
}

export function formatLocalizedNumber(value, options = {}) {
  return new Intl.NumberFormat(getLocale(), options).format(Number(value) || 0);
}

export function formatLocalizedDate(value, options = {}) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const localizedOptions = currentLanguage === "fr" && options.hour12 === undefined && (options.timeStyle || options.hour)
    ? { ...options, hour12: false }
    : options;
  return new Intl.DateTimeFormat(getLocale(), localizedOptions).format(date);
}

function translateTextNode(node, force = false) {
  if (!node?.nodeValue || !normalize(node.nodeValue)) return;
  const parent = node.parentElement;
  if (!parent || parent.closest("script, style, noscript, [data-i18n-ignore]")) return;

  let source = textSources.get(node);
  if (!source || !force) {
    const current = normalize(node.nodeValue);
    const expected = source ? t(source) : "";
    if (!source || (current !== normalize(expected) && current !== normalize(source))) {
      source = node.nodeValue;
      textSources.set(node, source);
    }
  }
  node.nodeValue = preserveWhitespace(source, t(source));
}

function translateAttributes(element, force = false) {
  if (!(element instanceof Element) || element.closest("[data-i18n-ignore]")) return;
  let sources = attributeSources.get(element);
  if (!sources) {
    sources = new Map();
    attributeSources.set(element, sources);
  }

  for (const attribute of TRANSLATED_ATTRIBUTES) {
    if (!element.hasAttribute(attribute)) continue;
    const current = element.getAttribute(attribute) || "";
    let source = sources.get(attribute);
    const expected = source ? t(source) : "";
    if (!source || (!force && normalize(current) !== normalize(expected) && normalize(current) !== normalize(source))) {
      source = current;
      sources.set(attribute, source);
    }
    element.setAttribute(attribute, t(source));
  }
}

function translateTree(root, force = false) {
  if (root instanceof Text) {
    translateTextNode(root, force);
    return;
  }
  if (!(root instanceof Element) && root !== document) return;
  if (root instanceof Element) translateAttributes(root, force);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node instanceof Text) translateTextNode(node, force);
    else translateAttributes(node, force);
    node = walker.nextNode();
  }
}

function observeDocument() {
  observer?.disconnect();
  observer = new MutationObserver((mutations) => {
    observer.disconnect();
    for (const mutation of mutations) {
      if (mutation.type === "characterData") translateTextNode(mutation.target);
      if (mutation.type === "attributes") translateAttributes(mutation.target);
      for (const node of mutation.addedNodes || []) translateTree(node);
    }
    observeDocument();
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: TRANSLATED_ATTRIBUTES,
  });
}

function syncLanguageControls() {
  for (const select of document.querySelectorAll("[data-language-select]")) {
    select.value = currentLanguage;
    select.setAttribute("aria-label", t("Langue du site"));
    for (const option of select.options) {
      option.textContent = LANGUAGE_NAMES[option.value]?.[currentLanguage] || option.value.toUpperCase();
    }
  }
}

function updateDocumentLanguage() {
  document.documentElement.lang = currentLanguage;
  document.documentElement.dir = currentLanguage === "ar" ? "rtl" : "ltr";
  document.body?.classList.toggle("is-rtl", currentLanguage === "ar");
}

export function setLanguage(language, { persist = true, announce = true } = {}) {
  if (!SUPPORTED_LANGUAGES.has(language)) return;
  const changed = language !== currentLanguage;
  currentLanguage = language;
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, currentLanguage);
    } catch {
      // Ignore blocked storage and keep the in-memory preference.
    }
  }

  observer?.disconnect();
  updateDocumentLanguage();
  translateTree(document, true);
  syncLanguageControls();
  observeDocument();

  if (changed) {
    document.dispatchEvent(new CustomEvent("aura:languagechange", { detail: { language: currentLanguage } }));
    if (announce) {
      const liveRegion = document.getElementById("language-announcement");
      if (liveRegion) liveRegion.textContent = currentLanguage === "ar" ? "تم تغيير اللغة إلى العربية" : currentLanguage === "en" ? "Language changed to English" : "Langue changée en français";
    }
  }
}

export function initializeI18n() {
  if (initialized) return;
  initialized = true;
  updateDocumentLanguage();
  translateTree(document, true);
  syncLanguageControls();
  for (const select of document.querySelectorAll("[data-language-select]")) {
    select.addEventListener("change", () => setLanguage(select.value));
  }
  observeDocument();
}

export const I18N_SUPPORTED_LANGUAGES = [...SUPPORTED_LANGUAGES];
