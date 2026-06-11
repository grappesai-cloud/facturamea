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
      <Card className="max-w-md mx-auto">
        <CardContent className="p-6 space-y-3">
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.12em] text-[#8A8A85]">Bon fiscal</p>
            <p className="text-lg font-bold font-mono text-[#0A0A0A]">{receipt.receiptNumber}</p>
          </div>
          <div className="border-t border-dashed border-[#E8E8E4] pt-3 space-y-1.5 text-sm">
            {receipt.lines.map((l, i) => (
              <div key={i} className="flex justify-between gap-2">
                <span className="text-[#3D3D3A] truncate">{l.quantity} × {l.name}</span>
                <span className="font-semibold text-[#0A0A0A] whitespace-nowrap">{ron(l.quantity * l.unitPriceCents)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-dashed border-[#E8E8E4] pt-3 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-[#6B6B68]">Subtotal</span><span>{ron(receipt.subtotalCents)}</span></div>
            <div className="flex justify-between"><span className="text-[#6B6B68]">TVA</span><span>{ron(receipt.vatCents)}</span></div>
            <div className="flex justify-between text-base font-bold text-[#0A0A0A]"><span>Total</span><span>{ron(receipt.totalCents)}</span></div>
            {receipt.changeCents > 0 && (
              <div className="flex justify-between text-[#15803D] font-semibold"><span>Rest</span><span>{ron(receipt.changeCents)}</span></div>
            )}
            <p className="text-xs text-[#6B6B68] pt-1">Plată: {receipt.paymentMethod === 'cash' ? 'Numerar' : receipt.paymentMethod === 'card' ? 'Card' : 'Mixt'}</p>
          </div>
          <div className="flex gap-2 pt-2">
            <Button className="flex-1" onClick={() => setReceipt(null)}>Vânzare nouă</Button>
            <Button variant="outline" onClick={() => window.print()}><Printer className="w-4 h-4 mr-1" /> Tipărește</Button>
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
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#A8A8A4]" />
          <Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută produs..." />
        </div>
        {products.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-sm text-[#6B6B68]">
            Niciun produs activ. Adaugă produse în Nomenclatoare → Produse & servicii.
          </CardContent></Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {filtered.map((p) => (
              <button key={p.id} onClick={() => addProduct(p)}
                className="text-left p-3 bg-white border border-[#E8E8E4] rounded-2xl hover:border-[#FF5C00] hover:bg-[#FFFAF6] transition-colors">
                <p className="text-sm font-semibold text-[#0A0A0A] line-clamp-2">{p.name}</p>
                <p className="text-xs text-[#FF5C00] font-semibold mt-1">{ron(p.defaultUnitPriceCents || 0)}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cart */}
      <div className="space-y-3">
        {error && <p className="text-sm text-[#B91C1C]">{error}</p>}
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold text-[#0A0A0A] text-sm">Coș</h3>
            {cart.length === 0 ? (
              <p className="text-sm text-[#6B6B68] py-4 text-center">Coșul este gol. Atinge un produs.</p>
            ) : (
              <ul className="space-y-2">
                {cart.map((l, i) => (
                  <li key={l.productId} className="flex items-center gap-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[#0A0A0A] truncate">{l.name}</p>
                      <p className="text-xs text-[#6B6B68]">{ron(l.unitPriceCents)} · TVA {l.vatRate}%</p>
                    </div>
                    <button onClick={() => setQty(i, -1)} className="p-1 text-[#6B6B68] hover:text-[#0A0A0A]"><Minus className="w-3.5 h-3.5" /></button>
                    <Input className="w-12 h-8 text-center px-1" type="number" value={l.quantity} onChange={(e) => setQtyExact(i, Number(e.target.value))} />
                    <button onClick={() => setQty(i, 1)} className="p-1 text-[#6B6B68] hover:text-[#0A0A0A]"><Plus className="w-3.5 h-3.5" /></button>
                    <button onClick={() => removeLine(i)} className="p-1 text-[#A8A8A4] hover:text-[#B91C1C]"><Trash2 className="w-3.5 h-3.5" /></button>
                  </li>
                ))}
              </ul>
            )}

            <div className="border-t border-[#F0F0EC] pt-3 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-[#6B6B68]">Subtotal</span><span>{ron(totals.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-[#6B6B68]">TVA</span><span>{ron(totals.vat)}</span></div>
              <div className="flex justify-between text-base font-bold text-[#0A0A0A]"><span>Total</span><span>{ron(totals.total)}</span></div>
            </div>

            {warehouses.length > 0 && (
              <div>
                <Label className="mb-1 block text-xs">Gestiune (descarcă stoc)</Label>
                <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                  <option value="">Fără descărcare stoc</option>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </Select>
              </div>
            )}

            <div>
              <Label className="mb-1 block text-xs">Metodă de plată</Label>
              <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="cash">Numerar</option>
                <option value="card">Card</option>
                <option value="mixed">Mixt</option>
              </Select>
            </div>

            {paymentMethod === 'cash' && (
              <div>
                <Label className="mb-1 block text-xs">Suma primită (RON)</Label>
                <Input type="number" step="any" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} placeholder="0.00" />
                {change > 0 && <p className="text-sm text-[#15803D] font-semibold mt-1">Rest: {ron(change)}</p>}
              </div>
            )}

            <Button className="w-full" disabled={busy || cart.length === 0} onClick={checkout}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Finalizează vânzarea'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
