import { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Select } from '../ui/Select';
import { Plus, Loader2, Warehouse as WarehouseIcon } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';

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
  const [showAll, setShowAll] = useState(false);

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

  const inputCls = 'rounded-xl bg-white/10 text-white placeholder:text-[#8FA6BC] border-0 focus:ring-2 focus:ring-[#E1FB15]/40 hover:border-0';
  const selectCls = `${inputCls} [color-scheme:dark]`;
  const btnPrimary = 'rounded-full bg-[#E1FB15] text-[#07090f] font-bold hover:bg-[#D2EA0E] shadow-none';
  const btnSecondary = 'rounded-full bg-white/10 text-white font-semibold hover:bg-white/15 border-0';

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-[#DC4B41]">{error}</p>}

      <div className="flex justify-end">
        <Button className={btnPrimary} onClick={() => setForm({ ...empty })}><Plus className="w-4 h-4 mr-1" /> Gestiune nouă</Button>
      </div>

      <Card className="bg-white/5 border-0 rounded-2xl shadow-none hover:shadow-none hover:translate-y-0">
        <CardContent className="p-2">
          {items.length === 0 ? (
            <EmptyState
              icon={<WarehouseIcon />}
              title="Nicio gestiune"
              description="Adaugă primul depozit sau magazin pentru a urmări stocul."
            />
          ) : (
            <>
            <ul className="space-y-2">
              {(showAll ? items : items.slice(0, 3)).map((w) => (
                <li key={w.id} className="flex items-center gap-3 bg-white/5 rounded-xl p-3 hover:bg-white/[0.08] transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {w.name}
                      {w.code && <span className="font-mono text-xs text-[#A8BED2] ml-2">{w.code}</span>}
                    </p>
                    <p className="text-xs text-[#A8BED2] truncate">
                      {TYPE_LABELS[w.type] || w.type}
                      {w.managementType && <span> · {MGMT_LABELS[w.managementType] || w.managementType}</span>}
                      {w.address && <span> · {w.address}</span>}
                    </p>
                  </div>
                  {w.isDefault && <span className="text-[10px] px-2 py-0.5 bg-[#E1FB15]/15 text-[#E1FB15] rounded-full font-semibold">implicită</span>}
                  {!w.isActive && <span className="text-[10px] px-2 py-0.5 bg-white/10 text-[#A8BED2] rounded-full font-semibold">inactivă</span>}
                </li>
              ))}
            </ul>
            {items.length > 3 && (
              <button type="button" onClick={() => setShowAll((s) => !s)} className="mt-3 mx-auto w-fit flex items-center px-5 py-2.5 rounded-full bg-[#E1FB15] text-[#07090f] text-[13.5px] font-semibold hover:bg-[#D2EA0E] active:scale-95 transition-all">
                {showAll ? 'Arată mai puțin' : `Vezi toate (${items.length})`}
              </button>
            )}
            </>
          )}
        </CardContent>
      </Card>

      {form && (
        <Card className="bg-white/5 border-0 rounded-2xl shadow-none hover:shadow-none hover:translate-y-0">
          <CardContent className="p-4 sm:p-5 space-y-4">
            <h3 className="font-semibold text-white">Gestiune nouă</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label className="mb-1.5 block text-[13px] font-medium text-[#A8BED2]">Denumire *</Label><Input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Depozit central" /></div>
              <div><Label className="mb-1.5 block text-[13px] font-medium text-[#A8BED2]">Cod</Label><Input className={inputCls} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="DEP01" /></div>
              <div>
                <Label className="mb-1.5 block text-[13px] font-medium text-[#A8BED2]">Tip</Label>
                <Select className={selectCls} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="depozit">Depozit</option>
                  <option value="magazin">Magazin</option>
                  <option value="custodie">Custodie</option>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5 block text-[13px] font-medium text-[#A8BED2]">Tip gestiune</Label>
                <Select className={selectCls} value={form.managementType} onChange={(e) => setForm({ ...form, managementType: e.target.value })}>
                  <option value="cantitativ_valoric">Cantitativ-valoric</option>
                  <option value="global_valoric">Global-valoric</option>
                </Select>
              </div>
              <div className="md:col-span-2"><Label className="mb-1.5 block text-[13px] font-medium text-[#A8BED2]">Adresă</Label><Input className={inputCls} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            </div>
            <label className="flex items-center gap-2 text-xs text-white">
              <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} className="[color-scheme:dark] accent-[#E1FB15]" /> Gestiune implicită
            </label>
            <div className="flex gap-2">
              <Button className={btnPrimary} size="sm" disabled={busy || !form.name} onClick={save}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvează'}</Button>
              <Button className={btnSecondary} size="sm" variant="outline" onClick={() => setForm(null)}>Renunță</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
