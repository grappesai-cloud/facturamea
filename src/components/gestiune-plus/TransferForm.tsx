import { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Select } from '../ui/Select';
import { Loader2, Check, ArrowRight } from 'lucide-react';

interface Warehouse { id: string; name: string; }
interface Product { id: string; name: string; }
interface Level { warehouseId: string; productId: string; quantity: number; }

const qtyFmt = (n: number) =>
  new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 3 }).format(n || 0);

export default function TransferForm() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [wr, pr, sr] = await Promise.all([
          fetch('/api/gestiune/warehouses').then((r) => r.json()).catch(() => ({ results: [] })),
          fetch('/api/pos/products').then((r) => r.json()).catch(() => ({ results: [] })),
          fetch('/api/gestiune/stock').then((r) => r.json()).catch(() => ({ results: [] })),
        ]);
        const ws = wr.results || [];
        setWarehouses(ws);
        if (ws.length) setFromWarehouseId(ws[0].id);
        if (ws.length > 1) setToWarehouseId(ws[1].id);
        setProducts(pr.results || []);
        setLevels((sr.results || []).map((r: any) => ({ warehouseId: r.warehouseId, productId: r.productId, quantity: Number(r.quantity) || 0 })));
      } catch { /* leave empty */ }
    })();
  }, []);

  const available = levels.find((l) => l.warehouseId === fromWarehouseId && l.productId === productId)?.quantity ?? 0;

  const submit = async () => {
    setError(''); setDone(false);
    if (!fromWarehouseId || !toWarehouseId) { setError('Alege gestiunea sursă și destinație'); return; }
    if (fromWarehouseId === toWarehouseId) { setError('Gestiunile trebuie să fie diferite'); return; }
    if (!productId) { setError('Alege un produs'); return; }
    const q = Number(quantity) || 0;
    if (q <= 0) { setError('Cantitatea trebuie să fie pozitivă'); return; }

    setBusy(true);
    try {
      const res = await fetch('/api/gestiune/transfer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromWarehouseId, toWarehouseId, productId, quantity: q }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Eroare'); return; }
      setDone(true);
      setQuantity('1');
      // Optimistically adjust local levels so the available qty stays correct.
      setLevels((ls) => {
        const next = ls.map((l) => ({ ...l }));
        const src = next.find((l) => l.warehouseId === fromWarehouseId && l.productId === productId);
        if (src) src.quantity -= q;
        const dst = next.find((l) => l.warehouseId === toWarehouseId && l.productId === productId);
        if (dst) dst.quantity += q;
        else next.push({ warehouseId: toWarehouseId, productId, quantity: q });
        return next;
      });
    } catch { setError('Eroare conexiune'); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-[#B91C1C]">{error}</p>}
      {done && (
        <p className="text-sm text-[#15803D] flex items-center gap-1.5"><Check className="w-4 h-4" /> Transfer efectuat. Stocurile au fost actualizate.</p>
      )}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
            <div>
              <Label className="mb-1 block text-xs">Din gestiunea *</Label>
              <Select value={fromWarehouseId} onChange={(e) => setFromWarehouseId(e.target.value)}>
                <option value="">Alege sursa</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-xs flex items-center gap-1"><ArrowRight className="w-3.5 h-3.5" /> În gestiunea *</Label>
              <Select value={toWarehouseId} onChange={(e) => setToWarehouseId(e.target.value)}>
                <option value="">Alege destinația</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
            <div>
              <Label className="mb-1 block text-xs">Produs *</Label>
              <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">Alege produsul</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-xs">Cantitate *</Label>
              <Input type="number" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              {productId && (
                <p className="text-xs text-[#6B6B68] mt-1">Disponibil în sursă: <span className="font-semibold text-[#0A0A0A]">{qtyFmt(available)}</span></p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button disabled={busy} onClick={submit}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Transferă'}</Button>
            <a href="/app/gestiune"><Button variant="ghost" type="button">Înapoi la stocuri</Button></a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
