import type { APIRoute } from 'astro';
import { db } from '../../../db';
import {
  users, companies, freight, availableTrucks, auctions, auctionBids,
  freightBids, orders, incidents, ratings, notifications, messages,
  forumThreads, forumReplies, companyDocuments,
  companyLicenses, companyBadges, classifieds, savedRoutes,
  freightFavorites, truckFavorites, companyFavorites,
  companyBlacklist, drivers, driverCertificates, invoiceGuarantees,
  creditTransactions, invoices, subscriptions, auditLog,
} from '../../../db/schema';
import { eq, or, inArray } from 'drizzle-orm';
import { logAction } from '../../../lib/audit';
import { verifyPassword } from '../../../lib/auth';
import { rateLimitAsync, getClientIp } from '../../../lib/security';

// GDPR Article 20 — right to data portability.
// Returns the full set of user-related rows as a JSON document.
// Requires the user's current password in the request body — protects
// against session-cookie theft auto-exfiltrating everything in one click.
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  }

  // Rate-limit: max 3 exports per user per hour
  const rl = await rateLimitAsync(`gdpr-export:${locals.user.id}`, 3, 60 * 60 * 1000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({
      error: `Prea multe export-uri. Aşteaptă ${Math.ceil(rl.resetIn / 60_000)} minute.`,
    }), { status: 429 });
  }

  // Re-authenticate via password to prevent stolen-session exfiltration
  let body: any;
  try { body = await request.json(); } catch { body = {}; }
  if (!body.password || typeof body.password !== 'string') {
    return new Response(JSON.stringify({
      error: 'Parola este obligatorie pentru export. POST { "password": "..." }',
    }), { status: 400 });
  }
  const [u] = await db.select({ hashedPassword: users.hashedPassword })
    .from(users).where(eq(users.id, locals.user.id));
  if (!u || !(await verifyPassword(body.password, u.hashedPassword))) {
    return new Response(JSON.stringify({ error: 'Parolă incorectă' }), { status: 401 });
  }

  const userId = locals.user.id;
  const companyId = locals.user.companyId;

  async function safe<T>(p: Promise<T>): Promise<T | null> {
    try { return await p; } catch { return null; }
  }

  const noCompany = Promise.resolve(null);

  const [
    me, company, myFreight, myTrucks, myAuctions, myAuctionBids,
    myFreightBids, ordersAsClient, ordersAsCarrier, myIncidents,
    myRatingsGiven, myRatingsReceived, myNotifications, myMessages,
    myForumThreads, myForumReplies, myDocs, myLicenses,
    myBadges, myClassifieds, mySavedRoutes,
    myFreightFavs, myTruckFavs, myCompanyFavs,
    myBlacklist, myDrivers, myCerts, myGuarantees, myCreditTx,
    myInvoices, mySubscriptions, myAuditLog,
  ] = await Promise.all([
    safe(db.select().from(users).where(eq(users.id, userId))),
    safe(companyId ? db.select().from(companies).where(eq(companies.id, companyId)) : noCompany),
    safe(companyId ? db.select().from(freight).where(eq(freight.companyId, companyId)) : noCompany),
    safe(companyId ? db.select().from(availableTrucks).where(eq(availableTrucks.companyId, companyId)) : noCompany),
    safe(companyId ? db.select().from(auctions).where(eq(auctions.companyId, companyId)) : noCompany),
    safe(db.select().from(auctionBids).where(eq(auctionBids.bidderUserId, userId))),
    safe(db.select().from(freightBids).where(eq(freightBids.bidderUserId, userId))),
    safe(db.select().from(orders).where(eq(orders.clientUserId, userId))),
    safe(db.select().from(orders).where(eq(orders.carrierUserId, userId))),
    safe(companyId ? db.select().from(incidents).where(or(eq(incidents.reporterCompanyId, companyId), eq(incidents.againstCompanyId, companyId))) : noCompany),
    safe(db.select().from(ratings).where(eq(ratings.fromUserId, userId))),
    safe(db.select().from(ratings).where(eq(ratings.toUserId, userId))),
    safe(db.select().from(notifications).where(eq(notifications.userId, userId))),
    safe(db.select().from(messages).where(eq(messages.senderUserId, userId))),
    safe(db.select().from(forumThreads).where(eq(forumThreads.userId, userId))),
    safe(db.select().from(forumReplies).where(eq(forumReplies.userId, userId))),
    safe(companyId ? db.select().from(companyDocuments).where(eq(companyDocuments.companyId, companyId)) : noCompany),
    safe(companyId ? db.select().from(companyLicenses).where(eq(companyLicenses.companyId, companyId)) : noCompany),
    safe(companyId ? db.select().from(companyBadges).where(eq(companyBadges.companyId, companyId)) : noCompany),
    safe(companyId ? db.select().from(classifieds).where(eq(classifieds.companyId, companyId)) : noCompany),
    safe(db.select().from(savedRoutes).where(eq(savedRoutes.userId, userId))),
    safe(db.select().from(freightFavorites).where(eq(freightFavorites.userId, userId))),
    safe(db.select().from(truckFavorites).where(eq(truckFavorites.userId, userId))),
    safe(db.select().from(companyFavorites).where(eq(companyFavorites.userId, userId))),
    safe(companyId ? db.select().from(companyBlacklist).where(eq(companyBlacklist.ownerCompanyId, companyId)) : noCompany),
    safe(companyId ? db.select().from(drivers).where(eq(drivers.companyId, companyId)) : noCompany),
    safe(companyId ? db.select().from(driverCertificates).where(
      inArray(driverCertificates.driverId, db.select({ id: drivers.id }).from(drivers).where(eq(drivers.companyId, companyId)))
    ) : noCompany),
    safe(companyId ? db.select().from(invoiceGuarantees).where(or(eq(invoiceGuarantees.buyerCompanyId, companyId), eq(invoiceGuarantees.payerCompanyId, companyId))) : noCompany),
    safe(companyId ? db.select().from(creditTransactions).where(eq(creditTransactions.companyId, companyId)) : noCompany),
    safe(companyId ? db.select().from(invoices).where(eq(invoices.companyId, companyId)) : noCompany),
    safe(companyId ? db.select().from(subscriptions).where(eq(subscriptions.companyId, companyId)) : noCompany),
    safe(db.select().from(auditLog).where(eq(auditLog.userId, userId))),
  ]);

  // Strip the password hash before exporting (it's a security artifact, not user data)
  const sanitizedMe = me?.[0] ? { ...me[0], hashedPassword: '[redacted]', totpSecret: '[redacted]', totpRecoveryCodes: '[redacted]' } : null;

  const payload = {
    exportedAt: new Date().toISOString(),
    schemaVersion: '1.0',
    subject: { userId, email: locals.user.email, name: locals.user.name },
    data: {
      account: sanitizedMe,
      company: company?.[0] || null,
      freight: myFreight, availableTrucks: myTrucks,
      auctions: myAuctions, auctionBids: myAuctionBids,
      freightBids: myFreightBids,
      ordersAsClient, ordersAsCarrier,
      incidents: myIncidents,
      ratingsGiven: myRatingsGiven, ratingsReceived: myRatingsReceived,
      notifications: myNotifications,
      messages: myMessages,
      forumThreads: myForumThreads, forumReplies: myForumReplies,
      companyDocuments: myDocs, companyLicenses: myLicenses,
      companyBadges: myBadges,
      classifieds: myClassifieds,
      savedRoutes: mySavedRoutes,
      favorites: { freight: myFreightFavs, trucks: myTruckFavs, companies: myCompanyFavs },
      blacklist: myBlacklist,
      drivers: myDrivers, driverCertificates: myCerts,
      invoiceGuarantees: myGuarantees,
      creditTransactions: myCreditTx,
      invoices: myInvoices, subscriptions: mySubscriptions,
      auditLog: myAuditLog,
    },
  };

  await logAction({
    userId, companyId, action: 'gdpr.export',
    entityType: 'user', entityId: userId, request,
  });

  const filename = `facturamea-data-${userId}-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
};
