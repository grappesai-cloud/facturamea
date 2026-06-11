import ro from '../i18n/ro.json';
import en from '../i18n/en.json';

export type Locale = 'ro' | 'en';

const dicts: Record<Locale, any> = { ro, en };

export const LOCALES: { code: Locale; label: string; flag: string }[] = [
  { code: 'ro', label: 'Română', flag: '🇷🇴' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
];

export function getLocaleFromCookie(cookieHeader: string | null | undefined): Locale {
  if (!cookieHeader) return 'ro';
  const m = cookieHeader.match(/(?:^|;\s*)th-locale=(\w+)/);
  return m && (m[1] === 'en' || m[1] === 'ro') ? m[1] as Locale : 'ro';
}

export function t(locale: Locale, key: string, fallback?: string): string {
  const path = key.split('.');
  let v: any = dicts[locale];
  for (const p of path) v = v?.[p];
  if (typeof v === 'string') return v;
  // Fallback to RO if missing in target
  if (locale !== 'ro') {
    let f: any = dicts.ro;
    for (const p of path) f = f?.[p];
    if (typeof f === 'string') return f;
  }
  return fallback ?? key;
}

// Helper that creates a bound t function for a given locale.
export function tFn(locale: Locale) {
  return (key: string, fallback?: string) => t(locale, key, fallback);
}

// Get raw value (any type — string, array, object) from the dict path.
export function tRaw<T = unknown>(locale: Locale, key: string): T | undefined {
  const path = key.split('.');
  let v: any = dicts[locale];
  for (const p of path) v = v?.[p];
  if (v !== undefined) return v as T;
  if (locale !== 'ro') {
    let f: any = dicts.ro;
    for (const p of path) f = f?.[p];
    if (f !== undefined) return f as T;
  }
  return undefined;
}
