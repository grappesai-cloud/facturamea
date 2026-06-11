import { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Select } from '../ui/Select';
import { Plus, Loader2 } from 'lucide-react';

interface Warehouse {
  id: string; name: string; code: string | null; type: string;
  address: string | null; managementType: string | null;
  isDefault: boolean; isActive: boolean;
}

const empty = {
  name: '', code: '', type: 'depozit', address: '',
  managementType: 'cantitativ_valoric', isDefault: false,
};

const TYPE_LABELS: Record<string, string> = {
  depozit: 'Depozit', magazin: 'Magazin', custodie: 'Custodie',
};
const MGMT_LABELS: Record<string, string> = {
  cantitativ_valoric: 'Cantitativ-valoric', global_valoric: 'Global-valoric',
};

export default function WarehousesManager() {
  const [items, setItems] = useState<Warehouse[]>([]);
  const [form, setForm] = useState<typeof empty | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    try {
      const r = await fetch('/api/gestiune/warehouses');
      const d = await r.json();
      setItems(d.results || []);
    } catch { /* leave empty */ }
  };
  useEffect(() => { refresh(); }, []);

  const save = async () => {
    if (!form) return;
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/gestiune/warehouses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Eroare'); return; }
      setForm(null); await refresh();
    } catch { setError('Eroare conexiune'); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-[#B91C1C]">{error}</p>}

      <div className="flex justify-end">
        <Button onClick={() => setForm({ ...empty })}><Plus className="w-4 h-4 mr-1" /> Gestiune nouă</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <p className="text-sm text-[#6B6B68] p-6 text-center">Nicio gestiune. Adaugă primul depozit sau magazin.</p>
          ) : (
            <ul className="divide-y divide-[#E8E8E4]">
              {items.map((w) => (
                <li key={w.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[#FAFAF8] transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#0A0A0A] truncate">
                      {w.name}
                      {w.code && <span className="font-mono text-xs text-[#6B6B68] ml-2">{w.code}</span>}
                    </p>
                    <p className="text-xs text-[#6B6B68] truncate">
                      {TYPE_LABELS[w.type] || w.type}
                      {w.managementType && <span> · {MGMT_LABELS[w.managementType] || w.managementType}</span>}
                      {w.address && <span> · {w.address}</span>}
                    </p>
                  </div>
                  {w.isDefault && <span className="text-[10px] px-2 py-0.5 bg-[#FFF1E6] text-[#FF5C00] rounded-full font-semibold">implicită</span>}
                  {!w.isActive && <span className="text-[10px] px-2 py-0.5 bg-[#F0F0EC] text-[#6B6B68] rounded-full font-semibold">inactivă</span>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {form && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold text-[#0A0A0A]">Gestiune nouă</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><Label className="mb-1 block text-xs">Denumire *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Depozit central" /></div>
              <div><Label className="mb-1 block text-xs">Cod</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="DEP01" /></div>
              <div>
                <Label className="mb-1 block text-xs">Tip</Label>
                <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="depozit">Depozit</option>
                  <option value="magazin">Magazin</option>
                  <option value="custodie">Custodie</option>
                </Select>
              </div>
              <div>
                <Label className="mb-1 block text-xs">Tip gestiune</Label>
                <Select value={form.managementType} onChange={(e) => setForm({ ...form, managementType: e.target.value })}>
                  <option value="cantitativ_valoric">Cantitativ-valoric</option>
                  <option value="global_valoric">Global-valoric</option>
                </Select>
              </div>
              <div className="md:col-span-2"><Label className="mb-1 block text-xs">Adresă</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            </div>
            <label className="flex items-center gap-2 text-xs text-[#0A0A0A]">
              <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} /> Gestiune implicită
            </label>
            <div className="flex gap-2">
              <Button size="sm" disabled={busy || !form.name} onClick={save}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvează'}</Button>
              <Button size="sm" variant="outline" onClick={() => setForm(null)}>Renunță</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
