import { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Select } from '../ui/Select';
import { Loader2, Check, ClipboardList } from 'lucide-react';

interface Warehouse { id: string; name: string; }
interface CountLine {
  id: string;
  productId: string | null;
  productName: string | null;
  productCode: string | null;
  um: string | null;
  systemQty: number;
  countedQty: number;
}

const qtyFmt = (n: number) =>
  new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 3 }).format(n || 0);

export default function StockCountForm() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [countDate, setCountDate] = useState(new Date().toISOString().slice(0, 10));
  const [countId, setCountId] = useState('');
  const [number, setNumber] = useState('');
  const [lines, setLines] = useState<CountLine[]>([]);
  const [counted, setCounted] = useState<Record<string, string>>({}); // lineId -> typed
  const [phase, setPhase] = useState<'pick' | 'count'>('pick');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const wr = await fetch('/api/gestiune/warehouses').then((r) => r.json()).catch(() => ({ results: [] }));
        const ws = wr.results || [];
        setWarehouses(ws);
        if (ws.length) setWarehouseId(ws[0].id);
      } catch { /* leave empty */ }
    })();
  }, []);

  const startCount = async () => {
    setError(''); setDone(false);
    if (!warehouseId) { setError('Alege o gestiune'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/gestiune/counts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warehouseId, countDate }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Eroare'); return; }
      setCountId(data.id);
      setNumber(data.number || '');
      // Load lines.
      const detail = await fetch(`/api/gestiune/counts/${data.id}`).then((r) => r.json()).catch(() => ({ lines: [] }));
      const ls: CountLine[] = detail.lines || [];
      setLines(ls);
      const init: Record<string, string> = {};
      ls.forEach((l) => { init[l.id] = String(l.systemQty ?? 0); });
      setCounted(init);
      setPhase('count');
    } catch { setError('Eroare conexiune'); } finally { setBusy(false); }
  };

  const finalize = async () => {
    setError(''); setDone(false);
    if (!countId) return;
    setBusy(true);
    try {
      const payload = {
        lines: lines.map((l) => ({ id: l.id, productId: l.productId, countedQty: Number(counted[l.id] ?? l.systemQty) || 0 })),
      };
      const res = await fetch(`/api/gestiune/counts/${countId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Eroare'); return; }
      setDone(true);
      setTimeout(() => { window.location.href = '/app/gestiune/inventariere'; }, 800);
    } catch { setError('Eroare conexiune'); } finally { setBusy(false); }
  };

  const diffFor = (l: CountLine) => (Number(counted[l.id] ?? l.systemQty) || 0) - (Number(l.systemQty) || 0);

  const inputCls = 'rounded-xl bg-white/10 text-white placeholder:text-[#7C9AB4] border-0 focus:ring-2 focus:ring-[#E1FB15]/40 hover:border-0';
  const selectCls = `${inputCls} [color-scheme:dark]`;
  const btnPrimary = 'rounded-full bg-[#E1FB15] text-[#0A2238] font-bold hover:bg-[#D2EA0E] shadow-none';
  const btnSecondary = 'rounded-full bg-white/10 text-white font-semibold hover:bg-white/15';

  if (phase === 'pick') {
    return (
      <div className="space-y-4">
        {error && <p className="text-sm text-[#DC4B41]">{error}</p>}
        <Card className="bg-white/5 border-0 rounded-2xl shadow-none hover:shadow-none hover:translate-y-0">
          <CardContent className="p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="mb-1.5 block text-[13px] font-medium text-[#9FB8CC]">Gestiune *</Label>
                <Select className={selectCls} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                  <option value="">Alege gestiunea</option>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </Select>
              </div>
              <div><Label className="mb-1.5 block text-[13px] font-medium text-[#9FB8CC]">Data inventarului</Label><Input className={`${inputCls} [color-scheme:dark]`} type="date" value={countDate} onChange={(e) => setCountDate(e.target.value)} /></div>
            </div>
            <Button className={btnPrimary} disabled={busy} onClick={startCount}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ClipboardList className="w-4 h-4 mr-1" /> Pornește inventarul</>}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-[#DC4B41]">{error}</p>}
      {done && (
        <p className="text-sm text-[#2E9E6A] flex items-center gap-1.5"><Check className="w-4 h-4" /> Inventar finalizat. Stocul a fost ajustat.</p>
      )}
      <Card className="bg-white/5 border-0 rounded-2xl shadow-none hover:shadow-none hover:translate-y-0">
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white text-sm">Inventar {number}</h3>
            <span className="text-xs text-[#9FB8CC]">{lines.length} produse</span>
          </div>

          {lines.length === 0 ? (
            <p className="text-sm text-[#9FB8CC] py-6 text-center">Nu există stoc în această gestiune. Inventarul e gol.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-[#7C9AB4] border-b border-white/10">
                    <th className="py-2 pr-3 font-medium">Produs</th>
                    <th className="py-2 px-3 font-medium text-right">Scriptic</th>
                    <th className="py-2 px-3 font-medium text-right">Faptic</th>
                    <th className="py-2 pl-3 font-medium text-right">Diferență</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const d = diffFor(l);
                    const dCls = d === 0 ? 'text-[#9FB8CC]' : d > 0 ? 'text-[#2E9E6A]' : 'text-[#DC4B41]';
                    return (
                      <tr key={l.id} className="border-b border-white/5">
                        <td className="py-2 pr-3 text-white">{l.productName || l.productId} {l.productCode ? <span className="text-[#7C9AB4]">({l.productCode})</span> : null}</td>
                        <td className="py-2 px-3 text-right text-[#9FB8CC] tabular-nums">{qtyFmt(l.systemQty)}</td>
                        <td className="py-2 px-3 text-right w-[120px]">
                          <Input type="number" step="any" className={`${inputCls} [color-scheme:dark] text-right`}
                            value={counted[l.id] ?? ''}
                            onChange={(e) => setCounted((c) => ({ ...c, [l.id]: e.target.value }))} />
                        </td>
                        <td className={`py-2 pl-3 text-right font-semibold tabular-nums ${dCls}`}>{d > 0 ? '+' : ''}{qtyFmt(d)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button className={btnPrimary} disabled={busy || lines.length === 0} variant="dark" onClick={finalize}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Finalizează și ajustează stocul'}
            </Button>
            <a href="/app/gestiune/inventariere"><Button className={btnSecondary} variant="ghost" type="button">Renunță</Button></a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
