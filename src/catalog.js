export const siteOrigin = "https://www.aura-stream.com";
export const siteLanguages = ["fr", "en", "ar"];

export const landingRoutes = {
  "landing-netflix": {
    path: "/netflix-algerie",
    title: "Netflix Premium en Algérie — Aura Stream",
    description: "Choisis un profil Netflix Premium pour 1 ou 2 mois en Algérie. Livraison automatique après paiement selon le stock disponible.",
    product: "Netflix Premium", service: "Netflix",
    image: "/netflix.svg",
    offers: [["1 mois", 600], ["2 mois", 1100]],
  },
  "landing-spotify": {
    path: "/spotify-family-algerie",
    title: "Spotify Family en Algérie — Aura Stream",
    description: "Spotify Family en Algérie pour 1 mois ou 1 an. Notre équipe active l’abonnement sur ton compte après confirmation du paiement.",
    product: "Spotify Family", service: "Spotify",
    image: "/spotify.svg",
    offers: [["1 mois", 800], ["1 an", 4000]],
  },
  "landing-crunchyroll": {
    path: "/crunchyroll-mega-fan-algerie",
    title: "Crunchyroll Mega Fan en Algérie — Aura Stream",
    description: "Crunchyroll Mega Fan en Algérie pour 1 mois ou 1 an. Notre équipe active l’accès sur ton compte après confirmation du paiement.",
    product: "Crunchyroll Mega Fan", service: "Crunchyroll",
    image: "/crunchyroll.svg",
    offers: [["1 mois", 500], ["1 an", 3000]],
  },
  "landing-snapchat": {
    path: "/snapchat-plus-algerie",
    title: "Snapchat+ en Algérie — Aura Stream",
    description: "Abonne-toi à Snapchat+ en Algérie sur ton propre compte pour 3 mois à 2 000 DA ou 6 mois à 2 500 DA. Activation avec ton nom d’utilisateur.",
    product: "Snapchat+", service: "Snapchat",
    image: "/snapchat.svg",
    offers: [["3 mois", 2000], ["6 mois", 2500]],
  },
};

export const seoRoutes = {
  home: {
    path: "/",
    title: "Abonnements streaming en Algérie — Aura Stream",
    description: "Retrouve Netflix Premium, Spotify Family, Crunchyroll Mega Fan et Snapchat+ en Algérie. Prix en DA et paiement par CIB ou Edahabia.",
  },
  ...landingRoutes,
};

export function localizedPath(path, language) {
  if (language === "fr") return path;
  return `/${language}${path === "/" ? "" : path}`;
}

export function splitLocalizedPath(pathname) {
  const match = /^\/(en|ar)(?=\/|$)/.exec(pathname);
  const path = match ? pathname.slice(match[0].length) : pathname;
  return { language: match?.[1] || "fr", path: path.replace(/\/$/, "") || "/" };
}

export function seoAlternates(path) {
  return [...siteLanguages, "x-default"].map(language => [
    language,
    siteOrigin + localizedPath(path, language === "x-default" ? "fr" : language),
  ]);
}

export const contentRoutes = {
  legal: {
    path: "/legal",
    title: "Conditions, confidentialité et remboursements — Aura Stream",
    description: "Consulte les conditions de vente, la politique de confidentialité et les règles de remboursement d’Aura Stream.",
  },
};

export const allowedCartPrices = new Map(Object.values(landingRoutes).flatMap(landing =>
  landing.offers.map(([duration, price]) => [
    [landing.service, landing.product, duration].join("|"),
    price,
  ]),
));

export function productSchema(landing, url, { available, translate = text => text } = {}) {
  const stock = landing.service === "Netflix"
    ? typeof available === "boolean" ? available ? "InStock" : "BackOrder" : null
    : "InStock";
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: landing.product,
    description: translate(landing.description),
    image: siteOrigin + landing.image,
    url,
    offers: landing.offers.map(([duration, price]) => ({
      "@type": "Offer",
      name: translate(duration),
      url,
      price,
      priceCurrency: "DZD",
      seller: { "@type": "Organization", name: "Aura Stream" },
      ...(stock ? { availability: "https://schema.org/" + stock } : {}),
    })),
  };
}
