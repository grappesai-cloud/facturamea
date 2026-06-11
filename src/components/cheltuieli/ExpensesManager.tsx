import { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Select } from '../ui/Select';
import { Plus, Trash2, Loader2, Check } from 'lucide-react';

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
  unpaid: { label: 'Neplătit', cls: 'bg-[#FDECEC] text-[#B91C1C]' },
  partial: { label: 'Parțial', cls: 'bg-[#FFF7E6] text-[#B45309]' },
  paid: { label: 'Plătit', cls: 'bg-[#E7F7EC] text-[#15803D]' },
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
      {error && <p className="text-sm text-[#B91C1C]">{error}</p>}

      <div className="flex items-center gap-2 flex-wrap">
        <Select className="w-auto min-w-[150px]" value={fStatus} onChange={(e) => { setFStatus(e.target.value); refresh(e.target.value, fCategory); }}>
          <option value="">Toate statusurile</option>
          <option value="unpaid">Neplătit</option>
          <option value="partial">Parțial</option>
          <option value="paid">Plătit</option>
        </Select>
        <Select className="w-auto min-w-[150px]" value={fCategory} onChange={(e) => { setFCategory(e.target.value); refresh(fStatus, e.target.value); }}>
          <option value="">Toate categoriile</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
        </Select>
        <Button className="ml-auto" onClick={() => setForm({ ...emptyForm })}><Plus className="w-4 h-4 mr-1" /> Cheltuială nouă</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <p className="text-sm text-[#6B6B68] p-6 text-center">Nicio cheltuială înregistrată.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-[#8A8A85] border-b border-[#F0F0EC]">
                    <th className="px-4 py-2.5 font-medium">Furnizor</th>
                    <th className="px-4 py-2.5 font-medium">Document</th>
                    <th className="px-4 py-2.5 font-medium">Categorie</th>
                    <th className="px-4 py-2.5 font-medium">Data</th>
                    <th className="px-4 py-2.5 font-medium text-right">Total</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((e) => {
                    const st = STATUS_BADGE[e.status] || STATUS_BADGE.unpaid;
                    return (
                      <tr key={e.id} className="border-b border-[#F6F6F2] hover:bg-[#FAFAF8]">
                        <td className="px-4 py-3 text-[#0A0A0A] truncate max-w-[180px]">{e.supplierName || e.supplierNameSnap || '—'}</td>
                        <td className="px-4 py-3 text-[#3D3D3A]">{DOC_LABELS[e.documentType] || e.documentType}{e.documentNumber ? ` · ${e.documentNumber}` : ''}</td>
                        <td className="px-4 py-3 text-[#3D3D3A]">{e.category ? (CAT_LABELS[e.category] || e.category) : '—'}</td>
                        <td className="px-4 py-3 text-[#6B6B68]">{e.issueDate || '—'}</td>
                        <td className="px-4 py-3 text-right font-semibold text-[#0A0A0A]">{ron(e.totalCents)}</td>
                        <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-medium ${st.cls}`}>{st.label}</span></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {e.status !== 'paid' && (
                              <button onClick={() => markPaid(e.id)} title="Marchează plătit" className="p-1.5 text-[#6B6B68] hover:text-[#15803D]"><Check className="w-4 h-4" /></button>
                            )}
                            <button onClick={() => remove(e.id)} title="Șterge" className="p-1.5 text-[#A8A8A4] hover:text-[#B91C1C]"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {form && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold text-[#0A0A0A]">Cheltuială nouă</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label className="mb-1 block text-xs">Furnizor</Label>
                <Select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
                  <option value="">Fără furnizor / manual</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </div>
              {!form.supplierId && (
                <div><Label className="mb-1 block text-xs">Nume furnizor</Label><Input value={form.supplierNameSnap} onChange={(e) => setForm({ ...form, supplierNameSnap: e.target.value })} /></div>
              )}
              <div>
                <Label className="mb-1 block text-xs">Categorie</Label>
                <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
                </Select>
              </div>
              <div>
                <Label className="mb-1 block text-xs">Tip document</Label>
                <Select value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })}>
                  <option value="factura">Factură</option>
                  <option value="bon">Bon</option>
                  <option value="chitanta">Chitanță</option>
                  <option value="extras">Extras</option>
                </Select>
              </div>
              <div><Label className="mb-1 block text-xs">Număr document</Label><Input value={form.documentNumber} onChange={(e) => setForm({ ...form, documentNumber: e.target.value })} /></div>
              <div><Label className="mb-1 block text-xs">Data emiterii</Label><Input type="date" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} /></div>
              <div><Label className="mb-1 block text-xs">Scadență</Label><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
              <div><Label className="mb-1 block text-xs">Net (RON)</Label><Input type="number" step="any" value={form.net} onChange={(e) => setForm({ ...form, net: e.target.value })} placeholder="0.00" /></div>
              <div><Label className="mb-1 block text-xs">TVA (RON)</Label><Input type="number" step="any" value={form.vat} onChange={(e) => setForm({ ...form, vat: e.target.value })} placeholder="0.00" /></div>
            </div>
            <label className="flex items-center gap-2 text-xs text-[#0A0A0A]">
              <input type="checkbox" checked={form.deductible} onChange={(e) => setForm({ ...form, deductible: e.target.checked })} /> Cheltuială deductibilă
            </label>
            <div className="flex gap-2">
              <Button size="sm" disabled={busy} onClick={save}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvează'}</Button>
              <Button size="sm" variant="outline" onClick={() => setForm(null)}>Renunță</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
