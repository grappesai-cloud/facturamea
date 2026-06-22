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

  if (!st) return <p className="text-[13px] text-[#6B6B68]">Se încarcă…</p>;

  const a = st.account;
  const ready = a?.chargesEnabled && a?.payoutsEnabled;
  const card = 'bg-white border border-[#E8E8E4] rounded-xl p-5';

  return (
    <div className="space-y-4 max-w-3xl">
      {msg && <div className={`text-[13px] rounded-lg px-4 py-2.5 ${msg.kind === 'ok' ? 'bg-[#1A759F]/8 text-[#155e7f]' : 'bg-[#DC4B41]/8 text-[#b3392f]'}`}>{msg.text}</div>}

      {/* Cont asociat */}
      <div className={card}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-semibold text-[#0A0A0A] text-[15px]">Cont asociat (Stripe Connect)</h2>
          {a && (
            <span className={`text-[12px] font-semibold px-2.5 py-1 rounded-full ${ready ? 'bg-[#2E9E6A]/12 text-[#1f7a50]' : 'bg-[#E8A33D]/15 text-[#9a6b14]'}`}>
              {ready ? 'Activ' : a.detailsSubmitted ? 'În verificare' : 'Neonboardat'}
            </span>
          )}
        </div>
        {!st.config.accountId ? (
          <p className="text-[13px] text-[#6B6B68] mb-3">Niciun cont creat. Apasă pentru a crea contul Express al asociatului și a genera linkul de onboarding (date firmă + cont bancar).</p>
        ) : (
          <div className="text-[13px] text-[#6B6B68] mb-3 space-y-0.5">
            <p>Cont: <span className="font-mono text-[#0A0A0A]">{st.config.accountId}</span></p>
            {a?.error ? <p className="text-[#b3392f]">{a.error}</p> : (
              <p>Plăți: {a?.chargesEnabled ? '✓' : '✕'} · Payout: {a?.payoutsEnabled ? '✓' : '✕'} · Date trimise: {a?.detailsSubmitted ? '✓' : '✕'}{a?.requirementsDue ? ` · ${a.requirementsDue} cerințe rămase` : ''}</p>
            )}
          </div>
        )}
        <button onClick={onboard} disabled={busy === 'onboard'}
          className="px-5 py-2.5 bg-[#1A759F] hover:bg-[#168AAD] text-white font-semibold rounded-lg text-[13px] disabled:opacity-60">
          {busy === 'onboard' ? 'Se generează…' : st.config.accountId ? (ready ? 'Re-onboarding / actualizare' : 'Continuă onboarding') : 'Creează cont + link onboarding'}
        </button>
      </div>

      {/* Config split */}
      <div className={card}>
        <h2 className="font-semibold text-[#0A0A0A] text-[15px] mb-3">Cota asociatului</h2>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-[12px] text-[#6B6B68] mb-1">Procent</label>
            <div className="flex items-center gap-1.5">
              <input type="number" min={1} max={100} value={pct} onChange={(e) => setPct(Number(e.target.value))}
                className="w-20 px-3 py-2 border border-[#E8E8E4] rounded-lg text-[13px]" />
              <span className="text-[13px] text-[#6B6B68]">%</span>
            </div>
          </div>
          <div className="min-w-[220px]">
            <label className="block text-[12px] text-[#6B6B68] mb-1">Bază de calcul</label>
            <select value={base} onChange={(e) => setBase(e.target.value)} className="w-full px-3 py-2 border border-[#E8E8E4] rounded-lg text-[13px]">
              <option value="net_after_fee">{BASE_LABELS.net_after_fee}</option>
              <option value="gross">{BASE_LABELS.gross}</option>
              <option value="net_after_vat">{BASE_LABELS.net_after_vat}</option>
            </select>
          </div>
          <button onClick={() => saveConfig({ bps: Math.round(pct * 100), base })} disabled={busy === 'config'}
            className="px-5 py-2.5 bg-[#0A0A0A] text-white font-semibold rounded-lg text-[13px] disabled:opacity-60">Salvează cota</button>
        </div>

        <div className="mt-4 pt-4 border-t border-[#E8E8E4] flex items-center justify-between">
          <div>
            <p className="text-[13px] font-medium text-[#0A0A0A]">Transfer automat la fiecare vânzare</p>
            <p className="text-[12px] text-[#6B6B68]">{st.config.enabled ? `Activ — ${(st.config.bps / 100).toFixed(0)}% ${BASE_LABELS[st.config.base] || ''}` : 'Dezactivat — nu se transferă nimic'}</p>
          </div>
          <button onClick={() => saveConfig({ enabled: !st.config.enabled })} disabled={busy === 'config'}
            className={`relative h-7 w-12 rounded-full transition-colors ${st.config.enabled ? 'bg-[#2E9E6A]' : 'bg-[#D7D7D2]'}`}>
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${st.config.enabled ? 'left-6' : 'left-1'}`} />
          </button>
        </div>
        {st.config.enabled && !ready && (
          <p className="mt-3 text-[12px] text-[#9a6b14] bg-[#E8A33D]/10 rounded-lg px-3 py-2">Activat, dar contul asociatului nu e încă gata. Transferurile vor fi marcate „skipped" până se termină onboarding-ul.</p>
        )}
      </div>

      {/* Istoric transferuri */}
      <div className={card}>
        <h2 className="font-semibold text-[#0A0A0A] text-[15px] mb-3">Ultimele transferuri</h2>
        {st.payouts.length === 0 ? (
          <p className="text-[13px] text-[#6B6B68]">Niciun transfer încă.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead><tr className="text-left text-[#6B6B68] border-b border-[#E8E8E4]">
                <th className="py-2 pr-3">Data</th><th className="py-2 pr-3">Brut</th><th className="py-2 pr-3">Comision</th><th className="py-2 pr-3">Transferat</th><th className="py-2 pr-3">Status</th>
              </tr></thead>
              <tbody>
                {st.payouts.map((p) => (
                  <tr key={p.id} className="border-b border-[#F0F0EC]">
                    <td className="py-2 pr-3 text-[#6B6B68] tabular-nums">{fmtDate(p.createdAt)}</td>
                    <td className="py-2 pr-3 tabular-nums">{ron(p.grossCents)}</td>
                    <td className="py-2 pr-3 tabular-nums text-[#6B6B68]">{ron(p.feeCents)}</td>
                    <td className="py-2 pr-3 tabular-nums font-semibold">{ron(p.amountCents)}</td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${p.status === 'paid' ? 'bg-[#2E9E6A]/12 text-[#1f7a50]' : p.status === 'error' ? 'bg-[#DC4B41]/12 text-[#b3392f]' : 'bg-[#E8E8E4] text-[#6B6B68]'}`} title={p.error || ''}>{p.status}</span>
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
