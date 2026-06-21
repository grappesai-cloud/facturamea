import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { users } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { NAV_MODULES } from '../../../lib/nav-modules';

// Valid module keys a user may pin to the dashboard (exclude the primary "emite"
// tile — it's always shown as the big button — and settings/import which live in menus).
const ALLOWED = new Set(
  NAV_MODULES.filter((m) => !m.primary && m.key !== 'setari' && m.key !== 'import').map((m) => m.key),
);

function parse(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((k) => typeof k === 'string' && ALLOWED.has(k)) : [];
  } catch {
    return [];
  }
}

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  }
  try {
    const [row] = await db
      .select({ dashboardModules: users.dashboardModules })
      .from(users)
      .where(eq(users.id, locals.user.id));
    return new Response(JSON.stringify({ modules: parse(row?.dashboardModules) }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la încărcare' }), { status: 500 });
  }
};

export const PUT: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  }
  try {
    const body = await request.json();
    const incoming: unknown = body?.modules;
    if (!Array.isArray(incoming)) {
      return new Response(JSON.stringify({ error: 'Format invalid' }), { status: 400 });
    }
    // De-dupe, keep order, drop unknown keys, cap to a sane maximum.
    const seen = new Set<string>();
    const clean: string[] = [];
    for (const k of incoming) {
      if (typeof k === 'string' && ALLOWED.has(k) && !seen.has(k)) {
        seen.add(k);
        clean.push(k);
        if (clean.length >= 24) break;
      }
    }

    await db
      .update(users)
      .set({ dashboardModules: JSON.stringify(clean), updatedAt: new Date() })
      .where(eq(users.id, locals.user.id));

    return new Response(JSON.stringify({ success: true, modules: clean }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la salvare' }), { status: 500 });
  }
};
