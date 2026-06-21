import { useEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';

export interface MonthDiv {
  short: string; name: string; empty: boolean;
  venituri: number; deplatit: number; emise: number; cheltuieli: number;
  dv: string; dd: string; de: string; dc: string;
}
export interface LegendItem { label: string; colors: string[]; display: string; }
export interface Stat { label: string; value: string; }

interface Props {
  title: string;
  subtitle: string;
  netDisplay: string;
  netValue?: number;
  netPositive: boolean;
  legend: LegendItem[];
  months: MonthDiv[];
  scaleMax: number;
  highlightIndex?: number;
  stats?: Stat[];
  demo?: boolean;
}

const C_FACT = '#3A47C2'; // indigo
const C_VEN = '#0E8074';  // teal
const C_DEP = '#E8730C';  // orange
const C_CHE = '#D11149';  // crimson
const C_FUT = '#94A089';  // muted gray-green for future months

const W = 360, H = 188, padL = 6, padR = 6, padT = 14, padB = 16;
const plotW = W - padL - padR, plotH = H - padT - padB, baseY = H - padB;

const ron = (cents: number) =>
  new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON', maximumFractionDigits: 0 }).format((cents || 0) / 100);

type Pt = { x: number; y: number };

function curve(pts: Pt[], withM = true): string {
  if (pts.length < 2) return pts.length && withM ? `M ${pts[0].x} ${pts[0].y}` : '';
  let d = withM ? `M ${pts[0].x} ${pts[0].y}` : '';
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

// Sample a Catmull-Rom curve into many points so band boundaries can follow the
// real (possibly crossing) lines per-x rather than relying on a global stack order.
const SEG = 12;
function sample(pts: Pt[]): Pt[] {
  if (pts.length < 2) return pts.slice();
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    for (let s = i === 0 ? 0 : 1; s <= SEG; s++) {
      const t = s / SEG, mt = 1 - t;
      out.push({
        x: mt * mt * mt * p1.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * p2.x,
        y: mt * mt * mt * p1.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * p2.y,
      });
    }
  }
  return out;
}

// Band for one series = area between its line and the CLOSEST line below it at each x
// (or the baseline if it's the lowest there). Bands tile the area without overlap.
function bandPath(self: Pt[], others: Pt[][]): string {
  const bot = self.map((p, j) => {
    let b = baseY; // lower y = higher value; a line "below" has greater y
    for (const o of others) {
      const oy = o[j].y;
      if (oy > p.y && oy < b) b = oy;
    }
    return b;
  });
  let d = `M ${self[0].x.toFixed(1)} ${self[0].y.toFixed(1)}`;
  for (let j = 1; j < self.length; j++) d += ` L ${self[j].x.toFixed(1)} ${self[j].y.toFixed(1)}`;
  for (let j = self.length - 1; j >= 0; j--) d += ` L ${self[j].x.toFixed(1)} ${bot[j].toFixed(1)}`;
  return d + ' Z';
}

const CSS = `
@keyframes fmcDraw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
@keyframes fmcFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes fmcGrow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
@keyframes fmcPulse { 0%,100% { opacity: .25; transform: scale(1); } 50% { opacity: .8; transform: scale(1.45); } }
/* Base state is fully VISIBLE. The .fmc-draw class — added when the chart scrolls
   into view (and removed when it leaves, so it replays) — runs the entrance.
   No-JS / reduced-motion never get the class, so they always see the full chart. */
.fmc-line { stroke-dasharray: 1; }
/* Armed (off-screen, waiting to be scrolled in): hold the entrance at its start. */
.fmc-pre .fmc-line { stroke-dashoffset: 1; }
.fmc-pre .fmc-band { opacity: 0; }
.fmc-pre rect[data-bar] { transform-box: fill-box; transform-origin: 50% 100%; transform: scaleY(0); }
.fmc-pre [data-anim] { opacity: 0; }
.fmc-draw .fmc-line  { animation: fmcDraw 1.15s cubic-bezier(.4,0,.2,1) both; }
.fmc-draw .fmc-band  { animation: fmcFade .7s ease both; }
.fmc-draw rect[data-bar] { transform-box: fill-box; transform-origin: 50% 100%; animation: fmcGrow .6s cubic-bezier(.2,.7,.2,1) both; }
.fmc-move { transition: cx .16s ease, cy .16s ease, x1 .16s ease, x2 .16s ease, opacity .18s ease; }
.fmc-anchor { transform-box: fill-box; transform-origin: center; animation: fmcPulse 2.4s ease-in-out infinite; }
.fmc-tip { transition: left .16s ease, opacity .16s ease; }
@media (prefers-reduced-motion: reduce) {
  .fmc-draw .fmc-line, .fmc-draw .fmc-band, .fmc-draw rect[data-bar], .fmc-anchor { animation: none; }
}
`;

export default function DashboardChart({
  title, subtitle, netDisplay, netValue, netPositive, legend, months, scaleMax, highlightIndex, stats = [], demo,
}: Props) {
  const n = months.length;
  const hasData = months.some((m) => !m.empty);
  const plotRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const netRef = useRef<HTMLSpanElement>(null);
  const net = netPositive ? '#0F3A28' : '#B23A30';

  const xAt = (i: number) => padL + (n <= 1 ? 0 : (i * plotW) / (n - 1));
  const yAt = (v: number) => padT + (1 - v / scaleMax) * plotH;

  // Draw only up to the current month — future months are not plotted.
  const lastDrawIdx = highlightIndex != null && highlightIndex >= 0 && highlightIndex < n ? highlightIndex : n - 1;

  // active = currently inspected month (null when idle). view keeps last position for smooth fade-out.
  const [active, setActive] = useState<number | null>(null);
  const [view, setView] = useState<number>(lastDrawIdx);
  const [mode, setMode] = useState<'line' | 'bars'>('line');
  const show = active !== null;

  const { factPts, venPts, chePts, depPts, bands } = useMemo(() => {
    const ptsOf = (vals: number[]): Pt[] => vals.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
    const f = ptsOf(months.map((m) => m.emise));
    const v = ptsOf(months.map((m) => m.venituri));
    const c = ptsOf(months.map((m) => m.cheltuieli));
    const dp = ptsOf(months.map((m) => m.deplatit));
    // Plot only through the current month (drop future months).
    const cut = lastDrawIdx + 1;
    const fc = f.slice(0, cut), vc = v.slice(0, cut), cc = c.slice(0, cut), dc = dp.slice(0, cut);
    // Sample each line, then build every band against the closest line below it per-x.
    const sF = sample(fc), sV = sample(vc), sC = sample(cc), sD = sample(dc);
    const bands = cut < 2 ? [] : [
      { d: bandPath(sF, [sV, sC, sD]), fill: 'url(#hatchFact)' },
      { d: bandPath(sV, [sF, sC, sD]), fill: 'url(#hatchVen)' },
      { d: bandPath(sC, [sF, sV, sD]), fill: 'url(#hatchChe)' },
      { d: bandPath(sD, [sF, sV, sC]), fill: 'url(#hatchDep)' },
    ];
    return { factPts: fc, venPts: vc, chePts: cc, depPts: dc, bands };
  }, [months, scaleMax, lastDrawIdx]);

  const pick = (clientX: number) => {
    const el = plotRef.current;
    if (!el || n <= 1) return;
    const r = el.getBoundingClientRect();
    const xView = ((clientX - r.left) / r.width) * W;
    const idx = Math.max(0, Math.min(lastDrawIdx, Math.round(((xView - padL) / plotW) * (n - 1))));
    setActive(idx);
    setView(idx);
  };

  const m = months[view];
  const hiX = xAt(view);
  const leftPct = (hiX / W) * 100;
  const spacing = n <= 1 ? plotW : plotW / (n - 1);
  const barW = Math.min(26, spacing * 0.62);
  const futH = plotH * 0.16; // height of future-month placeholder stubs
  const netM = m ? m.venituri - m.cheltuieli : 0;
  const rows = m ? [
    { label: 'Facturat', color: C_FACT, val: m.de },
    { label: 'Venituri', color: C_VEN, val: m.dv },
    { label: 'De plătit', color: C_DEP, val: m.dd },
    { label: 'Cheltuieli', color: C_CHE, val: m.dc },
  ] : [];

  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Scroll trigger (IntersectionObserver) ────────────────────────────────
  // The entrance plays ONLY when the chart is actively scrolled into view — never
  // on initial page load. The observer's FIRST callback reports load-time
  // visibility: if the chart is already on screen we leave it fully drawn and do
  // nothing; if it's off-screen we arm it (`.fmc-pre` hides the entrance state) and
  // wait. The next time it scrolls in, we swap to `.fmc-draw` (CSS line draw / band
  // fade / bar grow) + GSAP stats stagger + net count-up — once — then disconnect.
  useEffect(() => {
    if (reduced || !rootRef.current) return;
    const card = rootRef.current;

    const reveal = gsap.from(card.querySelectorAll('[data-anim]'), {
      opacity: 0, y: 16, duration: 0.5, ease: 'power2.out', stagger: 0.06,
      paused: true, immediateRender: false,
    });

    const countUp = () => {
      if (!netRef.current || typeof netValue !== 'number') return;
      const o = { v: 0 };
      gsap.to(o, {
        v: netValue, duration: 1.2, ease: 'power2.out',
        onUpdate() { if (netRef.current) netRef.current.textContent = ron(o.v); },
      });
    };

    let first = true;
    const io = new IntersectionObserver((entries, obs) => {
      for (const e of entries) {
        if (first) {
          first = false;
          if (e.isIntersecting) { obs.disconnect(); return; } // visible at load → never animate
          card.classList.add('fmc-pre');                       // off-screen → arm, hidden
          continue;
        }
        if (e.isIntersecting) {                                // genuine scroll-into-view → play once
          card.classList.remove('fmc-pre');
          card.classList.add('fmc-draw');
          reveal.restart();
          countUp();
          obs.disconnect();
          return;
        }
      }
    // Require ~25% of the card visible and its top past a line 12% up from the
    // viewport bottom, so it triggers when genuinely on screen — not at the edge.
    }, { threshold: 0.25, rootMargin: '0px 0px -12% 0px' });
    io.observe(card);
    return () => { io.disconnect(); reveal.kill(); card.classList.remove('fmc-pre', 'fmc-draw'); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Headline parallax — drifts gently with scroll for depth (rAF-throttled, no plugin).
  useEffect(() => {
    if (reduced || !rootRef.current) return;
    const card = rootRef.current;
    const target = card.querySelector('[data-parallax]') as HTMLElement | null;
    if (!target) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = card.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const p = Math.max(0, Math.min(1, 1 - (r.top + r.height / 2) / (vh + r.height / 2)));
      gsap.set(target, { yPercent: 14 - p * 28 });
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={rootRef} className="rounded-3xl p-5 sm:p-7" style={{ background: '#D9ED92', color: '#1C3A22' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] font-semibold text-[#3C5A33]">
            {subtitle}
            {demo && <span className="normal-case tracking-normal text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1C3A22] text-[#D9ED92]">Date demo</span>}
          </p>
          <p data-parallax className="text-[40px] sm:text-[48px] font-bold tracking-[-0.04em] leading-[0.9] mt-1">{title}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-[0.14em] font-semibold text-[#3C5A33]">Venit net</p>
          <p className="flex items-center justify-end gap-1 text-[24px] sm:text-[30px] font-bold tracking-[-0.02em] tabular-nums mt-1" style={{ color: net }}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              {netPositive
                ? <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                : <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />}
            </svg>
            <span ref={netRef}>{netDisplay}</span>
          </p>
        </div>
      </div>

      {/* Detail stats */}
      {stats.length > 0 && (
        <div className="flex gap-4 mt-5">
          {stats.map((s, i) => (
            <div key={s.label} data-anim className={`flex-1 min-w-0 ${i > 0 ? 'pl-4 border-l border-[#1C3A22]/12' : ''}`}>
              <p className="text-[11px] font-medium text-[#3C5A33] truncate">{s.label}</p>
              <p className="text-[15px] sm:text-[17px] font-bold tracking-[-0.01em] mt-0.5 tabular-nums truncate">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Chart-type toggle */}
      <div className="flex justify-end mt-5">
        <div className="inline-flex rounded-full bg-[#1C3A22]/10 p-0.5">
          {(['line', 'bars'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setMode(opt)}
              className={`px-3.5 py-1 rounded-full text-[12px] font-semibold transition-colors ${mode === opt ? 'bg-[#1C3A22] text-[#D9ED92]' : 'text-[#3C5A33] hover:text-[#1C3A22]'}`}
            >
              {opt === 'line' ? 'Linii' : 'Bare'}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive plot */}
      <div className="mt-3">
        <div
          ref={plotRef}
          className="relative cursor-crosshair touch-pan-y select-none"
          onPointerMove={(e) => pick(e.clientX)}
          onPointerDown={(e) => pick(e.clientX)}
          onPointerLeave={() => setActive(null)}
        >
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block overflow-visible" role="img" aria-label="Evoluție lunară">
            <defs>
              {/* One hatch per line, in that line's colour. Opaque card-coloured base so
                  the largest→smallest layering stays crisp instead of muddy. */}
              <pattern id="hatchFact" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="7" height="7" fill="#D9ED92" />
                <line x1="0" y1="0" x2="0" y2="7" stroke={C_FACT} strokeWidth="1.8" strokeOpacity="0.85" />
              </pattern>
              <pattern id="hatchVen" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="7" height="7" fill="#D9ED92" />
                <line x1="0" y1="0" x2="0" y2="7" stroke={C_VEN} strokeWidth="1.8" strokeOpacity="0.85" />
              </pattern>
              <pattern id="hatchChe" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="7" height="7" fill="#D9ED92" />
                <line x1="0" y1="0" x2="0" y2="7" stroke={C_CHE} strokeWidth="1.8" strokeOpacity="0.8" />
              </pattern>
              <pattern id="hatchDep" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="7" height="7" fill="#D9ED92" />
                <line x1="0" y1="0" x2="0" y2="7" stroke={C_DEP} strokeWidth="1.8" strokeOpacity="0.9" />
              </pattern>
            </defs>

            {hasData && (
              <>
                {/* future months — greyed out: bars get stubs, lines get a dotted line */}
                {mode === 'bars'
                  ? months.map((mm, i) => (i > lastDrawIdx ? (
                      <rect key={`fut-${i}`} x={xAt(i) - barW / 2} y={baseY - futH} width={barW} height={futH} rx="3" fill={C_FUT} fillOpacity="0.4" />
                    ) : null))
                  : (
                    <>
                      <line x1={xAt(lastDrawIdx)} y1={baseY - 1} x2={xAt(n - 1)} y2={baseY - 1} stroke={C_FUT} strokeWidth="2" strokeDasharray="1 5" strokeLinecap="round" strokeOpacity="0.75" />
                      {months.map((mm, i) => (i > lastDrawIdx ? (
                        <circle key={`futd-${i}`} cx={xAt(i)} cy={baseY - 1} r="2.6" fill={C_FUT} fillOpacity="0.75" />
                      ) : null))}
                    </>
                  )}

                {mode === 'line' ? (
                  <>
                    {bands.map((b, i) => <path key={i} className="fmc-band" d={b.d} fill={b.fill} />)}
                    <path className="fmc-line" pathLength={1} d={curve(depPts)} fill="none" stroke={C_DEP} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                    <path className="fmc-line" pathLength={1} d={curve(chePts)} fill="none" stroke={C_CHE} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                    <path className="fmc-line" pathLength={1} d={curve(factPts)} fill="none" stroke={C_FACT} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    <path className="fmc-line" pathLength={1} d={curve(venPts)} fill="none" stroke={C_VEN} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
                  </>
                ) : (
                  /* layered overlapping bars — full width, tallest behind, smallest in front */
                  months.slice(0, lastDrawIdx + 1).map((mm, i) => {
                    const cx = xAt(i);
                    const bs = [
                      { v: mm.emise, c: C_FACT }, { v: mm.venituri, c: C_VEN },
                      { v: mm.deplatit, c: C_DEP }, { v: mm.cheltuieli, c: C_CHE },
                    ].sort((a, b) => b.v - a.v);
                    return (
                      <g key={i} className="fmc-band">
                        {bs.map((b, k) => (b.v > 0 ? (
                          <rect key={k} data-bar x={cx - barW / 2} y={yAt(b.v)} width={barW} height={baseY - yAt(b.v)} rx="3" fill={b.c} />
                        ) : null))}
                      </g>
                    );
                  })
                )}

                {/* gray dotted cursor guide — top to bottom, only while inspecting */}
                <line className="fmc-move" x1={hiX} y1={4} x2={hiX} y2={baseY} stroke="#5E6B54" strokeWidth="1.3" strokeDasharray="0.5 4" strokeLinecap="round" style={{ opacity: show ? 1 : 0 }} />

                {/* active dots (line mode only) */}
                {mode === 'line' && m && (
                  <g style={{ opacity: show ? 1 : 0, transition: 'opacity .16s ease' }}>
                    <circle className="fmc-move" cx={hiX} cy={yAt(m.deplatit)} r="3.6" fill={C_DEP} stroke="#D9ED92" strokeWidth="1.8" />
                    <circle className="fmc-move" cx={hiX} cy={yAt(m.cheltuieli)} r="3.6" fill={C_CHE} stroke="#D9ED92" strokeWidth="1.8" />
                    <circle className="fmc-move" cx={hiX} cy={yAt(m.emise)} r="3.6" fill={C_FACT} stroke="#D9ED92" strokeWidth="1.8" />
                    <circle className="fmc-move" cx={hiX} cy={yAt(m.venituri)} r="4.4" fill={C_VEN} stroke="#D9ED92" strokeWidth="2" />
                  </g>
                )}
              </>
            )}
          </svg>

          {!hasData && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-[14px] font-medium text-[#3C5A33]">Nu există date încă pentru acest an.</p>
            </div>
          )}

          {/* tooltip — only while inspecting */}
          {hasData && m && (
            <div
              className="fmc-tip absolute top-0 z-10 pointer-events-none"
              style={{ left: `${leftPct}%`, opacity: show ? 1 : 0, transform: `translateX(${leftPct > 62 ? '-100%' : leftPct < 38 ? '0' : '-50%'})` }}
            >
              <div className="rounded-xl bg-[#16301E] text-[#EAF2E6] px-3 py-2.5 shadow-[0_12px_30px_-10px_rgba(0,0,0,0.6)] ring-1 ring-white/10 min-w-[140px]">
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#9FC982] mb-1.5">{m.name}</p>
                {rows.map((r) => (
                  <div key={r.label} className="flex items-center gap-1.5 text-[11px] leading-[1.6]">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} />
                    <span className="text-[#C7D9BA]">{r.label}</span>
                    <span className="ml-auto font-bold tabular-nums">{r.val}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1.5 text-[11px] leading-[1.6] mt-1.5 pt-1.5 border-t border-white/10">
                  <span className="text-[#9FC982] font-semibold">Net</span>
                  <span className="ml-auto font-bold tabular-nums" style={{ color: netM >= 0 ? '#9CE37D' : '#FF9A8F' }}>{ron(netM)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex mt-2.5" style={{ paddingLeft: `${(padL / W) * 100}%`, paddingRight: `${(padR / W) * 100}%` }}>
          {months.map((mm, i) => {
            const future = i > lastDrawIdx;
            return (
              <button
                key={mm.short}
                type="button"
                disabled={future}
                onClick={() => { if (!future) { setActive(active === i ? null : i); setView(i); } }}
                className={`flex-1 text-center text-[10px] sm:text-[11px] uppercase tracking-wide transition-colors ${
                  future ? 'text-[#3C5A33]/30 cursor-default' : i === view && show ? 'font-bold text-[#1C3A22]' : 'font-medium text-[#3C5A33] hover:text-[#1C3A22]'
                }`}
              >
                {mm.short}
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend / yearly totals */}
      <div className="flex flex-wrap gap-x-6 gap-y-2.5 pt-5 mt-5 border-t border-[#1C3A22]/12">
        {legend.map((l) => (
          <div key={l.label} data-anim className="flex items-center gap-2 min-w-0">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: l.colors[0] }} />
            <span className="text-[13px] font-medium text-[#3C5A33]">{l.label}</span>
            <span className="text-[13px] font-bold tabular-nums">{l.display}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
