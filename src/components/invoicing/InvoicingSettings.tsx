import { useState, useRef } from 'react';
import { Button } from '../ui/Button';
import { Label } from '../ui/Label';
import { Upload, Trash2, Loader2, Check } from 'lucide-react';

interface Initial {
  invoiceLogoUrl: string | null;
  invoiceStampUrl: string | null;
  invoiceSignatureUrl: string | null;
  invoiceFooterText: string | null;
  tvaAtCollection: boolean | null;
}

export default function InvoicingSettings({ initial }: { initial: Initial }) {
  const [stampUrl, setStampUrl] = useState(initial.invoiceStampUrl);
  const [signatureUrl, setSignatureUrl] = useState(initial.invoiceSignatureUrl);
  const [tva, setTva] = useState(!!initial.tvaAtCollection);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true); setSaved(false);
    try {
      const res = await fetch('/api/invoicing/branding', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Logo + footer live on the design (per-template) now; preserve any legacy company values.
          invoiceLogoUrl: initial.invoiceLogoUrl,
          invoiceStampUrl: stampUrl,
          invoiceSignatureUrl: signatureUrl,
          invoiceFooterText: initial.invoiceFooterText,
          tvaAtCollection: tva,
        }),
      });
      if (!res.ok) { alert('Eroare salvare'); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  };

  return (
    <div className="bg-white/5 rounded-2xl p-5 space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <BrandingSlot label="Ștampilă" hint="Apare jos-dreapta pe factură" url={stampUrl} setUrl={setStampUrl} />
        <BrandingSlot label="Semnătură" hint="Apare lângă ștampilă" url={signatureUrl} setUrl={setSignatureUrl} />
      </div>

      <div className="border-t border-white/10 pt-4">
        <label className="flex items-start gap-3 text-sm text-white">
          <input type="checkbox" checked={tva} onChange={(e) => setTva(e.target.checked)} className="mt-1" />
          <span>
            <strong>TVA la încasare</strong> (art. 282 Cod fiscal)
            <span className="block text-xs text-[#A8BED2] mt-0.5">Bifează dacă firma e înscrisă în registrul TVA la încasare. Mențiunea legală apare automat pe facturile emise după salvare.</span>
          </span>
        </label>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving} className="rounded-full bg-[#E1FB15] text-[#07090f] hover:bg-[#D2EA0E] active:scale-100">
          {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Check className="w-4 h-4 mr-1.5" />}
          Salvează setări
        </Button>
        {saved && <span className="text-sm text-[#2E9E6A]">Salvat ✓</span>}
      </div>
    </div>
  );
}

function BrandingSlot({ label, hint, url, setUrl }: { label: string; hint: string; url: string | null; setUrl: (u: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('purpose', 'image');
      const res = await fetch('/api/upload/document', { method: 'POST', body: fd });
      if (!res.ok) { const d = await res.json(); alert(d.error || 'Eroare upload'); return; }
      const { url: newUrl } = await res.json();
      setUrl(newUrl);
    } finally { setBusy(false); }
  };

  return (
    <div className="bg-white/5 rounded-2xl p-3 text-center">
      <Label className="text-xs uppercase tracking-wide text-[#8FA6BC]">{label}</Label>
      <div className="mt-2 h-28 flex items-center justify-center bg-white/5 rounded-xl">
        {url ? (
          <img src={url} alt={label} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
        ) : (
          <span className="text-xs text-[#8FA6BC]">Niciun {label.toLowerCase()}</span>
        )}
      </div>
      <p className="text-[10px] text-[#8FA6BC] mt-1">{hint}</p>
      <div className="flex gap-1 justify-center mt-2">
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <Button variant="outline" size="sm" className="rounded-full bg-white/10 text-white border-0 hover:bg-white/15 hover:border-0" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}
          Încarcă
        </Button>
        {url && <Button variant="outline" size="sm" className="rounded-full bg-white/10 border-0 hover:bg-white/15 hover:border-0" onClick={() => setUrl(null)}><Trash2 className="w-3 h-3 text-[#DC4B41]" /></Button>}
      </div>
    </div>
  );
}
