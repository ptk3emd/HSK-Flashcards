import { UserProfile } from '../types/card';

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Reads the display profile the sign-up screen stored in the account metadata.
 * Incomplete metadata (accounts created before this screen) reads as null.
 */
export function parseUserProfile(metadata: unknown): UserProfile | null {
  if (typeof metadata !== 'object' || metadata === null) return null;
  const source = metadata as Record<string, unknown>;
  const name = text(source.full_name);
  const country = text(source.country);
  const birthDate = text(source.birth_date);
  if (!name || !country || !birthDate) return null;
  return { name, country, birthDate };
}
