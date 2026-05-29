import type { ProductTemplate, DynamicFormValues } from "./types.js";

/** Conditional rule semantics: a field listed in `show` is only visible
 * when the trigger field's value equals `condition.value`. */
export function isFieldVisible(
  fieldKey: string,
  template: ProductTemplate,
  values: Pick<DynamicFormValues, "customFieldValues">,
): boolean {
  for (const rule of template.conditionalRules) {
    if (!rule.show.includes(fieldKey)) continue;
    const triggerVal = values.customFieldValues[rule.fieldKey];
    // string-coerced comparison so "10" === 10 etc.
    if (String(triggerVal ?? "") !== String(rule.condition.value)) {
      return false;
    }
  }
  return true;
}

function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

/**
 * Re-validate a payload against a template. Returns array of error messages.
 * Empty array = valid. Used by both the frontend (pre-submit) and the
 * backend (defense-in-depth, never trust the client).
 */
export function validateTemplatePayload(
  template: ProductTemplate,
  values: DynamicFormValues,
): string[] {
  const errors: string[] = [];

  // Custom field validation (via validationRules + per-field required flag)
  const visited = new Set<string>();
  for (const rule of template.validationRules) {
    visited.add(rule.fieldKey);
    if (!isFieldVisible(rule.fieldKey, template, values)) continue;
    if (isEmpty(values.customFieldValues[rule.fieldKey])) {
      errors.push(rule.message);
    }
  }
  for (const field of template.customFields) {
    if (!field.required || visited.has(field.key)) continue;
    if (!isFieldVisible(field.key, template, values)) continue;
    if (isEmpty(values.customFieldValues[field.key])) {
      errors.push(`${field.label} wajib diisi`);
    }
  }

  // Required documents
  for (const doc of template.requiredDocuments) {
    if (!doc.required) continue;
    const ref = values.uploadedDocuments.find((d) => d.key === doc.key)?.reference ?? "";
    if (!ref.trim()) {
      errors.push(`${doc.label} wajib diunggah/diisi`);
    }
  }

  return errors;
}
