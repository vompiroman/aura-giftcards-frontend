const SERVICE_PRESENTATIONS = [
  { key: "netflix", label: "Netflix", icon: "/netflix.svg", background: "bg-red-50" },
  { key: "spotify", label: "Spotify", icon: "/spotify.svg", background: "bg-green-100" },
  { key: "crunchyroll", label: "Crunchyroll", icon: "/crunchyroll.svg", background: "bg-orange-50" },
];

export function orderItemPresentation(item) {
  const name = String(item?.name || item?.service || "").trim();
  const normalized = name.toLowerCase();
  return SERVICE_PRESENTATIONS.find(service => normalized.includes(service.key)) || {
    key: "other",
    label: "Aura Stream",
    icon: "/aura-logo-mark.png",
    background: "bg-black/5",
  };
}

export function prioritizeOrder(orders, preferredOrderId) {
  if (!Array.isArray(orders)) return [];
  const preferred = String(preferredOrderId || "").trim();
  if (!preferred) return [...orders];
  return [...orders].sort((left, right) => {
    const leftMatches = String(left?.order_id || left?.id || "") === preferred;
    const rightMatches = String(right?.order_id || right?.id || "") === preferred;
    return Number(rightMatches) - Number(leftMatches);
  });
}
