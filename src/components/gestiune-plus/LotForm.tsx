import { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Select } from '../ui/Select';
import { Loader2, Check, Plus } from 'lucide-react';

interface Warehouse { id: string; name: string; }
interface Product { id: string; name: string; }

export default function LotForm() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [productId, setProductId] = useState('');
  const [lotCode, setLotCode] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [wr, pr] = await Promise.all([
          fetch('/api/gestiune/warehouses').then((r) => r.json()).catch(() => ({ results: [] })),
          fetch('/api/pos/products').then((r) => r.json()).catch(() => ({ results: [] })),
        ]);
        setWarehouses(wr.results || []);
        setProducts(pr.results || []);
      } catch { /* leave empty */ }
    })();
  }, []);

  const submit = async () => {
    setError(''); setDone(false);
    if (!productId) { setError('Alege un produs'); return; }
    if (!lotCode.trim()) { setError('Codul lotului e obligatoriu'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/gestiune/lots', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouseId: warehouseId || null,
          productId,
          lotCode: lotCode.trim(),
          expiryDate: expiryDate || null,
          quantity: Number(quantity) || 0,
          unitCostCents: Math.round((Number(unitCost) || 0) * 100),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Eroare'); return; }
      setDone(true);
      setTimeout(() => { window.location.reload(); }, 600);
    } catch { setError('Eroare conexiune'); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-[#B91C1C]">{error}</p>}
      {done && (
        <p className="text-sm text-[#15803D] flex items-center gap-1.5"><Check className="w-4 h-4" /> Lot adăugat.</p>
      )}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="mb-1 block text-xs">Produs *</Label>
              <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">Alege produsul</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-xs">Gestiune</Label>
              <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                <option value="">Fără gestiune</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </div>
            <div><Label className="mb-1 block text-xs">Cod lot *</Label><Input value={lotCode} onChange={(e) => setLotCode(e.target.value)} placeholder="LOT-2026-001" /></div>
            <div><Label className="mb-1 block text-xs">Data expirării</Label><Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} /></div>
            <div><Label className="mb-1 block text-xs">Cantitate</Label><Input type="number" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" /></div>
            <div><Label className="mb-1 block text-xs">Cost unitar (RON)</Label><Input type="number" step="any" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="0.00" /></div>
          </div>
          <Button disabled={busy} onClick={submit}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" /> Adaugă lot</>}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
