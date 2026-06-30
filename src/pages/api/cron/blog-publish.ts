// Blog publishing for the Claude Code (terminal) generator. This endpoint NEVER
// calls Claude — generation happens locally via the `claude` CLI on the user's
// subscription. Flow:
//   GET  → returns the next topic's ready-to-run prompt (curated queue, then fresh).
//   POST → { raw } the CLI output; parsed + stored + submitted to IndexNow.
// Guarded by CRON_SECRET (middleware exempts /api/cron/*).
import type { APIRoute } from 'astro';
import { db, blogPosts } from '../../../db';
import { sql, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { isCronAuthorized } from '../../../lib/cron-auth';
import { BLOG_TOPICS } from '../../../lib/blog-topics';
import { buildArticlePrompt, parseArticle } from '../../../lib/blog-generate';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

async function ensureTable() {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS blog_posts (
    id text PRIMARY KEY,
    slug varchar(200) UNIQUE NOT NULL,
    title varchar(300) NOT NULL,
    description varchar(400) NOT NULL,
    keywords text,
    category varchar(60),
    body_html text NOT NULL,
    read_minutes integer DEFAULT 5,
    status varchar(16) NOT NULL DEFAULT 'published',
    published_at timestamp DEFAULT now(),
    created_at timestamp DEFAULT now()
  )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_blog_status_pub ON blog_posts (status, published_at)`);
}

export const GET: APIRoute = async ({ request }) => {
  if (!isCronAuthorized(request)) return json({ error: 'Neautorizat' }, 401);
  await ensureTable();
  const existing = await db.select({ slug: blogPosts.slug }).from(blogPosts);
  const used = new Set(existing.map((r) => r.slug));
  const topic = BLOG_TOPICS.find((t) => !used.has(t.slug)) || null;
  return json({ ok: true, mode: topic ? 'curated' : 'fresh', prompt: buildArticlePrompt(topic, [...used]) });
};

export const POST: APIRoute = async ({ request }) => {
  if (!isCronAuthorized(request)) return json({ error: 'Neautorizat' }, 401);
  await ensureTable();

  const body = (await request.json().catch(() => ({}))) as { raw?: string };
  const raw = String(body?.raw || '');
  if (raw.length < 200) return json({ ok: false, error: 'Text lipsă sau prea scurt.' }, 400);

  const a = parseArticle(raw);
  if (!a.slug || !a.title || a.bodyHtml.length < 200) {
    return json({ ok: false, error: 'Articol invalid (slug/titlu/corp lipsă).', parsed: { slug: a.slug, title: a.title, bodyLen: a.bodyHtml.length } }, 400);
  }

  const [dup] = await db.select({ slug: blogPosts.slug }).from(blogPosts).where(eq(blogPosts.slug, a.slug)).limit(1);
  if (dup) return json({ ok: true, skipped: 'exists', slug: a.slug });

  await db.insert(blogPosts).values({
    id: nanoid(), slug: a.slug, title: a.title,
    description: a.description || a.title.slice(0, 150),
    keywords: a.keywords, category: a.category, bodyHtml: a.bodyHtml,
    readMinutes: a.readMinutes, status: 'published',
  } as any);

  // Submit the new URL to IndexNow (Bing/Yandex/Seznam).
  const url = `https://facturamea.com/blog/${a.slug}`;
  let indexnow = 0;
  try {
    const r = await fetch(`https://api.indexnow.org/indexnow?url=${encodeURIComponent(url)}&key=f8e3a1c7b94d2e6f05a8c3b1d7e09f42`);
    indexnow = r.status;
  } catch { /* best effort */ }

  const words = a.bodyHtml.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  return json({ ok: true, published: { slug: a.slug, title: a.title, words, readMinutes: a.readMinutes, indexnow } });
};
