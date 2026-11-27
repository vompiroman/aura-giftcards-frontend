import { t } from "./i18n.js";

function validationMessage(field) {
  if (field.validity.valueMissing) {
    return field.id === "snapchat-friend-added"
      ? t("Confirme l’ajout de @aura-stream.")
      : t("Renseigne ce champ.");
  }
  if (field.validity.typeMismatch && field.type === "email") {
    return t("Saisis une adresse e-mail valide.");
  }
  if (field.validity.patternMismatch && field.id === "snapchat-username") {
    return t("Saisis un nom d’utilisateur Snapchat valide.");
  }
  return t("Vérifie le format de ce champ.");
}

export function bindFieldValidation(form) {
  const errors = new Map();
  form.noValidate = true;

  function updateField(field) {
    const existing = errors.get(field);
    if (!field.willValidate || field.validity.valid) {
      if (existing) {
        const descriptions = (field.getAttribute("aria-describedby") || "").split(/\s+/)
          .filter(id => id && id !== existing.id);
        if (descriptions.length) field.setAttribute("aria-describedby", descriptions.join(" "));
        else field.removeAttribute("aria-describedby");
        field.removeAttribute("aria-invalid");
        existing.remove();
        errors.delete(field);
      }
      return false;
    }

    const message = existing || document.createElement("p");
    message.textContent = validationMessage(field);
    if (!existing) {
      message.id = field.id + "-error";
      message.className = "form-field-error";
      message.setAttribute("data-i18n-ignore", "");
      const wrapper = field.closest("[data-validation-field]");
      if (wrapper) wrapper.append(message);
      else field.after(message);
      const previous = field.getAttribute("aria-describedby") || "";
      field.setAttribute("aria-describedby", (previous + " " + message.id).trim());
      field.setAttribute("aria-invalid", "true");
      errors.set(field, message);
    }
    return true;
  }

  form.addEventListener("input", event => {
    if (errors.has(event.target)) updateField(event.target);
  });
  document.addEventListener("aura:languagechange", () => {
    for (const field of errors.keys()) updateField(field);
  });

  return () => {
    let firstInvalid = null;
    for (const field of form.elements) {
      if (field.id && updateField(field)) firstInvalid ||= field;
    }
    return firstInvalid;
  };
}
