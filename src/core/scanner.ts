import { extractLabel } from './label-extractor';
import type {
  FieldDescriptor,
  FieldKind,
  FieldOption,
} from '../shared/types';

export type VisibilityCheck = (el: HTMLElement) => boolean;

/** Default visibility check for real browsers (not reliable in jsdom). */
export function defaultIsVisible(el: HTMLElement): boolean {
  if (el.getAttribute('aria-hidden') === 'true') return false;
  if (el.hidden) return false;
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (style) {
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  const rects = el.getClientRects();
  if (rects.length === 0) {
    if (style?.display === 'none') return false;
    if (el.offsetParent === null && style?.position !== 'fixed') {
      let p: HTMLElement | null = el.parentElement;
      while (p) {
        if (p.hidden || p.getAttribute('aria-hidden') === 'true') return false;
        const ps = el.ownerDocument.defaultView?.getComputedStyle(p);
        if (ps && (ps.display === 'none' || ps.visibility === 'hidden')) return false;
        p = p.parentElement;
      }
    }
  }
  return true;
}

function isPlaceholderOption(opt: HTMLOptionElement): boolean {
  const text = (opt.textContent ?? '').trim();
  const value = opt.value;
  if (!value) return true;
  if (/^(select|choose|pick)(\s|\.|…|\.\.\.)?/i.test(text)) return true;
  if (text === '—' || text === '-' || text === 'Select...') return true;
  return false;
}

function kindOf(el: HTMLElement): FieldKind {
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  if (el instanceof HTMLSelectElement) return 'select';
  if (el instanceof HTMLInputElement) {
    const type = (el.type || 'text').toLowerCase();
    if (type === 'email') return 'email';
    if (type === 'tel') return 'tel';
    if (type === 'url') return 'url';
    if (type === 'number') return 'number';
    if (type === 'date' || type === 'month' || type === 'datetime-local') return 'date';
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'file') return 'file';
    if (type === 'text' || type === 'search' || type === 'password' || type === '') return 'text';
    return 'other';
  }
  return 'other';
}

function selectOptions(el: HTMLSelectElement): FieldOption[] {
  return Array.from(el.options).map((o) => ({
    value: o.value,
    label: (o.textContent ?? '').trim(),
    isPlaceholder: isPlaceholderOption(o),
    selected: o.selected,
  }));
}

function radioOptions(el: HTMLInputElement): FieldOption[] {
  if (!el.name) return [];
  const group = Array.from(
    el.ownerDocument.querySelectorAll<HTMLInputElement>(
      `input[type="radio"][name="${CSS.escape(el.name)}"]`,
    ),
  );
  return group.map((radio) => {
    let label = '';
    if (radio.id) {
      const lab = radio.ownerDocument.querySelector(`label[for="${CSS.escape(radio.id)}"]`);
      label = (lab?.textContent ?? '').replace(/\s+/g, ' ').trim();
    }
    if (!label) {
      const wrap = radio.closest('label');
      if (wrap) {
        const clone = wrap.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('input').forEach((n) => n.remove());
        label = (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
      }
    }
    return {
      value: radio.value,
      label,
      isPlaceholder: false,
      selected: radio.checked,
    };
  });
}

function currentValueAndEmpty(el: HTMLElement, kind: FieldKind): { currentValue: string; isEmpty: boolean } {
  if (el instanceof HTMLSelectElement) {
    const opt = el.selectedOptions[0];
    if (!opt || isPlaceholderOption(opt)) return { currentValue: '', isEmpty: true };
    return { currentValue: opt.value || (opt.textContent ?? '').trim(), isEmpty: false };
  }
  if (el instanceof HTMLInputElement) {
    if (kind === 'checkbox') {
      return { currentValue: el.checked ? 'true' : 'false', isEmpty: !el.checked };
    }
    if (kind === 'radio') {
      const checked = el.name
        ? el.ownerDocument.querySelector<HTMLInputElement>(
            `input[type="radio"][name="${CSS.escape(el.name)}"]:checked`,
          )
        : el.checked
          ? el
          : null;
      return {
        currentValue: checked?.value ?? '',
        isEmpty: !checked,
      };
    }
    return { currentValue: el.value, isEmpty: !el.value };
  }
  if (el instanceof HTMLTextAreaElement) {
    return { currentValue: el.value, isEmpty: !el.value };
  }
  return { currentValue: '', isEmpty: true };
}

function isSupportedForScan(el: Element): el is HTMLElement {
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) {
    const type = (el.type || 'text').toLowerCase();
    if (['hidden', 'submit', 'button', 'image', 'reset'].includes(type)) return false;
    return true; // include file for reporting
  }
  return false;
}

/**
 * Scan a document (or subtree) for fillable form controls.
 * Pass a custom `isVisible` for jsdom unit tests.
 */
export function scanForm(
  root: Document | Element | ShadowRoot,
  isVisible: VisibilityCheck = defaultIsVisible,
): { fields: FieldDescriptor[]; elements: Map<string, HTMLElement> } {
  const scope: ParentNode = root instanceof Document ? root : root;
  const nodes = Array.from(scope.querySelectorAll('input, textarea, select'));
  const fields: FieldDescriptor[] = [];
  const elements = new Map<string, HTMLElement>();
  const seenRadioGroups = new Set<string>();
  let index = 0;

  for (const node of nodes) {
    if (!isSupportedForScan(node)) continue;
    const el = node;
    const visible = isVisible(el);
    const kind = kindOf(el);

    // One descriptor per radio group
    if (kind === 'radio' && el instanceof HTMLInputElement) {
      const key = el.name || el.id || `radio-${index}`;
      if (seenRadioGroups.has(key)) continue;
      seenRadioGroups.add(key);
    }

    // Skip invisible except we still might want them marked — plan says detect eligible visible inputs
    if (!visible && kind !== 'file') continue;

    const { label, labelSource, placeholder, section, hints } = extractLabel(el);
    const id = `f${index++}`;
    const inputType =
      el instanceof HTMLInputElement
        ? (el.type || 'text').toLowerCase()
        : el.tagName.toLowerCase();

    const options =
      kind === 'select' && el instanceof HTMLSelectElement
        ? selectOptions(el)
        : kind === 'radio' && el instanceof HTMLInputElement
          ? radioOptions(el)
          : [];

    const { currentValue, isEmpty } = currentValueAndEmpty(el, kind);

    const descriptor: FieldDescriptor = {
      id,
      kind,
      inputType,
      label,
      labelSource,
      hints,
      name: el.getAttribute('name'),
      htmlId: el.id || null,
      placeholder,
      autocomplete: (el.getAttribute('autocomplete') ?? '').toLowerCase() || null,
      section,
      required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
      disabled:
        el instanceof HTMLInputElement ||
        el instanceof HTMLSelectElement ||
        el instanceof HTMLTextAreaElement
          ? el.disabled
          : false,
      readOnly:
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
          ? el.readOnly
          : false,
      visible,
      currentValue,
      isEmpty,
      options,
    };

    fields.push(descriptor);
    elements.set(id, el);
  }

  return { fields, elements };
}
