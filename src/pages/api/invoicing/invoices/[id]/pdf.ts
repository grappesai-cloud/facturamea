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

export const prerender = false;
export const config = { runtime: 'nodejs', maxDuration: 60 } as const;

export const GET: APIRoute = async ({ params, locals, request, cookies }) => {
  if (!locals.user?.companyId) return new Response('Unauthorized', { status: 401 });
  const invoiceId = params.id as string;

  const [inv] = await db.select().from(transportInvoices).where(eq(transportInvoices.id, invoiceId)).limit(1);
  if (!inv || inv.companyId !== locals.user.companyId) return new Response('Not found', { status: 404 });

  // Resolve the URL of the print page on the same host so cookies pass through
  const url = new URL(request.url);
  const printUrl = `${url.origin}/app/facturare/${invoiceId}/print`;

  // Forward the user's session cookie to Puppeteer so it can render the
  // authenticated page. We pass every cookie the browser sent us — the
  // session lib decides which ones it actually needs.
  const cookieHeader = request.headers.get('cookie') || '';

  // Heavy deps loaded lazily so they don't bloat unrelated functions
  const chromium = (await import('@sparticuz/chromium')).default;
  const puppeteer = (await import('puppeteer-core')).default;

  let browser: any = null;
  try {
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
  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'PDF generation failed', detail: err?.message || String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
};
