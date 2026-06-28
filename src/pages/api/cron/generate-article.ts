// Daily auto-publish: generates ONE SEO blog article and publishes it.
// Self-provisions the blog_posts table (idempotent). Guarded by CRON_SECRET.
// Schedule on Coolify as a daily task hitting this endpoint.
import type { APIRoute } from 'astro';
import { db, blogPosts } from '../../../db';
import { sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { isCronAuthorized } from '../../../lib/cron-auth';
import { BLOG_TOPICS, type BlogTopic } from '../../../lib/blog-topics';
import { generateArticle, proposeFreshTopic } from '../../../lib/blog-generate';

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

// Article generation takes ~100s (Claude + IndexNow). The Coolify scheduled task
// uses a short-lived `node -e fetch(...)` and the proxy in front closes long-held
// connections well under that, so awaiting the whole job here made the daily cron
// die mid-run. Default behaviour is now fire-and-forget: respond 202 immediately
// and run the work in the background. Pass `?wait=1` to await the result (manual runs).
let inFlight = false;

async function publishOneArticle() {
  await ensureTable();

  const existing = await db.select({ slug: blogPosts.slug }).from(blogPosts);
  const usedSlugs = new Set(existing.map((r) => r.slug));

  // Next curated topic not yet published; otherwise ask Claude for a fresh one.
  let topic: BlogTopic | undefined = BLOG_TOPICS.find((t) => !usedSlugs.has(t.slug));
  if (!topic) {
    topic = await proposeFreshTopic([...usedSlugs]);
    if (usedSlugs.has(topic.slug)) topic.slug = `${topic.slug}-${existing.length + 1}`;
  }

  const article = await generateArticle(topic);
  const id = nanoid();
  await db.insert(blogPosts).values({
    id, slug: topic.slug, title: article.title, description: article.description,
    keywords: article.keywords, category: topic.category, bodyHtml: article.bodyHtml,
    readMinutes: article.readMinutes, status: 'published',
  } as any);

  // Auto-submit the new URL to search engines via IndexNow (Bing/Yandex/Seznam).
  const url = `https://facturamea.com/blog/${topic.slug}`;
  let indexnow = 0;
  try {
    const r = await fetch(`https://api.indexnow.org/indexnow?url=${encodeURIComponent(url)}&key=f8e3a1c7b94d2e6f05a8c3b1d7e09f42`);
    indexnow = r.status;
  } catch { /* best effort */ }

  const words = article.bodyHtml.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  return { slug: topic.slug, title: article.title, words, indexnow };
}

export const GET: APIRoute = async ({ request }) => {
  if (!isCronAuthorized(request)) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });

  const wait = new URL(request.url).searchParams.get('wait') === '1';

  if (wait) {
    // Synchronous path for manual runs / debugging.
    try {
      const published = await publishOneArticle();
      return new Response(JSON.stringify({ ok: true, published }, null, 2), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    } catch (e: any) {
      console.error('generate-article failed:', e);
      return new Response(JSON.stringify({
        ok: false,
        error: String(e?.message || e).slice(0, 200),
        cause: String(e?.cause?.message || e?.cause || '').slice(0, 300),
        detail: String(e?.cause?.detail || e?.cause?.constraint || e?.cause?.code || ''),
      }), { status: 500 });
    }
  }

  // Default: fire-and-forget so the scheduled task returns instantly and isn't
  // killed by the proxy/task timeout while the ~100s generation runs.
  if (inFlight) {
    return new Response(JSON.stringify({ ok: true, accepted: false, reason: 'already running' }), {
      status: 202, headers: { 'Content-Type': 'application/json' },
    });
  }
  inFlight = true;
  publishOneArticle()
    .then((p) => console.log('generate-article published:', p.slug))
    .catch((e) => console.error('generate-article failed:', e))
    .finally(() => { inFlight = false; });

  return new Response(JSON.stringify({ ok: true, accepted: true }), {
    status: 202, headers: { 'Content-Type': 'application/json' },
  });
};
