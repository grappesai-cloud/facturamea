// Allowed frontend origins for CORS + OAuth token handoff.
const env = (k: string) => (import.meta as any).env?.[k] ?? process.env[k] ?? '';

export const FE_ORIGINS = env('FRONTEND_ORIGINS').split(',').map((s: string) => s.trim()).filter(Boolean);
export const DEV_ORIGINS = ['http://localhost:4321', 'http://localhost:4322', 'http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:4321'];
export const FE_SUFFIXES = (env('FRONTEND_ORIGIN_SUFFIXES') || '-grappesai-2100s-projects.vercel.app')
  .split(',').map((s: string) => s.trim()).filter(Boolean);

export function isAllowedFeOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  if (FE_ORIGINS.includes('*')) return true;
  if (FE_ORIGINS.includes(origin) || DEV_ORIGINS.includes(origin)) return true;
  try {
    const u = new URL(origin);
    if ((u.protocol === 'https:' || u.protocol === 'http:') && FE_SUFFIXES.some((s: string) => u.host.endsWith(s))) return true;
  } catch {}
  return false;
}

// Validate a full redirect URL: its origin must be an allowed FE origin.
export function isAllowedFeRedirect(url: string | null | undefined): boolean {
  if (!url) return false;
  try { return isAllowedFeOrigin(new URL(url).origin); } catch { return false; }
}
