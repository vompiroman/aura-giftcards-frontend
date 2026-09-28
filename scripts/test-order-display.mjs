import assert from "node:assert/strict";
import { orderItemPresentation, prioritizeOrder } from "../src/order-display.js";

assert.equal(orderItemPresentation({ name: "Netflix Premium 1 mois" }).key, "netflix");
assert.equal(orderItemPresentation({ name: "Spotify Family 1 mois" }).key, "spotify");
assert.equal(orderItemPresentation({ service: "Crunchyroll" }).key, "crunchyroll");
assert.equal(orderItemPresentation({ name: "Offre inconnue" }).key, "other");

const orders = [
  { order_id: "ORD-old", items: [{ name: "Spotify Family 1 mois" }] },
  { order_id: "ORD-netflix", items: [{ name: "Netflix Premium 1 mois" }] },
];
const prioritized = prioritizeOrder(orders, "ORD-netflix");
assert.equal(prioritized[0].order_id, "ORD-netflix");
assert.equal(prioritized[0].items[0].name, "Netflix Premium 1 mois");
assert.equal(orders[0].order_id, "ORD-old", "The API result must not be mutated");

console.log("Order display classification and prioritization tests passed.");
