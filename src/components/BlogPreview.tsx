import { useEffect, useRef, useState } from 'react';

interface Post { slug: string; title: string; description: string; category: string | null; readMinutes: number | null; publishedAt: string | null }

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Bucharest' }) : '';

export default function BlogPreview() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    fetch('/api/blog/latest?limit=10')
      .then((r) => (r.ok ? r.json() : { posts: [] }))
      .then((d) => setPosts(d.posts || []))
      .catch(() => setPosts([]));
  }, []);

  const updateArrows = () => {
    const el = scroller.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  };
  useEffect(() => { updateArrows(); }, [posts]);

  const scrollBy = (dir: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(680, el.clientWidth * 0.8), behavior: 'smooth' });
  };

  if (posts === null) {
    return (
      <div className="flex gap-5 overflow-hidden">
        {[0, 1, 2].map((i) => (
          <div key={i} className="shrink-0 w-[300px] sm:w-[340px] h-[150px] rounded-2xl bg-black/[0.04] animate-pulse" />
        ))}
      </div>
    );
  }
  if (posts.length === 0) return <div className="text-[#7C9AB4] text-[14px]">Primele articole apar în curând.</div>;

  const Arrow = ({ dir, disabled }: { dir: 1 | -1; disabled: boolean }) => (
    <button
      type="button"
      aria-label={dir === 1 ? 'Următoarele articole' : 'Articolele anterioare'}
      onClick={() => scrollBy(dir)}
      disabled={disabled}
      className={`absolute top-1/2 -translate-y-1/2 ${dir === 1 ? 'right-0 sm:-right-3' : 'left-0 sm:-left-3'} z-10 grid place-items-center w-11 h-11 rounded-full bg-white text-[#0A2238] shadow-[0_8px_24px_-8px_rgba(10,34,56,0.35)] ring-1 ring-black/[0.06] transition-opacity ${disabled ? 'opacity-0 pointer-events-none' : 'opacity-100 hover:bg-[#F5F8FB]'}`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        {dir === 1 ? <path d="M9 6l6 6-6 6" /> : <path d="M15 6l-6 6 6 6" />}
      </svg>
    </button>
  );

  return (
    <div className="relative">
      <Arrow dir={-1} disabled={atStart} />
      <div
        ref={scroller}
        onScroll={updateArrows}
        className="-mx-4 sm:mx-0 px-4 sm:px-0 flex gap-5 overflow-x-auto snap-x snap-mandatory pb-2 scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
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
      <Arrow dir={1} disabled={atEnd} />
    </div>
  );
}
