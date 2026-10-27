import { z } from 'zod';

const optionalText = z.string().trim().max(500).default('');

const optionalUrl = z
  .string()
  .trim()
  .default('')
  .refine((value) => value === '' || /^https?:\/\/\S+$/i.test(value), {
    message: 'Must be a full URL starting with http:// or https://',
  });

/** Free-text month/year, e.g. "2021-09" or "Sep 2021". Kept loose on purpose. */
const dateText = z.string().trim().max(50).default('');

export const personalSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().min(1, 'Last name is required').max(100),
  preferredName: optionalText,
  email: z.string().trim().email('Must be a valid email address'),
  phone: z
    .string()
    .trim()
    .default('')
    .refine((value) => value === '' || /^[+()\d\s.-]{7,25}$/.test(value), {
      message: 'Must be a phone number (digits, spaces, + ( ) . -)',
    }),
  /** "Current Location" free text, e.g. "Seattle, WA". Distinct from city/state/country. */
  location: optionalText,
  addressLine1: optionalText,
  addressLine2: optionalText,
  city: optionalText,
  state: optionalText,
  postalCode: optionalText,
  country: optionalText,
});

export const linksSchema = z.object({
  linkedin: optionalUrl,
  github: optionalUrl,
  portfolio: optionalUrl,
  website: optionalUrl,
});

export const educationEntrySchema = z.object({
  school: z.string().trim().min(1, 'School is required').max(200),
  degree: optionalText,
  fieldOfStudy: optionalText,
  startDate: dateText,
  endDate: dateText,
  gpa: optionalText,
});

export const experienceEntrySchema = z.object({
  company: z.string().trim().min(1, 'Company is required').max(200),
  title: optionalText,
  location: optionalText,
  startDate: dateText,
  endDate: dateText,
  current: z.boolean().default(false),
  description: z.string().trim().max(5000).default(''),
});

/**
 * Stored for later milestones. These map to sensitive questions and are never
 * autofilled in milestones 1-5 (see the matcher's sensitive denylist).
 */
export const answersSchema = z.object({
  authorizedToWorkInUS: z.boolean().optional(),
  requiresSponsorship: z.boolean().optional(),
  willingToRelocate: z.boolean().optional(),
  over18: z.boolean().optional(),
});

export const metaSchema = z.object({
  /** ISO 8601 timestamp of the last save. */
  updatedAt: z.string().datetime({ message: 'Must be an ISO 8601 timestamp' }),
});

export const profileSchema = z.object({
  version: z.literal(1),
  personal: personalSchema,
  links: linksSchema.default({ linkedin: '', github: '', portfolio: '', website: '' }),
  education: z.array(educationEntrySchema).default([]),
  experience: z.array(experienceEntrySchema).default([]),
  answers: answersSchema.default({}),
  meta: metaSchema,
});

export type Personal = z.infer<typeof personalSchema>;
export type Links = z.infer<typeof linksSchema>;
export type EducationEntry = z.infer<typeof educationEntrySchema>;
export type ExperienceEntry = z.infer<typeof experienceEntrySchema>;
export type Answers = z.infer<typeof answersSchema>;
export type ProfileMeta = z.infer<typeof metaSchema>;
/** A validated profile (defaults applied). */
export type Profile = z.infer<typeof profileSchema>;
/** Raw input accepted by the schema (optional fields may be missing). */
export type ProfileInput = z.input<typeof profileSchema>;

export interface ProfileFieldError {
  /** Dotted path, e.g. "personal.email" or "education.0.school". Empty string for root errors. */
  path: string;
  message: string;
}

export type ProfileParseResult =
  | { ok: true; profile: Profile }
  | { ok: false; errors: ProfileFieldError[] };

export function toFieldErrors(error: z.ZodError): ProfileFieldError[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

export function parseProfile(input: unknown): ProfileParseResult {
  const result = profileSchema.safeParse(input);
  return result.success
    ? { ok: true, profile: result.data }
    : { ok: false, errors: toFieldErrors(result.error) };
}

export function createEmptyProfile(now: Date = new Date()): ProfileInput {
  return {
    version: 1,
    personal: {
      firstName: '',
      lastName: '',
      preferredName: '',
      email: '',
      phone: '',
      location: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      postalCode: '',
      country: '',
    },
    links: { linkedin: '', github: '', portfolio: '', website: '' },
    education: [],
    experience: [],
    answers: {},
    meta: { updatedAt: now.toISOString() },
  };
}
