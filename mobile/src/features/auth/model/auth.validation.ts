export const TR_MOBILE_E164_REGEX = /^\+905\d{9}$/;

/**
 * Normalizes user-entered Turkish mobile numbers (e.g., "0532 123 45 67", "5321234567", "+905321234567")
 * into strict E.164 format "+905XXXXXXXXX".
 */
export function normalizeTurkishPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('90') && digits.length === 12) {
    return `+${digits}`;
  }
  if (digits.startsWith('0') && digits.length === 11) {
    return `+90${digits.slice(1)}`;
  }
  if (digits.startsWith('5') && digits.length === 10) {
    return `+90${digits}`;
  }
  return `+${digits}`;
}

export function isValidTurkishMobile(raw: string): boolean {
  return TR_MOBILE_E164_REGEX.test(normalizeTurkishPhone(raw));
}

export function isValidOtpCode(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}

