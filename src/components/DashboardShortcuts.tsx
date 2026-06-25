// Renders the quick-action launcher tiles and the "add action" picker.
import { useEffect, useMemo, useRef, useState } from 'react';

export interface ShortcutModule {
  key: string;
  label: string;
  desc: string;
  href: string;
  icon: string; // heroicons-style path `d`
  group: string;
  bg: string;
  fg: string;
  sub: string;
}

const MIN_SLOTS = 4; // empty dotted slots shown before the user pins anything
const SYNC_EVENT = 'dashboard-modules-changed';

export default function DashboardShortcuts({
  catalog,
  initialSelected,
}: {
  catalog: ShortcutModule[];
  initialSelected: string[];
}) {
  const byKey = useMemo(() => {
    const m = new Map<string, ShortcutModule>();
    for (const c of catalog) m.set(c.key, c);
    return m;
  }, [catalog]);

  // Only keep keys that still exist in the catalog, preserving saved order.
  const [selected, setSelected] = useState<string[]>(() =>
    initialSelected.filter((k) => byKey.has(k)),
  );
  const [picker, setPicker] = useState(false);   // mounted
  const [pickerOpen, setPickerOpen] = useState(false); // is-open (drives the slide/fade)
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Open/close with the same smooth sheet animation as the app menus.
  const openPicker = () => {
    setPicker(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setPickerOpen(true)));
  };
  const closePicker = () => {
    setPickerOpen(false);
    window.setTimeout(() => setPicker(false), 420);
  };

  // Drag / swipe-down to dismiss — same gestures as the app menu sheets
  // (pointer-drag on the grab handle, pull-to-dismiss from the top, trackpad
  // overscroll on mobile). Wired imperatively so wheel/touchmove can be passive:false.
  const cardRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);

  const available = useMemo(
    () => catalog.filter((m) => !selected.includes(m.key)),
    [catalog, selected],
  );

  // How many trailing dotted "+" slots to render.
  //  - fewer than MIN_SLOTS pinned → fill up to MIN_SLOTS
  //  - MIN_SLOTS or more pinned → keep exactly one as a reminder (while items remain)
  const emptySlots =
    available.length === 0
      ? 0
      : selected.length < MIN_SLOTS
        ? MIN_SLOTS - selected.length
        : 1;

  const persist = async (next: string[]) => {
    setSaving(true);
    try {
      await fetch('/api/me/dashboard', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modules: next }),
      });
    } catch {
      /* keep optimistic state; will re-sync on next load */
    } finally {
      setSaving(false);
    }
    // Tell the Acțiuni overlay (and anything else) so its pins stay in sync.
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { modules: next, source: 'island' } }));
  };

  const add = (key: string) => {
    const next = [...selected, key];
    setSelected(next);
    persist(next);
    if (available.length <= 1) closePicker(); // nothing left to add
  };

  const remove = (key: string) => {
    const next = selected.filter((k) => k !== key);
    setSelected(next);
    persist(next);
  };

  // Reflect changes made elsewhere (e.g. the Acțiuni overlay pin buttons).
  useEffect(() => {
    const onSync = (e: Event) => {
      const detail = (e as CustomEvent).detail as { modules?: string[]; source?: string } | undefined;
      if (!detail || detail.source === 'island') return;
      const next = (detail.modules || []).filter((k) => byKey.has(k));
      setSelected(next);
    };
    window.addEventListener(SYNC_EVENT, onSync);
    return () => window.removeEventListener(SYNC_EVENT, onSync);
  }, [byKey]);

  // Lock background scroll while the picker is open (matches the app sheets).
  useEffect(() => {
    if (!picker) return;
    document.documentElement.classList.add('sheet-lock');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closePicker(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.documentElement.classList.remove('sheet-lock');
      window.removeEventListener('keydown', onKey);
    };
  }, [picker]);

  // Wire the drag-to-dismiss gestures while the picker is mounted.
  useEffect(() => {
    if (!picker) return;
    const card = cardRef.current;
    const handle = handleRef.current;
    if (!card) return;

    const threshold = () => Math.min(110, card.offsetHeight * 0.2);
    const snap = () => { card.classList.remove('dragging'); card.style.transform = ''; };
    const swipeOut = () => {                 // continue the swipe, fade out, unmount
      card.classList.remove('dragging');
      card.style.transform = 'translateY(100%)';
      setPickerOpen(false);
      window.setTimeout(() => setPicker(false), 420);
    };

    // (1) Pointer drag on the grab handle — touch devices only.
    const isMouse = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;
    let pd = false, psy = 0, pdy = 0;
    const onPDown = (e: PointerEvent) => {
      pd = true; psy = e.clientY; pdy = 0;
      card.classList.add('dragging');
      handle?.setPointerCapture?.(e.pointerId);
    };
    const onPMove = (e: PointerEvent) => {
      if (!pd) return;
      pdy = Math.max(0, e.clientY - psy);
      card.style.transform = `translateY(${pdy}px)`;
    };
    const onPUp = () => { if (!pd) return; pd = false; if (pdy > threshold()) swipeOut(); else snap(); };
    if (!isMouse && handle) {
      handle.addEventListener('pointerdown', onPDown);
      handle.addEventListener('pointermove', onPMove);
      handle.addEventListener('pointerup', onPUp);
      handle.addEventListener('pointercancel', onPUp);
    }

    // (2) Pull-to-dismiss from the top of the content (touch).
    let sy = 0, ss = 0, act = false, dy = 0, onH = false;
    const onTStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      onH = !!handle && handle.contains(e.target as Node);
      sy = e.touches[0].clientY; ss = card.scrollTop; act = false; dy = 0;
    };
    const onTMove = (e: TouchEvent) => {
      if (onH || e.touches.length !== 1) return;
      const d = e.touches[0].clientY - sy;
      if (!act) { if (ss <= 0 && d > 6) { act = true; card.classList.add('dragging'); } else return; }
      dy = Math.max(0, d);
      card.style.transform = `translateY(${dy}px)`;
      if (e.cancelable) e.preventDefault();
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
  }, [picker]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[18px] font-bold text-white">Ce vrei să faci?</h2>
        <div className="flex items-center gap-3">
          {saving && <span className="text-[12px] text-[#7C9AB4]">Se salvează…</span>}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-xl text-[13px] font-semibold transition-colors ${
                editing
                  ? 'bg-[#E1FB15] text-[#0A2238] hover:bg-[#D2EA0E]'
                  : 'bg-white/10 text-[#C8DAE8] hover:bg-white/15'
              }`}
            >
              {editing ? (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  Gata
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zM19.5 14.25v4.875A1.875 1.875 0 0117.625 21H5.25A2.25 2.25 0 013 18.75V6.375A1.875 1.875 0 014.875 4.5H9.75" />
                  </svg>
                  Editează
                </>
              )}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 auto-rows-fr gap-3 sm:gap-4">
        {selected.map((key) => {
          const m = byKey.get(key);
          if (!m) return null;
          return (
            <div key={key} className="group relative h-full">
              <a
                href={m.href}
                onClick={editing ? (e) => e.preventDefault() : undefined}
                className={`relative overflow-hidden flex flex-col justify-end h-full p-4 sm:p-5 rounded-2xl transition-transform min-h-[104px] sm:min-h-[116px] ${
                  editing ? 'cursor-default' : 'hover:-translate-y-0.5'
                }`}
                style={{ background: m.bg }}
              >
                {/* large icon watermark — bigger than the card, centered, a subtle
                    lighter tint of the card colour, sitting behind the text (z-0) */}
                <span className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden pointer-events-none">
                  <svg
                    className="w-[130%] h-[130%] text-white/[0.10]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={0.9}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d={m.icon} />
                  </svg>
                </span>
                {/* title + subtitle, full width, on top */}
                <span className="tile-text relative z-10 w-full">
                  <span className="block w-full text-[16px] sm:text-[17px] font-bold leading-tight" style={{ color: m.fg }}>
                    {m.label}
                  </span>
                  <span className="block w-full text-[12.5px] mt-1 leading-snug" style={{ color: m.sub }}>
                    {m.desc}
                  </span>
                </span>
              </a>
              <button
                type="button"
                aria-label={`Elimină ${m.label}`}
                onClick={() => remove(key)}
                className={`absolute top-2 right-2 w-7 h-7 inline-flex items-center justify-center rounded-full bg-white/10 text-[#9FB8CC] hover:bg-[#DC4B41]/15 hover:text-[#DC4B41] transition-all ${
                  editing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}

        {Array.from({ length: emptySlots }).map((_, i) => (
          <button
            key={`slot-${i}`}
            type="button"
            onClick={openPicker}
            className="flex h-full flex-col items-center justify-center gap-2 p-4 sm:p-5 rounded-2xl border-2 border-dashed border-white/20 text-[#7C9AB4] hover:border-[#E1FB15]/60 hover:text-[#E1FB15] transition-colors min-h-[104px] sm:min-h-[116px]"
          >
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span className="text-[13px] font-semibold">Adaugă</span>
          </button>
        ))}
      </div>

      {picker && (
        <div
          className={`app-sheet ${pickerOpen ? 'is-open' : ''} fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm`}
          style={{ fontFamily: "'Outfit',ui-sans-serif,system-ui,sans-serif" }}
          onClick={closePicker}
        >
          <div
            ref={cardRef}
            className="app-sheet-card w-full sm:max-w-[820px] max-h-[94vh] sm:max-h-[92vh] overflow-y-auto bg-[#0A2238] rounded-t-[28px] sm:rounded-[28px] ring-1 ring-white/10 shadow-[0_-12px_60px_-12px_rgba(0,0,0,0.7)] sm:shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center px-3 pt-3.5 pb-1 select-none">
              <div className="flex-1" />
              <div ref={handleRef} className="touch-none cursor-grab active:cursor-grabbing flex justify-center flex-1"><span className="w-10 h-1.5 rounded-full fm-grab pointer-events-none" /></div>
              <div className="flex-1 flex justify-end">
                <button type="button" onClick={closePicker} aria-label="Închide" className="w-9 h-9 rounded-full bg-white/10 grid place-items-center text-[#9FB8CC] hover:bg-[#DC4B41]/15 hover:text-[#DC4B41] transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="sheet-content px-4 sm:px-7 pt-3 sm:pt-7 pb-7">
              <div className="mb-6">
                <h2 className="text-[24px] sm:text-[28px] font-bold tracking-[-0.02em] text-white">Adaugă o acțiune</h2>
                <p className="text-[14px] text-[#7C9AB4] mt-1">Alege ce vrei pe pagina principală</p>
              </div>

              {available.length === 0 ? (
                <p className="text-center text-[#7C9AB4] py-12">Ai adăugat toate acțiunile disponibile.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 auto-rows-fr gap-3">
                  {available.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => add(m.key)}
                      className="group relative overflow-hidden flex flex-col justify-end h-full min-h-[104px] p-4 rounded-2xl text-left transition-transform hover:-translate-y-0.5"
                      style={{ background: m.bg }}
                    >
                      {/* large icon watermark behind the text, centered */}
                      <span className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden pointer-events-none">
                        <svg className="w-[130%] h-[130%] text-white/[0.10]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.9}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={m.icon} />
                        </svg>
                      </span>
                      {/* title + subtitle, full width, on top */}
                      <span className="tile-text relative z-10 w-full">
                        <span className="block w-full text-[15.5px] font-bold leading-tight" style={{ color: m.fg }}>{m.label}</span>
                        <span className="block w-full text-[12.5px] mt-1 leading-snug line-clamp-2" style={{ color: m.sub }}>{m.desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
