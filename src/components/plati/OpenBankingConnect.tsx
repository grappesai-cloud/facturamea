import { useEffect, useState } from 'react';

// Open banking (GoCardless Bank Account Data) connect + sync island.
// - Lists Romanian banks, lets the user connect (opens the GoCardless link).
// - Stores the requisition id locally so the post-authorization sync can run.
// - "Sincronizează tranzacțiile" pulls transactions into the bank module.
//
// When `configured` is false it renders a clear "neconfigurat" panel with the
// env vars the operator must set, and skips all network calls.

interface Institution {
  id: string;
  name: string;
  bic?: string;
  logo?: string;
}

interface LocalAccount {
  id: string;
  name: string;
  iban: string | null;
  currency: string;
}

interface Props {
  configured: boolean;
  localAccounts?: LocalAccount[];
}

const LS_REQ = 'fm-openbanking-requisition';

const card = 'bg-white/5 rounded-2xl';
const btnPrimary =
  'inline-flex items-center gap-1.5 justify-center px-5 py-2.5 rounded-full bg-[#E1FB15] hover:bg-[#D2EA0E] disabled:opacity-50 disabled:cursor-not-allowed text-[#0A2238] text-[14px] font-bold transition-colors';
const btnGhost =
  'inline-flex items-center justify-center px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/15 disabled:opacity-50 text-white text-[14px] font-semibold transition-colors';
const inputCls =
  'w-full rounded-xl bg-white/10 px-4 py-2.5 text-[14px] text-white placeholder:text-[#7C9AB4] border-0 [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-[#E1FB15]/40';

export default function OpenBankingConnect({ configured, localAccounts = [] }: Props) {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loadingInst, setLoadingInst] = useState(false);
  const [institutionId, setInstitutionId] = useState('');
  const [pinnedAccountId, setPinnedAccountId] = useState('');
  const [requisitionId, setRequisitionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Restore a stored requisition id + react to the GoCardless callback flags.
  useEffect(() => {
    if (!configured) return;
    try {
      const stored = localStorage.getItem(LS_REQ);
      if (stored) setRequisitionId(stored);
    } catch { /* ignore */ }

    try {
      const sp = new URLSearchParams(window.location.search);
      const ob = sp.get('openbanking');
      if (ob === 'autorizat') {
        setNotice('Autorizare reușită. Apasă „Sincronizează tranzacțiile" pentru a aduce mișcările.');
      } else if (ob === 'eroare') {
        setError(`Autorizarea la bancă a eșuat${sp.get('details') ? ': ' + sp.get('details') : ''}.`);
      } else if (ob === 'neconfigurat') {
        setError('Open banking nu este configurat.');
      }
    } catch { /* ignore */ }
  }, [configured]);

  // Lazy-load the bank list the first time the picker is needed.
  const loadInstitutions = async () => {
    if (!configured || institutions.length > 0 || loadingInst) return;
    setLoadingInst(true);
    setError('');
    try {
      const r = await fetch('/api/banca/openbanking/connect?country=RO');
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || 'Nu am putut încărca lista băncilor.');
        return;
      }
      setInstitutions(d.institutions || []);
    } catch {
      setError('Eroare de conexiune la încărcarea băncilor.');
    } finally {
      setLoadingInst(false);
    }
  };

  useEffect(() => {
    if (configured) loadInstitutions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured]);

  const connect = async () => {
    setError('');
    setNotice('');
    if (!institutionId) {
      setError('Alege o bancă din listă.');
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/banca/openbanking/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ institutionId }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || 'Nu am putut iniția conectarea.');
        return;
      }
      if (d.requisitionId) {
        setRequisitionId(d.requisitionId);
        try { localStorage.setItem(LS_REQ, d.requisitionId); } catch { /* ignore */ }
      }
      if (d.link) {
        // Send the user to their bank to authorize. They return via /callback.
        window.location.href = d.link;
      } else {
        setError('Banca nu a returnat un link de autorizare.');
      }
    } catch {
      setError('Eroare de conexiune.');
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    setError('');
    setNotice('');
    if (!requisitionId) {
      setError('Conectează mai întâi o bancă.');
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/banca/openbanking/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requisitionId,
          accountId: pinnedAccountId || undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || 'Sincronizarea a eșuat.');
        return;
      }
      if (d.pending) {
        setNotice(d.error || 'Autorizarea nu este finalizată încă. Deschide linkul băncii și aprobă accesul.');
        return;
      }
      setNotice(`Sincronizare reușită: ${d.imported || 0} tranzacții importate, ${d.skipped || 0} deja existente.`);
    } catch {
      setError('Eroare de conexiune la sincronizare.');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () => {
    setRequisitionId(null);
    try { localStorage.removeItem(LS_REQ); } catch { /* ignore */ }
    setNotice('Conexiunea locală a fost ștearsă. Poți conecta din nou o bancă.');
  };

  // ── Neconfigurat state ────────────────────────────────────────────────
  if (!configured) {
    return (
      <div className={`${card} p-6`}>
        <div className="flex items-start gap-3">
          <span className="mt-1 w-2 h-2 rounded-full bg-[#E8A33C] shrink-0" />
          <div>
            <h3 className="text-[16px] font-semibold text-white">Open banking neconfigurat</h3>
            <p className="text-[14px] text-[#9FB8CC] mt-1.5 leading-relaxed">
              Conectarea automată la bancă folosește GoCardless Bank Account Data (fost Nordigen). Pentru a o activa,
              creează un cont la GoCardless, generează cheile API și setează-le ca variabile de mediu:
            </p>
            <ul className="mt-3 space-y-1.5 text-[13px] font-mono text-white">
              <li className="px-3 py-2 rounded-lg bg-white/5">GOCARDLESS_SECRET_ID</li>
              <li className="px-3 py-2 rounded-lg bg-white/5">GOCARDLESS_SECRET_KEY</li>
            </ul>
            <p className="text-[13px] text-[#9FB8CC] mt-3">
              Până atunci poți importa manual extrasul de cont (CSV sau MT940) din pagina Bancă.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Configured state ──────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {error && (
        <div className="px-4 py-3 rounded-xl bg-[#DC4B41]/15 text-[14px] text-[#DC4B41]">
          {error}
        </div>
      )}
      {notice && (
        <div className="px-4 py-3 rounded-xl bg-[#2E9E6A]/15 text-[14px] text-[#2E9E6A]">
          {notice}
        </div>
      )}

      <div className={`${card} p-6 space-y-4`}>
        <div>
          <h3 className="text-[16px] font-semibold text-white">Conectează o bancă</h3>
          <p className="text-[14px] text-[#9FB8CC] mt-1">
            Alege banca, autorizează accesul, apoi importăm tranzacțiile automat.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-[14px] font-medium text-[#9FB8CC] mb-1.5">Bancă</label>
            <select
              className={`${inputCls} appearance-none`}
              value={institutionId}
              onChange={(e) => setInstitutionId(e.target.value)}
              disabled={loadingInst || busy}
            >
              <option value="">{loadingInst ? 'Se încarcă băncile...' : 'Selectează banca'}</option>
              {institutions.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>

          {localAccounts.length > 0 && (
            <div>
              <label className="block text-[14px] font-medium text-[#9FB8CC] mb-1.5">
                Cont local (opțional)
              </label>
              <select
                className={`${inputCls} appearance-none`}
                value={pinnedAccountId}
                onChange={(e) => setPinnedAccountId(e.target.value)}
                disabled={busy}
              >
                <option value="">Creează automat după IBAN</option>
                {localAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.iban ? ` · ${a.iban}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3 pt-1">
          <button className={btnPrimary} onClick={connect} disabled={busy || !institutionId}>
            {busy ? 'Se conectează...' : 'Conectează banca'}
          </button>
          {institutions.length === 0 && !loadingInst && (
            <button className={btnGhost} onClick={loadInstitutions} disabled={busy}>
              Reîncarcă lista băncilor
            </button>
          )}
        </div>
      </div>

      {/* Sync panel — shown once a requisition exists (after connect/return). */}
      <div className={`${card} p-6 space-y-4`}>
        <div>
          <h3 className="text-[16px] font-semibold text-white">Sincronizează tranzacțiile</h3>
          <p className="text-[14px] text-[#9FB8CC] mt-1">
            {requisitionId
              ? 'Ai o conexiune activă. Apasă pentru a aduce ultimele mișcări din cont.'
              : 'Conectează mai întâi o bancă pentru a putea sincroniza.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className={btnPrimary} onClick={sync} disabled={busy || !requisitionId}>
            {busy ? 'Se sincronizează...' : 'Sincronizează tranzacțiile'}
          </button>
          {requisitionId && (
            <button className={btnGhost} onClick={disconnect} disabled={busy}>
              Deconectează
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
