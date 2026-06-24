import { useEffect, useState } from 'react';

interface Post { slug: string; title: string; description: string; category: string | null; readMinutes: number | null; publishedAt: string | null }

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Bucharest' }) : '';

export default function BlogPreview() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  useEffect(() => {
    fetch('/api/blog/latest?limit=10')
      .then((r) => (r.ok ? r.json() : { posts: [] }))
      .then((d) => setPosts(d.posts || []))
      .catch(() => setPosts([]));
  }, []);

  // Skeleton while loading so the band keeps its height (client:load hydrates
  // immediately; we never rely on the element being scrolled into view).
  if (posts === null) {
    return (
      <div className="flex gap-5 overflow-hidden">
        {[0, 1, 2].map((i) => (
          <div key={i} className="shrink-0 w-[300px] sm:w-[340px] h-[150px] rounded-2xl bg-black/[0.04] animate-pulse" />
        ))}
      </div>
    );
  }
  if (posts.length === 0) {
    return <div className="text-[#7C9AB4] text-[14px]">Primele articole apar în curând.</div>;
  }

  return (
    <div className="-mx-4 sm:mx-0 px-4 sm:px-0 flex gap-5 overflow-x-auto snap-x snap-mandatory pb-2 [scrollbar-width:thin]">
      {posts.map((p) => (
        <a key={p.slug} href={`/blog/${p.slug}`}
          className="snap-start shrink-0 w-[300px] sm:w-[340px] block p-6 rounded-2xl bg-white ring-1 ring-black/[0.06] hover:ring-[#34A0A4]/40 hover:shadow-[0_12px_40px_-18px_rgba(10,34,56,0.25)] transition-all">
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
