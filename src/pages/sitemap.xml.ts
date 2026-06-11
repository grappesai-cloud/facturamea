import type { APIRoute } from 'astro';

const STATIC_PATHS = [
  '', 'despre', 'contact', 'faq', 'asistenta', 'termeni', 'confidentialitate',
  'preturi', 'functii',
  'auth/login', 'auth/register',
];

function urlEntry(loc: string, lastmod: string, priority: string, changefreq = 'weekly') {
  return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

export const GET: APIRoute = async ({ site }) => {
  const origin = site?.toString().replace(/\/$/, '') ?? 'https://facturamea.com';
  const today = new Date().toISOString().slice(0, 10);

  const blocks: string[] = [];
  for (const p of STATIC_PATHS) {
    const loc = `${origin}/${p}`.replace(/\/$/, '') || origin;
    const priority = p === '' ? '1.0' : (p === 'preturi' || p === 'despre') ? '0.9' : '0.7';
    blocks.push(urlEntry(loc, today, priority));
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${blocks.join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
};
