import { describe, expect, it } from 'vitest';
import { createEmptyProfile, parseProfile } from '../../src/profile/schema';
import { getProfileValue } from '../../src/profile/values';

function validInput() {
  const profile = createEmptyProfile(new Date('2026-01-01T00:00:00Z'));
  profile.personal.firstName = 'Ada';
  profile.personal.lastName = 'Lovelace';
  profile.personal.email = 'ada@example.com';
  profile.personal.location = 'London, UK';
  profile.links!.linkedin = 'https://www.linkedin.com/in/ada';
  profile.education = [{ school: 'University of London', degree: 'BSc' }];
  return profile;
}

describe('profileSchema', () => {
  it('accepts a valid profile and applies defaults', () => {
    const result = parseProfile(validInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.education[0]?.fieldOfStudy).toBe('');
    expect(result.profile.answers).toEqual({});
    expect(getProfileValue(result.profile, 'personal.fullName')).toBe('Ada Lovelace');
    expect(getProfileValue(result.profile, 'education.0.school')).toBe('University of London');
  });

  it('accepts a minimal profile with optional sections omitted', () => {
    const result = parseProfile({
      version: 1,
      personal: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
      meta: { updatedAt: '2026-01-01T00:00:00.000Z' },
    });
    expect(result.ok).toBe(true);
  });

  it('rejects an invalid profile with field-level paths', () => {
    const input = validInput();
    input.personal.email = 'not-an-email';
    input.personal.firstName = '';
    input.links!.github = 'github.com/ada';
    const result = parseProfile(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const paths = result.errors.map((e) => e.path);
    expect(paths).toEqual(expect.arrayContaining(['personal.email', 'personal.firstName', 'links.github']));
  });

  it('rejects the wrong version', () => {
    const result = parseProfile({ ...validInput(), version: 2 });
    expect(result.ok).toBe(false);
  });
});
