import { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Loader2, SlidersHorizontal, ChevronDown } from 'lucide-react';

interface MonthCents { month: string; cents: number; }
interface NamedCents { name: string; cents: number; }
interface StatusBucket { status: string; count: number; cents: number; }
interface Analytics {
  period: { from: string; to: string };
  monthlyInvoiced: MonthCents[];
  monthlyCollected: MonthCents[];
  topClients: NamedCents[];
  topProducts: NamedCents[];
  byStatus: StatusBucket[];
  grossMargin: { revenueCents: number; costCents: number; marginCents: number; marginPct: number };
}

const ron = (cents: number) =>
  new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format((cents || 0) / 100);

const STATUS_LABELS: Record<string, string> = {
  draft: 'Ciornă', issued: 'Emisă', sent: 'Trimisă', paid: 'Plătită',
  partial: 'Parțial', overdue: 'Restantă', disputed: 'În dispută', voided: 'Anulată', reversed: 'Stornată',
};
const STATUS_COLORS: Record<string, string> = {
  paid: '#76C893', sent: '#1A759F', issued: '#34A0A4', partial: '#E8A33C',
  overdue: '#DC4B41', disputed: '#DC4B41', draft: '#7C9AB4', voided: '#7C9AB4',
};

function monthLabel(m: string) {
  const [y, mm] = m.split('-');
  const names = ['Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Noi', 'Dec'];
  const idx = Math.max(0, Math.min(11, Number(mm) - 1));
  return `${names[idx]} ${y.slice(2)}`;
}

// Grouped vertical bar chart (facturat vs încasat), pure SVG.
function MonthlyChart({ invoiced, collected }: { invoiced: MonthCents[]; collected: MonthCents[] }) {
  const months = invoiced.map((m) => m.month);
  const max = Math.max(1, ...invoiced.map((m) => m.cents), ...collected.map((m) => m.cents));
  if (months.length === 0) return <div className="text-[14px] text-[#7C9AB4]">Date insuficiente pentru perioada selectată.</div>;

  const H = 220;          // chart height in px
  const colW = 100 / months.length;
  return (
    <div>
      <div className="flex items-center gap-4 mb-3 text-[13px] text-[#9FB8CC]">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#76C893] inline-block" /> Facturat</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#1A759F] inline-block" /> Încasat</span>
      </div>
      <div className="relative" style={{ height: H }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
          {months.map((m, i) => {
            const inv = invoiced[i]?.cents || 0;
            const col = collected[i]?.cents || 0;
            const invH = (inv / max) * 100;
            const colH = (col / max) * 100;
            const x0 = i * colW;
            const bw = colW * 0.34;
            const gap = colW * 0.12;
            const xa = x0 + colW / 2 - bw - gap / 2;
            const xb = x0 + colW / 2 + gap / 2;
            return (
              <g key={m}>
                <rect x={xa} y={100 - invH} width={bw} height={invH} fill="#76C893" />
                <rect x={xb} y={100 - colH} width={bw} height={colH} fill="#1A759F" />
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex mt-1.5">
        {months.map((m) => (
          <div key={m} className="text-[11px] text-[#7C9AB4] text-center" style={{ width: `${colW}%` }}>{monthLabel(m)}</div>
        ))}
      </div>
    </div>
  );
}

// Horizontal bar (top clients / products).
function HBar({ label, value, max, color = '#76C893' }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.max((value / max) * 100, 2) : 0;
  return (
    <div className="flex items-center gap-3 text-[14px]">
      <div className="w-36 shrink-0 truncate text-white" title={label}>{label}</div>
      <div className="flex-1 h-6 bg-white/5 rounded-lg overflow-hidden">
        <div className="h-full rounded-lg" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="w-28 text-right text-white font-semibold tabular-nums">{ron(value)}</div>
    </div>
  );
}

function defaultRange() {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  return { from: start.toISOString().slice(0, 10), to };
}

export default function AnalyticsDashboard() {
  const [range, setRange] = useState(defaultRange());
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const load = async (r = range) => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/invoicing/reports/analytics?from=${r.from}&to=${r.to}`);
      if (!res.ok) { setError('Nu s-au putut încărca datele.'); setLoading(false); return; }
      const d = await res.json();
      setData(d);
    } catch { setError('Eroare de conexiune.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const maxClient = Math.max(1, ...(data?.topClients.map((c) => c.cents) || []));
  const maxProduct = Math.max(1, ...(data?.topProducts.map((p) => p.cents) || []));
  const maxStatus = Math.max(1, ...(data?.byStatus.map((s) => s.cents) || []));

  const totalInvoiced = data?.monthlyInvoiced.reduce((s, m) => s + m.cents, 0) || 0;
  const totalCollected = data?.monthlyCollected.reduce((s, m) => s + m.cents, 0) || 0;
  const collectRate = totalInvoiced > 0 ? Math.round((totalCollected / totalInvoiced) * 100) : 0;

  return (
    <div className="space-y-6">
      {error && <p className="text-[14px] text-[#DC4B41]">{error}</p>}

      {/* KPI row — first */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="bg-white/5 border-0 shadow-none rounded-2xl"><CardContent className="p-4"><p className="text-[13px] text-[#9FB8CC]">Total facturat</p><p className="text-[24px] sm:text-[28px] font-bold tracking-[-0.02em] text-white mt-1 tabular-nums">{ron(totalInvoiced)}</p></CardContent></Card>
        <Card className="bg-white/5 border-0 shadow-none rounded-2xl"><CardContent className="p-4"><p className="text-[13px] text-[#9FB8CC]">Total încasat</p><p className="text-[24px] sm:text-[28px] font-bold tracking-[-0.02em] text-white mt-1 tabular-nums">{ron(totalCollected)}</p></CardContent></Card>
        <Card className="bg-white/5 border-0 shadow-none rounded-2xl"><CardContent className="p-4"><p className="text-[13px] text-[#9FB8CC]">Rată de încasare</p><p className="text-[24px] sm:text-[28px] font-bold tracking-[-0.02em] text-[#E1FB15] mt-1 tabular-nums">{collectRate}%</p></CardContent></Card>
        <Card className="bg-white/5 border-0 shadow-none rounded-2xl"><CardContent className="p-4"><p className="text-[13px] text-[#9FB8CC]">Marjă brută</p><p className="text-[24px] sm:text-[28px] font-bold tracking-[-0.02em] text-white mt-1 tabular-nums">{data ? `${data.grossMargin.marginPct}%` : '—'}</p><p className="text-[12px] text-[#7C9AB4]">{data ? ron(data.grossMargin.marginCents) : ''}</p></CardContent></Card>
      </div>

      {/* Period filter — collapsed by default behind a dropdown */}
      <div>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 text-white text-[14px] font-semibold hover:bg-white/15 transition-colors"
        >
          <SlidersHorizontal className="w-4 h-4" />
          Perioadă: {range.from} – {range.to}
          <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>
        {showFilters && (
          <Card className="bg-white/5 border-0 shadow-none rounded-2xl mt-3">
            <CardContent className="p-4">
              <div className="flex items-end gap-3 flex-wrap">
                <div>
                  <Label className="mb-1.5 block text-[14px] text-[#9FB8CC]">De la</Label>
                  <Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className="w-auto bg-white/5 text-white [color-scheme:dark] focus:ring-2 focus:ring-[#E1FB15]/40" />
                </div>
                <div>
                  <Label className="mb-1.5 block text-[14px] text-[#9FB8CC]">Până la</Label>
                  <Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} className="w-auto bg-white/5 text-white [color-scheme:dark] focus:ring-2 focus:ring-[#E1FB15]/40" />
                </div>
                <Button onClick={() => load(range)} disabled={loading} className="rounded-full bg-[#E1FB15] text-[#0A2238] font-bold hover:bg-[#D2EA0E]">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Actualizează'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Monthly chart */}
      <Card className="bg-white/5 border-0 shadow-none rounded-2xl">
        <CardContent className="p-5">
          <h3 className="text-[16px] font-bold text-white mb-1">Facturat vs încasat pe luni</h3>
          <p className="text-[13px] text-[#9FB8CC] mb-4">Evoluția lunară a sumelor facturate și a celor încasate.</p>
          {data ? <MonthlyChart invoiced={data.monthlyInvoiced} collected={data.monthlyCollected} /> : <div className="text-[14px] text-[#9FB8CC]">Se încarcă...</div>}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top clients */}
        <Card className="bg-white/5 border-0 shadow-none rounded-2xl">
          <CardContent className="p-5">
            <h3 className="text-[16px] font-bold text-white mb-4">Top clienți</h3>
            <div className="space-y-2.5">
              {(data?.topClients.length || 0) === 0 ? (
                <p className="text-[14px] text-[#9FB8CC]">Date insuficiente.</p>
              ) : data!.topClients.map((c) => <HBar key={c.name} label={c.name} value={c.cents} max={maxClient} color="#34A0A4" />)}
            </div>
          </CardContent>
        </Card>

        {/* Top products */}
        <Card className="bg-white/5 border-0 shadow-none rounded-2xl">
          <CardContent className="p-5">
            <h3 className="text-[16px] font-bold text-white mb-4">Top produse / servicii</h3>
            <div className="space-y-2.5">
              {(data?.topProducts.length || 0) === 0 ? (
                <p className="text-[14px] text-[#9FB8CC]">Date insuficiente.</p>
              ) : data!.topProducts.map((p) => <HBar key={p.name} label={p.name} value={p.cents} max={maxProduct} color="#1A759F" />)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status distribution */}
      <Card className="bg-white/5 border-0 shadow-none rounded-2xl">
        <CardContent className="p-5">
          <h3 className="text-[16px] font-bold text-white mb-4">Distribuție pe status</h3>
          <div className="space-y-2.5">
            {(data?.byStatus.length || 0) === 0 ? (
              <p className="text-[14px] text-[#9FB8CC]">Date insuficiente.</p>
            ) : data!.byStatus.map((s) => (
              <div key={s.status} className="flex items-center gap-3 text-[14px]">
                <div className="w-36 shrink-0 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: STATUS_COLORS[s.status] || '#7C9AB4' }} />
                  <span className="text-white">{STATUS_LABELS[s.status] || s.status}</span>
                </div>
                <div className="flex-1 h-6 bg-white/5 rounded-lg overflow-hidden">
                  <div className="h-full rounded-lg" style={{ width: `${Math.max((s.cents / maxStatus) * 100, 2)}%`, background: STATUS_COLORS[s.status] || '#7C9AB4' }} />
                </div>
                <div className="w-12 text-right text-[#9FB8CC] tabular-nums">{s.count}</div>
                <div className="w-28 text-right text-white font-semibold tabular-nums">{ron(s.cents)}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
