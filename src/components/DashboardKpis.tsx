// Organizes the customizable KPI widgets — swipe to reveal, add/remove, read charts.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Info, X, Plus, ArrowRight } from 'lucide-react';

export interface KpiDef {
  key: string;
  label: string;
  kind: 'money' | 'percent';
  whole: string;      // big number (or "23%")
  dec: string;        // faded decimals for money; '' for percent
  bars?: number[];    // optional sparkline (0-100)
  barLabels?: string[]; // month labels for each bar
  barValues?: string[]; // formatted value for each bar (shown on tap/hover)
  accent: string;     // hex, e.g. #76C893
  icon: string;       // heroicons-style path `d`
  info: string;       // description shown in the info sheet
  note?: string;      // small secondary figure shown under the headline (e.g. "din X facturat")
  href?: string;
  extra?: { label: string; value: string }[]; // contextual stats in the info sheet
}

// Small inline icon helper.
function Glyph({ d, className }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

const LS_KEY = 'fm-dashboard-kpis-v3';
const OPEN_W = 120; // width of the revealed action drawer (two circular buttons)

// ── Reusable bottom-sheet (slide-up + drag-to-dismiss, same feel as the menus) ──
function BottomSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    } else {
      setShown(false);
      const t = window.setTimeout(() => setMounted(false), 420);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.classList.add('sheet-lock');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.documentElement.classList.remove('sheet-lock'); window.removeEventListener('keydown', onKey); };
  }, [mounted]);

  // drag-to-dismiss (pointer on handle + pull from top + trackpad overscroll)
  useEffect(() => {
    // Swipe/drag-to-close gestures disabled — closing is via X button, backdrop, Esc only.
    const GESTURES_DISABLED = true;
    if (GESTURES_DISABLED) return;
    if (!mounted) return;
    const card = cardRef.current; const handle = handleRef.current;
    if (!card) return;
    const threshold = () => Math.min(110, card.offsetHeight * 0.2);
    const snap = () => { card.classList.remove('dragging'); card.style.transform = ''; };
    const swipeOut = () => { card.classList.remove('dragging'); card.style.transform = 'translateY(100%)'; onClose(); };

    const isMouse = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;
    let pd = false, psy = 0, pdy = 0;
    const onPDown = (e: PointerEvent) => { pd = true; psy = e.clientY; pdy = 0; card.classList.add('dragging'); handle?.setPointerCapture?.(e.pointerId); };
    const onPMove = (e: PointerEvent) => { if (!pd) return; pdy = Math.max(0, e.clientY - psy); card.style.transform = `translateY(${pdy}px)`; };
    const onPUp = () => { if (!pd) return; pd = false; if (pdy > threshold()) swipeOut(); else snap(); };
    if (!isMouse && handle) {
      handle.addEventListener('pointerdown', onPDown);
      handle.addEventListener('pointermove', onPMove);
      handle.addEventListener('pointerup', onPUp);
      handle.addEventListener('pointercancel', onPUp);
    }

    let sy = 0, ss = 0, act = false, dy = 0, onH = false;
    const onTStart = (e: TouchEvent) => { if (e.touches.length !== 1) return; onH = !!handle && handle.contains(e.target as Node); sy = e.touches[0].clientY; ss = card.scrollTop; act = false; dy = 0; };
    const onTMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const d = e.touches[0].clientY - sy;
      if (!act) {
        // Grab handle → drag down right away; content → only when scrolled to the top.
        if (onH && d > 0) { act = true; card.classList.add('dragging'); }
        else if (!onH && ss <= 0 && d > 6) { act = true; card.classList.add('dragging'); }
        else return;
      }
      dy = Math.max(0, d); card.style.transform = `translateY(${dy}px)`; if (e.cancelable) e.preventDefault();
    };
    const onTEnd = () => { if (!act) return; act = false; if (dy > threshold()) swipeOut(); else snap(); };
    card.addEventListener('touchstart', onTStart, { passive: true });
    card.addEventListener('touchmove', onTMove, { passive: false });
    card.addEventListener('touchend', onTEnd);
    card.addEventListener('touchcancel', onTEnd);

    return () => {
      if (!isMouse && handle) {
        handle.removeEventListener('pointerdown', onPDown);
        handle.removeEventListener('pointermove', onPMove);
        handle.removeEventListener('pointerup', onPUp);
        handle.removeEventListener('pointercancel', onPUp);
      }
      card.removeEventListener('touchstart', onTStart);
      card.removeEventListener('touchmove', onTMove);
      card.removeEventListener('touchend', onTEnd);
      card.removeEventListener('touchcancel', onTEnd);
    };
  }, [mounted]);

  if (!mounted) return null;
  return (
    <div className={`app-sheet ${shown ? 'is-open' : ''} fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70`} onClick={onClose} style={{ fontFamily: "'Outfit',ui-sans-serif,system-ui,sans-serif" }}>
      <div ref={cardRef} className="app-sheet-card relative w-full sm:max-w-[520px] max-h-[80vh] sm:max-h-[86vh] overflow-y-auto bg-[#07090f] rounded-t-[28px] sm:rounded-[28px] shadow-[0_-12px_60px_-12px_rgba(0,0,0,0.7)] sm:shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)]" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Închide" className="absolute top-4 right-4 z-10 fm-close-btn">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        {children}
      </div>
    </div>
  );
}

// ── A single swipeable KPI card ──
function KpiCard({ def, onInfo, onDelete }: { def: KpiDef; onInfo: () => void; onDelete: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(false);
  const [open, setOpen] = useState(false);

  // The info button sits inside the swipe-card, whose native touch/mouse listeners
  // would otherwise swallow the tap. Wire it natively + stop propagation so the card
  // never tracks it as a swipe and the tap reliably opens the info sheet on mobile.
  const infoBtnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = infoBtnRef.current;
    if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    const fire = (e: Event) => { e.stopPropagation(); onInfo(); };
    el.addEventListener('pointerdown', stop);
    el.addEventListener('mousedown', stop);
    el.addEventListener('touchstart', stop, { passive: true });
    el.addEventListener('click', fire);
    return () => {
      el.removeEventListener('pointerdown', stop);
      el.removeEventListener('mousedown', stop);
      el.removeEventListener('touchstart', stop);
      el.removeEventListener('click', fire);
    };
  }, [onInfo]);
  const [removing, setRemoving] = useState(false);
  const [activeBar, setActiveBar] = useState<number | null>(null);
  const startRemove = () => { setRemoving(true); window.setTimeout(onDelete, 320); };

  // Native touch + mouse drag (more reliable in mobile simulators than pointer events).
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    let active = false, sx = 0, sy = 0, dx = 0, moved = false, base = 0, dir: 'h' | 'v' | null = null;
    let vx = 0, lastX = 0, lastT = 0; // for flick (velocity) detection
    const setTx = (tx: number) => { card.style.transform = `translateX(${tx}px)`; };
    const begin = (x: number, y: number) => { active = true; sx = x; sy = y; dx = 0; moved = false; dir = null; base = openRef.current ? -OPEN_W : 0; vx = 0; lastX = x; lastT = performance.now(); card.style.transition = 'none'; };
    const move = (x: number) => {
      const t = performance.now(); const dt = t - lastT;
      if (dt > 0) vx = (x - lastX) / dt; // px per ms (negative = moving left)
      lastX = x; lastT = t;
      dx = x - sx; if (Math.abs(dx) > 4) moved = true;
      setTx(Math.max(-OPEN_W, Math.min(0, base + dx)));
    };
    const end = () => {
      if (!active) return; active = false;
      card.style.transition = '';
      const tx = Math.max(-OPEN_W, Math.min(0, base + dx));
      // A fast flick wins over distance — left flick opens, right flick closes —
      // so a light swipe works like the menus instead of needing a full drag.
      const fast = Math.abs(vx) > 0.35;
      const willOpen = fast ? vx < 0 : tx < -OPEN_W / 2;
      openRef.current = willOpen;
      setOpen(willOpen);
      setTx(willOpen ? -OPEN_W : 0);
    };

    // Touch
    const onTS = (e: TouchEvent) => { if (e.touches.length !== 1) return; begin(e.touches[0].clientX, e.touches[0].clientY); };
    const onTM = (e: TouchEvent) => {
      if (!active || e.touches.length !== 1) return;
      const x = e.touches[0].clientX, y = e.touches[0].clientY;
      if (!dir) {
        if (Math.abs(x - sx) < 6 && Math.abs(y - sy) < 6) return;
        dir = Math.abs(x - sx) > Math.abs(y - sy) ? 'h' : 'v';
        if (dir === 'v') { active = false; card.style.transition = ''; return; } // let the page scroll
      }
      move(x);
      if (e.cancelable) e.preventDefault();
    };
    card.addEventListener('touchstart', onTS, { passive: true });
    card.addEventListener('touchmove', onTM, { passive: false });
    card.addEventListener('touchend', end);
    card.addEventListener('touchcancel', end);

    // Mouse (desktop)
    const onMD = (e: MouseEvent) => {
      begin(e.clientX, e.clientY);
      const mm = (ev: MouseEvent) => move(ev.clientX);
      const mu = () => { end(); window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
      window.addEventListener('mousemove', mm);
      window.addEventListener('mouseup', mu);
    };
    card.addEventListener('mousedown', onMD);

    // Trackpad horizontal swipe (desktop) — fires wheel events with deltaX, the
    // same way the menus close on a two-finger swipe. No click-drag needed.
    let wTx = 0, wActive = false, wTimer = 0;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // vertical → let the page scroll
      e.preventDefault();
      if (!wActive) { wActive = true; card.style.transition = 'none'; wTx = openRef.current ? -OPEN_W : 0; }
      wTx = Math.max(-OPEN_W, Math.min(0, wTx - e.deltaX)); // swipe left → reveal actions
      card.style.transform = `translateX(${wTx}px)`;
      window.clearTimeout(wTimer);
      wTimer = window.setTimeout(() => {
        wActive = false;
        card.style.transition = '';
        const willOpen = wTx < -OPEN_W / 2;
        openRef.current = willOpen;
        setOpen(willOpen);
        card.style.transform = willOpen ? `translateX(${-OPEN_W}px)` : 'translateX(0px)';
      }, 110);
    };
    card.addEventListener('wheel', onWheel, { passive: false });

    // Tap an open card to close it; swallow the click that ends a drag.
    const onClick = (e: MouseEvent) => {
      if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; return; }
      if (openRef.current) { openRef.current = false; setOpen(false); setTx(0); }
    };
    card.addEventListener('click', onClick);

    return () => {
      card.removeEventListener('touchstart', onTS);
      card.removeEventListener('touchmove', onTM);
      card.removeEventListener('touchend', end);
      card.removeEventListener('touchcancel', end);
      card.removeEventListener('mousedown', onMD);
      card.removeEventListener('wheel', onWheel);
      card.removeEventListener('click', onClick);
    };
  }, []);

  return (
    <div
      className="group relative rounded-3xl overflow-hidden h-full transition-all duration-300 ease-out"
      style={removing ? { opacity: 0, transform: 'scale(0.88)', filter: 'blur(1px)', pointerEvents: 'none' } : undefined}
    >
      {/* revealed actions — circular, icon-only (sit behind the card, swipe-reveal on mobile) */}
      <div className="absolute inset-y-0 right-0 w-[120px] flex items-center justify-center gap-2.5">
        <button type="button" aria-label="Info" onClick={() => { openRef.current = false; setOpen(false); onInfo(); }} className="w-11 h-11 rounded-full bg-white/10 text-white grid place-items-center hover:bg-white/15 transition-colors">
          <Info className="w-5 h-5" />
        </button>
        <button type="button" aria-label="Șterge" onClick={startRemove} className="w-11 h-11 rounded-full bg-[#DC4B41] text-white grid place-items-center hover:brightness-110 transition">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* the card itself */}
      <div
        ref={cardRef}
        className="relative h-full flex flex-col rounded-3xl p-5 bg-white/5 select-none transition-transform duration-300 ease-out"
        style={{ transform: open ? `translateX(${-OPEN_W}px)` : 'translateX(0px)', touchAction: 'pan-y' }}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-[13px] font-medium text-[#8FA6BC]">{def.label}</p>
          <div className="flex items-center gap-1 shrink-0">
            {/* always-visible info button (the swipe-reveal one isn't discoverable on mobile) */}
            <button
              ref={infoBtnRef}
              type="button"
              aria-label="Detalii"
              className="w-7 h-7 grid place-items-center rounded-full bg-white/10 text-[#A8BED2] hover:bg-white/15 hover:text-white transition-colors"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
            {/* desktop-only hover X to remove the KPI card */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); startRemove(); }}
              title="Elimină"
              className="hidden lg:grid w-7 h-7 place-items-center rounded-full bg-white/10 text-[#A8BED2] hover:bg-[#DC4B41]/15 hover:text-[#DC4B41] transition-colors opacity-0 group-hover:opacity-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <span className="w-8 h-8 rounded-full grid place-items-center" style={{ background: def.accent + '26', color: def.accent }}>
              <Glyph d={def.icon} className="w-4 h-4" />
            </span>
          </div>
        </div>
        {(() => {
          const hasFooter = (def.bars && def.bars.length > 0) || (def.extra && def.extra.length > 0);
          // Plain count/percent cards (no chart, no extra) center their number
          // vertically so they read balanced instead of top-stuck in the equal-height grid.
          const headlineCls = hasFooter ? 'mt-2' : 'my-auto py-1';
          return activeBar !== null && def.barValues && def.barLabels ? (
            <div className={headlineCls}>
              <p className="text-[12px] font-medium text-[#8FA6BC]">{def.barLabels[activeBar]}</p>
              <p className="tabular-nums tracking-[-0.03em] leading-none mt-0.5">
                <span className="text-[28px] sm:text-[32px] font-bold text-white">{def.barValues[activeBar]}</span>
              </p>
            </div>
          ) : (
            <div className={headlineCls}>
              <p className="tabular-nums tracking-[-0.03em] leading-none">
                <span className="text-[30px] sm:text-[34px] font-bold text-white">{def.whole}</span>
                {def.kind === 'money' && <span className="text-[19px] font-bold text-[#8FA6BC]">,{def.dec} RON</span>}
              </p>
              {def.note && <p className="text-[12px] text-[#8FA6BC] mt-1.5">{def.note}</p>}
            </div>
          );
        })()}
        {def.bars && def.bars.length > 0 ? (
          <div className="mt-auto pt-3.5">
            {(() => {
              const ai = activeBar ?? def.bars!.length - 1; // default: current month
              return (
                <>
                  <div className="flex items-end gap-1.5 h-11">
                    {def.bars!.map((h, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setActiveBar(i); }}
                        title={def.barValues ? `${def.barLabels?.[i] ?? ''}: ${def.barValues[i]}` : undefined}
                        className="flex-1 rounded-md transition-all cursor-pointer"
                        style={{ height: `${Math.max(10, h)}%`, background: i === ai ? def.accent : def.accent + '59' }}
                      />
                    ))}
                  </div>
                  {/* Always-visible month labels so the chart reads as a labeled bar chart. */}
                  {def.barLabels && (
                    <div className="flex gap-1.5 mt-1.5">
                      {def.barLabels.map((l, i) => (
                        <span key={i} className={`flex-1 text-center text-[9px] tabular-nums ${i === ai ? 'text-white font-semibold' : 'text-[#8FA6BC]'}`}>{l}</span>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        ) : def.extra && def.extra.length > 0 ? (
          <div className="mt-auto pt-4 space-y-2">
            {def.extra.slice(0, 2).map((row, i) => (
              <div key={i} className="flex items-center justify-between gap-2 border-t border-white/10 pt-2 first:border-t-0 first:pt-0">
                <span className="text-[12px] text-[#8FA6BC] truncate">{row.label}</span>
                <span className="text-[12.5px] font-semibold text-white tabular-nums shrink-0">{row.value}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function DashboardKpis({ catalog, initialSelected }: { catalog: KpiDef[]; initialSelected: string[] }) {
  const byKey = new Map(catalog.map((d) => [d.key, d] as const));
  const [selected, setSelected] = useState<string[]>(() => initialSelected.filter((k) => byKey.has(k)));
  const [picker, setPicker] = useState(false);
  const [infoKey, setInfoKey] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Load saved selection (per-device) after mount to avoid hydration mismatch.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setSelected(arr.filter((k) => typeof k === 'string' && byKey.has(k)));
      }
    } catch { /* ignore */ }
    setHydrated(true);
  }, []);

  // Persist on change (once hydrated, so we don't overwrite saved state on first paint).
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(LS_KEY, JSON.stringify(selected)); } catch { /* ignore */ }
  }, [selected, hydrated]);

  const available = catalog.filter((d) => !selected.includes(d.key));
  const add = (key: string) => setSelected((s) => (s.includes(key) ? s : [...s, key]));
  const remove = (key: string) => setSelected((s) => s.filter((k) => k !== key));
  const infoDef = infoKey ? byKey.get(infoKey) : null;

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 auto-rows-fr">
        {selected.map((key) => {
          const def = byKey.get(key);
          if (!def) return null;
          return <KpiCard key={key} def={def} onInfo={() => setInfoKey(key)} onDelete={() => remove(key)} />;
        })}

        {available.length > 0 && (
          <button
            type="button"
            onClick={() => setPicker(true)}
            className="rounded-3xl border-2 border-dashed border-white/15 min-h-[150px] h-full flex flex-col items-center justify-center gap-2 text-[#8FA6BC] hover:border-[#E1FB15]/60 hover:text-[#E1FB15] transition-colors"
          >
            <Plus className="w-7 h-7" />
            <span className="text-[13px] font-semibold">Adaugă indicator</span>
          </button>
        )}
      </div>

      {/* Info sheet */}
      <BottomSheet open={!!infoDef} onClose={() => setInfoKey(null)}>
        {infoDef && (
          <div className="px-5 sm:px-6 pt-5 pb-6">
            <div className="flex items-center gap-3 pr-10">
              <span className="w-11 h-11 rounded-2xl grid place-items-center shrink-0" style={{ background: infoDef.accent + '26', color: infoDef.accent }}>
                <Glyph d={infoDef.icon} className="w-6 h-6" />
              </span>
              <p className="text-[14px] font-medium text-[#A8BED2]">{infoDef.label}</p>
            </div>
            <p className="mt-3 tabular-nums tracking-[-0.03em] leading-none">
              <span className="text-[34px] font-bold text-white">{infoDef.whole}</span>
              {infoDef.kind === 'money' && <span className="text-[18px] font-bold text-[#8FA6BC]">,{infoDef.dec} RON</span>}
            </p>
            {infoDef.note && <p className="text-[13px] text-[#8FA6BC] mt-1.5">{infoDef.note}</p>}
            {infoDef.bars && infoDef.bars.length > 0 && (
              <div className="mt-5">
                <div className="flex items-end gap-2 h-24">
                  {infoDef.bars.map((h, i) => (
                    <div key={i} className="flex-1 rounded-lg" style={{ height: `${Math.max(10, h)}%`, background: i === infoDef.bars!.length - 1 ? infoDef.accent : infoDef.accent + '66' }} />
                  ))}
                </div>
                {infoDef.barLabels && infoDef.barLabels.length === infoDef.bars.length && (
                  <div className="flex gap-2 mt-2">
                    {infoDef.barLabels.map((l, i) => (
                      <span key={i} className={`flex-1 text-center text-[11px] ${i === infoDef.barLabels!.length - 1 ? 'text-white font-semibold' : 'text-[#8FA6BC]'}`}>{l}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
            <p className="mt-5 text-[14px] text-[#C8DAE8] leading-relaxed">{infoDef.info}</p>
            {infoDef.extra && infoDef.extra.length > 0 && (
              <div className="mt-4 rounded-2xl bg-white/10 overflow-hidden">
                {infoDef.extra.map((row, i) => (
                  <div key={i} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-white/10' : ''}`}>
                    <span className="text-[13px] text-[#A8BED2]">{row.label}</span>
                    <span className="text-[14px] font-semibold text-white tabular-nums">{row.value}</span>
                  </div>
                ))}
              </div>
            )}
            {infoDef.href && (
              <a href={infoDef.href} className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#E1FB15] hover:underline">
                Vezi detalii <ArrowRight className="w-4 h-4" />
              </a>
            )}
          </div>
        )}
      </BottomSheet>

      {/* Add-indicator picker */}
      <BottomSheet open={picker} onClose={() => setPicker(false)}>
        <div className="px-4 sm:px-6 pt-5 pb-6">
          <h3 className="text-[20px] font-bold text-white pr-12">Adaugă indicator</h3>
          <p className="text-[13px] text-[#8FA6BC] mt-1 mb-4">Alege ce vrei să urmărești pe pagina principală.</p>
          {available.length === 0 ? (
            <p className="text-center text-[#8FA6BC] py-8">Ai adăugat toți indicatorii disponibili.</p>
          ) : (
            <div className="space-y-2">
              {available.map((d) => (
                <button key={d.key} type="button" onClick={() => add(d.key)} className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white/5 hover:bg-white/10 text-left transition-colors">
                  <span className="w-10 h-10 rounded-xl grid place-items-center shrink-0" style={{ background: d.accent + '26', color: d.accent }}>
                    <Glyph d={d.icon} className="w-5 h-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold text-white truncate">{d.label}</span>
                    <span className="block text-[12px] text-[#A8BED2] truncate">{d.info}</span>
                  </span>
                  <Plus className="w-5 h-5 text-[#E1FB15] shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}
