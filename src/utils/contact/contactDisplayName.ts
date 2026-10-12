import { formatContactPhone } from './formatContactPhone';

const PHONE_ONLY = /^\+?[\d\s().-]{8,}$/;

/**
 * Name to show for a contact. A contact that was never registered carries its
 * phone number as the name; that number is shown formatted. Returns null when
 * there is neither a name nor a phone, so the caller picks the fallback text.
 */
export function contactDisplayName(
  name: string | null | undefined,
  phone?: string | null,
): string | null {
  const trimmed = name?.trim();
  if (!trimmed) return formatContactPhone(phone);
  return PHONE_ONLY.test(trimmed) ? formatContactPhone(trimmed) ?? trimmed : trimmed;
}
