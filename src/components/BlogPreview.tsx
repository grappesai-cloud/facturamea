import { useEffect, useState } from 'react';

interface Post { slug: string; title: string; description: string; category: string | null; readMinutes: number | null; publishedAt: string | null }

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Bucharest' }) : '';

export default function BlogPreview() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  useEffect(() => {
    fetch('/api/blog/latest?limit=3')
      .then((r) => (r.ok ? r.json() : { posts: [] }))
      .then((d) => setPosts(d.posts || []))
      .catch(() => setPosts([]));
  }, []);

  // Hide the whole section until we have at least one article (avoids an empty band).
  if (!posts || posts.length === 0) return null;

  return (
    <div className="grid sm:grid-cols-3 gap-5">
      {posts.map((p) => (
        <a key={p.slug} href={`/blog/${p.slug}`}
          className="block p-6 rounded-2xl bg-white ring-1 ring-black/[0.06] hover:ring-[#34A0A4]/40 hover:shadow-[0_12px_40px_-18px_rgba(10,34,56,0.25)] transition-all">
          <div className="flex items-center gap-2 text-[12px] text-[#7C9AB4] mb-2">
            {p.category && <span className="px-2 py-0.5 rounded-full bg-[#E1FB15]/30 text-[#0A2238] font-semibold">{p.category}</span>}
            <span>{p.readMinutes} min</span>
          </div>
          <h3 className="text-[16px] font-bold text-[#0A2238] tracking-[-0.02em] mb-1.5 leading-snug line-clamp-2">{p.title}</h3>
          <p className="text-[13.5px] text-[#46627A] leading-relaxed line-clamp-2">{p.description}</p>
          <p className="text-[11px] text-[#9FB8CC] mt-3">{fmtDate(p.publishedAt)}</p>
        </a>
      ))}
    </div>
  );
}
