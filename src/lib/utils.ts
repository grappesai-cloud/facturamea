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

/** Round a numeric value to N decimals, strip trailing zeros. */
export function fmtNum(n: number | string | null | undefined, decimals = 2): string {
  if (n === null || n === undefined || n === '') return '—';
  const v = typeof n === 'string' ? parseFloat(n) : n;
  if (!isFinite(v)) return '—';
  return String(Number(v.toFixed(decimals)));
}
