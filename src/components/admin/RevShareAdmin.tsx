import { useEffect, useState } from 'react';

const ron = (cents: number) =>
  new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format((cents || 0) / 100);
const fmtDate = (d: any) => d ? new Date(d).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

const BASE_LABELS: Record<string, string> = {
  gross: 'din suma brută',
  net_after_fee: 'din net (după comision Stripe)',
  net_after_vat: 'din net (fără TVA și comision)',
};

interface State {
  config: { accountId: string | null; enabled: boolean; bps: number; base: string };
  account: { id: string; chargesEnabled?: boolean; payoutsEnabled?: boolean; detailsSubmitted?: boolean; requirementsDue?: number; error?: string } | null;
  payouts: any[];
}

export default function RevShareAdmin() {
  const [st, setSt] = useState<State | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pct, setPct] = useState(20);
  const [base, setBase] = useState('net_after_fee');

  const load = async () => {
    try {
      const r = await fetch('/api/admin/revshare/status').then((x) => x.json());
      setSt(r);
      if (r.config) { setPct(Math.round((r.config.bps || 2000) / 100)); setBase(r.config.base || 'net_after_fee'); }
    } catch { setMsg({ kind: 'err', text: 'Nu am putut încărca starea.' }); }
  };
  useEffect(() => { load(); }, []);

  const onboard = async () => {
    setBusy('onboard'); setMsg(null);
    try {
      const r = await fetch('/api/admin/revshare/onboard', { method: 'POST' }).then((x) => x.json());
      if (r.url) { window.open(r.url, '_blank'); setMsg({ kind: 'ok', text: 'Link de onboarding deschis. Trimite-l asociatului dacă nu ești tu.' }); await load(); }
      else setMsg({ kind: 'err', text: (r.error || 'Eroare') + (r.hint ? ' — ' + r.hint : '') });
    } catch { setMsg({ kind: 'err', text: 'Eroare la onboarding.' }); } finally { setBusy(''); }
  };

  const saveConfig = async (patch: any) => {
    setBusy('config'); setMsg(null);
    try {
      const r = await fetch('/api/admin/revshare/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }).then((x) => x.json());
      if (r.ok) { setMsg({ kind: 'ok', text: r.warning || 'Salvat.' }); await load(); }
      else setMsg({ kind: 'err', text: r.error || 'Eroare' });
    } catch { setMsg({ kind: 'err', text: 'Eroare la salvare.' }); } finally { setBusy(''); }
  };

  if (!st) return <p className="text-[13px] text-[#8FA6BC]">Se încarcă…</p>;

  const a = st.account;
  const ready = a?.chargesEnabled && a?.payoutsEnabled;
  const card = 'rounded-2xl bg-white/5 p-5 sm:p-6 [color-scheme:dark]';

  return (
    <div className="space-y-3 max-w-3xl">
      {msg && <div className={`text-[13px] rounded-xl px-4 py-2.5 ${msg.kind === 'ok' ? 'bg-[#2E9E6A]/15 text-[#2E9E6A]' : 'bg-[#DC4B41]/15 text-[#DC4B41]'}`}>{msg.text}</div>}

      {/* Cont asociat */}
      <div className={card}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-semibold text-white text-[15px]">Cont asociat (Stripe Connect)</h2>
          {a && (
            <span className={`text-[12px] font-semibold px-2.5 py-1 rounded-full ${ready ? 'bg-[#2E9E6A]/15 text-[#2E9E6A]' : 'bg-[#E8A33C]/15 text-[#E8A33C]'}`}>
              {ready ? 'Activ' : a.detailsSubmitted ? 'În verificare' : 'Neonboardat'}
            </span>
          )}
        </div>
        {!st.config.accountId ? (
          <p className="text-[13px] text-[#8FA6BC] mb-3">Niciun cont creat. Apasă pentru a crea contul Express al asociatului și a genera linkul de onboarding (date firmă + cont bancar).</p>
        ) : (
          <div className="text-[13px] text-[#8FA6BC] mb-3 space-y-0.5">
            <p>Cont: <span className="font-mono text-white">{st.config.accountId}</span></p>
            {a?.error ? <p className="text-[#DC4B41]">{a.error}</p> : (
              <p>Plăți: {a?.chargesEnabled ? '✓' : '✕'} · Payout: {a?.payoutsEnabled ? '✓' : '✕'} · Date trimise: {a?.detailsSubmitted ? '✓' : '✕'}{a?.requirementsDue ? ` · ${a.requirementsDue} cerințe rămase` : ''}</p>
            )}
          </div>
        )}
        <button onClick={onboard} disabled={busy === 'onboard'}
          className="px-5 py-2.5 bg-[#E1FB15] hover:bg-[#D2EA0E] text-[#07090f] font-bold rounded-full text-[13px] disabled:opacity-60 transition-colors">
          {busy === 'onboard' ? 'Se generează…' : st.config.accountId ? (ready ? 'Re-onboarding / actualizare' : 'Continuă onboarding') : 'Creează cont + link onboarding'}
        </button>
      </div>

      {/* Config split */}
      <div className={card}>
        <h2 className="font-semibold text-white text-[15px] mb-3">Cota asociatului</h2>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-[12px] text-[#8FA6BC] mb-1.5">Procent</label>
            <div className="flex items-center gap-1.5">
              <input type="number" min={1} max={100} value={pct} onChange={(e) => setPct(Number(e.target.value))}
                className="w-20 px-3 py-2 rounded-xl bg-white/5 text-white ring-1 ring-white/10 focus:ring-[#34A0A4]/50 focus:outline-none text-[13px] transition-all" />
              <span className="text-[13px] text-[#8FA6BC]">%</span>
            </div>
          </div>
          <div className="min-w-[220px]">
            <label className="block text-[12px] text-[#8FA6BC] mb-1.5">Bază de calcul</label>
            <select value={base} onChange={(e) => setBase(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-white/5 text-white ring-1 ring-white/10 focus:ring-[#34A0A4]/50 focus:outline-none text-[13px] transition-all">
              <option value="net_after_fee">{BASE_LABELS.net_after_fee}</option>
              <option value="gross">{BASE_LABELS.gross}</option>
              <option value="net_after_vat">{BASE_LABELS.net_after_vat}</option>
            </select>
          </div>
          <button onClick={() => saveConfig({ bps: Math.round(pct * 100), base })} disabled={busy === 'config'}
            className="px-5 py-2.5 bg-white/10 hover:bg-white/15 text-[#D7E5F0] font-semibold rounded-full text-[13px] disabled:opacity-60 transition-colors">Salvează cota</button>
        </div>

        <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold text-white">Transfer automat la fiecare vânzare</p>
            <p className="text-[12px] text-[#8FA6BC]">{st.config.enabled ? `Activ — ${(st.config.bps / 100).toFixed(0)}% ${BASE_LABELS[st.config.base] || ''}` : 'Dezactivat — nu se transferă nimic'}</p>
          </div>
          <button onClick={() => saveConfig({ enabled: !st.config.enabled })} disabled={busy === 'config'}
            className={`relative h-7 w-12 rounded-full transition-colors shrink-0 ${st.config.enabled ? 'bg-[#2E9E6A]' : 'bg-white/15'}`}>
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${st.config.enabled ? 'left-6' : 'left-1'}`} />
          </button>
        </div>
        {st.config.enabled && !ready && (
          <p className="mt-3 text-[12px] text-[#E8A33C] bg-[#E8A33C]/15 rounded-xl px-3 py-2">Activat, dar contul asociatului nu e încă gata. Transferurile vor fi marcate „skipped" până se termină onboarding-ul.</p>
        )}
      </div>

      {/* Istoric transferuri */}
      <div className={card}>
        <h2 className="font-semibold text-white text-[15px] mb-3">Ultimele transferuri</h2>
        {st.payouts.length === 0 ? (
          <p className="text-[13px] text-[#8FA6BC]">Niciun transfer încă.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead><tr className="text-left text-[#8FA6BC] border-b border-white/10">
                <th className="py-2.5 pr-3 font-semibold">Data</th><th className="py-2.5 pr-3 font-semibold">Brut</th><th className="py-2.5 pr-3 font-semibold">Comision</th><th className="py-2.5 pr-3 font-semibold">Transferat</th><th className="py-2.5 pr-3 font-semibold">Status</th>
              </tr></thead>
              <tbody>
                {st.payouts.map((p) => (
                  <tr key={p.id} className="border-b border-white/5">
                    <td className="py-2.5 pr-3 text-[#8FA6BC] tabular-nums whitespace-nowrap">{fmtDate(p.createdAt)}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-white">{ron(p.grossCents)}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-[#8FA6BC]">{ron(p.feeCents)}</td>
                    <td className="py-2.5 pr-3 tabular-nums font-semibold text-white">{ron(p.amountCents)}</td>
                    <td className="py-2.5 pr-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${p.status === 'paid' ? 'bg-[#2E9E6A]/15 text-[#2E9E6A]' : p.status === 'error' ? 'bg-[#DC4B41]/15 text-[#DC4B41]' : 'bg-white/10 text-[#8FA6BC]'}`} title={p.error || ''}>{p.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
