import { browser } from 'wxt/browser';
import { parseProfile, type Profile, type ProfileFieldError } from './schema';

export const PROFILE_STORAGE_KEY = 'profile';

export type LoadProfileResult =
  | { status: 'none' }
  | { status: 'ok'; profile: Profile }
  /** Stored data exists but fails validation. Never returned as partial data. */
  | { status: 'invalid'; errors: ProfileFieldError[]; raw: unknown };

export type SaveProfileResult =
  | { ok: true; profile: Profile }
  | { ok: false; errors: ProfileFieldError[] };

export async function loadProfile(): Promise<LoadProfileResult> {
  const stored = await browser.storage.local.get(PROFILE_STORAGE_KEY);
  const raw: unknown = stored[PROFILE_STORAGE_KEY];
  if (raw === undefined || raw === null) return { status: 'none' };

  const parsed = parseProfile(raw);
  return parsed.ok
    ? { status: 'ok', profile: parsed.profile }
    : { status: 'invalid', errors: parsed.errors, raw };
}

/** Validates first; nothing is written if validation fails. Stamps meta.updatedAt. */
export async function saveProfile(input: unknown, now: Date = new Date()): Promise<SaveProfileResult> {
  const stamped =
    input && typeof input === 'object'
      ? { ...(input as Record<string, unknown>), meta: { updatedAt: now.toISOString() } }
      : input;

  const parsed = parseProfile(stamped);
  if (!parsed.ok) return parsed;

  await browser.storage.local.set({ [PROFILE_STORAGE_KEY]: parsed.profile });
  return { ok: true, profile: parsed.profile };
}

export async function clearProfile(): Promise<void> {
  await browser.storage.local.remove(PROFILE_STORAGE_KEY);
}
