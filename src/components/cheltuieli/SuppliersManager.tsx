import { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Plus, Trash2, Loader2, Pencil, Search } from 'lucide-react';

interface Supplier {
  id: string; name: string; cui: string | null; regCom: string | null;
  address: string | null; city: string | null; country: string | null;
  iban: string | null; email: string | null; phone: string | null;
}

const empty = {
  id: '', name: '', cui: '', regCom: '', address: '', city: '',
  country: 'Romania', iban: '', email: '', phone: '',
};

export default function SuppliersManager() {
  const [items, setItems] = useState<Supplier[]>([]);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<typeof empty | null>(null);
  const [busy, setBusy] = useState(false);
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);

  const refresh = async (term = q) => {
    try {
      const r = await fetch(`/api/cheltuieli/suppliers${term ? `?q=${encodeURIComponent(term)}` : ''}`);
      const d = await r.json();
      setItems(d.results || []);
    } catch { /* leave empty */ }
  };
  useEffect(() => { refresh(''); }, []);

  const lookupCui = async () => {
    if (!editing?.cui) return;
    setLooking(true); setError('');
    try {
      const r = await fetch(`/api/anaf/lookup?cui=${encodeURIComponent(editing.cui)}`);
      const d = await r.json();
      if (d.ok) {
        setEditing((e) => e ? { ...e, name: d.name || e.name, address: d.address || e.address } : e);
      } else setError(d.error || 'CUI negăsit la ANAF');
    } catch { setError('Eroare ANAF'); } finally { setLooking(false); }
  };

  const save = async () => {
    if (!editing) return;
    setBusy(true); setError('');
    try {
      const isEdit = !!editing.id;
      const res = await fetch(isEdit ? `/api/cheltuieli/suppliers/${editing.id}` : '/api/cheltuieli/suppliers', {
        method: isEdit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Eroare'); return; }
      setEditing(null); await refresh();
    } catch { setError('Eroare conexiune'); } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!confirm('Sigur ștergi furnizorul?')) return;
    try {
      const res = await fetch(`/api/cheltuieli/suppliers/${id}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Eroare'); return; }
      await refresh();
    } catch { setError('Eroare conexiune'); }
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-[#DC4B41]">{error}</p>}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#7C9AB4]" />
          <Input className="pl-9 rounded-full bg-white/5 border-0 text-white placeholder:text-[#7C9AB4] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" value={q} onChange={(e) => { setQ(e.target.value); refresh(e.target.value); }} placeholder="Caută după nume sau CUI..." />
        </div>
        <Button className="bg-[#E1FB15] text-[#0A2238] hover:bg-[#D2EA0E] rounded-full font-bold shadow-none" onClick={() => setEditing({ ...empty })}><Plus className="w-4 h-4 mr-1" /> Furnizor nou</Button>
      </div>

      <Card className="bg-white/5 border-0 shadow-none rounded-2xl">
        <CardContent className="p-0">
          {items.length === 0 ? (
            <p className="text-sm text-[#7C9AB4] p-6 text-center">Niciun furnizor. Adaugă primul furnizor.</p>
          ) : (
            <>
            <ul className="divide-y divide-white/5">
              {(showAll ? items : items.slice(0, 3)).map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/10 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{s.name}</p>
                    <p className="text-xs text-[#9FB8CC] truncate">
                      {s.cui && <span className="font-mono mr-2">{s.cui}</span>}
                      {[s.city, s.country].filter(Boolean).join(', ')}
                      {s.email && <span className="ml-2">· {s.email}</span>}
                    </p>
                  </div>
                  <button onClick={() => setEditing({ ...empty, ...s, cui: s.cui || '', country: s.country || 'Romania' } as any)} className="p-1.5 text-[#7C9AB4] hover:text-white"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => remove(s.id)} className="p-1.5 text-[#7C9AB4] hover:text-[#DC4B41]"><Trash2 className="w-4 h-4" /></button>
                </li>
              ))}
            </ul>
            {items.length > 3 && (
              <button type="button" onClick={() => setShowAll((s) => !s)} className="mt-3 mx-auto w-fit flex items-center px-5 py-2.5 rounded-full bg-[#E1FB15] text-[#0A2238] text-[13.5px] font-semibold hover:bg-[#D2EA0E] active:scale-95 transition-all">
                {showAll ? 'Arată mai puțin' : `Vezi toți (${items.length})`}
              </button>
            )}
            </>
          )}
        </CardContent>
      </Card>

      {editing && (
        <Card className="bg-white/5 border-0 shadow-none rounded-2xl">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold text-white">{editing.id ? 'Editează furnizor' : 'Furnizor nou'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label className="mb-1 block text-xs text-[#9FB8CC]">CUI</Label>
                <div className="flex gap-1">
                  <Input className="bg-white/5 border-0 text-white placeholder:text-[#7C9AB4] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" value={editing.cui} onChange={(e) => setEditing({ ...editing, cui: e.target.value })} placeholder="RO12345678" />
                  <Button className="bg-white/10 border-0 text-white hover:bg-white/15 rounded-full" size="sm" variant="outline" onClick={lookupCui} disabled={looking || !editing.cui} title="Preia din ANAF">{looking ? <Loader2 className="w-4 h-4 animate-spin" /> : 'ANAF'}</Button>
                </div>
              </div>
              <div><Label className="mb-1 block text-xs text-[#9FB8CC]">Nume *</Label><Input className="bg-white/5 border-0 text-white placeholder:text-[#7C9AB4] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><Label className="mb-1 block text-xs text-[#9FB8CC]">Reg. comerțului</Label><Input className="bg-white/5 border-0 text-white placeholder:text-[#7C9AB4] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" value={editing.regCom} onChange={(e) => setEditing({ ...editing, regCom: e.target.value })} placeholder="J40/..." /></div>
              <div><Label className="mb-1 block text-xs text-[#9FB8CC]">Țara</Label><Input className="bg-white/5 border-0 text-white placeholder:text-[#7C9AB4] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" value={editing.country} onChange={(e) => setEditing({ ...editing, country: e.target.value })} /></div>
              <div><Label className="mb-1 block text-xs text-[#9FB8CC]">Localitate</Label><Input className="bg-white/5 border-0 text-white placeholder:text-[#7C9AB4] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" value={editing.city} onChange={(e) => setEditing({ ...editing, city: e.target.value })} /></div>
              <div className="md:col-span-2"><Label className="mb-1 block text-xs text-[#9FB8CC]">Adresă</Label><Input className="bg-white/5 border-0 text-white placeholder:text-[#7C9AB4] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></div>
              <div><Label className="mb-1 block text-xs text-[#9FB8CC]">IBAN</Label><Input className="bg-white/5 border-0 text-white placeholder:text-[#7C9AB4] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" value={editing.iban} onChange={(e) => setEditing({ ...editing, iban: e.target.value })} /></div>
              <div><Label className="mb-1 block text-xs text-[#9FB8CC]">Email</Label><Input className="bg-white/5 border-0 text-white placeholder:text-[#7C9AB4] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></div>
              <div><Label className="mb-1 block text-xs text-[#9FB8CC]">Telefon</Label><Input className="bg-white/5 border-0 text-white placeholder:text-[#7C9AB4] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></div>
            </div>
            <div className="flex gap-2">
              <Button className="bg-[#E1FB15] text-[#0A2238] hover:bg-[#D2EA0E] rounded-full font-bold shadow-none" size="sm" disabled={busy || !editing.name} onClick={save}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvează'}</Button>
              <Button className="bg-white/10 border-0 text-white hover:bg-white/15 rounded-full" size="sm" variant="outline" onClick={() => setEditing(null)}>Renunță</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
