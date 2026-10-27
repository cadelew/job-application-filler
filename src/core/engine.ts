import type { Profile } from '../profile/schema';
import { getProfileValue } from '../profile/values';
import { matchField } from './matcher';
import { scanForm, type VisibilityCheck, defaultIsVisible } from './scanner';
import { fillField } from './writer';
import {
  buildFillReport,
  type FieldDescriptor,
  type FillReport,
  type FillResult,
} from '../shared/types';

export interface EngineScanResult {
  fields: FieldDescriptor[];
  elements: Map<string, HTMLElement>;
}

/**
 * Scan the page and keep a live element map keyed by field id.
 */
export function scanPage(
  root: Document | Element | ShadowRoot = document,
  isVisible: VisibilityCheck = defaultIsVisible,
): EngineScanResult {
  return scanForm(root, isVisible);
}

export interface RunFillOptions {
  root?: Document | Element | ShadowRoot;
  isVisible?: VisibilityCheck;
  elements?: Map<string, HTMLElement>;
  fields?: FieldDescriptor[];
  url?: string;
}

/**
 * scan → match → fill high-confidence fields. Never submits the form.
 */
export function runFill(profile: Profile, options: RunFillOptions = {}): FillReport {
  const root = options.root ?? document;
  const isVisible = options.isVisible ?? defaultIsVisible;

  let fields = options.fields;
  let elements = options.elements;

  if (!fields || !elements) {
    const scanned = scanPage(root, isVisible);
    fields = scanned.fields;
    elements = scanned.elements;
  }

  const results: FillResult[] = [];

  for (const field of fields) {
    const match = matchField(field, profile, { allFields: fields });

    if (match.sensitive) {
      results.push({
        fieldId: field.id,
        label: field.label,
        status: 'skipped',
        code: 'sensitive',
        reason: match.reason,
        profileKey: null,
        confidence: 0,
      });
      continue;
    }

    if (match.decision === 'skip' || !match.profileKey) {
      const code =
        match.decision === 'review'
          ? 'needs-review'
          : match.reason.includes('empty')
            ? 'empty-profile-value'
            : match.confidence > 0 && match.confidence < 0.72
              ? 'low-confidence'
              : 'no-match';

      if (match.decision === 'review') {
        results.push({
          fieldId: field.id,
          label: field.label,
          status: 'review',
          code: 'needs-review',
          reason: match.reason,
          profileKey: match.profileKey,
          confidence: match.confidence,
        });
      } else {
        results.push({
          fieldId: field.id,
          label: field.label,
          status: 'skipped',
          code,
          reason: match.reason,
          profileKey: match.profileKey,
          confidence: match.confidence,
        });
      }
      continue;
    }

    if (match.decision === 'review') {
      results.push({
        fieldId: field.id,
        label: field.label,
        status: 'review',
        code: 'needs-review',
        reason: match.reason,
        profileKey: match.profileKey,
        confidence: match.confidence,
      });
      continue;
    }

    // decision === 'fill'
    const value = getProfileValue(profile, match.profileKey);
    if (!value) {
      results.push({
        fieldId: field.id,
        label: field.label,
        status: 'skipped',
        code: 'empty-profile-value',
        reason: 'Profile value is empty',
        profileKey: match.profileKey,
        confidence: match.confidence,
      });
      continue;
    }

    const el = elements.get(field.id);
    if (!el) {
      results.push({
        fieldId: field.id,
        label: field.label,
        status: 'failed',
        code: 'element-missing',
        reason: 'Element not found in content-script map',
        profileKey: match.profileKey,
        confidence: match.confidence,
      });
      continue;
    }

    results.push(
      fillField({
        element: el,
        value,
        field,
        profileKey: match.profileKey,
        confidence: match.confidence,
      }),
    );
  }

  const url =
    options.url ??
    (typeof location !== 'undefined' ? location.href : '') ??
    '';
  return buildFillReport(results, url);
}
