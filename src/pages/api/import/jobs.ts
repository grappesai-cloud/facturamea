import type { APIRoute } from 'astro';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../../db';
import { importJobs } from '../../../db/schema';

// List recent import jobs for the current company (most recent first).
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  }
  const companyId = locals.user.companyId;
  if (!companyId) {
    return new Response(JSON.stringify({ jobs: [] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const jobs = await db
      .select()
      .from(importJobs)
      .where(eq(importJobs.companyId, companyId))
      .orderBy(desc(importJobs.createdAt))
      .limit(25);
    return new Response(JSON.stringify({ jobs }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    // DB not provisioned — return an empty list rather than 500.
    console.error('import jobs list failed', err);
    return new Response(JSON.stringify({ jobs: [] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
