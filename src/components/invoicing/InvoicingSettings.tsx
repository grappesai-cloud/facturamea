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
  const [logoUrl, setLogoUrl] = useState(initial.invoiceLogoUrl);
  const [stampUrl, setStampUrl] = useState(initial.invoiceStampUrl);
  const [signatureUrl, setSignatureUrl] = useState(initial.invoiceSignatureUrl);
  const [footerText, setFooterText] = useState(initial.invoiceFooterText || '');
  const [tva, setTva] = useState(!!initial.tvaAtCollection);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true); setSaved(false);
    try {
      const res = await fetch('/api/invoicing/branding', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceLogoUrl: logoUrl,
          invoiceStampUrl: stampUrl,
          invoiceSignatureUrl: signatureUrl,
          invoiceFooterText: footerText.trim() || null,
          tvaAtCollection: tva,
        }),
      });
      if (!res.ok) { alert('Eroare salvare'); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  };

  return (
    <div className="bg-white border border-[#E8E8E4] rounded-xl p-5 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <BrandingSlot label="Logo" hint="Apare în antetul facturii" url={logoUrl} setUrl={setLogoUrl} />
        <BrandingSlot label="Ștampilă" hint="Apare bottom-right" url={stampUrl} setUrl={setStampUrl} />
        <BrandingSlot label="Semnătură" hint="Apare lângă ștampilă" url={signatureUrl} setUrl={setSignatureUrl} />
      </div>

      <div>
        <Label>Text footer (opțional)</Label>
        <textarea
          value={footerText} onChange={(e) => setFooterText(e.target.value)}
          rows={3}
          className="w-full mt-1 rounded-xl border border-[#E8E8E4] px-3 py-2 text-sm"
          placeholder="Ex: IBAN RO00 BTRL ... · Înregistrată la ONRC sub J40/12345/2018"
        />
      </div>

      <div className="border-t border-[#E8E8E4] pt-4">
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={tva} onChange={(e) => setTva(e.target.checked)} className="mt-1" />
          <span>
            <strong>TVA la încasare</strong> (art. 282 Cod fiscal)
            <span className="block text-xs text-[#6B6B68] mt-0.5">Bifează dacă firma e înscrisă în registrul TVA la încasare. Mențiunea legală apare automat pe facturile emise după salvare.</span>
          </span>
        </label>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Check className="w-4 h-4 mr-1.5" />}
          Salvează setări
        </Button>
        {saved && <span className="text-sm text-[#16A34A]">Salvat ✓</span>}
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
    <div className="border border-dashed border-[#E8E8E4] rounded-xl p-3 text-center">
      <Label className="text-xs uppercase tracking-wide text-[#6B6B68]">{label}</Label>
      <div className="mt-2 h-28 flex items-center justify-center bg-[#FAFAF8] rounded">
        {url ? (
          <img src={url} alt={label} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
        ) : (
          <span className="text-xs text-[#8A8A85]">Niciun {label.toLowerCase()}</span>
        )}
      </div>
      <p className="text-[10px] text-[#8A8A85] mt-1">{hint}</p>
      <div className="flex gap-1 justify-center mt-2">
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <Button variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}
          Încarcă
        </Button>
        {url && <Button variant="outline" size="sm" onClick={() => setUrl(null)}><Trash2 className="w-3 h-3 text-[#B91C1C]" /></Button>}
      </div>
    </div>
  );
}
