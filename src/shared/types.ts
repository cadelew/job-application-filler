/**
 * Shared contracts between the scanner, matcher, writer, engine, content script, and popup.
 * Everything here must stay JSON-serializable: these values cross the
 * popup <-> content script message boundary. DOM elements never leave the content script;
 * it keeps its own Map<fieldId, HTMLElement>.
 */

// ---------------------------------------------------------------------------
// Profile keys
// ---------------------------------------------------------------------------

/**
 * Profile values the matcher can map a field to. Dotted paths into `Profile`, plus
 * `personal.fullName`, which is derived (`firstName + ' ' + lastName`) and not stored.
 * Only the first education entry is fillable in milestones 1-5.
 * `answers.*` keys are deliberately absent: sensitive questions are never autofilled.
 */
export const PROFILE_FIELD_KEYS = [
  'personal.fullName',
  'personal.firstName',
  'personal.lastName',
  'personal.preferredName',
  'personal.email',
  'personal.phone',
  'personal.location',
  'personal.addressLine1',
  'personal.addressLine2',
  'personal.city',
  'personal.state',
  'personal.postalCode',
  'personal.country',
  'links.linkedin',
  'links.github',
  'links.portfolio',
  'links.website',
  'education.0.school',
  'education.0.degree',
  'education.0.fieldOfStudy',
  'education.0.startDate',
  'education.0.endDate',
  'education.0.gpa',
] as const;

export type ProfileFieldKey = (typeof PROFILE_FIELD_KEYS)[number];

// ---------------------------------------------------------------------------
// Scanner output
// ---------------------------------------------------------------------------

export type FieldKind =
  | 'text' // input type text/search or missing type
  | 'email'
  | 'tel'
  | 'url'
  | 'number'
  | 'date' // date, month
  | 'textarea'
  | 'select' // native <select> (single)
  | 'checkbox'
  | 'radio' // one descriptor per radio *group* (same form + name)
  | 'file' // detected for reporting only; never written
  | 'other'; // contenteditable, custom widgets, unknown input types; never written in M1-5

/** Where a label string came from, in the label extractor's priority order. */
export type LabelSource =
  | 'label-for'
  | 'label-wrap'
  | 'aria-labelledby'
  | 'aria-label'
  | 'placeholder'
  | 'name'
  | 'none';

export interface FieldOption {
  /** The option's/radio's `value` attribute. */
  value: string;
  /** Visible text: <option> text, or the radio's label. */
  label: string;
  /** Placeholder options ("Select...", empty value) are flagged so they count as empty. */
  isPlaceholder: boolean;
  selected: boolean;
}

export interface FieldDescriptor {
  /** Stable for the lifetime of the content script, e.g. "f0", "f1". Key into the element map. */
  id: string;
  kind: FieldKind;
  /** Raw `type` attribute for inputs ("text", "email", ...); tag name for others ("textarea", "select"). */
  inputType: string;
  /** Best human label after trimming/whitespace collapse. Empty string if none was found. */
  label: string;
  labelSource: LabelSource;
  /** Other label-ish text the matcher may use as extra signal (aria-describedby, nearby text). */
  hints: string[];
  name: string | null;
  htmlId: string | null;
  placeholder: string | null;
  /** `autocomplete` attribute, lowercased, e.g. "given-name", "email". */
  autocomplete: string | null;
  /** Nearest fieldset legend or section heading text, used for section ambiguity. Null if none. */
  section: string | null;
  required: boolean;
  disabled: boolean;
  readOnly: boolean;
  /** Result of the injected visibility check (jsdom tests stub it). */
  visible: boolean;
  /**
   * Current value. text-like/select: the value string; checkbox: "true"/"false";
   * radio group: the checked radio's value or "".
   */
  currentValue: string;
  /** True when nothing user-entered is present. A select on a placeholder option counts as empty. */
  isEmpty: boolean;
  /** select and radio only; empty array otherwise. */
  options: FieldOption[];
}

// ---------------------------------------------------------------------------
// Matcher output
// ---------------------------------------------------------------------------

/** Engine thresholds: >= FILL fills, >= REVIEW is reported for review, below is skipped. */
export const FILL_THRESHOLD = 0.92;
export const REVIEW_THRESHOLD = 0.72;

export type MatchDecision = 'fill' | 'review' | 'skip';

export interface FieldMatch {
  fieldId: string;
  /** Null when nothing matched or the field is sensitive. */
  profileKey: ProfileFieldKey | null;
  /** 0..1. Sensitive and unmatched fields are 0. */
  confidence: number;
  /** Decision derived from confidence + rules (sensitive => skip, section ambiguity => review). */
  decision: MatchDecision;
  /** True when the sensitive denylist matched; such fields are always skipped. */
  sensitive: boolean;
  /** Human-readable explanation, e.g. 'alias "linkedin profile" matched label'. */
  reason: string;
}

// ---------------------------------------------------------------------------
// Writer / engine output
// ---------------------------------------------------------------------------

export type FillStatus = 'filled' | 'skipped' | 'review' | 'failed';

/** Machine-readable reason codes; `reason` on results carries the human text. */
export type FillReasonCode =
  | 'filled'
  | 'no-match'
  | 'low-confidence'
  | 'needs-review' // confidence in review band, or ambiguous section
  | 'sensitive'
  | 'prefilled' // never overwrite existing values
  | 'empty-profile-value'
  | 'hidden'
  | 'disabled'
  | 'readonly'
  | 'unsupported-kind' // file, other
  | 'no-matching-option' // select/radio had no option matching the profile value
  | 'element-missing' // element detached since scan
  | 'verify-failed' // value did not stick after write
  | 'error';

export interface FillResult {
  fieldId: string;
  label: string;
  status: FillStatus;
  code: FillReasonCode;
  reason: string;
  profileKey: ProfileFieldKey | null;
  confidence: number;
}

export interface FillReportEntry {
  fieldId: string;
  label: string;
  code: FillReasonCode;
  reason: string;
  profileKey: ProfileFieldKey | null;
  confidence: number;
}

export interface FillReport {
  /** Page URL at fill time. */
  url: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
  filled: FillReportEntry[];
  skipped: FillReportEntry[];
  review: FillReportEntry[];
  failed: FillReportEntry[];
  /** Total fields scanned (equals the sum of the four groups). */
  totalFields: number;
}

/** Groups per-field results into a report. Shared so engine and tests agree on shape. */
export function buildFillReport(results: FillResult[], url: string, now: Date = new Date()): FillReport {
  const report: FillReport = {
    url,
    createdAt: now.toISOString(),
    filled: [],
    skipped: [],
    review: [],
    failed: [],
    totalFields: results.length,
  };
  for (const { status, ...entry } of results) report[status].push(entry);
  return report;
}
