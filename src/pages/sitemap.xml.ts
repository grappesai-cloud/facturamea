import type { APIRoute } from 'astro';
import { db, blogPosts } from '../db';
import { eq, desc } from 'drizzle-orm';

// Only public, indexable pages (auth/app/api are disallowed in robots.txt).
const STATIC_PATHS = [
  '', 'blog', 'termeni', 'confidentialitate',
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
    const priority = p === '' ? '1.0' : p === 'blog' ? '0.8' : '0.7';
    blocks.push(urlEntry(loc, today, priority));
  }

  // Auto-published blog articles (skip silently if the table doesn't exist yet).
  try {
    const posts = await db.select({ slug: blogPosts.slug, publishedAt: blogPosts.publishedAt })
      .from(blogPosts).where(eq(blogPosts.status, 'published')).orderBy(desc(blogPosts.publishedAt)).limit(1000);
    for (const post of posts) {
      const lastmod = post.publishedAt ? new Date(post.publishedAt).toISOString().slice(0, 10) : today;
      blocks.push(urlEntry(`${origin}/blog/${post.slug}`, lastmod, '0.7'));
    }
  } catch { /* table not provisioned yet */ }

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
