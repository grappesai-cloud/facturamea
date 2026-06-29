// Renders the quick-action launcher tiles and the "add action" picker.
import { useEffect, useMemo, useState } from 'react';
import { BottomSheet } from './ui/BottomSheet';

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
  const [picker, setPicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Open/close via the shared BottomSheet — identical reveal/close to the app menus.
  const openPicker = () => setPicker(true);
  const closePicker = () => setPicker(false);

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


  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[18px] font-bold text-white">Ce vrei să faci?</h2>
        <div className="flex items-center gap-3">
          {saving && <span className="text-[12px] text-[#8FA6BC]">Se salvează…</span>}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-xl text-[13px] font-semibold transition-colors ${
                editing
                  ? 'bg-[#E1FB15] text-[#07090f] hover:bg-[#D2EA0E]'
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
                className={`relative overflow-hidden flex flex-col justify-between h-full p-4 sm:p-5 rounded-2xl transition-transform min-h-[104px] sm:min-h-[116px] ${
                  editing ? 'cursor-default' : 'group-hover:-translate-y-0.5'
                }`}
                style={{ background: m.bg }}
              >
                {/* small icon, top-left */}
                <span className="relative z-10 inline-flex" aria-hidden="true">
                  <svg
                    className="w-7 h-7 sm:w-8 sm:h-8"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.7}
                    style={{ color: m.fg }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d={m.icon} />
                  </svg>
                </span>
                {/* title + subtitle, full width, below the icon */}
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
                className={`absolute top-2 right-2 w-7 h-7 inline-flex items-center justify-center rounded-full bg-white/10 text-[#A8BED2] hover:bg-[#DC4B41]/15 hover:text-[#DC4B41] transition-all ${
                  editing ? 'opacity-100' : 'opacity-0 pointer-events-none lg:pointer-events-auto lg:group-hover:opacity-100 focus:opacity-100'
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
            className="flex h-full flex-col items-center justify-center gap-2 p-4 sm:p-5 rounded-2xl border-2 border-dashed border-white/20 text-[#8FA6BC] hover:border-[#E1FB15]/60 hover:text-[#E1FB15] transition-colors min-h-[104px] sm:min-h-[116px]"
          >
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span className="text-[13px] font-semibold">Adaugă</span>
          </button>
        ))}
      </div>

      <BottomSheet open={picker} onClose={closePicker} align="top" cardClassName="sm:max-w-[820px]">
        <div className="sheet-content px-4 sm:px-7 pt-5 sm:pt-7 pb-7">
          <div className="mb-6 pr-12">
            <h2 className="text-[24px] sm:text-[28px] font-bold tracking-[-0.02em] text-white">Adaugă o acțiune</h2>
            <p className="text-[14px] text-[#8FA6BC] mt-1">Alege ce vrei pe pagina principală</p>
          </div>

          {available.length === 0 ? (
            <p className="text-center text-[#8FA6BC] py-12">Ai adăugat toate acțiunile disponibile.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 auto-rows-fr gap-3">
              {available.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => add(m.key)}
                  className="relative overflow-hidden flex flex-col justify-between h-full min-h-[104px] p-4 rounded-2xl text-left transition-transform hover:-translate-y-0.5"
                  style={{ background: m.bg }}
                >
                  {/* small icon, top-left */}
                  <span className="relative z-10 inline-flex" aria-hidden="true">
                    <svg className="w-7 h-7 sm:w-8 sm:h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} style={{ color: m.fg }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={m.icon} />
                    </svg>
                  </span>
                  {/* title + subtitle, full width, below the icon */}
                  <span className="tile-text relative z-10 w-full">
                    <span className="block w-full text-[15.5px] font-bold leading-tight" style={{ color: m.fg }}>{m.label}</span>
                    <span className="block w-full text-[12.5px] mt-1 leading-snug line-clamp-2" style={{ color: m.sub }}>{m.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}
