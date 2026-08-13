const ALGERIA_COUNTRY_CODE = "+213";

function algerianLocalDigits(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00213")) digits = digits.slice(5);
  else if (digits.startsWith("213")) digits = digits.slice(3);
  else if (digits.startsWith("0")) digits = digits.slice(1);

  return digits.replace(/^0+/, "").slice(0, 9);
}

export function formatAlgerianPhoneInput(value) {
  const digits = algerianLocalDigits(value);
  if (!digits) return `${ALGERIA_COUNTRY_CODE} `;

  const groups = [digits.slice(0, 1)];
  for (let index = 1; index < digits.length; index += 2) {
    groups.push(digits.slice(index, index + 2));
  }
  return `${ALGERIA_COUNTRY_CODE} ${groups.join(" ")}`;
}

export function normalizeAlgerianPhone(value) {
  const digits = algerianLocalDigits(value);
  return digits ? `${ALGERIA_COUNTRY_CODE}${digits}` : "";
}

export function isCompleteAlgerianMobile(value) {
  return /^\+213[5-7]\d{8}$/.test(normalizeAlgerianPhone(value));
}
