import { useMemo, useRef, useState } from 'react';
import { DatePicker } from '../ui/DatePicker';

// Bonul, serializat din pagina Astro (datele rămân din aceeași sursă: posSales).
export interface PosSaleRow {
  id: string;
  receiptNumber: string;
  createdAt: string | null;
  paymentMethod: string;
  totalCents: number;
  vatCents: number;
  fiscalStatus?: string | null;
  fiscalReceiptNumber?: string | null;
}

const ron = (cents: number) =>
  new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format((cents || 0) / 100);

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const payLabel: Record<string, string> = { cash: 'Numerar', card: 'Card', mixed: 'Mixt' };

const fmtTime = (d: string | null) =>
  d ? new Date(d).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }) : '—';

const fmtDayHeader = (key: string) => {
  const [y, m, dd] = key.split('-').map(Number);
  const date = new Date(y, m - 1, dd);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  if (key === dayKey(today)) return 'Astăzi';
  if (key === dayKey(yest)) return 'Ieri';
  return date.toLocaleDateString('ro-RO', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
};

const fiscal = (s: PosSaleRow): { text: string; cls: string } | null => {
  if (s.fiscalStatus === 'printed') return { text: s.fiscalReceiptNumber ? `Fiscal · ${s.fiscalReceiptNumber}` : 'Fiscal', cls: 'bg-[#2E9E6A]/15 text-[#46C28A]' };
  if (s.fiscalStatus === 'error') return { text: 'Fiscal eșuat', cls: 'bg-[#DC4B41]/15 text-[#E8736A]' };
  return null;
};

interface DayGroup {
  key: string;
  sales: PosSaleRow[];
  totalCents: number;
  vatCents: number;
}

export default function PosHistory({ rows }: { rows: PosSaleRow[] }) {
  const [pick, setPick] = useState('');
  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Grupare pe zi (cronologic descrescător), cu total zilnic.
  const groups: DayGroup[] = useMemo(() => {
    const map = new Map<string, DayGroup>();
    for (const s of rows) {
      const key = s.createdAt ? dayKey(new Date(s.createdAt)) : '—';
      let g = map.get(key);
      if (!g) { g = { key, sales: [], totalCents: 0, vatCents: 0 }; map.set(key, g); }
      g.sales.push(s);
      g.totalCents += s.totalCents || 0;
      g.vatCents += s.vatCents || 0;
    }
    return Array.from(map.values()).sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [rows]);

  const availableDays = useMemo(() => new Set(groups.map((g) => g.key)), [groups]);
  const minDay = groups.length ? groups[groups.length - 1].key : undefined;
  const maxDay = groups.length ? groups[0].key : undefined;

  const jumpTo = (iso: string) => {
    setPick(iso);
    if (!iso) return;
    const el = groupRefs.current[iso];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('fm-day-flash');
      window.setTimeout(() => el.classList.remove('fm-day-flash'), 1400);
    }
  };

  return (
    <div className="space-y-6">
      {/* Calendar — sari la o zi. */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <span className="text-[13px] text-[#A8BED2] shrink-0">Sari la ziua:</span>
        <div className="w-full sm:w-[240px]">
          <DatePicker
            value={pick}
            onChange={jumpTo}
            placeholder="Alege o zi"
            min={minDay}
            max={maxDay}
            className="bg-white/5 border border-white/[0.12] text-white"
          />
        </div>
        {pick && !availableDays.has(pick) && (
          <span className="text-[13px] text-[#8FA6BC]">Nicio vânzare în această zi.</span>
        )}
      </div>

      {/* Istoric pe zile. */}
      <div className="space-y-6">
        {groups.map((g) => (
          <div
            key={g.key}
            ref={(el) => { groupRefs.current[g.key] = el; }}
            className="scroll-mt-24 rounded-2xl transition-shadow"
          >
            <div className="flex items-end justify-between gap-3 mb-2.5 px-1">
              <div className="min-w-0">
                <h2 className="text-[15px] sm:text-[17px] font-semibold text-white capitalize truncate">{fmtDayHeader(g.key)}</h2>
                <p className="text-[12px] text-[#8FA6BC]">{g.sales.length} {g.sales.length === 1 ? 'bon' : 'bonuri'}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold text-white tabular-nums">{ron(g.totalCents)}</p>
                <p className="text-[12px] text-[#8FA6BC] tabular-nums">TVA {ron(g.vatCents)}</p>
              </div>
            </div>
            <ul className="space-y-2.5">
              {g.sales.map((s) => (
                <li key={s.id} className="flex items-center gap-3 p-4 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors">
                  <div className="min-w-0">
                    <p className="font-mono font-bold text-white truncate">
                      {s.receiptNumber}
                      {fiscal(s) && (
                        <span className={`ml-2 align-middle inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${fiscal(s)!.cls}`}>{fiscal(s)!.text}</span>
                      )}
                    </p>
                    <p className="text-[13px] text-[#8FA6BC] tabular-nums mt-0.5">
                      {fmtTime(s.createdAt)} · {payLabel[s.paymentMethod] || s.paymentMethod}
                    </p>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="font-bold text-white tabular-nums">{ron(s.totalCents)}</p>
                    <p className="text-[13px] text-[#8FA6BC] tabular-nums mt-0.5">TVA {ron(s.vatCents)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
