import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { companies } from '../../../db/schema';
import { eq } from 'drizzle-orm';

export const PUT: APIRoute = async ({ request, locals }) => {
  const user = locals.user as any;
  if (!user?.isAdmin && user?.userType !== 'admin') {
    return new Response(JSON.stringify({ error: 'Acces interzis' }), { status: 403 });
  }

  try {
    const { companyId, action } = await request.json();

    if (action === 'verify') {
      await db.update(companies).set({ isVerified: true }).where(eq(companies.id, companyId));
    } else if (action === 'unverify') {
      await db.update(companies).set({ isVerified: false }).where(eq(companies.id, companyId));
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare' }), { status: 500 });
  }
};
