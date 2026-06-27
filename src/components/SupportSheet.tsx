import { useEffect, useState } from 'react';
import { BottomSheet } from './ui/BottomSheet';
import { Select } from './ui/Select';

// Contact / support form, opened as a popup from the Settings sheet. Uses the
// shared BottomSheet (same reveal/close animation as every other popup) and the
// app's custom Select dropdown.
export default function SupportSheet({ userEmail = '' }: { userEmail?: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(userEmail);
  const [topic, setTopic] = useState('intrebare');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string; mailto?: string } | null>(null);

  // Triggers (Settings entry, app footer "Contact", …) are marked with
  // [data-support-open]. Use event delegation on document so it keeps working
  // even though those triggers live in swapped page content while this sheet is
  // a persisted island. Clicking one closes any open Settings sheet, then opens
  // this popup on top.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = (e.target as Element | null)?.closest?.('[data-support-open]');
      if (!t) return;
      document.getElementById('settings-close-btn')?.click();
      window.setTimeout(() => { setStatus(null); setOpen(true); }, 180);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) { setStatus({ kind: 'err', text: 'Mesajul este obligatoriu.' }); return; }
    setBusy(true); setStatus(null);
    try {
      const res = await fetch('/api/support', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, topic, message }),
      });
      if (!res.ok) throw new Error('fail');
      setStatus({ kind: 'ok', text: 'Mesaj trimis. Îți răspundem cât de curând.' });
      setMessage('');
    } catch {
      const subj = encodeURIComponent(`[Suport] ${topic}`);
      const body = encodeURIComponent(`${message}\n\n— ${email}`);
      setStatus({ kind: 'err', text: 'Nu am putut trimite acum.', mailto: `mailto:contact@facturamea.com?subject=${subj}&body=${body}` });
    } finally { setBusy(false); }
  };

  return (
    <BottomSheet open={open} onClose={() => setOpen(false)} cardClassName="sm:max-w-[480px]">
      <form onSubmit={submit} className="px-5 sm:px-6 pt-4 pb-7 space-y-4">
        <div className="pr-12">
          <h3 className="text-[20px] font-bold text-white">Contact & suport</h3>
          <p className="text-[13px] text-[#A8BED2] mt-1">Spune-ne ce se întâmplă și revenim pe email.</p>
        </div>

        {status?.kind === 'ok' && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-[#2E9E6A]/15">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2E9E6A] mt-1.5 shrink-0" />
            <p className="text-[13px] text-[#2E9E6A]">{status.text}</p>
          </div>
        )}
        {status?.kind === 'err' && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-[#DC4B41]/15">
            <span className="w-1.5 h-1.5 rounded-full bg-[#DC4B41] mt-1.5 shrink-0" />
            <p className="text-[13px] text-[#DC4B41]">
              {status.text}{status.mailto && <> <a className="underline" href={status.mailto}>Trimite pe email</a>.</>}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[13px] font-medium text-[#A8BED2] mb-1.5">Email de contact</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl bg-white/5 px-4 py-2.5 text-[14px] text-white placeholder:text-[#8FA6BC] focus:outline-none focus:ring-2 focus:ring-[#E1FB15]/40" />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-[#A8BED2] mb-1.5">Subiect</label>
            <Select value={topic} onChange={(e) => setTopic(e.target.value)}>
              <option value="intrebare">Întrebare</option>
              <option value="problema">Problemă / bug</option>
              <option value="facturare">Facturare / abonament</option>
              <option value="sugestie">Sugestie</option>
              <option value="altele">Altele</option>
            </Select>
          </div>
        </div>

        <div>
          <label className="block text-[13px] font-medium text-[#A8BED2] mb-1.5">Mesaj</label>
          <textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} required placeholder="Descrie pe scurt despre ce e vorba…" className="w-full rounded-xl bg-white/5 px-4 py-2.5 text-[14px] text-white placeholder:text-[#8FA6BC] focus:outline-none focus:ring-2 focus:ring-[#E1FB15]/40" />
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button type="submit" disabled={busy} className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full bg-[#E1FB15] text-[#07090f] font-bold text-[14px] whitespace-nowrap hover:bg-[#D2EA0E] active:scale-95 transition-all disabled:opacity-60">
            {busy ? 'Se trimite…' : 'Trimite mesajul'}
          </button>
          <a href="mailto:contact@facturamea.com" className="text-[13px] text-[#A8BED2] hover:text-white transition-colors">sau contact@facturamea.com</a>
        </div>
      </form>
    </BottomSheet>
  );
}
