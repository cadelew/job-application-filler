import type { Profile } from '../profile/schema';
import { getProfileValue } from '../profile/values';
import type {
  FieldDescriptor,
  FieldMatch,
  MatchDecision,
  ProfileFieldKey,
} from '../shared/types';
import { FILL_THRESHOLD, REVIEW_THRESHOLD } from '../shared/types';

/** Normalize labels / names for alias comparison. */
export function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[_./\\-]+/g, ' ')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sensitive topics — checked BEFORE alias matching.
 * These fields are never autofilled in the MVP.
 */
export const SENSITIVE_DENYLIST: string[] = [
  'authorized to work',
  'legally authorized',
  'work authorization',
  'work authorisation',
  'eligible to work',
  'right to work',
  'sponsorship',
  'visa sponsorship',
  'require sponsorship',
  'need sponsorship',
  'gender',
  'sex',
  'race',
  'ethnicity',
  'ethnic',
  'hispanic',
  'latino',
  'veteran',
  'protected veteran',
  'military status',
  'disability',
  'disabled',
  'accommodation',
  'salary',
  'compensation',
  'expected salary',
  'desired salary',
  'pay expectation',
  'how did you hear',
  'how did you find',
  'referral source',
  'source of hire',
];

export const FIELD_ALIASES: Record<ProfileFieldKey, string[]> = {
  'personal.fullName': ['full name', 'legal name', 'name', 'candidate name', 'your name'],
  'personal.firstName': [
    'first name',
    'given name',
    'first_name',
    'fname',
    'firstname',
    'legal first name',
  ],
  'personal.lastName': [
    'last name',
    'surname',
    'family name',
    'last_name',
    'lname',
    'lastname',
    'legal last name',
  ],
  'personal.preferredName': ['preferred name', 'nickname', 'goes by'],
  'personal.email': [
    'email',
    'email address',
    'e mail',
    'candidate email',
    'work email',
    'emailaddress',
  ],
  'personal.phone': [
    'phone',
    'phone number',
    'mobile',
    'mobile phone',
    'telephone',
    'cell',
    'cell phone',
  ],
  'personal.location': [
    'current location',
    'location',
    'current city',
    'where are you located',
    'your location',
    'home location',
  ],
  'personal.addressLine1': ['address', 'address line 1', 'street address', 'street'],
  'personal.addressLine2': ['address line 2', 'apt', 'suite', 'unit'],
  'personal.city': ['city', 'town'],
  'personal.state': ['state', 'province', 'region', 'state province'],
  'personal.postalCode': ['postal code', 'zip', 'zip code', 'postcode'],
  'personal.country': ['country', 'country region', 'nation'],
  'links.linkedin': ['linkedin', 'linkedin url', 'linkedin profile', 'linkedin profile url'],
  'links.github': ['github', 'github url', 'github profile', 'github username'],
  'links.portfolio': ['portfolio', 'portfolio url', 'personal portfolio'],
  'links.website': ['website', 'personal website', 'personal site', 'homepage', 'web site'],
  'education.0.school': [
    'school',
    'school name',
    'university',
    'college',
    'institution',
    'university name',
    'college name',
  ],
  'education.0.degree': ['degree', 'degree type', 'education degree'],
  'education.0.fieldOfStudy': ['major', 'field of study', 'concentration', 'area of study'],
  'education.0.startDate': ['education start date', 'school start date', 'start date'],
  'education.0.endDate': [
    'graduation date',
    'grad date',
    'graduation',
    'expected graduation',
    'end date',
  ],
  'education.0.gpa': ['gpa', 'grade point average'],
};

const NEGATIVE_LOCATION_TOKENS = ['desired', 'preferred', 'willing', 'relocat', 'target', 'hope'];

const AUTOCOMPLETE_MAP: Record<string, ProfileFieldKey> = {
  'given-name': 'personal.firstName',
  'family-name': 'personal.lastName',
  'additional-name': 'personal.preferredName',
  name: 'personal.fullName',
  email: 'personal.email',
  'tel': 'personal.phone',
  'tel-national': 'personal.phone',
  'street-address': 'personal.addressLine1',
  'address-line1': 'personal.addressLine1',
  'address-line2': 'personal.addressLine2',
  'address-level2': 'personal.city',
  'address-level1': 'personal.state',
  'postal-code': 'personal.postalCode',
  country: 'personal.country',
  'country-name': 'personal.country',
  url: 'links.website',
};

function haystack(field: FieldDescriptor): string {
  return normalize(
    [field.label, field.name ?? '', field.htmlId ?? '', field.placeholder ?? '', field.section ?? '', ...field.hints].join(
      ' ',
    ),
  );
}

function isSensitive(text: string): boolean {
  const n = normalize(text);
  return SENSITIVE_DENYLIST.some((term) => n.includes(normalize(term)));
}

function isDesiredLocation(text: string): boolean {
  const n = normalize(text);
  if (!n.includes('location') && !n.includes('city') && !/\brelocat/.test(n)) {
    return false;
  }
  return NEGATIVE_LOCATION_TOKENS.some((t) => n.includes(t));
}

function scoreAliasHit(normalizedField: string, alias: string): number {
  const a = normalize(alias);
  if (!a) return 0;
  if (normalizedField === a) return 1.0;
  const re = new RegExp(`(?:^|\\s)${a.replace(/\s+/g, '\\s+')}(?:\\s|$)`);
  if (re.test(normalizedField)) return 0.96;
  if (normalizedField.includes(a)) return 0.93;
  return 0;
}

function decisionFromConfidence(confidence: number): MatchDecision {
  if (confidence >= FILL_THRESHOLD) return 'fill';
  if (confidence >= REVIEW_THRESHOLD) return 'review';
  return 'skip';
}

function skipMatch(
  fieldId: string,
  reason: string,
  extras: Partial<FieldMatch> = {},
): FieldMatch {
  return {
    fieldId,
    profileKey: null,
    confidence: 0,
    decision: 'skip',
    sensitive: false,
    reason,
    ...extras,
  };
}

/** Labels that commonly repeat across education/experience sections. */
const AMBIGUOUS_LABELS = new Set([
  'start date',
  'end date',
  'graduation date',
  'degree',
  'major',
  'field of study',
  'school',
  'university',
  'college',
  'institution',
  'company',
  'title',
  'job title',
  'gpa',
]);

function isAmbiguousDuplicate(field: FieldDescriptor, allFields: FieldDescriptor[]): boolean {
  const label = normalize(field.label);
  const name = normalize(field.name ?? '');
  if (!AMBIGUOUS_LABELS.has(label) && !AMBIGUOUS_LABELS.has(name)) return false;

  const same = allFields.filter(
    (f) => normalize(f.label) === label || (name && normalize(f.name ?? '') === name),
  );
  if (same.length <= 1) return false;

  const sections = new Set(same.map((f) => normalize(f.section ?? '')));
  return sections.size > 1 || same.length > 1;
}

export interface MatchOptions {
  allFields?: FieldDescriptor[];
}

/**
 * Match a single field against the profile.
 */
export function matchField(
  field: FieldDescriptor,
  profile: Profile,
  options: MatchOptions = {},
): FieldMatch {
  const text = haystack(field);
  const allFields = options.allFields ?? [field];

  if (isSensitive(text) || isSensitive(field.label)) {
    return skipMatch(field.id, 'Sensitive question — left for manual entry', {
      sensitive: true,
    });
  }

  if (isDesiredLocation(text)) {
    return skipMatch(field.id, 'Desired/preferred location is not current location');
  }

  if (field.kind === 'file' || field.kind === 'other') {
    return skipMatch(field.id, `Unsupported field kind: ${field.kind}`);
  }

  if (isAmbiguousDuplicate(field, allFields)) {
    const section = normalize(field.section ?? '');
    const isFirstEducation =
      section.includes('education') &&
      !section.includes('2') &&
      !section.includes('second') &&
      !section.includes('additional') &&
      !section.includes('experience') &&
      !section.includes('employment');

    if (!isFirstEducation) {
      return {
        fieldId: field.id,
        profileKey: null,
        confidence: 0.8,
        decision: 'review',
        sensitive: false,
        reason: 'Duplicate label across sections — needs review',
      };
    }
  }

  // Autocomplete hint (high confidence)
  if (field.autocomplete && AUTOCOMPLETE_MAP[field.autocomplete]) {
    const key = AUTOCOMPLETE_MAP[field.autocomplete]!;
    const value = getProfileValue(profile, key);
    if (!value) {
      return skipMatch(field.id, `Matched ${key} via autocomplete but profile value is empty`, {
        profileKey: key,
      });
    }
    return {
      fieldId: field.id,
      profileKey: key,
      confidence: 0.98,
      decision: 'fill',
      sensitive: false,
      reason: `autocomplete="${field.autocomplete}" → ${key}`,
    };
  }

  let best: { key: ProfileFieldKey; score: number; alias: string } | null = null;

  for (const [key, aliases] of Object.entries(FIELD_ALIASES) as [ProfileFieldKey, string[]][]) {
    for (const alias of aliases) {
      const score = scoreAliasHit(text, alias);
      if (score > 0 && (!best || score > best.score)) {
        best = { key, score, alias };
      }
    }
  }

  // Prefer specific name fields over bare "name" / fullName when first/last also match
  if (best?.key === 'personal.fullName') {
    const firstScore = Math.max(
      ...FIELD_ALIASES['personal.firstName'].map((a) => scoreAliasHit(text, a)),
    );
    const lastScore = Math.max(
      ...FIELD_ALIASES['personal.lastName'].map((a) => scoreAliasHit(text, a)),
    );
    if (firstScore >= 0.93 || lastScore >= 0.93) {
      best =
        firstScore >= lastScore
          ? { key: 'personal.firstName', score: firstScore, alias: 'first name' }
          : { key: 'personal.lastName', score: lastScore, alias: 'last name' };
    }
  }

  if (!best) {
    return skipMatch(field.id, 'No confident match');
  }

  if (best.key === 'personal.location' && /desired|preferred|willing/.test(text)) {
    return skipMatch(field.id, 'Desired/preferred location is not current location');
  }

  const value = getProfileValue(profile, best.key);
  if (!value) {
    return skipMatch(field.id, `Matched ${best.key} but profile value is empty`, {
      profileKey: best.key,
    });
  }

  const decision = decisionFromConfidence(best.score);
  return {
    fieldId: field.id,
    profileKey: best.key,
    confidence: best.score,
    decision,
    sensitive: false,
    reason: `Matched alias "${best.alias}" → ${best.key}`,
  };
}

export function matchFields(fields: FieldDescriptor[], profile: Profile): FieldMatch[] {
  return fields.map((f) => matchField(f, profile, { allFields: fields }));
}
