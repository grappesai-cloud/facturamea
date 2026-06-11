import { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Plus, Trash2, Loader2, Pencil, Search, Download } from 'lucide-react';

interface Client {
  id: string; name: string; taxId: string | null; isVatPayer: boolean; registryNumber: string | null;
  country: string | null; county: string | null; city: string | null; address: string | null;
  email: string | null; phone: string | null; iban: string | null; bank: string | null; contactName: string | null;
}

const empty = {
  id: '', name: '', taxId: '', isVatPayer: false, registryNumber: '', country: 'Romania', county: '',
  city: '', address: '', email: '', phone: '', iban: '', bank: '', contactName: '',
};

export default function ClientsManager() {
  const [clients, setClients] = useState<Client[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<typeof empty | null>(null);
  const [looking, setLooking] = useState(false);

  const refresh = async (term = '') => {
    const r = await fetch(`/api/invoicing/clients${term ? `?q=${encodeURIComponent(term)}` : ''}`);
    const d = await r.json();
    setClients(d.results || []);
  };
  useEffect(() => { refresh(); }, []);

  const lookupCui = async () => {
    if (!editing?.taxId) return;
    setLooking(true); setError('');
    try {
      const r = await fetch(`/api/anaf/lookup?cui=${encodeURIComponent(editing.taxId)}`);
      const d = await r.json();
      if (d.ok) {
        setEditing((e) => e ? { ...e, name: d.name || e.name, address: d.address || e.address, isVatPayer: !!d.isVatPayer } : e);
      } else setError(d.error || 'CUI negăsit la ANAF');
    } catch { setError('Eroare ANAF'); } finally { setLooking(false); }
  };

  const save = async () => {
    if (!editing) return;
    setBusy(true); setError('');
    try {
      const isEdit = !!editing.id;
      const res = await fetch('/api/invoicing/clients', {
        method: isEdit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Eroare'); return; }
      setEditing(null); await refresh(q);
    } catch { setError('Eroare conexiune'); } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!confirm('Sigur ștergi clientul?')) return;
    const r = await fetch(`/api/invoicing/clients?id=${id}`, { method: 'DELETE' });
    if (!r.ok) { const d = await r.json(); setError(d.error || 'Eroare'); return; }
    await refresh(q);
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#A8A8A4]" />
          <Input className="pl-9" value={q} onChange={(e) => { setQ(e.target.value); refresh(e.target.value); }} placeholder="Caută după nume sau CUI..." />
        </div>
        <a href="/api/invoicing/clients/export" className="px-3 h-10 inline-flex items-center gap-1.5 text-sm border border-[#E8E8E4] rounded-xl hover:bg-[#FAFAF8]"><Download className="w-4 h-4" /> Export</a>
        <Button onClick={() => setEditing({ ...empty })}><Plus className="w-4 h-4 mr-1" /> Client nou</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {clients.length === 0 ? (
            <p className="text-sm text-[#6B6B68] p-6 text-center">Niciun client. Adaugă primul client extern.</p>
          ) : (
            <ul className="divide-y divide-[#E8E8E4]">
              {clients.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[#FAFAF8] transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#0A0A0A] truncate">{c.name}</p>
                    <p className="text-xs text-[#6B6B68] truncate">
                      {c.taxId && <span className="font-mono mr-2">{c.taxId}</span>}
                      {[c.city, c.country].filter(Boolean).join(', ')}
                      {c.email && <span className="ml-2">· {c.email}</span>}
                    </p>
                  </div>
                  {c.isVatPayer && <span className="text-[10px] px-2 py-0.5 bg-[#DBEAFE] text-[#1E3A8A] rounded-full font-semibold">plătitor TVA</span>}
                  <button onClick={() => setEditing({ ...empty, ...c, taxId: c.taxId || '', country: c.country || 'Romania' } as any)} className="p-1.5 text-[#6B6B68] hover:text-[#0A0A0A]"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => remove(c.id)} className="p-1.5 text-[#A8A8A4] hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {editing && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold text-[#0A0A0A]">{editing.id ? 'Editează client' : 'Client nou'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label className="mb-1 block text-xs">Cod fiscal / CUI</Label>
                <div className="flex gap-1">
                  <Input value={editing.taxId} onChange={(e) => setEditing({ ...editing, taxId: e.target.value })} placeholder="RO12345678" />
                  <Button size="sm" variant="outline" onClick={lookupCui} disabled={looking || !editing.taxId} title="Preia din ANAF">{looking ? <Loader2 className="w-4 h-4 animate-spin" /> : 'ANAF'}</Button>
                </div>
              </div>
              <div><Label className="mb-1 block text-xs">Nume *</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><Label className="mb-1 block text-xs">Reg. comerțului</Label><Input value={editing.registryNumber} onChange={(e) => setEditing({ ...editing, registryNumber: e.target.value })} placeholder="J40/..." /></div>
              <div><Label className="mb-1 block text-xs">Țara</Label><Input value={editing.country} onChange={(e) => setEditing({ ...editing, country: e.target.value })} /></div>
              <div><Label className="mb-1 block text-xs">Județ</Label><Input value={editing.county} onChange={(e) => setEditing({ ...editing, county: e.target.value })} /></div>
              <div><Label className="mb-1 block text-xs">Localitate</Label><Input value={editing.city} onChange={(e) => setEditing({ ...editing, city: e.target.value })} /></div>
              <div className="md:col-span-2"><Label className="mb-1 block text-xs">Adresă</Label><Input value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></div>
              <div><Label className="mb-1 block text-xs">Telefon</Label><Input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></div>
              <div><Label className="mb-1 block text-xs">Email</Label><Input value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></div>
              <div><Label className="mb-1 block text-xs">IBAN</Label><Input value={editing.iban} onChange={(e) => setEditing({ ...editing, iban: e.target.value })} /></div>
              <div><Label className="mb-1 block text-xs">Bancă</Label><Input value={editing.bank} onChange={(e) => setEditing({ ...editing, bank: e.target.value })} /></div>
              <div><Label className="mb-1 block text-xs">Persoană contact</Label><Input value={editing.contactName} onChange={(e) => setEditing({ ...editing, contactName: e.target.value })} /></div>
            </div>
            <label className="flex items-center gap-2 text-xs text-[#0A0A0A]">
              <input type="checkbox" checked={editing.isVatPayer} onChange={(e) => setEditing({ ...editing, isVatPayer: e.target.checked })} /> Plătitor de TVA
            </label>
            <div className="flex gap-2">
              <Button size="sm" disabled={busy || !editing.name} onClick={save}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvează'}</Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Renunță</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
