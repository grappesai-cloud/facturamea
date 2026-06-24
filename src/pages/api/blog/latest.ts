// Latest published blog posts — used by the landing-page preview island.
import type { APIRoute } from 'astro';
import { db, blogPosts } from '../../../db';
import { eq, desc } from 'drizzle-orm';

export const GET: APIRoute = async ({ url }) => {
  const limit = Math.min(6, Math.max(1, Number(url.searchParams.get('limit')) || 3));
  try {
    const rows = await db.select({
      slug: blogPosts.slug, title: blogPosts.title, description: blogPosts.description,
      category: blogPosts.category, readMinutes: blogPosts.readMinutes, publishedAt: blogPosts.publishedAt,
    }).from(blogPosts).where(eq(blogPosts.status, 'published')).orderBy(desc(blogPosts.publishedAt)).limit(limit);
    return new Response(JSON.stringify({ posts: rows }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=600, s-maxage=600' },
    });
  } catch {
    return new Response(JSON.stringify({ posts: [] }), { headers: { 'Content-Type': 'application/json' } });
  }
};
