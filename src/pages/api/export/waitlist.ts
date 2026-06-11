import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { waitlistSignups } from '../../../db/schema';
import { asc } from 'drizzle-orm';
import { toCsv, csvResponse } from '../../../lib/csv';

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user?.isAdmin) {
    return new Response(JSON.stringify({ error: 'Acces interzis' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rows = await db
    .select()
    .from(waitlistSignups)
    .orderBy(asc(waitlistSignups.createdAt));

  const mapped = rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone ?? '',
    company_name: r.companyName ?? '',
    company_type: r.companyType,
    accepted_tc: r.acceptedTc ? 'da' : 'nu',
    accepted_gdpr: r.acceptedGdpr ? 'da' : 'nu',
    thank_you_sent: r.thankYouSentAt ? new Date(r.thankYouSentAt).toISOString() : '',
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : '',
    ip_address: r.ipAddress ?? '',
  }));

  const csv = toCsv(mapped, [
    'id', 'name', 'email', 'phone', 'company_name', 'company_type',
    'accepted_tc', 'accepted_gdpr', 'thank_you_sent', 'created_at', 'ip_address',
  ]);

  return csvResponse(`waitlist_${new Date().toISOString().slice(0, 10)}.csv`, csv);
};
