import { useMemo, useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Plus, Edit2, Save, X, Search } from 'lucide-react';

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
  const [showAll, setShowAll] = useState(false);

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
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#7C9AB4]" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută după nume sau cod…" className="pl-9 rounded-full bg-white/5 border-0 text-white placeholder:text-[#7C9AB4] hover:border-0 focus:border-0 focus:ring-2 focus:ring-[#E1FB15]/40" />
        </div>
        <Button onClick={startCreate} disabled={creating || editing !== null} className="rounded-full bg-[#E1FB15] text-[#0A2238] hover:bg-[#D2EA0E] active:scale-100">
          <Plus className="w-4 h-4 mr-1.5" /> Produs nou
        </Button>
      </div>

      {(creating || editing) && (
        <div className="bg-white/5 rounded-2xl p-5 space-y-4">
          <h3 className="font-bold text-white">{creating ? 'Adaugă produs/serviciu' : 'Editează'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Label className="text-[13px] font-medium text-[#9FB8CC]">Denumire *</Label>
              <Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Transport rutier internațional 22t" className="bg-white/10 border-0 text-white placeholder:text-[#7C9AB4] hover:border-0 focus:border-0 focus:ring-2 focus:ring-[#E1FB15]/40" />
            </div>
            <div>
              <Label className="text-[13px] font-medium text-[#9FB8CC]">Cod</Label>
              <Input value={form.code || ''} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="TR-INT-22" className="bg-white/10 border-0 text-white placeholder:text-[#7C9AB4] hover:border-0 focus:border-0 focus:ring-2 focus:ring-[#E1FB15]/40" />
            </div>
            <div className="md:col-span-3">
              <Label className="text-[13px] font-medium text-[#9FB8CC]">Descriere (opțional)</Label>
              <Input value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Apare pe factură sub denumire" className="bg-white/10 border-0 text-white placeholder:text-[#7C9AB4] hover:border-0 focus:border-0 focus:ring-2 focus:ring-[#E1FB15]/40" />
            </div>
            <div>
              <Label className="text-[13px] font-medium text-[#9FB8CC]">Preț unitar</Label>
              <Input value={priceInput} onChange={(e) => setPriceInput(e.target.value)} placeholder="1800.00" inputMode="decimal" className="bg-white/10 border-0 text-white placeholder:text-[#7C9AB4] hover:border-0 focus:border-0 focus:ring-2 focus:ring-[#E1FB15]/40" />
            </div>
            <div>
              <Label className="text-[13px] font-medium text-[#9FB8CC]">Monedă</Label>
              <select value={form.defaultCurrency || 'RON'} onChange={(e) => setForm({ ...form, defaultCurrency: e.target.value })} className="w-full rounded-xl bg-white/10 px-4 py-2.5 text-[14px] text-white border-0 focus:outline-none focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]">
                <option>RON</option><option>EUR</option><option>USD</option><option>GBP</option>
              </select>
            </div>
            <div>
              <Label className="text-[13px] font-medium text-[#9FB8CC]">UM</Label>
              <Input value={form.defaultUm || 'buc'} onChange={(e) => setForm({ ...form, defaultUm: e.target.value })} placeholder="buc, cursă, km, ore" className="bg-white/10 border-0 text-white placeholder:text-[#7C9AB4] hover:border-0 focus:border-0 focus:ring-2 focus:ring-[#E1FB15]/40" />
            </div>
            <div>
              <Label className="text-[13px] font-medium text-[#9FB8CC]">TVA (%)</Label>
              <select value={form.defaultVatRate ?? 19} onChange={(e) => setForm({ ...form, defaultVatRate: Number(e.target.value) })} className="w-full rounded-xl bg-white/10 px-4 py-2.5 text-[14px] text-white border-0 focus:outline-none focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]">
                {VAT_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
              </select>
            </div>
            <div>
              <Label className="text-[13px] font-medium text-[#9FB8CC]">Tip produs</Label>
              <select value={form.productType || 'Servicii'} onChange={(e) => setForm({ ...form, productType: e.target.value })} className="w-full rounded-xl bg-white/10 px-4 py-2.5 text-[14px] text-white border-0 focus:outline-none focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]">
                {PRODUCT_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-white">
                <input type="checkbox" checked={form.isActive !== false} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                Activ
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={save} disabled={busy} className="rounded-full bg-[#E1FB15] text-[#0A2238] hover:bg-[#D2EA0E] active:scale-100"><Save className="w-4 h-4 mr-1.5" /> Salvează</Button>
            <Button variant="outline" onClick={cancel} className="rounded-full bg-white/10 text-white border-0 hover:bg-white/15 hover:border-0"><X className="w-4 h-4 mr-1.5" /> Anulează</Button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="bg-white/5 rounded-2xl p-8 text-center text-[#7C9AB4]">Niciun produs încă. Adaugă primul.</div>
      ) : (
        <>
        <ul className="space-y-2.5">
          {(showAll ? filtered : filtered.slice(0, 3)).map((p) => (
            <li key={p.id} className="group flex items-center gap-3 p-4 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white truncate">{p.name}</span>
                  {p.isActive
                    ? <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-[#2E9E6A]/15 text-[#2E9E6A]">activ</span>
                    : <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-[#9FB8CC]">inactiv</span>}
                </div>
                <p className="text-[12px] text-[#7C9AB4] mt-0.5 truncate">
                  {p.code ? `${p.code} · ` : ''}{p.productType} · {p.defaultUm} · TVA {p.defaultVatRate}%
                </p>
              </div>
              <p className="text-[15px] font-bold tabular-nums text-white shrink-0">{fmtPrice(p.defaultUnitPriceCents, p.defaultCurrency)}</p>
              <div className="flex items-center gap-1 shrink-0 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                <button onClick={() => startEdit(p)} className="w-9 h-9 rounded-full bg-white/10 grid place-items-center text-[#9FB8CC] hover:bg-white/15 hover:text-white transition-colors" title="Editează"><Edit2 className="w-3.5 h-3.5" /></button>
                {p.isActive && <button onClick={() => remove(p.id)} className="w-9 h-9 rounded-full bg-white/10 grid place-items-center text-[#9FB8CC] hover:bg-[#DC4B41]/15 hover:text-[#DC4B41] transition-colors" title="Dezactivează"><X className="w-4 h-4" /></button>}
              </div>
            </li>
          ))}
        </ul>
        {filtered.length > 3 && (
          <button type="button" onClick={() => setShowAll((s) => !s)} className="mt-3 mx-auto w-fit flex items-center px-5 py-2.5 rounded-full bg-[#E1FB15] text-[#0A2238] text-[13.5px] font-semibold hover:bg-[#D2EA0E] active:scale-95 transition-all">
            {showAll ? 'Arată mai puțin' : `Vezi toate (${filtered.length})`}
          </button>
        )}
        </>
      )}
    </div>
  );
}
