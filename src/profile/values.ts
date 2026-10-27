import type { ProfileFieldKey } from '../shared/types';
import type { Profile } from './schema';

/** Resolves a fillable profile key to its string value. Returns '' when unset. */
export function getProfileValue(profile: Profile, key: ProfileFieldKey): string {
  if (key === 'personal.fullName') {
    return [profile.personal.firstName, profile.personal.lastName].filter(Boolean).join(' ').trim();
  }

  const [group, second, third] = key.split('.') as [string, string, string | undefined];
  if (group === 'personal') return profile.personal[second as keyof Profile['personal']] ?? '';
  if (group === 'links') return profile.links[second as keyof Profile['links']] ?? '';
  if (group === 'education') {
    const entry = profile.education[Number(second)];
    return entry ? (entry[third as keyof typeof entry] ?? '') : '';
  }
  return '';
}
