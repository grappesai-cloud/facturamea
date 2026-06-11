import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { orders, freight, users, companies, incidents } from '../../../db/schema';
import { sql, and, gte } from 'drizzle-orm';

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user?.isAdmin) {
    return new Response(JSON.stringify({ error: 'Acces interzis' }), { status: 403 });
  }

  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const since180 = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

  const [usersTotal] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(users);
  const [companiesTotal] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(companies);
  const [freightTotal] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(freight);
  const [ordersTotal] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(orders);
  const [incidentsTotal] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(incidents);

  const [usersNew30] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(users).where(gte(users.createdAt, since30));
  const [ordersNew30] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(orders).where(gte(orders.createdAt, since30));

  // Orders per month (last 6 months)
  const ordersPerMonth = await db.execute(sql`
    SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, COUNT(*)::int AS count
    FROM orders
    WHERE created_at >= ${since180}
    GROUP BY 1 ORDER BY 1 ASC
  `);

  // Top loading countries (last 30d)
  const topLoading = await db.execute(sql`
    SELECT loading_country AS country, COUNT(*)::int AS count
    FROM freight
    WHERE created_at >= ${since30}
    GROUP BY 1 ORDER BY count DESC LIMIT 8
  `);

  // Status breakdown for orders
  const orderStatuses = await db.execute(sql`
    SELECT status, COUNT(*)::int AS count FROM orders GROUP BY 1 ORDER BY count DESC
  `);

  return new Response(JSON.stringify({
    totals: {
      users: usersTotal?.count ?? 0,
      companies: companiesTotal?.count ?? 0,
      freight: freightTotal?.count ?? 0,
      orders: ordersTotal?.count ?? 0,
      incidents: incidentsTotal?.count ?? 0,
    },
    last30: {
      newUsers: usersNew30?.count ?? 0,
      newOrders: ordersNew30?.count ?? 0,
    },
    ordersPerMonth: (ordersPerMonth as any).rows ?? ordersPerMonth,
    topLoadingCountries: (topLoading as any).rows ?? topLoading,
    orderStatuses: (orderStatuses as any).rows ?? orderStatuses,
  }), { headers: { 'Content-Type': 'application/json' } });
};
