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
  const [showAll, setShowAll] = useState(false);

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

  const fieldCls = 'bg-white/10 border-0 text-white placeholder:text-[#7C9AB4] hover:border-0 focus:border-0 focus:ring-2 focus:ring-[#E1FB15]/40';
  const lblCls = 'mb-1.5 block text-[13px] font-medium text-[#9FB8CC]';

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-[#DC4B41]">{error}</p>}

      {/* Toolbar — search on its own line on mobile, with breathing room before the buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-[#7C9AB4] pointer-events-none" />
          <Input className={`pl-11 rounded-full ${fieldCls}`} value={q} onChange={(e) => { setQ(e.target.value); refresh(e.target.value); }} placeholder="Caută după nume sau CUI..." />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a href="/api/invoicing/clients/export" className="px-4 h-11 inline-flex items-center gap-1.5 text-[14px] font-semibold text-white bg-white/10 rounded-full hover:bg-white/15 transition-colors"><Download className="w-4 h-4" /> Export</a>
          <Button onClick={() => setEditing({ ...empty })} className="rounded-full bg-[#E1FB15] text-[#0A2238] hover:bg-[#D2EA0E] active:scale-100"><Plus className="w-4 h-4 mr-1" /> Client nou</Button>
        </div>
      </div>

      {/* Edit / add form — rendered HERE (above the list) so it's immediately visible
          when opened, and the fields sit one shade lighter than the card so they read clearly. */}
      {editing && (
        <Card className="bg-white/5 border-0 shadow-none hover:shadow-none hover:translate-y-0 rounded-2xl ring-1 ring-[#E1FB15]/25">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[16px] font-bold text-white">{editing.id ? 'Editează client' : 'Client nou'}</h3>
              <button type="button" onClick={() => setEditing(null)} className="text-[13px] text-[#9FB8CC] hover:text-white">Închide</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label className={lblCls}>Cod fiscal / CUI</Label>
                <div className="flex gap-2">
                  <Input className={fieldCls} value={editing.taxId} onChange={(e) => setEditing({ ...editing, taxId: e.target.value })} placeholder="RO12345678" />
                  <Button size="sm" variant="outline" className="rounded-full bg-white/10 text-white border-0 hover:bg-white/15 hover:border-0 shrink-0" onClick={lookupCui} disabled={looking || !editing.taxId} title="Preia din ANAF">{looking ? <Loader2 className="w-4 h-4 animate-spin" /> : 'ANAF'}</Button>
                </div>
              </div>
              <div><Label className={lblCls}>Nume *</Label><Input className={fieldCls} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Denumirea firmei" /></div>
              <div><Label className={lblCls}>Reg. comerțului</Label><Input className={fieldCls} value={editing.registryNumber} onChange={(e) => setEditing({ ...editing, registryNumber: e.target.value })} placeholder="J40/..." /></div>
              <div><Label className={lblCls}>Țara</Label><Input className={fieldCls} value={editing.country} onChange={(e) => setEditing({ ...editing, country: e.target.value })} placeholder="Romania" /></div>
              <div><Label className={lblCls}>Județ</Label><Input className={fieldCls} value={editing.county} onChange={(e) => setEditing({ ...editing, county: e.target.value })} placeholder="ex: Cluj" /></div>
              <div><Label className={lblCls}>Localitate</Label><Input className={fieldCls} value={editing.city} onChange={(e) => setEditing({ ...editing, city: e.target.value })} placeholder="ex: Cluj-Napoca" /></div>
              <div className="md:col-span-2"><Label className={lblCls}>Adresă</Label><Input className={fieldCls} value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} placeholder="Strada, număr…" /></div>
              <div><Label className={lblCls}>Telefon</Label><Input className={fieldCls} value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} placeholder="07xx xxx xxx" /></div>
              <div><Label className={lblCls}>Email</Label><Input className={fieldCls} value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} placeholder="contact@firma.ro" /></div>
              <div><Label className={lblCls}>IBAN</Label><Input className={fieldCls} value={editing.iban} onChange={(e) => setEditing({ ...editing, iban: e.target.value })} placeholder="RO..." /></div>
              <div><Label className={lblCls}>Bancă</Label><Input className={fieldCls} value={editing.bank} onChange={(e) => setEditing({ ...editing, bank: e.target.value })} placeholder="ex: BT" /></div>
              <div><Label className={lblCls}>Persoană contact</Label><Input className={fieldCls} value={editing.contactName} onChange={(e) => setEditing({ ...editing, contactName: e.target.value })} placeholder="Nume contact" /></div>
            </div>
            <label className="flex items-center gap-2 text-[13px] text-white">
              <input type="checkbox" className="accent-[#E1FB15]" checked={editing.isVatPayer} onChange={(e) => setEditing({ ...editing, isVatPayer: e.target.checked })} /> Plătitor de TVA
            </label>
            <div className="flex gap-2 pt-1">
              <Button size="sm" className="rounded-full bg-[#E1FB15] text-[#0A2238] hover:bg-[#D2EA0E] active:scale-100" disabled={busy || !editing.name} onClick={save}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvează'}</Button>
              <Button size="sm" variant="outline" className="rounded-full bg-white/10 text-white border-0 hover:bg-white/15 hover:border-0" onClick={() => setEditing(null)}>Renunță</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-white/5 border-0 shadow-none hover:shadow-none hover:translate-y-0 rounded-2xl">
        <CardContent className="p-0">
          {clients.length === 0 ? (
            <p className="text-sm text-[#9FB8CC] p-6 text-center">Niciun client. Adaugă primul client extern.</p>
          ) : (
            <>
            <ul className="p-2 space-y-2">
              {(showAll ? clients : clients.slice(0, 3)).map((c) => (
                <li key={c.id} className="flex items-center gap-3 p-4 rounded-2xl bg-white/10 hover:bg-white/15 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-bold text-white truncate">{c.name}</p>
                    <p className="text-xs text-[#9FB8CC] truncate">
                      {c.taxId && <span className="font-mono mr-2">{c.taxId}</span>}
                      {[c.city, c.country].filter(Boolean).join(', ')}
                      {c.email && <span className="ml-2">· {c.email}</span>}
                    </p>
                  </div>
                  {c.isVatPayer && <span className="text-[10px] px-2 py-0.5 bg-[#34A0A4]/15 text-[#34A0A4] rounded-full font-semibold shrink-0">plătitor TVA</span>}
                  <button onClick={() => setEditing({ ...empty, ...c, taxId: c.taxId || '', country: c.country || 'Romania' } as any)} className="w-9 h-9 rounded-full bg-white/5 grid place-items-center text-white hover:bg-white/15 shrink-0"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => remove(c.id)} className="w-9 h-9 rounded-full bg-white/5 grid place-items-center text-[#9FB8CC] hover:bg-white/15 hover:text-[#DC4B41] shrink-0"><Trash2 className="w-4 h-4" /></button>
                </li>
              ))}
            </ul>
            {clients.length > 3 && (
              <button type="button" onClick={() => setShowAll((s) => !s)} className="mt-3 mx-auto w-fit flex items-center px-5 py-2.5 rounded-full bg-[#E1FB15] text-[#0A2238] text-[13.5px] font-semibold hover:bg-[#D2EA0E] active:scale-95 transition-all">
                {showAll ? 'Arată mai puțin' : `Vezi toți (${clients.length})`}
              </button>
            )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
