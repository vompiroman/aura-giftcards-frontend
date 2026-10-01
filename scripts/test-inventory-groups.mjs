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

const unsortedNames = ["Aura05", "Aura02", "Aura01", "Aura10", "Aura04", "Aura 03", "aura06", ""];
const unsorted = unsortedNames.map((profile_name, index) => ({ id: `profile-${index}`, account_email: "sorted@example.com", profile_name, profile_pin: `000${index}` }));
const sorted = groupInventoryByAccount(unsorted)[0].profiles;
assert.deepEqual(sorted.map(item => item.profile_name), ["Aura01", "Aura02", "Aura 03", "Aura04", "Aura05", "aura06", "Aura10", ""]);
assert.equal(sorted[0].id, "profile-2");
assert.equal(sorted[0].profile_pin, "0002");
assert.deepEqual(unsorted.map(item => item.profile_name), unsortedNames, "Sorting must not rename profiles or change API order");

const profiles = Array.from({ length: 5 }, (_, index) => ({ profile_name: `Aura0${index + 1}`, profile_pin: "0011" }));
const payload = groupedInventoryPayload(" account@example.com ", profiles, true);
assert.deepEqual(payload, { service: "netflix", account_email: "account@example.com", profiles, manual_assignment: true });
assert.throws(() => groupedInventoryPayload("x@example.com", [], false));
assert.throws(() => groupedInventoryPayload("x@example.com", [...profiles, profiles[0]], false));
assert.throws(() => groupedInventoryPayload("x@example.com", [{ profile_name: "Aura01" }, { profile_name: " aura01 " }], false), /nom différent/);
console.log("Grouped inventory and batch payload tests passed.");
