import { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Loader2, Plus, Star, Trash2 } from 'lucide-react';

interface Model { id: string; name: string; layoutKey: string; brandColor: string; logoUrl: string | null; footerText: string | null; isDefault: boolean; showQr: boolean; showShipping: boolean; showEmittedWith: boolean }

const blankDraft = { name: '', layoutKey: 'classic', brandColor: '#0A0A0A', logoUrl: '', footerText: '', isDefault: false, showQr: false, showShipping: true, showEmittedWith: false };

export default function ModelEditor() {
  const [models, setModels] = useState<Model[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Model | null>(null);
  const [draft, setDraft] = useState(blankDraft);

  const refresh = async () => {
    const r = await fetch('/api/invoicing/models');
    const d = await r.json();
    setModels(d.results || []);
  };
  useEffect(() => { refresh(); }, []);

  const startNew = () => { setEditing(null); setDraft(blankDraft); };
  const startEdit = (m: Model) => { setEditing(m); setDraft({ ...blankDraft, ...m, logoUrl: m.logoUrl || '', footerText: m.footerText || '' }); };

  const save = async () => {
    setError(''); setBusy(true);
    try {
      const payload = {
        ...draft,
        logoUrl: draft.logoUrl || null,
        footerText: draft.footerText || null,
      };
      const res = editing
        ? await fetch('/api/invoicing/models', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing.id, ...payload }) })
        : await fetch('/api/invoicing/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Eroare'); return; }
      setEditing(null); setDraft(blankDraft);
      await refresh();
    } catch { setError('Eroare conexiune'); } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!confirm('Sigur ștergi modelul?')) return;
    await fetch(`/api/invoicing/models?id=${id}`, { method: 'DELETE' });
    await refresh();
  };

  const setDefault = async (id: string) => {
    await fetch('/api/invoicing/models', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, isDefault: true }) });
    await refresh();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-[#0A0A0A]">Modele existente</h3>
          <Button size="sm" onClick={startNew}><Plus className="w-4 h-4 mr-1" /> Model nou</Button>
        </div>
        {models.length === 0 ? (
          <p className="text-xs text-[#6B6B68]">Niciun model. Creează unul pentru a personaliza PDF-ul.</p>
        ) : (
          <ul className="space-y-1.5">
            {models.map((m) => (
              <li key={m.id} className={`flex items-center gap-2 px-3 py-2 bg-white border rounded-xl cursor-pointer ${editing?.id === m.id ? 'border-[#FF5C00]' : 'border-[#E8E8E4]'}`} onClick={() => startEdit(m)}>
                <span className="w-3 h-3 rounded shrink-0" style={{ background: m.brandColor }} />
                <span className="text-sm font-medium text-[#0A0A0A] flex-1 truncate">{m.name}</span>
                <span className="text-[10px] text-[#6B6B68] uppercase">{m.layoutKey}</span>
                {m.isDefault ? (
                  <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-semibold flex items-center gap-1"><Star className="w-3 h-3 fill-amber-500" /> implicit</span>
                ) : (
                  <button onClick={(e) => { e.stopPropagation(); setDefault(m.id); }} className="text-[10px] text-[#6B6B68] hover:text-[#0A0A0A] underline">implicit</button>
                )}
                <button onClick={(e) => { e.stopPropagation(); remove(m.id); }} className="p-1 text-[#A8A8A4] hover:text-red-600">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="font-semibold text-[#0A0A0A]">{editing ? 'Editează model' : 'Model nou'}</h3>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="space-y-2">
            <div>
              <Label className="mb-1 block text-xs">Nume *</Label>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Model Clasic Brand" />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Aspect</Label>
              <div className="flex gap-2">
                {['classic', 'accent'].map((l) => (
                  <button key={l} type="button" onClick={() => setDraft({ ...draft, layoutKey: l })} className={`flex-1 px-3 py-2 rounded-xl text-xs font-medium border ${draft.layoutKey === l ? 'border-[#FF5C00] bg-amber-50 text-[#FF5C00]' : 'border-[#E8E8E4] bg-white text-[#0A0A0A]'}`}>
                    {l === 'classic' ? 'Clasic (sobru)' : 'Accent (colorat)'}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="mb-1 block text-xs">Culoare brand</Label>
                <div className="flex gap-2">
                  <input type="color" value={draft.brandColor} onChange={(e) => setDraft({ ...draft, brandColor: e.target.value })} className="w-10 h-10 rounded border border-[#E8E8E4]" />
                  <Input value={draft.brandColor} onChange={(e) => setDraft({ ...draft, brandColor: e.target.value })} className="flex-1" />
                </div>
              </div>
              <div>
                <Label className="mb-1 block text-xs">Logo URL</Label>
                <Input value={draft.logoUrl} onChange={(e) => setDraft({ ...draft, logoUrl: e.target.value })} placeholder="https://..." />
              </div>
            </div>
            <div>
              <Label className="mb-1 block text-xs">Footer (text mic la baza facturii)</Label>
              <textarea
                rows={3}
                value={draft.footerText}
                onChange={(e) => setDraft({ ...draft, footerText: e.target.value })}
                placeholder="ex: Plata se face în contul RO… deschis la …"
                className="w-full px-3 py-2 border border-[#E8E8E4] rounded-xl text-sm"
              />
            </div>
            <div className="border-t border-[#E8E8E4] pt-2 space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider text-[#6B6B68]">Opțiuni afișare</p>
              <label className="flex items-center gap-2 text-xs text-[#0A0A0A]">
                <input type="checkbox" checked={draft.showShipping} onChange={(e) => setDraft({ ...draft, showShipping: e.target.checked })} />
                Afișează date privind expediția
              </label>
              <label className="flex items-center gap-2 text-xs text-[#0A0A0A]">
                <input type="checkbox" checked={draft.showQr} onChange={(e) => setDraft({ ...draft, showQr: e.target.checked })} />
                Afișează cod QR pe factură
              </label>
              <label className="flex items-center gap-2 text-xs text-[#0A0A0A]">
                <input type="checkbox" checked={draft.showEmittedWith} onChange={(e) => setDraft({ ...draft, showEmittedWith: e.target.checked })} />
                Afișează „Emis cu facturamea"
              </label>
            </div>
            <label className="flex items-center gap-2 text-xs text-[#0A0A0A]">
              <input type="checkbox" checked={draft.isDefault} onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })} />
              Setează ca model implicit la emitere
            </label>
          </div>
          <div className="flex gap-2 pt-2">
            <Button disabled={busy || !draft.name} onClick={save}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {editing ? 'Salvează modificările' : 'Creează model'}
            </Button>
            {editing && <Button variant="outline" onClick={startNew}>Renunță</Button>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
