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
  if (field.id === "reset-password" && (field.validity.tooShort || field.validity.tooLong)) {
    return t("Le nouveau mot de passe doit contenir 12 à 128 caractères.");
  }
  if (field.validity.patternMismatch && field.id === "snapchat-username") {
    return t("Saisis un nom d’utilisateur Snapchat valide.");
  }
  return t("Vérifie le format de ce champ.");
}

export function bindFieldValidation(form) {
  const errors = new Map();
  const serverErrors = new Map();
  form.noValidate = true;

  function clearField(field) {
    const existing = errors.get(field);
    if (!existing) return;
    const descriptions = (field.getAttribute("aria-describedby") || "").split(/\s+/)
      .filter(id => id && id !== existing.id);
    if (descriptions.length) field.setAttribute("aria-describedby", descriptions.join(" "));
    else field.removeAttribute("aria-describedby");
    field.removeAttribute("aria-invalid");
    existing.remove();
    errors.delete(field);
  }

  function updateField(field) {
    const serverError = serverErrors.get(field);
    if (!field.willValidate || (field.validity.valid && !serverError)) {
      clearField(field);
      return false;
    }

    const existing = errors.get(field);
    const message = existing || document.createElement("p");
    message.textContent = serverError ? t(serverError) : validationMessage(field);
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
    serverErrors.delete(event.target);
    if (errors.has(event.target)) updateField(event.target);
  });
  document.addEventListener("aura:languagechange", () => {
    for (const field of errors.keys()) updateField(field);
  });

  function validate() {
    let firstInvalid = null;
    for (const field of form.elements) {
      if (field.id && updateField(field)) firstInvalid ||= field;
    }
    return firstInvalid;
  }
  validate.clear = () => {
    serverErrors.clear();
    for (const field of errors.keys()) clearField(field);
  };
  validate.showFieldError = (field, message) => {
    serverErrors.set(field, message);
    updateField(field);
    field.focus();
  };
  return validate;
}
