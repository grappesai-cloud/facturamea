// Server-side PDF render. Spins up a headless Chromium (via @sparticuz/chromium
// + puppeteer-core) on Vercel, navigates it to the in-app /print page with a
// short-lived cookie so it can read the authenticated session, and returns
// the resulting PDF inline.
//
// The print page itself (/app/facturare/[id]/print) is the source of truth
// for layout — both the manual "Print / Save as PDF" button in the browser
// and this endpoint render the same HTML.
import type { APIRoute } from 'astro';
import { db } from '../../../../../db';
import { transportInvoices } from '../../../../../db/schema';
import { eq } from 'drizzle-orm';
import { captureError } from '../../../../../lib/observability';

export const prerender = false;
export const config = { runtime: 'nodejs', maxDuration: 60 } as const;

// Each render launches a full Chromium. On the single Coolify container a handful
// of concurrent downloads OOM-kill the process, so cap concurrency and shed load
// with a 429 instead of crashing the whole app.
let activePdfRenders = 0;
const MAX_PDF_CONCURRENCY = Number(process.env.PDF_MAX_CONCURRENCY) || 2;

export const GET: APIRoute = async ({ params, locals, request }) => {
  if (!locals.user?.companyId) return new Response('Unauthorized', { status: 401 });
  const invoiceId = params.id as string;

  const [inv] = await db.select().from(transportInvoices).where(eq(transportInvoices.id, invoiceId)).limit(1);
  if (!inv || inv.companyId !== locals.user.companyId) return new Response('Not found', { status: 404 });

  if (activePdfRenders >= MAX_PDF_CONCURRENCY) {
    return new Response('Prea multe descărcări PDF simultane. Reîncearcă în câteva secunde.', { status: 429, headers: { 'Retry-After': '5' } });
  }

  // Resolve the URL of the print page on the same host so cookies pass through
  const url = new URL(request.url);
  const printUrl = `${url.origin}/app/facturare/${invoiceId}/print`;
  const cookieHeader = request.headers.get('cookie') || '';

  let browser: any = null;
  // Increment INSIDE the try so the finally always decrements even if the lazy
  // chromium/puppeteer import throws (otherwise the slot leaks → permanent 429).
  activePdfRenders++;
  try {
    // Heavy deps loaded lazily so they don't bloat unrelated functions
    const chromium = (await import('@sparticuz/chromium')).default;
    const puppeteer = (await import('puppeteer-core')).default;
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1240, height: 1754 }, // A4 @ 150 DPI
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    const page = await browser.newPage();
    if (cookieHeader) {
      // Parse the cookie header and feed it into the headless browser
      const parsed = cookieHeader.split(';').map((p) => {
        const [name, ...rest] = p.trim().split('=');
        return { name: name.trim(), value: rest.join('='), domain: url.hostname, path: '/' };
      }).filter((c) => c.name);
      if (parsed.length) await page.setCookie(...parsed);
    }

    await page.goto(printUrl, { waitUntil: 'networkidle0', timeout: 30000 });
    // Hide the no-print toolbar before printing
    await page.addStyleTag({ content: '.no-print { display: none !important; }' });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' },
    });

    return new Response(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${inv.fullNumber}.pdf"`,
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (err) {
    await captureError(err, {
      userId: locals.user.id,
      companyId: locals.user.companyId,
      route: '/api/invoicing/invoices/[id]/pdf',
      method: 'GET',
      extra: { invoiceId },
    });
    // Don't dead-end the user if Chromium fails — fall back to the printable
    // page so they can still "Save as PDF" from the browser.
    return new Response(null, { status: 302, headers: { Location: printUrl } });
  } finally {
    if (browser) await browser.close().catch(() => {});
    activePdfRenders--;
  }
};
