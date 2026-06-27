import { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Select } from '../ui/Select';
import { DatePicker } from '../ui/DatePicker';
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

  const inputCls = 'rounded-xl bg-white/5 text-white placeholder:text-[#8FA6BC] border-0 focus:ring-2 focus:ring-[#E1FB15]/40 hover:border-0';
  const selectCls = `${inputCls} [color-scheme:dark]`;
  const btnPrimary = 'rounded-full bg-[#E1FB15] text-[#07090f] font-bold hover:bg-[#D2EA0E] shadow-none';

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-[#DC4B41]">{error}</p>}
      {done && (
        <p className="text-sm text-[#2E9E6A] flex items-center gap-1.5"><Check className="w-4 h-4" /> Lot adăugat.</p>
      )}
      <Card className="bg-white/5 border-0 rounded-2xl shadow-none hover:shadow-none hover:translate-y-0">
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="mb-1.5 block text-[13px] font-medium text-[#A8BED2]">Produs *</Label>
              <Select className={selectCls} value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">Alege produsul</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block text-[13px] font-medium text-[#A8BED2]">Gestiune</Label>
              <Select className={selectCls} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                <option value="">Fără gestiune</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </div>
            <div><Label className="mb-1.5 block text-[13px] font-medium text-[#A8BED2]">Cod lot *</Label><Input className={inputCls} value={lotCode} onChange={(e) => setLotCode(e.target.value)} placeholder="LOT-2026-001" /></div>
            <div><Label className="mb-1.5 block text-[13px] font-medium text-[#A8BED2]">Data expirării</Label><DatePicker value={expiryDate} onChange={(v) => setExpiryDate(v)} /></div>
            <div><Label className="mb-1.5 block text-[13px] font-medium text-[#A8BED2]">Cantitate</Label><Input className={`${inputCls} [color-scheme:dark]`} type="number" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" /></div>
            <div><Label className="mb-1.5 block text-[13px] font-medium text-[#A8BED2]">Cost unitar (RON)</Label><Input className={`${inputCls} [color-scheme:dark]`} type="number" step="any" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="0.00" /></div>
          </div>
          <Button className={btnPrimary} disabled={busy} onClick={submit}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" /> Adaugă lot</>}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
