import * as React from 'react';
import { cn } from '../../lib/utils';

export interface DatePickerProps {
  value: string;                       // 'YYYY-MM-DD' or ''
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
}

const MONTHS = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'];
const WEEKDAYS = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du'];

const pad = (n: number) => String(n).padStart(2, '0');
const toISO = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

function parseISO(s: string): { y: number; m: number; d: number } | null {
  const mt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!mt) return null;
  return { y: +mt[1], m: +mt[2] - 1, d: +mt[3] };
}

function formatHuman(s: string): string {
  const p = parseISO(s);
  if (!p) return '';
  const short = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sep.', 'oct.', 'nov.', 'dec.'];
  return `${p.d} ${short[p.m]} ${p.y}`;
}

/** Fully custom calendar — replaces the native <input type="date"> popup. */
export function DatePicker({ value, onChange, placeholder = 'Alege data', className, disabled, min, max }: DatePickerProps) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);

  const today = new Date();
  const sel = parseISO(value);
  const [view, setView] = React.useState(() => {
    const base = sel || { y: today.getFullYear(), m: today.getMonth() };
    return { y: base.y, m: base.m };
  });

  // When the value changes externally, follow it into view.
  React.useEffect(() => {
    const p = parseISO(value);
    if (p) setView({ y: p.y, m: p.m });
  }, [value]);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  // Build the day grid (Monday-first). 0 = leading blank.
  const firstDow = (new Date(view.y, view.m, 1).getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: number[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(0);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(0);

  const isToday = (d: number) => d === today.getDate() && view.m === today.getMonth() && view.y === today.getFullYear();
  const isSel = (d: number) => !!sel && d === sel.d && view.m === sel.m && view.y === sel.y;
  const outOfRange = (d: number) => {
    const iso = toISO(view.y, view.m, d);
    return (min && iso < min) || (max && iso > max);
  };

  const shift = (delta: number) => {
    const m = view.m + delta;
    setView({ y: view.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 });
  };
  const choose = (d: number) => { onChange(toISO(view.y, view.m, d)); setOpen(false); };

  return (
    <div ref={wrapRef} className="fm-cal relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'fm-cal-trigger flex h-11 w-full items-center justify-between gap-2 rounded-xl border-0 bg-white/5 px-4 text-left text-sm text-white transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-[#E1FB15]/40 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        <span className={cn('truncate', !value && 'text-[#7C9AB4]')}>{value ? formatHuman(value) : placeholder}</span>
        <svg className="w-4 h-4 shrink-0 opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 2v3m8-3v3M3.5 9h17M5 4.5h14A1.5 1.5 0 0 1 20.5 6v13A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V6A1.5 1.5 0 0 1 5 4.5Z" />
        </svg>
      </button>

      {open && (
        <div className="fm-cal-pop absolute left-0 z-50 mt-1.5 w-[300px] max-w-[88vw] rounded-2xl p-3">
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => shift(-1)} className="fm-cal-nav w-8 h-8 grid place-items-center rounded-lg" aria-label="Luna anterioară">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" /></svg>
            </button>
            <span className="text-[14px] font-bold fm-cal-title">{MONTHS[view.m]} {view.y}</span>
            <button type="button" onClick={() => shift(1)} className="fm-cal-nav w-8 h-8 grid place-items-center rounded-lg" aria-label="Luna următoare">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" /></svg>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((w) => <span key={w} className="fm-cal-dow text-center text-[11px] font-semibold py-1">{w}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => d === 0
              ? <span key={i} />
              : (
                <button
                  key={i}
                  type="button"
                  disabled={!!outOfRange(d)}
                  onClick={() => choose(d)}
                  className={cn('fm-cal-day h-9 rounded-lg text-[13px] tabular-nums', isToday(d) && 'is-today', isSel(d) && 'is-selected')}
                >
                  {d}
                </button>
              ))}
          </div>

          <div className="flex items-center justify-between mt-2 pt-2 fm-cal-foot">
            <button type="button" onClick={() => { const n = new Date(); onChange(toISO(n.getFullYear(), n.getMonth(), n.getDate())); setOpen(false); }} className="fm-cal-action text-[12px] font-semibold px-2 py-1 rounded-lg">Azi</button>
            {value && <button type="button" onClick={() => { onChange(''); setOpen(false); }} className="fm-cal-action text-[12px] font-semibold px-2 py-1 rounded-lg">Șterge</button>}
          </div>
        </div>
      )}
    </div>
  );
}
