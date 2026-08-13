import assert from "node:assert/strict";
import {
  formatAlgerianPhoneInput,
  isCompleteAlgerianMobile,
  normalizeAlgerianPhone,
} from "../src/phone.js";

assert.equal(formatAlgerianPhoneInput(""), "+213 ");
assert.equal(formatAlgerianPhoneInput("+213 05"), "+213 5");
assert.equal(formatAlgerianPhoneInput("+213 0557828812"), "+213 5 57 82 88 12");
assert.equal(formatAlgerianPhoneInput("0557828812"), "+213 5 57 82 88 12");
assert.equal(formatAlgerianPhoneInput("00213 557828812"), "+213 5 57 82 88 12");
assert.equal(normalizeAlgerianPhone("+213 05 57 82 88 12"), "+213557828812");
assert.equal(isCompleteAlgerianMobile("+213 05 57 82 88 12"), true);
assert.equal(isCompleteAlgerianMobile("+213 04 57 82 88 12"), false);
assert.equal(isCompleteAlgerianMobile("+213 5 57"), false);

console.log("Tests du préfixe téléphonique algérien réussis.");
