const MOBILE_NUMBER_PATTERN = /^\+?[0-9]{10,15}$/;

export function normalizeMobileNumberInput(value: string): string {
  const trimmedStart = value.trimStart();
  const prefix = trimmedStart.startsWith('+') ? '+' : '';
  const digits = value.replace(/\D/g, '').slice(0, 15);
  return `${prefix}${digits}`;
}

export function isValidMobileNumber(value: string): boolean {
  return MOBILE_NUMBER_PATTERN.test(value);
}
