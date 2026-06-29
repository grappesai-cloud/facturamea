import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';

type Audience = 'all' | 'trial' | 'lifetime' | 'custom';

const ORANGE = '#1A759F';
const INK = '#07090f';
const BORDER = '#E3EAF1';
const MUTED = '#46627A';

const AUDIENCES: { value: Audience; label: string }[] = [
  { value: 'all', label: 'Toți utilizatorii' },
  { value: 'trial', label: 'Trial (licență activă)' },
  { value: 'lifetime', label: 'Lifetime (licență activă)' },
  { value: 'custom', label: 'Listă custom de email-uri' },
];

// Snippet templates injected at the cursor. Kept in sync with helpers in
// src/lib/email-campaign.ts so the preview matches the final send.
const SNIPPETS: { id: string; label: string; html: string }[] = [
  {
    id: 'heading',
    label: 'Titlu',
    html: `<h2 style="margin:28px 0 12px;font-family:'Outfit',Arial,sans-serif;font-size:20px;font-weight:700;line-height:1.3;color:${INK};letter-spacing:-0.02em;">Titlul tău aici</h2>\n`,
  },
  {
    id: 'paragraph',
    label: 'Paragraf',
    html: `<p style="margin:0 0 16px;font-family:'Outfit',Arial,sans-serif;font-size:15px;line-height:1.65;color:${INK};">Scrie aici textul paragrafului.</p>\n`,
  },
  {
    id: 'cta',
    label: 'Buton CTA',
    html: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
  <tr>
    <td align="center" bgcolor="${ORANGE}" style="border-radius:12px;">
      <a href="https://facturamea.com" target="_blank" style="display:inline-block;padding:14px 28px;font-family:'Outfit',Arial,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;background-color:${ORANGE};">Deschide facturamea</a>
    </td>
  </tr>
</table>\n`,
  },
];

const STARTER_BODY = `<p style="margin:0 0 16px;font-family:'Outfit',Arial,sans-serif;font-size:15px;line-height:1.65;color:${INK};">Salut,</p>
<p style="margin:0 0 16px;font-family:'Outfit',Arial,sans-serif;font-size:15px;line-height:1.65;color:${INK};">Scrie mesajul aici.</p>`;

const inputCls =
  'w-full px-4 py-2.5 rounded-xl bg-white/5 text-[13px] text-white placeholder:text-[#8FA6BC] ring-1 ring-white/10 focus:ring-[#34A0A4]/50 focus:outline-none transition-all [color-scheme:dark]';

// Client-side mirror of wrapEmailHtml (src/lib/email-campaign.ts) for instant preview.
function wrapPreview(preheader: string, bodyHtml: string): string {
  const cream = '#EDF1F5';
  return `<!DOCTYPE html><html lang="ro"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background-color:${cream};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${cream};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#ffffff;border:1px solid ${BORDER};border-radius:16px;overflow:hidden;">
        <tr><td style="padding:28px 40px;border-bottom:1px solid ${BORDER};">
          <span style="font-family:'Outfit',Arial,sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.03em;color:${INK};">factura<span style="color:${ORANGE};">mea</span></span>
        </td></tr>
        <tr><td style="padding:32px 40px;">${bodyHtml}</td></tr>
        <tr><td style="padding:24px 40px 32px;border-top:1px solid ${BORDER};">
          <p style="margin:0 0 6px;font-family:'Outfit',Arial,sans-serif;font-size:12px;line-height:1.6;color:${MUTED};">facturamea · Platformă de facturare pentru transport și logistică</p>
          <p style="margin:0;font-family:'Outfit',Arial,sans-serif;font-size:12px;line-height:1.6;color:${MUTED};">Ai primit acest email pentru că ai un cont facturamea. <a href="#" style="color:${MUTED};text-decoration:underline;">Dezabonează-te</a>.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

type Banner = { kind: 'ok' | 'err'; text: string } | null;

export default function EmailComposer({ adminEmail }: { adminEmail: string }) {
  const [subject, setSubject] = useState('');
  const [preheader, setPreheader] = useState('');
  const [audience, setAudience] = useState<Audience>('all');
  const [customRecipients, setCustomRecipients] = useState('');
  const [body, setBody] = useState(STARTER_BODY);

  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [savedHash, setSavedHash] = useState<string>('');
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [busy, setBusy] = useState<null | 'save' | 'test' | 'send' | 'count'>(null);
  const [banner, setBanner] = useState<Banner>(null);

  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const previewSrc = useMemo(() => wrapPreview(preheader, body), [preheader, body]);

  // Snapshot used to decide whether we need to re-save before test/send.
  const currentHash = useMemo(
    () => JSON.stringify({ subject, preheader, audience, customRecipients, body }),
    [subject, preheader, audience, customRecipients, body],
  );
  const dirty = currentHash !== savedHash;

  // Refresh audience size when audience / custom list changes (debounced).
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/emailuri/audience-count', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audience, customRecipients }),
        });
        const data = await res.json();
        setAudienceCount(typeof data.count === 'number' ? data.count : null);
      } catch {
        setAudienceCount(null);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [audience, customRecipients]);

  function insertSnippet(html: string) {
    const ta = bodyRef.current;
    if (!ta) { setBody((b) => b + '\n' + html); return; }
    const start = ta.selectionStart ?? body.length;
    const end = ta.selectionEnd ?? body.length;
    const next = body.slice(0, start) + html + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + html.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  function validate(): string | null {
    if (!subject.trim()) return 'Adaugă un subiect.';
    if (!body.trim()) return 'Conținutul nu poate fi gol.';
    if (audience === 'custom' && !customRecipients.trim()) return 'Adaugă cel puțin o adresă în lista custom.';
    return null;
  }

  // Ensure we have a saved campaign reflecting the current fields. Returns its id.
  async function ensureSaved(): Promise<string | null> {
    if (campaignId && !dirty) return campaignId;
    setBusy('save');
    try {
      if (!campaignId) {
        const res = await fetch('/api/admin/emailuri', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject, preheader, html: body, audience, customRecipients }),
        });
        const data = await res.json();
        if (!res.ok) { setBanner({ kind: 'err', text: data.error || 'Nu am putut salva.' }); return null; }
        setCampaignId(data.id);
        setSavedHash(currentHash);
        return data.id;
      }
      const res = await fetch(`/api/admin/emailuri/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, preheader, html: body, audience, customRecipients }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setBanner({ kind: 'err', text: data.error || 'Nu am putut actualiza.' }); return null; }
      setSavedHash(currentHash);
      return campaignId;
    } catch {
      setBanner({ kind: 'err', text: 'Eroare de rețea la salvare.' });
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function onSaveDraft() {
    const err = validate();
    if (err) { setBanner({ kind: 'err', text: err }); return; }
    const id = await ensureSaved();
    if (id) setBanner({ kind: 'ok', text: 'Schiță salvată.' });
  }

  async function onTest() {
    const err = validate();
    if (err) { setBanner({ kind: 'err', text: err }); return; }
    setBanner(null);
    const id = await ensureSaved();
    if (!id) return;
    setBusy('test');
    try {
      const res = await fetch(`/api/admin/emailuri/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test' }),
      });
      const data = await res.json();
      if (!res.ok) setBanner({ kind: 'err', text: data.error || 'Trimiterea de test a eșuat.' });
      else setBanner({ kind: 'ok', text: `Email de test trimis către ${data.sentTo || adminEmail}.` });
    } catch {
      setBanner({ kind: 'err', text: 'Eroare de rețea la testare.' });
    } finally {
      setBusy(null);
    }
  }

  async function onSend() {
    const err = validate();
    if (err) { setBanner({ kind: 'err', text: err }); return; }
    const sizeText = audienceCount != null ? `${audienceCount} destinatari` : 'audiența selectată';
    if (!confirm(`Trimiți campania către ${sizeText}? Acțiunea este ireversibilă.`)) return;
    setBanner(null);
    const id = await ensureSaved();
    if (!id) return;
    setBusy('send');
    try {
      const res = await fetch(`/api/admin/emailuri/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send' }),
      });
      const data = await res.json();
      if (!res.ok) { setBanner({ kind: 'err', text: data.error || 'Trimiterea a eșuat.' }); return; }
      const note = data.note ? ' ' + data.note : '';
      setBanner({
        kind: 'ok',
        text: `Trimis: ${data.sentCount} reușite, ${data.failedCount} eșuate (din ${data.totalRecipients}).${note}`,
      });
      setTimeout(() => window.location.reload(), 2200);
    } catch {
      setBanner({ kind: 'err', text: 'Eroare de rețea la trimitere.' });
    } finally {
      setBusy(null);
    }
  }

  const onBodyChange = (e: ChangeEvent<HTMLTextAreaElement>) => setBody(e.target.value);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {/* Composer column */}
      <div className="space-y-4 p-5 sm:p-6 rounded-2xl bg-white/5">
        {banner && (
          <div
            className={
              'px-4 py-3 rounded-xl text-[13px] ' +
              (banner.kind === 'ok'
                ? 'text-[#2E9E6A] bg-[#2E9E6A]/15'
                : 'text-[#DC4B41] bg-[#DC4B41]/15')
            }
          >
            {banner.text}
          </div>
        )}

        <div>
          <label className="block text-[12px] font-medium text-[#A8BED2] mb-1.5">Subiect</label>
          <input
            className={inputCls}
            value={subject}
            maxLength={300}
            placeholder="ex. Noutăți în facturamea"
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-[12px] font-medium text-[#A8BED2] mb-1.5">
            Preheader <span className="text-[#5E7385] font-normal">(text de previzualizare în inbox)</span>
          </label>
          <input
            className={inputCls}
            value={preheader}
            maxLength={300}
            placeholder="Apare lângă subiect în inbox"
            onChange={(e) => setPreheader(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-[12px] font-medium text-[#A8BED2] mb-1.5">Audiență</label>
          <select className={inputCls} value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>
            {AUDIENCES.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
          <p className="text-[11px] text-[#8FA6BC] mt-1.5">
            Destinatari estimați:{' '}
            <span className="font-semibold text-white">
              {audienceCount != null ? audienceCount.toLocaleString('ro-RO') : '-'}
            </span>
          </p>
        </div>

        {audience === 'custom' && (
          <div>
            <label className="block text-[12px] font-medium text-[#A8BED2] mb-1.5">Email-uri (separate prin virgulă, spațiu sau linie)</label>
            <textarea
              className={inputCls + ' resize-y font-mono text-[12px]'}
              rows={4}
              value={customRecipients}
              placeholder="ana@exemplu.ro, ion@exemplu.ro"
              onChange={(e) => setCustomRecipients(e.target.value)}
            />
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[12px] font-medium text-[#A8BED2]">Conținut HTML</label>
            <div className="flex gap-1.5">
              {SNIPPETS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => insertSnippet(s.html)}
                  className="px-2.5 py-1 text-[11px] font-semibold rounded-full bg-white/10 text-[#D7E5F0] hover:bg-white/15 transition-colors"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <textarea
            ref={bodyRef}
            className={inputCls + ' resize-y font-mono text-[12px] leading-relaxed'}
            rows={14}
            value={body}
            onChange={onBodyChange}
            spellCheck={false}
          />
          <p className="text-[11px] text-[#8FA6BC] mt-1.5">
            HTML cu stiluri inline. Antetul, footerul și shell-ul branded se adaugă automat la trimitere.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={onSaveDraft}
            disabled={busy != null}
            className="px-4 py-2.5 rounded-full bg-white/10 text-[#D7E5F0] font-semibold text-[13px] hover:bg-white/15 disabled:opacity-50 transition-colors"
          >
            {busy === 'save' ? 'Se salvează...' : 'Salvează schița'}
          </button>
          <button
            type="button"
            onClick={onTest}
            disabled={busy != null}
            className="px-4 py-2.5 rounded-full text-[#34A0A4] bg-[#34A0A4]/10 font-semibold text-[13px] hover:bg-[#34A0A4]/20 disabled:opacity-50 transition-colors"
          >
            {busy === 'test' ? 'Se trimite...' : 'Trimite test către mine'}
          </button>
          <button
            type="button"
            onClick={onSend}
            disabled={busy != null}
            className="px-5 py-2.5 rounded-full bg-[#E1FB15] hover:bg-[#D2EA0E] disabled:opacity-50 text-[#07090f] font-bold text-[13px] transition-colors"
          >
            {busy === 'send' ? 'Se trimite...' : 'Trimite campanie'}
          </button>
        </div>
        <p className="text-[11px] text-[#8FA6BC]">
          Testul ajunge la <span className="font-semibold text-[#D7E5F0]">{adminEmail}</span>. Trimiterea campaniei este ireversibilă.
        </p>
      </div>

      {/* Preview column */}
      <div className="rounded-2xl bg-white/5 overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <p className="text-[13px] font-semibold text-white">Previzualizare</p>
          <span className="text-[11px] text-[#8FA6BC]">{dirty || !campaignId ? 'Nesalvat' : 'Salvat'}</span>
        </div>
        <iframe
          title="Previzualizare email"
          srcDoc={previewSrc}
          className="w-full flex-1 min-h-[640px] bg-[#EDF1F5]"
          sandbox=""
        />
      </div>
    </div>
  );
}
