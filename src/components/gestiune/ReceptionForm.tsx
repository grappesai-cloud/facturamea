import { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Select } from '../ui/Select';
import { Plus, Trash2, Loader2, Check } from 'lucide-react';

interface Warehouse { id: string; name: string; }
interface Supplier { id: string; name: string; }
interface Product { id: string; name: string; code: string | null; defaultUm: string | null; defaultVatRate: number | null; }

interface Line {
  productId: string;
  name: string;
  um: string;
  quantity: string;
  unitCost: string; // RON, as typed
  vatRate: string;
}

const newLine = (): Line => ({ productId: '', name: '', um: 'buc', quantity: '1', unitCost: '', vatRate: '21' });

const ron = (cents: number) =>
  new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format((cents || 0) / 100);

export default function ReceptionForm() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [nirNumber, setNirNumber] = useState('');
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('');
  const [receptionDate, setReceptionDate] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [wr, sr, pr] = await Promise.all([
          fetch('/api/gestiune/warehouses').then((r) => r.json()).catch(() => ({ results: [] })),
          fetch('/api/cheltuieli/suppliers').then((r) => r.json()).catch(() => ({ results: [] })),
          fetch('/api/pos/products').then((r) => r.json()).catch(() => ({ results: [] })),
        ]);
        const ws = wr.results || [];
        setWarehouses(ws);
        if (ws.length) setWarehouseId(ws[0].id);
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
      um: p?.defaultUm || lines[i].um,
      vatRate: p?.defaultVatRate != null ? String(p.defaultVatRate) : lines[i].vatRate,
    });
  };

  const totals = lines.reduce(
    (acc, l) => {
      const qty = Number(l.quantity) || 0;
      const unit = Math.round((Number(l.unitCost) || 0) * 100);
      const net = Math.round(qty * unit);
      const vat = Math.round(net * ((Number(l.vatRate) || 0) / 100));
      acc.net += net; acc.vat += vat; acc.total += net + vat;
      return acc;
    },
    { net: 0, vat: 0, total: 0 }
  );

  const submit = async () => {
    setError(''); setDone(false);
    if (!warehouseId) { setError('Alege o gestiune'); return; }
    if (!nirNumber.trim()) { setError('Numărul NIR e obligatoriu'); return; }
    const payload = {
      warehouseId,
      supplierId: supplierId || null,
      nirNumber: nirNumber.trim(),
      supplierInvoiceNumber: supplierInvoiceNumber.trim() || null,
      receptionDate,
      status: 'posted',
      lines: lines
        .filter((l) => l.name.trim() && Number(l.quantity) > 0)
        .map((l) => ({
          productId: l.productId || null,
          name: l.name.trim(),
          um: l.um,
          quantity: Number(l.quantity) || 0,
          unitCostCents: Math.round((Number(l.unitCost) || 0) * 100),
          vatRate: Number(l.vatRate) || 0,
        })),
    };
    if (payload.lines.length === 0) { setError('Adaugă cel puțin o linie validă'); return; }

    setBusy(true);
    try {
      const res = await fetch('/api/gestiune/receptions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Eroare'); return; }
      setDone(true);
      setNirNumber(''); setSupplierInvoiceNumber(''); setLines([newLine()]);
    } catch { setError('Eroare conexiune'); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-[#B91C1C]">{error}</p>}
      {done && (
        <p className="text-sm text-[#15803D] flex items-center gap-1.5"><Check className="w-4 h-4" /> Recepție salvată. Stocul a fost actualizat.</p>
      )}

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="mb-1 block text-xs">Gestiune *</Label>
              <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                <option value="">Alege gestiunea</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-xs">Furnizor</Label>
              <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Fără furnizor</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
            <div><Label className="mb-1 block text-xs">Data recepției</Label><Input type="date" value={receptionDate} onChange={(e) => setReceptionDate(e.target.value)} /></div>
            <div><Label className="mb-1 block text-xs">Număr NIR *</Label><Input value={nirNumber} onChange={(e) => setNirNumber(e.target.value)} placeholder="NIR-001" /></div>
            <div><Label className="mb-1 block text-xs">Nr. factură furnizor</Label><Input value={supplierInvoiceNumber} onChange={(e) => setSupplierInvoiceNumber(e.target.value)} /></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-[#0A0A0A] text-sm">Linii recepție</h3>
            <Button size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, newLine()])}><Plus className="w-4 h-4 mr-1" /> Adaugă linie</Button>
          </div>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end border-b border-[#F0F0EC] pb-2">
                <div className="md:col-span-4">
                  <Label className="mb-1 block text-[10px] uppercase tracking-wider text-[#8A8A85]">Produs</Label>
                  {products.length > 0 ? (
                    <Select value={l.productId} onChange={(e) => onPickProduct(i, e.target.value)}>
                      <option value="">Liber (fără stoc)</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </Select>
                  ) : (
                    <Input value={l.name} onChange={(e) => updateLine(i, { name: e.target.value })} placeholder="Denumire produs" />
                  )}
                </div>
                {products.length > 0 && (
                  <div className="md:col-span-3">
                    <Label className="mb-1 block text-[10px] uppercase tracking-wider text-[#8A8A85]">Denumire</Label>
                    <Input value={l.name} onChange={(e) => updateLine(i, { name: e.target.value })} placeholder="Denumire" />
                  </div>
                )}
                <div className="md:col-span-1">
                  <Label className="mb-1 block text-[10px] uppercase tracking-wider text-[#8A8A85]">Cant.</Label>
                  <Input type="number" step="any" value={l.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} />
                </div>
                <div className="md:col-span-1">
                  <Label className="mb-1 block text-[10px] uppercase tracking-wider text-[#8A8A85]">UM</Label>
                  <Input value={l.um} onChange={(e) => updateLine(i, { um: e.target.value })} />
                </div>
                <div className="md:col-span-1">
                  <Label className="mb-1 block text-[10px] uppercase tracking-wider text-[#8A8A85]">Cost</Label>
                  <Input type="number" step="any" value={l.unitCost} onChange={(e) => updateLine(i, { unitCost: e.target.value })} placeholder="0.00" />
                </div>
                <div className="md:col-span-1">
                  <Label className="mb-1 block text-[10px] uppercase tracking-wider text-[#8A8A85]">TVA %</Label>
                  <Input type="number" step="any" value={l.vatRate} onChange={(e) => updateLine(i, { vatRate: e.target.value })} />
                </div>
                <div className="md:col-span-1 flex justify-end">
                  <button onClick={() => setLines((ls) => ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls)} className="p-2 text-[#A8A8A4] hover:text-[#B91C1C]"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col items-end gap-0.5 pt-2 text-sm">
            <p className="text-[#6B6B68]">Net: <span className="font-semibold text-[#0A0A0A]">{ron(totals.net)}</span></p>
            <p className="text-[#6B6B68]">TVA: <span className="font-semibold text-[#0A0A0A]">{ron(totals.vat)}</span></p>
            <p className="text-[#0A0A0A] text-base font-bold">Total: {ron(totals.total)}</p>
          </div>

          <div className="flex gap-2">
            <Button disabled={busy} onClick={submit}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvează recepția'}</Button>
            <a href="/app/gestiune/nir"><Button variant="outline" type="button">Înapoi la lista NIR</Button></a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
