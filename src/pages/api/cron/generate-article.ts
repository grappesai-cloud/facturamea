// Daily auto-publish: generates ONE SEO blog article and publishes it.
// Self-provisions the blog_posts table (idempotent). Guarded by CRON_SECRET.
// Schedule on Coolify as a daily task hitting this endpoint.
import type { APIRoute } from 'astro';
import { db, blogPosts } from '../../../db';
import { sql, desc } from 'drizzle-orm';
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

export const GET: APIRoute = async ({ request }) => {
  if (!isCronAuthorized(request)) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  try {
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

    return new Response(JSON.stringify({ ok: true, published: { slug: topic.slug, title: article.title, words: article.bodyHtml.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length } }, null, 2), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('generate-article failed:', e);
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message) }), { status: 500 });
  }
};
