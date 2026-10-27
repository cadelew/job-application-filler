import type { FieldDescriptor, FillResult, ProfileFieldKey } from '../shared/types';

function isPlaceholderOption(opt: HTMLOptionElement): boolean {
  const text = (opt.textContent ?? '').trim();
  const value = opt.value;
  if (!value) return true;
  if (/^(select|choose|pick)(\s|\.|…|\.\.\.)?/i.test(text)) return true;
  if (text === '—' || text === '-' || text === 'Select...') return true;
  return false;
}

/** Treat placeholder select options as empty (safe to overwrite). */
export function isEffectivelyEmpty(el: HTMLElement): boolean {
  if (el instanceof HTMLSelectElement) {
    const opt = el.selectedOptions[0];
    if (!opt) return true;
    return isPlaceholderOption(opt);
  }
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox' || el.type === 'radio') return !el.checked;
    return !el.value;
  }
  if (el instanceof HTMLTextAreaElement) return !el.value;
  return true;
}

function normalizeForCompare(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function fillText(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): boolean {
  if (element.disabled || element.readOnly) return false;

  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;

  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (!setter) {
    element.value = value;
  } else {
    setter.call(element, value);
  }

  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  return element.value === value;
}

function fillSelect(element: HTMLSelectElement, value: string): boolean {
  if (element.disabled) return false;
  const target = normalizeForCompare(String(value));

  let matched: HTMLOptionElement | undefined;
  for (const opt of Array.from(element.options)) {
    if (isPlaceholderOption(opt)) continue;
    const text = normalizeForCompare(opt.textContent ?? '');
    const val = normalizeForCompare(opt.value);
    if (text === target || val === target || text.includes(target) || val.includes(target)) {
      matched = opt;
      break;
    }
  }
  if (!matched) return false;

  element.value = matched.value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  return element.value === matched.value;
}

function fillCheckbox(element: HTMLInputElement, value: string): boolean {
  if (element.disabled || element.readOnly) return false;
  const want = /^(true|yes|1|on|checked)$/i.test(String(value));
  element.checked = want;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  return element.checked === want;
}

function fillRadio(element: HTMLInputElement, value: string): boolean {
  if (element.disabled || element.readOnly) return false;
  const name = element.name;
  if (!name) return false;

  const group = Array.from(
    element.ownerDocument.querySelectorAll<HTMLInputElement>(
      `input[type="radio"][name="${CSS.escape(name)}"]`,
    ),
  );

  const target = normalizeForCompare(String(value));
  let matched: HTMLInputElement | undefined;
  for (const radio of group) {
    const labelText = (() => {
      if (radio.id) {
        const lab = radio.ownerDocument.querySelector(`label[for="${CSS.escape(radio.id)}"]`);
        if (lab) return normalizeForCompare(lab.textContent ?? '');
      }
      const wrap = radio.closest('label');
      return normalizeForCompare(wrap?.textContent ?? '');
    })();
    const val = normalizeForCompare(radio.value);
    if (val === target || labelText === target || labelText.includes(target) || val.includes(target)) {
      matched = radio;
      break;
    }
  }
  if (!matched) return false;

  matched.checked = true;
  matched.dispatchEvent(new Event('input', { bubbles: true }));
  matched.dispatchEvent(new Event('change', { bubbles: true }));
  return matched.checked;
}

export interface FillFieldArgs {
  element: HTMLElement;
  value: string;
  field: FieldDescriptor;
  profileKey: ProfileFieldKey | null;
  confidence: number;
  /** When false (default), nonempty user values are preserved. */
  overwrite?: boolean;
}

/**
 * Write a value into a form control. Never submits the form.
 */
export function fillField(args: FillFieldArgs): FillResult {
  const { element, value, field, profileKey, confidence, overwrite = false } = args;
  const base = {
    fieldId: field.id,
    label: field.label,
    profileKey,
    confidence,
  };

  if (field.kind === 'file' || field.kind === 'other') {
    return {
      ...base,
      status: 'skipped',
      code: 'unsupported-kind',
      reason: `Unsupported field kind: ${field.kind}`,
    };
  }

  if (!field.visible) {
    return {
      ...base,
      status: 'skipped',
      code: 'hidden',
      reason: 'Field is hidden',
    };
  }

  if (field.disabled) {
    return {
      ...base,
      status: 'skipped',
      code: 'disabled',
      reason: 'Field is disabled',
    };
  }

  if (field.readOnly) {
    return {
      ...base,
      status: 'skipped',
      code: 'readonly',
      reason: 'Field is read-only',
    };
  }

  if (!overwrite && !field.isEmpty && !isEffectivelyEmpty(element)) {
    return {
      ...base,
      status: 'skipped',
      code: 'prefilled',
      reason: 'Preserved existing value',
    };
  }

  let ok = false;
  let noOption = false;
  try {
    if (element instanceof HTMLSelectElement) {
      ok = fillSelect(element, value);
      if (!ok) noOption = true;
    } else if (element instanceof HTMLTextAreaElement) {
      ok = fillText(element, value);
    } else if (element instanceof HTMLInputElement) {
      const t = (element.type || 'text').toLowerCase();
      if (t === 'checkbox') ok = fillCheckbox(element, value);
      else if (t === 'radio') {
        ok = fillRadio(element, value);
        if (!ok) noOption = true;
      } else ok = fillText(element, value);
    } else {
      return {
        ...base,
        status: 'failed',
        code: 'unsupported-kind',
        reason: `Unsupported element: ${element.tagName}`,
      };
    }
  } catch (err) {
    return {
      ...base,
      status: 'failed',
      code: 'error',
      reason: err instanceof Error ? err.message : 'Write threw',
    };
  }

  if (!ok) {
    return {
      ...base,
      status: 'failed',
      code: noOption ? 'no-matching-option' : 'verify-failed',
      reason: noOption ? 'No matching select/radio option' : 'Write verification failed',
    };
  }

  return {
    ...base,
    status: 'filled',
    code: 'filled',
    reason: 'Filled successfully',
  };
}
