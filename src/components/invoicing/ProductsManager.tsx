import { useMemo, useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Plus, Trash2, Edit2, Save, X, Search } from 'lucide-react';

interface Product {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  defaultUnitPriceCents: number | null;
  defaultCurrency: string | null;
  defaultUm: string | null;
  defaultVatRate: number | null;
  productType: string | null;
  isActive: boolean | null;
}

const PRODUCT_TYPES = ['Servicii', 'Marfuri', 'Produs finit', 'Materii prime', 'Semifabricate', 'Obiecte de inventar', 'Ambalaje'];
const VAT_RATES = [0, 5, 9, 19];

const emptyForm = (): Partial<Product> => ({
  code: '', name: '', description: '',
  defaultUnitPriceCents: null, defaultCurrency: 'RON', defaultUm: 'buc',
  defaultVatRate: 19, productType: 'Servicii', isActive: true,
});

export default function ProductsManager({ initial }: { initial: Product[] }) {
  const [items, setItems] = useState<Product[]>(initial);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Partial<Product>>(emptyForm());
  const [priceInput, setPriceInput] = useState('');
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter((i) =>
      i.name.toLowerCase().includes(term) || (i.code?.toLowerCase().includes(term) ?? false),
    );
  }, [items, q]);

  const startCreate = () => {
    setForm(emptyForm()); setPriceInput(''); setCreating(true); setEditing(null);
  };
  const startEdit = (p: Product) => {
    setForm({ ...p });
    setPriceInput(p.defaultUnitPriceCents != null ? (p.defaultUnitPriceCents / 100).toFixed(2) : '');
    setEditing(p.id); setCreating(false);
  };
  const cancel = () => { setCreating(false); setEditing(null); setForm(emptyForm()); setPriceInput(''); };

  const save = async () => {
    if (!form.name?.trim()) { alert('Numele e obligatoriu'); return; }
    setBusy(true);
    try {
      const payload = {
        ...form,
        defaultUnitPriceCents: priceInput ? Math.round(parseFloat(priceInput) * 100) : null,
      };
      if (creating) {
        const res = await fetch('/api/invoicing/products', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) { const d = await res.json(); alert(d.error || 'Eroare'); return; }
        const { id } = await res.json();
        setItems((prev) => [{ ...payload, id } as Product, ...prev]);
      } else {
        const res = await fetch('/api/invoicing/products', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editing, ...payload }),
        });
        if (!res.ok) { const d = await res.json(); alert(d.error || 'Eroare'); return; }
        setItems((prev) => prev.map((i) => (i.id === editing ? { ...i, ...payload } as Product : i)));
      }
      cancel();
    } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!confirm('Dezactivezi acest produs?')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/invoicing/products?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) { alert('Eroare'); return; }
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, isActive: false } : i)));
    } finally { setBusy(false); }
  };

  const fmtPrice = (cents: number | null, cur: string | null) =>
    cents != null ? `${(cents / 100).toLocaleString('ro-RO', { minimumFractionDigits: 2 })} ${cur || 'RON'}` : '—';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8A85]" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută după nume sau cod…" className="pl-9" />
        </div>
        <Button onClick={startCreate} disabled={creating || editing !== null}>
          <Plus className="w-4 h-4 mr-1.5" /> Produs nou
        </Button>
      </div>

      {(creating || editing) && (
        <div className="bg-white border border-[#E8E8E4] rounded-xl p-5 space-y-4">
          <h3 className="font-bold text-[#0A0A0A]">{creating ? 'Adaugă produs/serviciu' : 'Editează'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Label>Denumire *</Label>
              <Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Transport rutier internațional 22t" />
            </div>
            <div>
              <Label>Cod</Label>
              <Input value={form.code || ''} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="TR-INT-22" />
            </div>
            <div className="md:col-span-3">
              <Label>Descriere (opțional)</Label>
              <Input value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Apare pe factură sub denumire" />
            </div>
            <div>
              <Label>Preț unitar</Label>
              <Input value={priceInput} onChange={(e) => setPriceInput(e.target.value)} placeholder="1800.00" inputMode="decimal" />
            </div>
            <div>
              <Label>Monedă</Label>
              <select value={form.defaultCurrency || 'RON'} onChange={(e) => setForm({ ...form, defaultCurrency: e.target.value })} className="w-full h-9 rounded-xl border border-[#E8E8E4] px-2 text-sm">
                <option>RON</option><option>EUR</option><option>USD</option><option>GBP</option>
              </select>
            </div>
            <div>
              <Label>UM</Label>
              <Input value={form.defaultUm || 'buc'} onChange={(e) => setForm({ ...form, defaultUm: e.target.value })} placeholder="buc, cursă, km, ore" />
            </div>
            <div>
              <Label>TVA (%)</Label>
              <select value={form.defaultVatRate ?? 19} onChange={(e) => setForm({ ...form, defaultVatRate: Number(e.target.value) })} className="w-full h-9 rounded-xl border border-[#E8E8E4] px-2 text-sm">
                {VAT_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
              </select>
            </div>
            <div>
              <Label>Tip produs</Label>
              <select value={form.productType || 'Servicii'} onChange={(e) => setForm({ ...form, productType: e.target.value })} className="w-full h-9 rounded-xl border border-[#E8E8E4] px-2 text-sm">
                {PRODUCT_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isActive !== false} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                Activ
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={save} disabled={busy}><Save className="w-4 h-4 mr-1.5" /> Salvează</Button>
            <Button variant="outline" onClick={cancel}><X className="w-4 h-4 mr-1.5" /> Anulează</Button>
          </div>
        </div>
      )}

      <div className="bg-white border border-[#E8E8E4] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#FAFAF8]">
            <tr className="text-left text-[10px] uppercase tracking-wider text-[#8A8A85]">
              <th className="py-3 px-4">Cod</th>
              <th className="py-3 px-4">Denumire</th>
              <th className="py-3 px-4">Tip</th>
              <th className="py-3 px-4 text-right">Preț</th>
              <th className="py-3 px-4">UM</th>
              <th className="py-3 px-4 text-right">TVA</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="py-10 text-center text-[#8A8A85]">Niciun produs încă. Adaugă primul.</td></tr>
            )}
            {filtered.map((p) => (
              <tr key={p.id} className="border-t border-[#F0F0EC]">
                <td className="py-3 px-4 text-[#6B6B68] font-mono text-xs">{p.code || '—'}</td>
                <td className="py-3 px-4">
                  <div className="font-medium text-[#0A0A0A]">{p.name}</div>
                  {p.description && <div className="text-xs text-[#8A8A85] mt-0.5">{p.description}</div>}
                </td>
                <td className="py-3 px-4 text-xs text-[#6B6B68]">{p.productType}</td>
                <td className="py-3 px-4 text-right tabular-nums">{fmtPrice(p.defaultUnitPriceCents, p.defaultCurrency)}</td>
                <td className="py-3 px-4 text-[#6B6B68]">{p.defaultUm}</td>
                <td className="py-3 px-4 text-right tabular-nums">{p.defaultVatRate}%</td>
                <td className="py-3 px-4">
                  {p.isActive ? <span className="text-xs px-2 py-0.5 rounded-full bg-[#D1FAE5] text-[#065F46]">activ</span>
                              : <span className="text-xs px-2 py-0.5 rounded-full bg-[#F0F0EC] text-[#6B6B68]">inactiv</span>}
                </td>
                <td className="py-3 px-4 text-right">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => startEdit(p)} className="p-1.5 hover:bg-[#F0F0EC] rounded" title="Editează"><Edit2 className="w-3.5 h-3.5 text-[#6B6B68]" /></button>
                    {p.isActive && <button onClick={() => remove(p.id)} className="p-1.5 hover:bg-[#FEE2E2] rounded" title="Dezactivează"><Trash2 className="w-3.5 h-3.5 text-[#B91C1C]" /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
