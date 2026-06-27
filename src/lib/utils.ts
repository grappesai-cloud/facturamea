import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Term to send to the freight/truck search API for a picked city/country.
 * The autocomplete's display value is "City, CC" (e.g. "Constanța, RO"), but
 * the DB stores the bare city name ("Constanța") in *_city_name and the ISO
 * code ("RO") in *_country. Sending the display string made the ILIKE
 * substring match fail, so search returned nothing. Emit the bare city name
 * (city pick) or the country code (id === -1 = country-only pick) instead.
 */
export function citySearchTerm(city: { id: number; name: string; countryCode: string } | null): string {
  if (!city) return '';
  return city.id === -1 ? city.countryCode : city.name;
}

/**
 * Validate a Romanian CUI/CIF using the official mod-11 control digit
 * (key 753217532). Accepts an optional "RO" prefix and surrounding spaces.
 * Returns false for clearly malformed values; used only for a soft client-side
 * warning — the backend remains the source of truth.
 */
export function isValidCui(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const digits = String(raw).replace(/^ro/i, '').replace(/\D/g, '');
  if (digits.length < 2 || digits.length > 10) return false;
  const control = Number(digits.slice(-1));
  const body = digits.slice(0, -1).padStart(9, '0');
  const key = '753217532';
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(body[i]) * Number(key[i]);
  let c = (sum * 10) % 11;
  if (c === 10) c = 0;
  return c === control;
}

/** Round a numeric value to N decimals, strip trailing zeros. */
export function fmtNum(n: number | string | null | undefined, decimals = 2): string {
  if (n === null || n === undefined || n === '') return '—';
  const v = typeof n === 'string' ? parseFloat(n) : n;
  if (!isFinite(v)) return '—';
  return String(Number(v.toFixed(decimals)));
}
