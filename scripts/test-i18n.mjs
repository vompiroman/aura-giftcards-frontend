import assert from "node:assert/strict";
import fs from "node:fs";
import { TRANSLATIONS, TRANSLATION_PHRASES } from "../src/translations.js";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8")
  .replace(/<script[\s\S]*?<\/script>/gi, "")
  .replace(/<style[\s\S]*?<\/style>/gi, "");

const decode = (value) => value
  .replaceAll("&amp;", "&")
  .replaceAll("&nbsp;", " ")
  .replaceAll("&copy;", "©")
  .replaceAll("&#39;", "'")
  .replaceAll("&quot;", '"');

const visibleText = [...html.matchAll(/>([^<>]+)</g)]
  .map((match) => decode(match[1].replace(/\s+/g, " ").trim()))
  .filter((value) => value && /[A-Za-zÀ-ÿ]/.test(value));
const translatedAttributes = [...html.matchAll(/(?:placeholder|title|aria-label)="([^"]+)"/g)]
  .map((match) => decode(match[1]));

const universalText = /^(Aura|Stream|Netflix|Spotify|Crunchyroll|Netflix Premium|Spotify Family|Crunchyroll Mega Fan|FAQ|WhatsApp|Instagram|PIN|Français|English|العربية|Nassym|Yaker|AURA10|\d+|\d+[\d\s]* DA|[+][0-9 ]+|[•]+|#AS-.*|−?0 DA)$/;
const missingStaticTranslations = [...new Set([...visibleText, ...translatedAttributes])]
  .filter((value) => !universalText.test(value) && !TRANSLATIONS.en.has(value));

assert.deepEqual(missingStaticTranslations, [], `Missing static translations:\n${missingStaticTranslations.join("\n")}`);
assert.equal(TRANSLATIONS.en.size, TRANSLATIONS.ar.size, "English and Arabic dictionaries must have the same coverage");

for (const [source, english, arabic] of TRANSLATION_PHRASES) {
  assert.ok(source.trim(), "A source phrase cannot be empty");
  assert.ok(english.trim(), `Missing English translation for: ${source}`);
  assert.ok(arabic.trim(), `Missing Arabic translation for: ${source}`);
  assert.equal(TRANSLATIONS.en.get(source), english, `Duplicate English source phrase: ${source}`);
  assert.equal(TRANSLATIONS.ar.get(source), arabic, `Duplicate Arabic source phrase: ${source}`);
}

const requiredDynamicMessages = [
  "Connexion réussie.",
  "Création du compte impossible.",
  "Le lien de réinitialisation est invalide ou expiré.",
  "Paiement en cours de vérification",
  "Impossible de préparer le paiement",
  "En attente de stock",
  "Activation en cours",
  "Informations transmises en toute sécurité",
  "Aucun code Netflix récent n’a été trouvé.",
  "Aucune commande ne correspond aux filtres.",
  "Compte ajouté au stock.",
  "Statut de la commande mis à jour",
  "Aucune vente sur cette période.",
  "WhatsApp est ouvert avec ton message prêt à envoyer.",
  "Connexion administrateur",
  "Export du suivi des commandes",
  "Mise à jour du statut d’une commande",
  "Ajout de comptes au stock",
  "Suppression d’un compte du stock",
  "Modification d’un compte en stock",
  "Création d’un code promo",
  "Modification d’un code promo",
  "Désactivation d’un code promo",
  "Authentification",
  "Code promo",
  "Système",
];

for (const message of requiredDynamicMessages) {
  assert.ok(TRANSLATIONS.en.has(message), `Missing dynamic English translation: ${message}`);
  assert.ok(TRANSLATIONS.ar.has(message), `Missing dynamic Arabic translation: ${message}`);
}

assert.match(html, /data-language-select/g, "Language controls are required");
assert.match(html, /data-filter="sécurité données"/, "FAQ filters must use language-independent values");

console.log(`Trilingual coverage validated: ${TRANSLATIONS.en.size} phrases in French, English and Arabic.`);
