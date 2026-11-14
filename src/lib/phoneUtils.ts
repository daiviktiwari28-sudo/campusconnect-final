export interface PhoneValidationResult {
  valid: boolean;
  formatted: string;
  error?: string;
}

export function validatePhoneNumber(raw: string): PhoneValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      valid: false,
      formatted: '',
      error: 'Please enter your phone number so students can confirm pickups.',
    };
  }

  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length < 7 || digitsOnly.length > 15) {
    return {
      valid: false,
      formatted: '',
      error: 'Enter a valid phone number (7 to 15 digits).',
    };
  }

  let formatted = trimmed;
  if (digitsOnly.length === 10 && !trimmed.startsWith('+')) {
    formatted = `(${digitsOnly.slice(0, 3)}) ${digitsOnly.slice(3, 6)}-${digitsOnly.slice(6)}`;
  }

  if (formatted.length < 7 || formatted.length > 25) {
    return {
      valid: false,
      formatted: '',
      error: 'Phone number must be between 7 and 25 characters.',
    };
  }

  return {
    valid: true,
    formatted,
  };
}
