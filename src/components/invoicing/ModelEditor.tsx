import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Loader2, Plus, Star, Trash2, Upload, FileText, Check } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';
import InvoicePreview from './InvoicePreview';

interface Model { id: string; name: string; layoutKey: string; brandColor: string; logoUrl: string | null; footerText: string | null; isDefault: boolean; showQr: boolean; showShipping: boolean; showEmittedWith: boolean }

const blankDraft = { name: '', layoutKey: 'classic', brandColor: '#07090f', logoUrl: '', footerText: '', isDefault: false, showQr: false, showShipping: true, showEmittedWith: false };

// A tiny white-paper thumbnail that hints at each template's look. Always on a
// white sheet (it's an invoice) so it reads in both light & dark app themes.
function TemplateThumb({ layout, brand }: { layout: string; brand: string }) {
  const b = brand && brand !== '#0A0A0A' ? brand : '#07090f';
  const bar = (w: string, c = '#C7D2DD') => <span style={{ display: 'block', height: 2.5, width: w, borderRadius: 2, background: c }} />;
  return (
    <div
      className="w-full aspect-[4/3] rounded-lg overflow-hidden ring-1 ring-black/10"
      style={{
        background: '#fff',
        padding: 6,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        borderTop: layout === 'classic' ? `3px solid ${b}` : undefined,
        borderLeft: layout === 'bold' ? `4px solid ${b}` : undefined,
      }}
    >
      {layout === 'modern' ? (
        <div style={{ margin: -6, marginBottom: 2, padding: 5, background: b, display: 'flex', justifyContent: 'space-between' }}>
          {bar('40%', 'rgba(255,255,255,0.85)')}
          {bar('22%', 'rgba(255,255,255,0.6)')}
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            paddingBottom: 3,
            borderBottom: layout === 'elegant' ? undefined : `1px solid #E3EAF1`,
            background: layout === 'elegant' ? `${b}14` : undefined,
            borderRadius: layout === 'elegant' ? 4 : undefined,
            padding: layout === 'elegant' ? 4 : undefined,
            margin: layout === 'elegant' ? -2 : undefined,
          }}
        >
          {bar('40%', b)}
          {bar('22%')}
        </div>
      )}
      {/* table header */}
      <div
        style={{
          display: 'flex',
          gap: 3,
          padding: layout === 'classic' || layout === 'modern' || layout === 'bold' || layout === 'elegant' ? '2px 3px' : 0,
          borderRadius: 2,
          background: layout === 'classic' || layout === 'modern' || layout === 'bold' || layout === 'elegant' ? b : undefined,
          borderBottom: layout === 'minimal' ? `1.5px solid ${b}` : undefined,
          paddingBottom: layout === 'minimal' ? 2 : undefined,
        }}
      >
        {bar('38%', layout === 'minimal' ? b : 'rgba(255,255,255,0.85)')}
        {bar('22%', layout === 'minimal' ? b : 'rgba(255,255,255,0.6)')}
      </div>
      {bar('100%', '#EEF2F6')}
      {bar('100%', '#EEF2F6')}
      {/* total */}
      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end' }}>
        <span
          style={{
            display: 'block',
            width: '45%',
            height: 8,
            borderRadius: 2,
            background: layout === 'modern' || layout === 'bold' ? b : `${b}1F`,
          }}
        />
      </div>
    </div>
  );
}

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
  const nameRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const refresh = async () => {
    const r = await fetch('/api/invoicing/models');
    const d = await r.json();
    setModels(d.results || []);
  };
  useEffect(() => { refresh(); }, []);

  const startNew = () => {
    setEditing(null); setDraft(blankDraft); setError('');
    // Make it obvious the editor is ready: scroll to it and focus the name.
    requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      nameRef.current?.focus();
    });
  };
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
    if (!draft.name.trim()) {
      setError('Dă-i un nume designului ca să îl poți salva.');
      nameRef.current?.focus();
      return;
    }
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
          <button onClick={startNew} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#E1FB15] text-[#07090f] text-[13px] font-bold hover:bg-[#D2EA0E] transition-colors">
            <Plus className="w-4 h-4" /> Design nou
          </button>
        </div>
        {models.length === 0 ? (
          <EmptyState
            icon={<FileText />}
            title="Niciun design salvat"
            description="Creează un model reutilizabil pentru facturile tale."
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {models.map((m) => (
              <button key={m.id} onClick={() => startEdit(m)} className={`text-left px-3.5 py-3 rounded-2xl border transition-colors ${editing?.id === m.id ? 'border-[#E1FB15] bg-white/[0.06]' : 'border-white/10 bg-white/5 hover:border-white/25'}`}>
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded shrink-0" style={{ background: m.brandColor }} />
                  <span className="text-[13px] font-semibold text-white flex-1 truncate">{m.name}</span>
                </div>
                <div className="flex items-center justify-between mt-1.5 gap-2">
                  <span className="text-[10px] uppercase tracking-wide text-[#8FA6BC] truncate">{m.layoutKey}</span>
                  {m.isDefault ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-[#E1FB15] font-semibold shrink-0"><Star className="w-3 h-3 fill-[#E1FB15]" /> implicit</span>
                  ) : (
                    <span onClick={(e) => { e.stopPropagation(); setDefault(m.id); }} className="text-[10px] text-[#A8BED2] hover:text-white underline cursor-pointer shrink-0">fă implicit</span>
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
        <div ref={editorRef} className="rounded-2xl bg-white/10 p-5 space-y-4 scroll-mt-24">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-bold text-white">{editing ? 'Editează design' : 'Design nou'}</h3>
            {editing && <button onClick={startNew} className="text-[12px] text-[#A8BED2] hover:text-white">Renunță</button>}
          </div>
          {error && <p className="text-[13px] text-[#DC4B41]">{error}</p>}

          <div>
            <Label className="mb-1.5 block text-[13px] text-[#A8BED2]">Nume design</Label>
            <Input ref={nameRef} value={draft.name} onChange={(e) => field('name', e.target.value)} placeholder="ex: Brand albastru" className="bg-white/5 text-white border-0 ring-1 ring-white/15 focus:ring-2 focus:ring-[#E1FB15]/50" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block text-[13px] text-[#A8BED2]">Culoare brand</Label>
              <div className="flex gap-2">
                <input type="color" value={draft.brandColor} onChange={(e) => field('brandColor', e.target.value)} className="w-10 h-10 rounded-lg bg-transparent border border-white/15 cursor-pointer" />
                <Input value={draft.brandColor} onChange={(e) => field('brandColor', e.target.value)} className="flex-1 bg-white/5 text-white border-0 ring-1 ring-white/15" />
              </div>
            </div>
            <div>
              <Label className="mb-1.5 block text-[13px] text-[#A8BED2]">Logo</Label>
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
            <Label className="mb-1.5 block text-[13px] text-[#A8BED2]">Footer (text mic la baza facturii)</Label>
            <textarea rows={2} value={draft.footerText} onChange={(e) => field('footerText', e.target.value)} placeholder="ex: Plata se face în contul RO… deschis la …" className="w-full px-3 py-2 rounded-xl bg-white/5 text-white text-sm border-0 ring-1 ring-white/15 focus:outline-none focus:ring-2 focus:ring-[#E1FB15]/50 placeholder:text-[#8FA6BC]" />
          </div>

          <div className="border-t border-white/10 pt-3 space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-[#8FA6BC]">Opțiuni afișare</p>
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
            <Button disabled={busy} onClick={save} className="rounded-full bg-[#E1FB15] text-[#07090f] font-bold hover:bg-[#D2EA0E] disabled:opacity-60">
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Salvează design
            </Button>
            {editing && (
              <Button variant="outline" onClick={() => remove(editing.id)} className="rounded-full border-0 bg-white/10 text-white hover:bg-[#DC4B41]/20 hover:text-[#DC4B41]">
                <Trash2 className="w-4 h-4 mr-1" /> Șterge
              </Button>
            )}
          </div>
        </div>

        {/* Live preview + template picker (kept side-by-side so a template
            change is visible in the preview with almost no scrolling). */}
        <div className="lg:sticky lg:top-4 self-start space-y-4 order-first">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[12px] uppercase tracking-wider text-[#8FA6BC]">Previzualizare live</p>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#8FA6BC]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#2E9E6A]" /> în timp real
              </span>
            </div>
            <div className="rounded-3xl bg-white/10 p-3 sm:p-4">
              <div className="mx-auto max-w-[360px]">
                <InvoicePreview draft={draft} />
              </div>
            </div>
            <p className="text-[11px] text-[#8FA6BC] mt-2">Se actualizează pe măsură ce schimbi designul. Date demonstrative.</p>
          </div>

          {/* Template picker — directly under the preview */}
          <div>
            <Label className="mb-1.5 block text-[13px] text-[#A8BED2]">Șablon</Label>
            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-3 gap-2.5">
              {TEMPLATES.map(([l, name, desc]) => {
                const active = draft.layoutKey === l;
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => field('layoutKey', l)}
                    aria-pressed={active}
                    className={`group relative text-left p-2.5 rounded-2xl border-2 transition-colors ${active ? 'border-[#E1FB15] bg-[#E1FB15]/[0.08]' : 'border-white/10 bg-white/5 hover:border-white/30'}`}
                  >
                    <TemplateThumb layout={l} brand={draft.brandColor} />
                    <span className={`block text-[13px] font-semibold mt-2 ${active ? 'text-white' : 'text-[#C8DAE8]'}`}>{name}</span>
                    <span className="block text-[10.5px] leading-tight text-[#8FA6BC] mt-0.5">{desc}</span>
                    {active && <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-[#E1FB15] grid place-items-center"><Check className="w-3 h-3 text-[#07090f]" /></span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
