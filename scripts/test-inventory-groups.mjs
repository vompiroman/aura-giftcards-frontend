import assert from "node:assert/strict";
import { groupInventoryByAccount, groupedInventoryPayload } from "../src/inventory-groups.js";

const inventory = [
  { id: "one", account_email: " Netflix@example.com ", profile_name: "Aura01", profile_pin: "0011", is_used: true, assigned_order_id: "ORD-one" },
  { id: "two", account_email: "other@example.com", profile_name: "Aura01", is_used: false },
  { id: "three", account_email: "netflix@example.com", profile_name: "Aura02", profile_pin: "0022", is_used: false },
];
const groups = groupInventoryByAccount(inventory);
assert.equal(groups.length, 2);
assert.equal(groups[0].email, "netflix@example.com");
assert.deepEqual(groups[0].profiles.map(item => item.id), ["one", "three"]);
assert.equal(groups[0].profiles[0].assigned_order_id, "ORD-one");
assert.equal(groups[0].profiles[1].profile_pin, "0022");
assert.equal(inventory[0].account_email, " Netflix@example.com ");
assert.deepEqual(groupInventoryByAccount(null), []);

const profiles = Array.from({ length: 5 }, (_, index) => ({ profile_name: `Aura0${index + 1}`, profile_pin: "0011" }));
const payload = groupedInventoryPayload(" account@example.com ", profiles, true);
assert.deepEqual(payload, { service: "netflix", account_email: "account@example.com", profiles, manual_assignment: true });
assert.throws(() => groupedInventoryPayload("x@example.com", [], false));
assert.throws(() => groupedInventoryPayload("x@example.com", [...profiles, profiles[0]], false));
assert.throws(() => groupedInventoryPayload("x@example.com", [{ profile_name: "Aura01" }, { profile_name: " aura01 " }], false), /nom différent/);
console.log("Grouped inventory and batch payload tests passed.");
