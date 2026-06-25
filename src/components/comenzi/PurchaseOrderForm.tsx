import { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Select } from '../ui/Select';
import { Plus, X, Loader2, Check } from 'lucide-react';

interface Supplier { id: string; name: string; }
interface Product { id: string; name: string; defaultUnitPriceCents: number | null; defaultVatRate: number | null; }

interface Line {
  productId: string;
  name: string;
  quantity: string;
  unitPrice: string; // RON, as typed
  vatRate: string;
}

const newLine = (): Line => ({ productId: '', name: '', quantity: '1', unitPrice: '', vatRate: '21' });

const ron = (cents: number) =>
  new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format((cents || 0) / 100);

export default function PurchaseOrderForm() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedDate, setExpectedDate] = useState('');
  const [number, setNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [sr, pr] = await Promise.all([
          fetch('/api/cheltuieli/suppliers').then((r) => r.json()).catch(() => ({ results: [] })),
          fetch('/api/pos/products').then((r) => r.json()).catch(() => ({ results: [] })),
        ]);
        setSuppliers(sr.results || []);
        setProducts(pr.results || []);
      } catch { /* leave empty */ }
    })();
  }, []);

  const updateLine = (i: number, patch: Partial<Line>) => {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };

  const onPickProduct = (i: number, productId: string) => {
    const p = products.find((x) => x.id === productId);
    updateLine(i, {
      productId,
      name: p ? p.name : lines[i].name,
      unitPrice: p?.defaultUnitPriceCents != null ? (p.defaultUnitPriceCents / 100).toFixed(2) : lines[i].unitPrice,
      vatRate: p?.defaultVatRate != null ? String(p.defaultVatRate) : lines[i].vatRate,
    });
  };

  const onPickSupplier = (id: string) => {
    setSupplierId(id);
    const s = suppliers.find((x) => x.id === id);
    if (s) setSupplierName(s.name);
  };

  const totals = lines.reduce(
    (acc, l) => {
      const qty = Number(l.quantity) || 0;
      const unit = Math.round((Number(l.unitPrice) || 0) * 100);
      const net = Math.round(qty * unit);
      const vat = Math.round(net * ((Number(l.vatRate) || 0) / 100));
      acc.net += net; acc.vat += vat; acc.total += net + vat;
      return acc;
    },
    { net: 0, vat: 0, total: 0 }
  );

  const submit = async (status: 'draft' | 'sent') => {
    setError(''); setDone(false);
    if (!supplierId && !supplierName.trim()) { setError('Alege un furnizor'); return; }
    const payload = {
      supplierId: supplierId || null,
      supplierName: supplierName.trim() || null,
      orderDate,
      expectedDate: expectedDate || null,
      number: number.trim() || null,
      status,
      notes: notes.trim() || null,
      lines: lines
        .filter((l) => l.name.trim() && Number(l.quantity) > 0)
        .map((l) => ({
          productId: l.productId || null,
          name: l.name.trim(),
          quantity: Number(l.quantity) || 0,
          unitPriceCents: Math.round((Number(l.unitPrice) || 0) * 100),
          vatRate: Number(l.vatRate) || 0,
        })),
    };
    if (payload.lines.length === 0) { setError('Adaugă cel puțin o linie validă'); return; }

    setBusy(true);
    try {
      const res = await fetch('/api/comenzi/purchase', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Eroare'); return; }
      setDone(true);
      setTimeout(() => { window.location.href = '/app/comenzi?tab=furnizori'; }, 700);
    } catch { setError('Eroare conexiune'); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-[#DC4B41]">{error}</p>}
      {done && (
        <p className="text-sm text-[#2E9E6A] flex items-center gap-1.5"><Check className="w-4 h-4" /> Comandă salvată.</p>
      )}

      <Card className="bg-white/5 border-0 shadow-none">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label className="mb-1 block text-xs text-[#9FB8CC]">Furnizor *</Label>
              {suppliers.length > 0 ? (
                <Select className="bg-white/10 border-0 text-white placeholder:text-[#7C9AB4] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" value={supplierId} onChange={(e) => onPickSupplier(e.target.value)}>
                  <option value="">Alege furnizorul</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              ) : (
                <Input className="bg-white/10 border-0 text-white placeholder:text-[#7C9AB4] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Nume furnizor" />
              )}
            </div>
            <div><Label className="mb-1 block text-xs text-[#9FB8CC]">Data comenzii</Label><Input className="bg-white/10 border-0 text-white placeholder:text-[#7C9AB4] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></div>
            <div><Label className="mb-1 block text-xs text-[#9FB8CC]">Livrare estimată</Label><Input className="bg-white/10 border-0 text-white placeholder:text-[#7C9AB4] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} /></div>
            <div><Label className="mb-1 block text-xs text-[#9FB8CC]">Număr (opțional)</Label><Input className="bg-white/10 border-0 text-white placeholder:text-[#7C9AB4] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Auto" /></div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/5 border-0 shadow-none">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white text-sm">Linii comandă</h3>
            <Button className="bg-white/10 border-0 text-white hover:bg-white/15 rounded-full" size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, newLine()])}><Plus className="w-4 h-4 mr-1" /> Adaugă linie</Button>
          </div>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end border-b border-white/5 pb-2">
                <div className="md:col-span-4">
                  <Label className="mb-1 block text-[10px] uppercase tracking-wider text-[#7C9AB4]">Produs</Label>
                  {products.length > 0 ? (
                    <Select className="bg-white/10 border-0 text-white placeholder:text-[#7C9AB4] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" value={l.productId} onChange={(e) => onPickProduct(i, e.target.value)}>
                      <option value="">Liber (fără stoc)</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </Select>
                  ) : (
                    <Input className="bg-white/10 border-0 text-white placeholder:text-[#7C9AB4] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" value={l.name} onChange={(e) => updateLine(i, { name: e.target.value })} placeholder="Denumire produs" />
                  )}
                </div>
                {products.length > 0 && (
                  <div className="md:col-span-3">
                    <Label className="mb-1 block text-[10px] uppercase tracking-wider text-[#7C9AB4]">Denumire</Label>
                    <Input className="bg-white/10 border-0 text-white placeholder:text-[#7C9AB4] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" value={l.name} onChange={(e) => updateLine(i, { name: e.target.value })} placeholder="Denumire" />
                  </div>
                )}
                <div className="md:col-span-1">
                  <Label className="mb-1 block text-[10px] uppercase tracking-wider text-[#7C9AB4]">Cant.</Label>
                  <Input className="bg-white/10 border-0 text-white placeholder:text-[#7C9AB4] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" type="number" step="any" value={l.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <Label className="mb-1 block text-[10px] uppercase tracking-wider text-[#7C9AB4]">Cost unitar</Label>
                  <Input className="bg-white/10 border-0 text-white placeholder:text-[#7C9AB4] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" type="number" step="any" value={l.unitPrice} onChange={(e) => updateLine(i, { unitPrice: e.target.value })} placeholder="0.00" />
                </div>
                <div className="md:col-span-1">
                  <Label className="mb-1 block text-[10px] uppercase tracking-wider text-[#7C9AB4]">TVA %</Label>
                  <Input className="bg-white/10 border-0 text-white placeholder:text-[#7C9AB4] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" type="number" step="any" value={l.vatRate} onChange={(e) => updateLine(i, { vatRate: e.target.value })} />
                </div>
                <div className="md:col-span-1 flex justify-end">
                  <button onClick={() => setLines((ls) => ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls)} className="w-9 h-9 rounded-full grid place-items-center text-[#9FB8CC] hover:bg-white/10 hover:text-[#DC4B41] transition-colors" title="Șterge linia"><X className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>

          <div>
            <Label className="mb-1 block text-xs text-[#9FB8CC]">Observații</Label>
            <Input className="bg-white/10 border-0 text-white placeholder:text-[#7C9AB4] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opțional" />
          </div>

          <div className="flex flex-col items-end gap-0.5 pt-2 text-sm">
            <p className="text-[#9FB8CC]">Net: <span className="font-semibold text-white tabular-nums">{ron(totals.net)}</span></p>
            <p className="text-[#9FB8CC]">TVA: <span className="font-semibold text-white tabular-nums">{ron(totals.vat)}</span></p>
            <p className="text-white text-base font-bold tabular-nums">Total: {ron(totals.total)}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button className="bg-[#E1FB15] text-[#0A2238] hover:bg-[#D2EA0E] rounded-full font-bold shadow-none" disabled={busy} onClick={() => submit('sent')}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvează și trimite'}</Button>
            <Button className="bg-white/10 border-0 text-white hover:bg-white/15 rounded-full" disabled={busy} variant="outline" onClick={() => submit('draft')}>Salvează ca ciornă</Button>
            <a href="/app/comenzi?tab=furnizori"><Button className="text-[#9FB8CC] hover:bg-white/10 hover:text-white rounded-full" variant="ghost" type="button">Renunță</Button></a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
