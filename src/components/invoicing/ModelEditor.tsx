import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Loader2, Plus, Star, Trash2, Upload } from 'lucide-react';
import InvoicePreview from './InvoicePreview';

interface Model { id: string; name: string; layoutKey: string; brandColor: string; logoUrl: string | null; footerText: string | null; isDefault: boolean; showQr: boolean; showShipping: boolean; showEmittedWith: boolean }

const blankDraft = { name: '', layoutKey: 'classic', brandColor: '#0A2238', logoUrl: '', footerText: '', isDefault: false, showQr: false, showShipping: true, showEmittedWith: false };

const TEMPLATES: [string, string, string][] = [
  ['classic', 'Clasic', 'bară sus + tabel colorat'],
  ['modern', 'Modern', 'antet colorat, total plin'],
  ['minimal', 'Minimal', 'linii fine, fără blocuri'],
  ['bold', 'Bold', 'dungă laterală, total plin'],
  ['elegant', 'Elegant', 'panou antet nuanțat'],
];

export default function ModelEditor() {
  const [models, setModels] = useState<Model[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<Model | null>(null);
  const [draft, setDraft] = useState(blankDraft);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    const r = await fetch('/api/invoicing/models');
    const d = await r.json();
    setModels(d.results || []);
  };
  useEffect(() => { refresh(); }, []);

  const startNew = () => { setEditing(null); setDraft(blankDraft); setError(''); };
  const startEdit = (m: Model) => { setEditing(m); setDraft({ ...blankDraft, ...m, logoUrl: m.logoUrl || '', footerText: m.footerText || '' }); setError(''); };

  const onLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('purpose', 'image');
      const res = await fetch('/api/upload/document', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Eroare upload'); return; }
      setDraft((d) => ({ ...d, logoUrl: data.url }));
    } catch { setError('Eroare upload'); } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const save = async () => {
    setError(''); setBusy(true);
    try {
      const payload = { ...draft, logoUrl: draft.logoUrl || null, footerText: draft.footerText || null };
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
    if (!confirm('Sigur ștergi acest design?')) return;
    await fetch(`/api/invoicing/models?id=${id}`, { method: 'DELETE' });
    if (editing?.id === id) startNew();
    await refresh();
  };

  const setDefault = async (id: string) => {
    await fetch('/api/invoicing/models', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, isDefault: true }) });
    await refresh();
  };

  const field = (k: keyof typeof blankDraft, v: any) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div className="space-y-5">
      {/* Saved designs */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-[15px] font-bold text-white">Designurile mele</h3>
          <button onClick={startNew} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#E1FB15] text-[#0A2238] text-[13px] font-bold hover:bg-[#D2EA0E] transition-colors">
            <Plus className="w-4 h-4" /> Design nou
          </button>
        </div>
        {models.length === 0 ? (
          <p className="text-[13px] text-[#9FB8CC]">Niciun design salvat încă. Creează unul — îl poți refolosi pe orice factură.</p>
        ) : (
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {models.map((m) => (
              <button key={m.id} onClick={() => startEdit(m)} className={`shrink-0 text-left w-44 px-3.5 py-3 rounded-2xl border transition-colors ${editing?.id === m.id ? 'border-[#E1FB15] bg-white/[0.06]' : 'border-white/10 bg-white/5 hover:border-white/25'}`}>
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded shrink-0" style={{ background: m.brandColor }} />
                  <span className="text-[13px] font-semibold text-white flex-1 truncate">{m.name}</span>
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10px] uppercase tracking-wide text-[#7C9AB4]">{m.layoutKey}</span>
                  {m.isDefault ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-[#E1FB15] font-semibold"><Star className="w-3 h-3 fill-[#E1FB15]" /> implicit</span>
                  ) : (
                    <span onClick={(e) => { e.stopPropagation(); setDefault(m.id); }} className="text-[10px] text-[#9FB8CC] hover:text-white underline cursor-pointer">fă implicit</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Editor + live preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="rounded-2xl bg-white/5 p-5 space-y-3.5">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-bold text-white">{editing ? 'Editează design' : 'Design nou'}</h3>
            {editing && <button onClick={startNew} className="text-[12px] text-[#9FB8CC] hover:text-white">Renunță</button>}
          </div>
          {error && <p className="text-[13px] text-[#DC4B41]">{error}</p>}

          <div>
            <Label className="mb-1.5 block text-[13px] text-[#9FB8CC]">Nume design</Label>
            <Input value={draft.name} onChange={(e) => field('name', e.target.value)} placeholder="ex: Brand albastru" className="bg-white/5 text-white border-0 ring-1 ring-white/15 focus:ring-2 focus:ring-[#E1FB15]/50" />
          </div>

          <div>
            <Label className="mb-1.5 block text-[13px] text-[#9FB8CC]">Șablon</Label>
            <div className="grid grid-cols-3 gap-2">
              {TEMPLATES.map(([l, name, desc]) => (
                <button key={l} type="button" onClick={() => field('layoutKey', l)} className={`text-left px-3 py-2.5 rounded-xl text-xs border transition-colors ${draft.layoutKey === l ? 'border-[#E1FB15] bg-[#E1FB15]/[0.08] text-white' : 'border-white/10 bg-white/5 text-[#C8DAE8] hover:border-white/25'}`}>
                  <span className="block font-semibold">{name}</span>
                  <span className="block text-[10px] text-[#7C9AB4] mt-0.5">{desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block text-[13px] text-[#9FB8CC]">Culoare brand</Label>
              <div className="flex gap-2">
                <input type="color" value={draft.brandColor} onChange={(e) => field('brandColor', e.target.value)} className="w-10 h-10 rounded-lg bg-transparent border border-white/15 cursor-pointer" />
                <Input value={draft.brandColor} onChange={(e) => field('brandColor', e.target.value)} className="flex-1 bg-white/5 text-white border-0 ring-1 ring-white/15" />
              </div>
            </div>
            <div>
              <Label className="mb-1.5 block text-[13px] text-[#9FB8CC]">Logo</Label>
              <div className="flex items-center gap-2">
                {draft.logoUrl && <img src={draft.logoUrl} alt="" className="w-10 h-10 object-contain rounded-lg bg-white ring-1 ring-white/15" />}
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 text-white text-[12px] font-semibold hover:bg-white/15 disabled:opacity-50">
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {draft.logoUrl ? 'Schimbă' : 'Încarcă'}
                </button>
                {draft.logoUrl && <button type="button" onClick={() => field('logoUrl', '')} className="text-[12px] text-[#DC4B41] hover:underline">Scoate</button>}
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={onLogoFile} />
              </div>
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block text-[13px] text-[#9FB8CC]">Footer (text mic la baza facturii)</Label>
            <textarea rows={2} value={draft.footerText} onChange={(e) => field('footerText', e.target.value)} placeholder="ex: Plata se face în contul RO… deschis la …" className="w-full px-3 py-2 rounded-xl bg-white/5 text-white text-sm border-0 ring-1 ring-white/15 focus:outline-none focus:ring-2 focus:ring-[#E1FB15]/50 placeholder:text-[#7C9AB4]" />
          </div>

          <div className="border-t border-white/10 pt-3 space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-[#7C9AB4]">Opțiuni afișare</p>
            {([['showShipping', 'Afișează date privind expediția'], ['showQr', 'Afișează cod QR pe factură'], ['showEmittedWith', 'Afișează „Emis cu facturamea”']] as const).map(([k, lbl]) => (
              <label key={k} className="flex items-center gap-2.5 text-[13px] text-[#C8DAE8] cursor-pointer">
                <input type="checkbox" checked={draft[k] as boolean} onChange={(e) => field(k, e.target.checked)} className="w-4 h-4 accent-[#1A759F]" />
                {lbl}
              </label>
            ))}
            <label className="flex items-center gap-2.5 text-[13px] text-[#C8DAE8] cursor-pointer pt-1">
              <input type="checkbox" checked={draft.isDefault} onChange={(e) => field('isDefault', e.target.checked)} className="w-4 h-4 accent-[#1A759F]" />
              Folosește acest design implicit la emitere
            </label>
          </div>

          <div className="flex gap-2 pt-1">
            <Button disabled={busy || !draft.name} onClick={save} className="rounded-full bg-[#E1FB15] text-[#0A2238] font-bold hover:bg-[#D2EA0E]">
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {editing ? 'Salvează design' : 'Salvează design'}
            </Button>
            {editing && (
              <Button variant="outline" onClick={() => remove(editing.id)} className="rounded-full border-0 bg-white/10 text-white hover:bg-[#DC4B41]/20 hover:text-[#DC4B41]">
                <Trash2 className="w-4 h-4 mr-1" /> Șterge
              </Button>
            )}
          </div>
        </div>

        {/* Live preview */}
        <div className="lg:sticky lg:top-4 self-start">
          <p className="text-[12px] uppercase tracking-wider text-[#7C9AB4] mb-2">Previzualizare live</p>
          <InvoicePreview draft={draft} />
          <p className="text-[11px] text-[#7C9AB4] mt-2">Se actualizează pe măsură ce schimbi designul. Date demonstrative.</p>
        </div>
      </div>
    </div>
  );
}
