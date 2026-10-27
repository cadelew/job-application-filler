import type { LabelSource } from '../shared/types';

function textOf(el: Element | null | undefined): string {
  if (!el) return '';
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function labelByFor(el: HTMLElement): string {
  const id = el.id;
  if (!id) return '';
  try {
    const label = el.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`);
    return textOf(label);
  } catch {
    return '';
  }
}

function wrappingLabel(el: HTMLElement): string {
  const label = el.closest('label');
  if (!label) return '';
  const clone = label.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('input, select, textarea').forEach((n) => n.remove());
  return textOf(clone);
}

function ariaLabelledBy(el: HTMLElement): string {
  const ids = el.getAttribute('aria-labelledby');
  if (!ids) return '';
  const doc = el.ownerDocument;
  return ids
    .split(/\s+/)
    .map((id) => textOf(doc.getElementById(id)))
    .filter(Boolean)
    .join(' ')
    .trim();
}

/** Nearest fieldset legend or preceding heading used as section context. */
export function extractSection(el: HTMLElement): string | null {
  const fieldset = el.closest('fieldset');
  if (fieldset) {
    const legend = fieldset.querySelector(':scope > legend');
    const t = textOf(legend);
    if (t) return t;
  }

  let node: HTMLElement | null = el;
  while (node && node !== el.ownerDocument.body) {
    const heading = node.querySelector(
      ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > [role="heading"]',
    );
    if (heading && !heading.contains(el)) {
      const t = textOf(heading);
      if (t) return t;
    }

    let prev = node.previousElementSibling as HTMLElement | null;
    while (prev) {
      if (/^H[1-6]$/.test(prev.tagName) || prev.getAttribute('role') === 'heading') {
        const t = textOf(prev);
        if (t) return t;
      }
      const nested = prev.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]');
      if (nested) {
        const t = textOf(nested);
        if (t) return t;
      }
      prev = prev.previousElementSibling as HTMLElement | null;
    }

    node = node.parentElement;
  }

  return null;
}

export interface ExtractedLabel {
  label: string;
  labelSource: LabelSource;
  placeholder: string | null;
  section: string | null;
  hints: string[];
}

export function extractLabel(el: HTMLElement): ExtractedLabel {
  const placeholderRaw =
    el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
      ? (el.placeholder ?? '').trim()
      : '';
  const placeholder = placeholderRaw || null;
  const section = extractSection(el);
  const hints: string[] = [];

  const describedBy = el.getAttribute('aria-describedby');
  if (describedBy) {
    const doc = el.ownerDocument;
    for (const id of describedBy.split(/\s+/)) {
      const t = textOf(doc.getElementById(id));
      if (t) hints.push(t);
    }
  }

  const byFor = labelByFor(el);
  if (byFor) {
    return { label: byFor, labelSource: 'label-for', placeholder, section, hints };
  }

  const wrap = wrappingLabel(el);
  if (wrap) {
    return { label: wrap, labelSource: 'label-wrap', placeholder, section, hints };
  }

  const labelledBy = ariaLabelledBy(el);
  if (labelledBy) {
    return { label: labelledBy, labelSource: 'aria-labelledby', placeholder, section, hints };
  }

  const aria = (el.getAttribute('aria-label') ?? '').trim();
  if (aria) {
    return { label: aria, labelSource: 'aria-label', placeholder, section, hints };
  }

  if (placeholder) {
    return { label: placeholder, labelSource: 'placeholder', placeholder, section, hints };
  }

  const name = el.getAttribute('name') || el.getAttribute('id') || '';
  if (name) {
    return {
      label: name.replace(/[_-]+/g, ' '),
      labelSource: 'name',
      placeholder,
      section,
      hints,
    };
  }

  return { label: '', labelSource: 'none', placeholder, section, hints };
}
