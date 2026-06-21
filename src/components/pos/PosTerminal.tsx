import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Select } from '../ui/Select';
import { Plus, Minus, Trash2, Loader2, Search, Printer } from 'lucide-react';

interface Product {
  id: string; code: string | null; name: string;
  defaultUnitPriceCents: number | null; defaultUm: string | null; defaultVatRate: number | null;
}
interface Warehouse { id: string; name: string; }
interface CartLine {
  productId: string; name: string; unitPriceCents: number; vatRate: number; quantity: number;
}
interface Receipt {
  receiptNumber: string; subtotalCents: number; vatCents: number; totalCents: number;
  changeCents: number; paymentMethod: string; lines: CartLine[];
}

const ron = (cents: number) =>
  new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format((cents || 0) / 100);

export default function PosTerminal() {
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [q, setQ] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [pr, wr] = await Promise.all([
          fetch('/api/pos/products').then((r) => r.json()).catch(() => ({ results: [] })),
          fetch('/api/gestiune/warehouses').then((r) => r.json()).catch(() => ({ results: [] })),
        ]);
        setProducts(pr.results || []);
        setWarehouses(wr.results || []);
      } catch { /* leave empty */ }
    })();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return products;
    return products.filter((p) =>
      p.name.toLowerCase().includes(term) || (p.code || '').toLowerCase().includes(term));
  }, [products, q]);

  const totals = useMemo(() => {
    return cart.reduce(
      (acc, l) => {
        const gross = Math.round(l.quantity * l.unitPriceCents);
        const net = l.vatRate > 0 ? Math.round(gross / (1 + l.vatRate / 100)) : gross;
        acc.total += gross; acc.subtotal += net; acc.vat += gross - net;
        return acc;
      },
      { subtotal: 0, vat: 0, total: 0 }
    );
  }, [cart]);

  const change = useMemo(() => {
    const received = Math.round((Number(cashReceived) || 0) * 100);
    return paymentMethod === 'cash' && received > totals.total ? received - totals.total : 0;
  }, [cashReceived, paymentMethod, totals.total]);

  const addProduct = (p: Product) => {
    setReceipt(null);
    setCart((c) => {
      const idx = c.findIndex((l) => l.productId === p.id);
      if (idx >= 0) return c.map((l, i) => (i === idx ? { ...l, quantity: l.quantity + 1 } : l));
      return [...c, {
        productId: p.id, name: p.name,
        unitPriceCents: p.defaultUnitPriceCents || 0,
        vatRate: p.defaultVatRate != null ? p.defaultVatRate : 21,
        quantity: 1,
      }];
    });
  };

  const setQty = (i: number, delta: number) => {
    setCart((c) => c.map((l, idx) => idx === i ? { ...l, quantity: Math.max(1, l.quantity + delta) } : l));
  };
  const setQtyExact = (i: number, v: number) => {
    setCart((c) => c.map((l, idx) => idx === i ? { ...l, quantity: Math.max(0, v) } : l).filter((l) => l.quantity > 0));
  };
  const removeLine = (i: number) => setCart((c) => c.filter((_, idx) => idx !== i));

  const checkout = async () => {
    if (cart.length === 0) { setError('Coșul este gol'); return; }
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/pos/sales', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouseId: warehouseId || null,
          paymentMethod,
          cashReceivedCents: Math.round((Number(cashReceived) || 0) * 100),
          lines: cart.map((l) => ({
            productId: l.productId, name: l.name,
            quantity: l.quantity, unitPriceCents: l.unitPriceCents, vatRate: l.vatRate,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Eroare'); return; }
      setReceipt({
        receiptNumber: data.receiptNumber,
        subtotalCents: data.subtotalCents, vatCents: data.vatCents, totalCents: data.totalCents,
        changeCents: data.changeCents, paymentMethod, lines: cart,
      });
      setCart([]); setCashReceived('');
    } catch { setError('Eroare conexiune'); } finally { setBusy(false); }
  };

  if (receipt) {
    return (
      <Card className="max-w-md mx-auto bg-white/5 border-0 shadow-none rounded-2xl">
        <CardContent className="p-6 space-y-3">
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.12em] text-[#7C9AB4]">Bon fiscal</p>
            <p className="text-lg font-bold font-mono text-white">{receipt.receiptNumber}</p>
          </div>
          <div className="border-t border-dashed border-white/10 pt-3 space-y-1.5 text-sm">
            {receipt.lines.map((l, i) => (
              <div key={i} className="flex justify-between gap-2">
                <span className="text-[#9FB8CC] truncate">{l.quantity} × {l.name}</span>
                <span className="font-semibold text-white whitespace-nowrap tabular-nums">{ron(l.quantity * l.unitPriceCents)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-dashed border-white/10 pt-3 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-[#9FB8CC]">Subtotal</span><span className="text-white tabular-nums">{ron(receipt.subtotalCents)}</span></div>
            <div className="flex justify-between"><span className="text-[#9FB8CC]">TVA</span><span className="text-white tabular-nums">{ron(receipt.vatCents)}</span></div>
            <div className="flex justify-between text-base font-bold text-white"><span>Total</span><span className="tabular-nums">{ron(receipt.totalCents)}</span></div>
            {receipt.changeCents > 0 && (
              <div className="flex justify-between text-[#2E9E6A] font-semibold"><span>Rest</span><span className="tabular-nums">{ron(receipt.changeCents)}</span></div>
            )}
            <p className="text-xs text-[#9FB8CC] pt-1">Plată: {receipt.paymentMethod === 'cash' ? 'Numerar' : receipt.paymentMethod === 'card' ? 'Card' : 'Mixt'}</p>
          </div>
          <div className="flex gap-2 pt-2">
            <Button className="flex-1 rounded-full bg-[#E1FB15] text-[#0A2238] font-bold hover:bg-[#D2EA0E]" onClick={() => setReceipt(null)}>Vânzare nouă</Button>
            <Button variant="outline" className="rounded-full bg-white/10 text-white border-0 hover:bg-white/15" onClick={() => window.print()}><Printer className="w-4 h-4 mr-1" /> Tipărește</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Product grid */}
      <div className="lg:col-span-2 space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#7C9AB4] z-10" />
          <Input className="pl-9 rounded-full bg-white/5 text-white border-0 placeholder:text-[#7C9AB4] focus:ring-2 focus:ring-[#E1FB15]/40" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută produs..." />
        </div>
        {products.length === 0 ? (
          <Card className="bg-white/5 border-0 shadow-none rounded-2xl"><CardContent className="p-6 text-center text-sm text-[#9FB8CC]">
            Niciun produs activ. Adaugă produse în Nomenclatoare → Produse & servicii.
          </CardContent></Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {filtered.map((p) => (
              <button key={p.id} onClick={() => addProduct(p)}
                className="text-left p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition-colors">
                <p className="text-sm font-semibold text-white line-clamp-2">{p.name}</p>
                <p className="text-xs text-[#E1FB15] font-semibold mt-1 tabular-nums">{ron(p.defaultUnitPriceCents || 0)}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cart */}
      <div className="space-y-3">
        {error && <p className="text-sm text-[#DC4B41]">{error}</p>}
        <Card className="bg-white/5 border-0 shadow-none rounded-2xl">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold text-white text-sm">Coș</h3>
            {cart.length === 0 ? (
              <p className="text-sm text-[#9FB8CC] py-4 text-center">Coșul este gol. Atinge un produs.</p>
            ) : (
              <ul className="space-y-2">
                {cart.map((l, i) => (
                  <li key={l.productId} className="flex items-center gap-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-white truncate">{l.name}</p>
                      <p className="text-xs text-[#9FB8CC]">{ron(l.unitPriceCents)} · TVA {l.vatRate}%</p>
                    </div>
                    <button onClick={() => setQty(i, -1)} className="p-1 text-[#9FB8CC] hover:text-white"><Minus className="w-3.5 h-3.5" /></button>
                    <Input className="w-12 h-8 text-center px-1 bg-white/10 text-white placeholder:text-[#7C9AB4] border-0 [color-scheme:dark] focus:ring-2 focus:ring-[#E1FB15]/40" type="number" value={l.quantity} onChange={(e) => setQtyExact(i, Number(e.target.value))} />
                    <button onClick={() => setQty(i, 1)} className="p-1 text-[#9FB8CC] hover:text-white"><Plus className="w-3.5 h-3.5" /></button>
                    <button onClick={() => removeLine(i)} className="p-1 text-[#7C9AB4] hover:text-[#DC4B41]"><Trash2 className="w-3.5 h-3.5" /></button>
                  </li>
                ))}
              </ul>
            )}

            <div className="border-t border-white/10 pt-3 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-[#9FB8CC]">Subtotal</span><span className="text-white tabular-nums">{ron(totals.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-[#9FB8CC]">TVA</span><span className="text-white tabular-nums">{ron(totals.vat)}</span></div>
              <div className="flex justify-between items-baseline"><span className="text-[#9FB8CC]">Total</span><span className="text-[24px] sm:text-[28px] font-bold tracking-[-0.02em] tabular-nums text-white">{ron(totals.total)}</span></div>
            </div>

            {warehouses.length > 0 && (
              <div>
                <Label className="mb-1 block text-xs text-[#9FB8CC]">Gestiune (descarcă stoc)</Label>
                <Select className="bg-white/10 text-white placeholder:text-[#7C9AB4] border-0 [color-scheme:dark] focus:ring-2 focus:ring-[#E1FB15]/40" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                  <option value="">Fără descărcare stoc</option>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </Select>
              </div>
            )}

            <div>
              <Label className="mb-1 block text-xs text-[#9FB8CC]">Metodă de plată</Label>
              <Select className="bg-white/10 text-white placeholder:text-[#7C9AB4] border-0 [color-scheme:dark] focus:ring-2 focus:ring-[#E1FB15]/40" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="cash">Numerar</option>
                <option value="card">Card</option>
                <option value="mixed">Mixt</option>
              </Select>
            </div>

            {paymentMethod === 'cash' && (
              <div>
                <Label className="mb-1 block text-xs text-[#9FB8CC]">Suma primită (RON)</Label>
                <Input className="bg-white/10 text-white border-0 [color-scheme:dark] placeholder:text-[#7C9AB4] focus:ring-2 focus:ring-[#E1FB15]/40" type="number" step="any" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} placeholder="0.00" />
                {change > 0 && <p className="text-sm text-[#2E9E6A] font-semibold mt-1 tabular-nums">Rest: {ron(change)}</p>}
              </div>
            )}

            <Button className="w-full rounded-full bg-[#E1FB15] text-[#0A2238] font-bold hover:bg-[#D2EA0E]" disabled={busy || cart.length === 0} onClick={checkout}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Finalizează vânzarea'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
