export const landingRoutes = {
  "landing-netflix": {
    path: "/netflix-algerie",
    title: "Netflix Premium en Algérie — Aura Stream",
    description: "Accès à un profil Netflix Premium, livré automatiquement après confirmation du paiement.",
    product: "Netflix Premium", service: "Netflix",
    offers: [["1 mois", 600], ["2 mois", 1100]],
  },
  "landing-spotify": {
    path: "/spotify-family-algerie",
    title: "Spotify Family en Algérie — Aura Stream",
    description: "Accès Spotify Family activé sur ton compte avec accompagnement humain en Algérie.",
    product: "Spotify Family", service: "Spotify",
    offers: [["1 mois", 800], ["1 an", 4000]],
  },
  "landing-crunchyroll": {
    path: "/crunchyroll-mega-fan-algerie",
    title: "Crunchyroll Mega Fan en Algérie — Aura Stream",
    description: "Crunchyroll Mega Fan activé sur ton compte avec suivi et support en Algérie.",
    product: "Crunchyroll Mega Fan", service: "Crunchyroll",
    offers: [["1 mois", 500], ["1 an", 3000]],
  },
  "landing-snapchat": {
    path: "/snapchat-plus-algerie",
    title: "Snapchat+ en Algérie — Aura Stream",
    description: "Snapchat+ : 3 mois à 2 000 DA ou 6 mois à 2 500 DA. Renseigne ton nom d’utilisateur et ajoute @aura-stream.",
    product: "Snapchat+", service: "Snapchat",
    offers: [["3 mois", 2000], ["6 mois", 2500]],
  },
};

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
