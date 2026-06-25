import { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Select } from '../ui/Select';
import { Plus, X, Loader2, Check, ChevronDown } from 'lucide-react';

function PillSelect({ value, onChange, options, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 h-10 pl-4 pr-3 rounded-full text-[13px] font-semibold transition-colors ${value ? 'bg-[#E1FB15]/15 text-[#E1FB15]' : 'bg-white/10 text-white hover:bg-white/15'}`}
      >
        <span className="whitespace-nowrap">{selected?.label ?? placeholder}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 bg-[#071828] rounded-2xl ring-1 ring-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.5)] py-1.5 z-50 min-w-[160px]">
          <button
            type="button"
            className={`w-full text-left px-4 py-2 text-[13px] rounded-xl transition-colors ${!value ? 'text-[#E1FB15] font-semibold' : 'text-[#9FB8CC] hover:text-white hover:bg-white/5'}`}
            onClick={() => { onChange(''); setOpen(false); }}
          >
            {placeholder}
          </button>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`w-full text-left px-4 py-2 text-[13px] rounded-xl transition-colors ${value === o.value ? 'text-[#E1FB15] font-semibold' : 'text-[#9FB8CC] hover:text-white hover:bg-white/5'}`}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface Expense {
  id: string; supplierNameSnap: string | null; supplierName: string | null;
  category: string | null; documentType: string; documentNumber: string | null;
  issueDate: string | null; dueDate: string | null; currency: string | null;
  netCents: number; vatCents: number; totalCents: number; paidCents: number;
  status: string; deductible: boolean; notes: string | null;
}
interface Supplier { id: string; name: string; }

const CATEGORIES = ['utilitati', 'chirie', 'combustibil', 'servicii', 'marfa', 'salarii', 'taxe', 'altele'];
const CAT_LABELS: Record<string, string> = {
  utilitati: 'Utilități', chirie: 'Chirie', combustibil: 'Combustibil', servicii: 'Servicii',
  marfa: 'Marfă', salarii: 'Salarii', taxe: 'Taxe', altele: 'Altele',
};
const DOC_LABELS: Record<string, string> = {
  factura: 'Factură', bon: 'Bon', chitanta: 'Chitanță', extras: 'Extras',
};
const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  unpaid: { label: 'Neplătit', cls: 'bg-[#DC4B41]/15 text-[#DC4B41]' },
  partial: { label: 'Parțial', cls: 'bg-[#E8A33C]/15 text-[#E8A33C]' },
  paid: { label: 'Plătit', cls: 'bg-[#2E9E6A]/15 text-[#2E9E6A]' },
};

const ron = (cents: number) =>
  new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format((cents || 0) / 100);

const emptyForm = {
  supplierId: '', supplierNameSnap: '', category: 'servicii', documentType: 'factura',
  documentNumber: '', issueDate: new Date().toISOString().slice(0, 10), dueDate: '',
  net: '', vat: '', deductible: true,
};

export default function ExpensesManager() {
  const [items, setItems] = useState<Expense[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [fStatus, setFStatus] = useState('');
  const [fCategory, setFCategory] = useState('');
  const [form, setForm] = useState<typeof emptyForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);

  const refresh = async (status = fStatus, category = fCategory) => {
    try {
      const p = new URLSearchParams();
      if (status) p.set('status', status);
      if (category) p.set('category', category);
      const r = await fetch(`/api/cheltuieli/expenses${p.toString() ? `?${p}` : ''}`);
      const d = await r.json();
      setItems(d.results || []);
    } catch { /* leave empty */ }
  };
  useEffect(() => {
    refresh();
    fetch('/api/cheltuieli/suppliers').then((r) => r.json()).then((d) => setSuppliers(d.results || [])).catch(() => {});
  }, []);

  const save = async () => {
    if (!form) return;
    setBusy(true); setError('');
    try {
      const supplier = suppliers.find((s) => s.id === form.supplierId);
      const payload = {
        supplierId: form.supplierId || null,
        supplierNameSnap: supplier?.name || form.supplierNameSnap || null,
        category: form.category,
        documentType: form.documentType,
        documentNumber: form.documentNumber || null,
        issueDate: form.issueDate || null,
        dueDate: form.dueDate || null,
        netCents: Math.round((Number(form.net) || 0) * 100),
        vatCents: Math.round((Number(form.vat) || 0) * 100),
        deductible: form.deductible,
      };
      const res = await fetch('/api/cheltuieli/expenses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Eroare'); return; }
      setForm(null); await refresh();
    } catch { setError('Eroare conexiune'); } finally { setBusy(false); }
  };

  const markPaid = async (id: string) => {
    if (!confirm('Confirmi că această cheltuială a fost plătită?')) return;
    try {
      const res = await fetch(`/api/cheltuieli/expenses/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markPaid: true }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Eroare'); return; }
      await refresh();
    } catch { setError('Eroare conexiune'); }
  };

  const remove = async (id: string) => {
    if (!confirm('Sigur ștergi cheltuiala?')) return;
    try {
      const res = await fetch(`/api/cheltuieli/expenses/${id}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Eroare'); return; }
      await refresh();
    } catch { setError('Eroare conexiune'); }
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-[#DC4B41]">{error}</p>}

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
          <PillSelect
            value={fStatus}
            onChange={(v) => { setFStatus(v); refresh(v, fCategory); }}
            placeholder="Toate statusurile"
            options={[
              { value: 'unpaid', label: 'Neplătit' },
              { value: 'partial', label: 'Parțial' },
              { value: 'paid', label: 'Plătit' },
            ]}
          />
          <PillSelect
            value={fCategory}
            onChange={(v) => { setFCategory(v); refresh(fStatus, v); }}
            placeholder="Toate categoriile"
            options={CATEGORIES.map((c) => ({ value: c, label: CAT_LABELS[c] }))}
          />
        </div>
        <Button className="bg-[#E1FB15] text-[#0A2238] hover:bg-[#D2EA0E] rounded-full font-bold shadow-none w-full sm:w-auto justify-center shrink-0" onClick={() => setForm({ ...emptyForm })}><Plus className="w-4 h-4 mr-1" /> Cheltuială nouă</Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl bg-white/5 p-8 text-center text-sm text-[#7C9AB4]">Nicio cheltuială înregistrată.</div>
      ) : (
        <>
        <ul className="space-y-2.5">
          {(showAll ? items : items.slice(0, 3)).map((e) => {
            const st = STATUS_BADGE[e.status] || STATUS_BADGE.unpaid;
            return (
              <li key={e.id} className="group flex items-center gap-3 p-4 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                    <span className="text-[12px] text-[#7C9AB4] truncate">{DOC_LABELS[e.documentType] || e.documentType}{e.documentNumber ? ` · ${e.documentNumber}` : ''}</span>
                  </div>
                  <p className="text-[15px] text-white font-semibold truncate mt-1.5">{e.supplierName || e.supplierNameSnap || '—'}</p>
                  <p className="text-[12px] text-[#7C9AB4] mt-0.5 truncate">{e.category ? (CAT_LABELS[e.category] || e.category) : '—'}{e.issueDate ? ` · ${new Date(e.issueDate).toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest' })}` : ''}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[15px] font-bold tabular-nums text-white">{ron(e.totalCents)}</p>
                  <div className="flex items-center justify-end gap-1 mt-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                    {e.status !== 'paid' && (
                      <button onClick={() => markPaid(e.id)} title="Marchează plătit" className="w-8 h-8 grid place-items-center rounded-full bg-white/10 text-[#9FB8CC] hover:text-[#2E9E6A] hover:bg-white/15 transition-colors"><Check className="w-4 h-4" /></button>
                    )}
                    <button onClick={() => remove(e.id)} title="Șterge" className="w-8 h-8 grid place-items-center rounded-full bg-white/10 text-[#9FB8CC] hover:text-[#DC4B41] hover:bg-white/15 transition-colors"><X className="w-4 h-4" /></button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {items.length > 3 && (
          <button type="button" onClick={() => setShowAll((s) => !s)} className="mt-3 mx-auto w-fit flex items-center px-5 py-2.5 rounded-full bg-[#E1FB15] text-[#0A2238] text-[13.5px] font-semibold hover:bg-[#D2EA0E] active:scale-95 transition-all">
            {showAll ? 'Arată mai puțin' : `Vezi toate (${items.length})`}
          </button>
        )}
        </>
      )}

      {form && (
        <Card className="bg-white/5 border-0 shadow-none">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold text-white">Cheltuială nouă</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label className="mb-1 block text-xs text-[#9FB8CC]">Furnizor</Label>
                <Select className="bg-white/5 border-0 text-white placeholder:text-[#7C9AB4] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
                  <option value="">Fără furnizor / manual</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </div>
              {!form.supplierId && (
                <div><Label className="mb-1 block text-xs text-[#9FB8CC]">Nume furnizor</Label><Input className="bg-white/5 border-0 text-white placeholder:text-[#7C9AB4] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" value={form.supplierNameSnap} onChange={(e) => setForm({ ...form, supplierNameSnap: e.target.value })} /></div>
              )}
              <div>
                <Label className="mb-1 block text-xs text-[#9FB8CC]">Categorie</Label>
                <Select className="bg-white/5 border-0 text-white placeholder:text-[#7C9AB4] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
                </Select>
              </div>
              <div>
                <Label className="mb-1 block text-xs text-[#9FB8CC]">Tip document</Label>
                <Select className="bg-white/5 border-0 text-white placeholder:text-[#7C9AB4] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })}>
                  <option value="factura">Factură</option>
                  <option value="bon">Bon</option>
                  <option value="chitanta">Chitanță</option>
                  <option value="extras">Extras</option>
                </Select>
              </div>
              <div><Label className="mb-1 block text-xs text-[#9FB8CC]">Număr document</Label><Input className="bg-white/5 border-0 text-white placeholder:text-[#7C9AB4] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" value={form.documentNumber} onChange={(e) => setForm({ ...form, documentNumber: e.target.value })} /></div>
              <div><Label className="mb-1 block text-xs text-[#9FB8CC]">Data emiterii</Label><Input className="bg-white/5 border-0 text-white placeholder:text-[#7C9AB4] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" type="date" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} /></div>
              <div><Label className="mb-1 block text-xs text-[#9FB8CC]">Scadență</Label><Input className="bg-white/5 border-0 text-white placeholder:text-[#7C9AB4] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
              <div><Label className="mb-1 block text-xs text-[#9FB8CC]">Net (RON)</Label><Input className="bg-white/5 border-0 text-white placeholder:text-[#7C9AB4] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" type="number" step="any" value={form.net} onChange={(e) => setForm({ ...form, net: e.target.value })} placeholder="0.00" /></div>
              <div><Label className="mb-1 block text-xs text-[#9FB8CC]">TVA (RON)</Label><Input className="bg-white/5 border-0 text-white placeholder:text-[#7C9AB4] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" type="number" step="any" value={form.vat} onChange={(e) => setForm({ ...form, vat: e.target.value })} placeholder="0.00" /></div>
            </div>
            <label className="flex items-center gap-2 text-xs text-[#9FB8CC]">
              <input type="checkbox" checked={form.deductible} onChange={(e) => setForm({ ...form, deductible: e.target.checked })} /> Cheltuială deductibilă
            </label>
            <div className="flex gap-2">
              <Button className="bg-[#E1FB15] text-[#0A2238] hover:bg-[#D2EA0E] rounded-full font-bold shadow-none" size="sm" disabled={busy} onClick={save}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvează'}</Button>
              <Button className="bg-white/10 border-0 text-white hover:bg-white/15 rounded-full" size="sm" variant="outline" onClick={() => setForm(null)}>Renunță</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
