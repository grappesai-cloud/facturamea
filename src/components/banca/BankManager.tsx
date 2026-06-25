import { useEffect, useState, useRef, useCallback } from 'react';

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────
interface BankAccount {
  id: string;
  name: string;
  iban: string | null;
  bank: string | null;
  currency: string;
  balanceCents: number | null;
  isActive: boolean | null;
  unreconciledCount?: number;
}
interface BankTransaction {
  id: string;
  accountId: string;
  bookingDate: string | null;
  amountCents: number;
  currency: string;
  description: string | null;
  counterparty: string | null;
  counterpartyIban: string | null;
  reference: string | null;
  reconciled: boolean;
  matchedType: string | null;
  matchedId: string | null;
}
interface Suggestion {
  type: 'invoice' | 'expense';
  id: string;
  number: string;
  party: string;
  outstandingCents: number;
  totalCents: number;
  amountLabel: string;
  reason: 'exact' | 'number';
}

const ron = (cents: number, currency = 'RON') => {
  try {
    return new Intl.NumberFormat('ro-RO', { style: 'currency', currency: currency || 'RON' }).format((cents || 0) / 100);
  } catch {
    return new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format((cents || 0) / 100);
  }
};
const dateLabel = (iso: string | null) => {
  if (!iso) return '–';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
};

// ──────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────
export default function BankManager() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [filter, setFilter] = useState<'all' | 'unreconciled' | 'reconciled'>('unreconciled');
  const [loadingTx, setLoadingTx] = useState(false);
  const [showAllTx, setShowAllTx] = useState(false);

  // new-account inline form
  const [showNew, setShowNew] = useState(false);
  const [naName, setNaName] = useState('');
  const [naIban, setNaIban] = useState('');
  const [naBank, setNaBank] = useState('');
  const [naCurrency, setNaCurrency] = useState('RON');
  const [savingAccount, setSavingAccount] = useState(false);

  // import
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // per-transaction suggestions panel
  const [openTxId, setOpenTxId] = useState<string>('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSugg, setLoadingSugg] = useState(false);
  const [busyMatch, setBusyMatch] = useState('');

  const [error, setError] = useState('');

  const activeAccount = accounts.find((a) => a.id === activeId) || null;

  const loadAccounts = useCallback(async (selectFirst = false) => {
    try {
      const r = await fetch('/api/banca/accounts');
      const d = await r.json();
      const list: BankAccount[] = d.accounts || [];
      setAccounts(list);
      if (selectFirst && !activeId && list.length > 0) setActiveId(list[0].id);
    } catch { /* leave empty */ }
  }, [activeId]);

  const loadTransactions = useCallback(async (accountId: string, f = filter) => {
    if (!accountId) { setTransactions([]); return; }
    setLoadingTx(true);
    try {
      const p = new URLSearchParams({ accountId });
      if (f === 'unreconciled') p.set('reconciled', 'false');
      else if (f === 'reconciled') p.set('reconciled', 'true');
      const r = await fetch(`/api/banca/transactions?${p}`);
      const d = await r.json();
      setTransactions(d.transactions || []);
    } catch { setTransactions([]); }
    finally { setLoadingTx(false); }
  }, [filter]);

  useEffect(() => { loadAccounts(true); }, []);
  useEffect(() => { if (activeId) { setOpenTxId(''); loadTransactions(activeId, filter); } }, [activeId, filter]);

  // ── account creation ──
  const createAccount = async () => {
    if (!naName.trim()) { setError('Dă un nume contului (ex: BCR cont curent).'); return; }
    setSavingAccount(true); setError('');
    try {
      const r = await fetch('/api/banca/accounts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: naName.trim(), iban: naIban.trim(), bank: naBank.trim(), currency: naCurrency }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Nu am putut salva contul.'); return; }
      setNaName(''); setNaIban(''); setNaBank(''); setNaCurrency('RON'); setShowNew(false);
      await loadAccounts();
      if (d.id) setActiveId(d.id);
    } catch { setError('Eroare de rețea.'); }
    finally { setSavingAccount(false); }
  };

  const deleteAccount = async (acc: BankAccount) => {
    if (!confirm(`Ștergi contul "${acc.name}" și toate tranzacțiile lui? Această acțiune nu poate fi anulată.`)) return;
    try {
      await fetch(`/api/banca/accounts/${acc.id}`, { method: 'DELETE' });
      if (activeId === acc.id) setActiveId('');
      await loadAccounts();
    } catch { setError('Nu am putut șterge contul.'); }
  };

  // ── statement import ──
  const onPickFile = () => fileRef.current?.click();
  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await doImport(file);
    if (fileRef.current) fileRef.current.value = '';
  };
  const doImport = async (file: File) => {
    if (!activeId) { setImportMsg({ kind: 'err', text: 'Selectează mai întâi un cont bancar.' }); return; }
    setImporting(true); setImportMsg(null);
    try {
      const fd = new FormData();
      fd.append('accountId', activeId);
      fd.append('file', file);
      const r = await fetch('/api/banca/transactions/import', { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok) { setImportMsg({ kind: 'err', text: d.error || 'Importul a eșuat.' }); return; }
      if (d.error) { setImportMsg({ kind: 'err', text: d.error }); }
      else {
        const warn = (d.warnings && d.warnings.length) ? ` (${d.warnings.length} avertismente)` : '';
        setImportMsg({ kind: 'ok', text: `Am importat ${d.imported} tranzacții, ${d.skipped} duplicate ignorate${warn}.` });
      }
      await loadAccounts();
      await loadTransactions(activeId, filter);
    } catch { setImportMsg({ kind: 'err', text: 'Eroare de rețea la import.' }); }
    finally { setImporting(false); }
  };

  // ── reconcile ──
  const toggleSuggestions = async (tx: BankTransaction) => {
    if (openTxId === tx.id) { setOpenTxId(''); return; }
    setOpenTxId(tx.id); setSuggestions([]); setLoadingSugg(true);
    try {
      const r = await fetch(`/api/banca/transactions/${tx.id}`);
      const d = await r.json();
      setSuggestions(d.suggestions || []);
    } catch { setSuggestions([]); }
    finally { setLoadingSugg(false); }
  };

  const reconcile = async (tx: BankTransaction, s: Suggestion) => {
    setBusyMatch(s.id);
    try {
      const r = await fetch(`/api/banca/transactions/${tx.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchType: s.type, matchId: s.id }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Reconcilierea a eșuat.'); return; }
      setOpenTxId('');
      await loadAccounts();
      await loadTransactions(activeId, filter);
    } catch { setError('Eroare de rețea.'); }
    finally { setBusyMatch(''); }
  };

  const undoReconcile = async (tx: BankTransaction) => {
    if (!confirm('Anulezi reconcilierea acestei tranzacții? Plata aplicată documentului va fi retrasă.')) return;
    try {
      const r = await fetch(`/api/banca/transactions/${tx.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reconciled: false }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error || 'Anularea a eșuat.'); return; }
      await loadAccounts();
      await loadTransactions(activeId, filter);
    } catch { setError('Eroare de rețea.'); }
  };

  // ── totals ──
  const totalBalance = accounts.reduce((s, a) => s + (a.balanceCents || 0), 0);
  const totalUnreconciled = accounts.reduce((s, a) => s + (a.unreconciledCount || 0), 0);

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white/5 rounded-2xl p-4 sm:p-5">
          <p className="text-[14px] text-[#9FB8CC] font-medium">Conturi bancare</p>
          <p className="text-[24px] sm:text-[30px] font-bold tracking-[-0.02em] mt-1.5 text-white tabular-nums">{accounts.length}</p>
        </div>
        <div className="bg-white/5 rounded-2xl p-4 sm:p-5">
          <p className="text-[14px] text-[#9FB8CC] font-medium">Sold total</p>
          <p className="text-[24px] sm:text-[30px] font-bold tracking-[-0.02em] mt-1.5 text-white tabular-nums">{ron(totalBalance)}</p>
        </div>
        <div className="bg-white/5 rounded-2xl p-4 sm:p-5 col-span-2 lg:col-span-1">
          <p className="text-[14px] text-[#9FB8CC] font-medium">Tranzacții nereconciliate</p>
          <p className={`text-[24px] sm:text-[30px] font-bold tracking-[-0.02em] mt-1.5 tabular-nums ${totalUnreconciled > 0 ? 'text-[#E8A33C]' : 'text-[#2E9E6A]'}`}>{totalUnreconciled}</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-[#DC4B41]/15 border-0 rounded-xl text-[15px] text-[#DC4B41]">
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto font-semibold underline">Închide</button>
        </div>
      )}

      {/* Accounts */}
      <div className="bg-white/5 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-white/10">
          <h2 className="text-[17px] font-bold text-white">Conturile tale</h2>
          <button onClick={() => setShowNew((v) => !v)} className="px-5 h-11 rounded-full bg-[#E1FB15] text-[#0A2238] text-[14px] font-bold hover:bg-[#D2EA0E]">
            {showNew ? 'Renunță' : '+ Cont nou'}
          </button>
        </div>

        {showNew && (
          <div className="px-5 sm:px-6 py-5 border-b border-white/10 bg-white/[0.03]">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-[13px] font-semibold text-[#9FB8CC] mb-1.5">Nume cont *</label>
                <input value={naName} onChange={(e) => setNaName(e.target.value)} placeholder="BCR cont curent"
                  className="w-full h-11 px-3.5 rounded-xl bg-white/10 border-0 text-white text-[15px] placeholder:text-[#7C9AB4] focus:outline-none focus:ring-2 focus:ring-[#E1FB15]/40" />
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-[#9FB8CC] mb-1.5">IBAN</label>
                <input value={naIban} onChange={(e) => setNaIban(e.target.value)} placeholder="RO49AAAA1B31..."
                  className="w-full h-11 px-3.5 rounded-xl bg-white/10 border-0 text-white text-[15px] placeholder:text-[#7C9AB4] focus:outline-none focus:ring-2 focus:ring-[#E1FB15]/40" />
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-[#9FB8CC] mb-1.5">Bancă</label>
                <input value={naBank} onChange={(e) => setNaBank(e.target.value)} placeholder="BCR"
                  className="w-full h-11 px-3.5 rounded-xl bg-white/10 border-0 text-white text-[15px] placeholder:text-[#7C9AB4] focus:outline-none focus:ring-2 focus:ring-[#E1FB15]/40" />
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-[#9FB8CC] mb-1.5">Monedă</label>
                <select value={naCurrency} onChange={(e) => setNaCurrency(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-white/10 border-0 text-white text-[15px] placeholder:text-[#7C9AB4] focus:outline-none focus:ring-2 focus:ring-[#E1FB15]/40">
                  <option value="RON">RON</option><option value="EUR">EUR</option><option value="USD">USD</option>
                </select>
              </div>
            </div>
            <div className="mt-4">
              <button onClick={createAccount} disabled={savingAccount}
                className="px-5 h-11 rounded-full bg-[#E1FB15] text-[#0A2238] text-[15px] font-bold hover:bg-[#D2EA0E] disabled:opacity-60">
                {savingAccount ? 'Se salvează...' : 'Salvează contul'}
              </button>
            </div>
          </div>
        )}

        {accounts.length === 0 ? (
          <div className="px-6 py-12 text-center text-[15px] text-[#9FB8CC]">
            Niciun cont bancar încă. Adaugă primul cont ca să poți importa extrasul.
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {accounts.map((a) => (
              <div key={a.id}
                onClick={() => setActiveId(a.id)}
                className={`group flex items-center gap-4 px-5 sm:px-6 py-4 cursor-pointer transition-colors ${activeId === a.id ? 'bg-white/10' : 'hover:bg-white/5'}`}>
                <span className={`shrink-0 w-3 h-3 rounded-full ${activeId === a.id ? 'bg-[#E1FB15]' : 'bg-white/20'}`} />
                <span className="flex-1 min-w-0">
                  <span className="block text-[16px] font-semibold truncate text-white">{a.name}</span>
                  <span className="block text-[13px] text-[#9FB8CC] truncate">
                    {[a.bank, a.iban].filter(Boolean).join(' · ') || 'Fără IBAN'}
                  </span>
                </span>
                {(a.unreconciledCount ?? 0) > 0 && (
                  <span className="shrink-0 px-2.5 py-1 rounded-full text-[13px] font-semibold bg-[#E8A33C]/15 text-[#E8A33C]">
                    {a.unreconciledCount} nereconciliate
                  </span>
                )}
                <span className="shrink-0 text-[16px] font-bold tabular-nums text-white">{ron(a.balanceCents || 0, a.currency)}</span>
                <button onClick={(e) => { e.stopPropagation(); deleteAccount(a); }}
                  className="shrink-0 w-9 h-9 rounded-full border-0 bg-white/10 grid place-items-center text-[#9FB8CC] hover:bg-[#DC4B41]/15 hover:text-[#DC4B41] transition-colors opacity-100 lg:opacity-0 lg:group-hover:opacity-100" title="Șterge contul">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reconciliation view */}
      {activeAccount && (
        <div className="bg-white/5 rounded-2xl overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 px-5 sm:px-6 py-4 border-b border-white/10">
            <div className="flex-1 min-w-[180px]">
              <h2 className="text-[17px] font-bold text-white">{activeAccount.name}</h2>
              <p className="text-[13px] text-[#9FB8CC]">Extras de cont și reconciliere</p>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.txt,.sta,.mt940,.940,text/csv,text/plain" className="hidden" onChange={onFileChosen} />
            <button onClick={onPickFile} disabled={importing}
              className="px-4 h-11 rounded-full bg-[#E1FB15] text-[#0A2238] text-[14px] font-bold hover:bg-[#D2EA0E] disabled:opacity-60">
              {importing ? 'Se importă...' : 'Importă extras (CSV / MT940)'}
            </button>
          </div>

          {importMsg && (
            <div className={`mx-5 sm:mx-6 mt-4 px-4 py-3 rounded-xl text-[14px] ${importMsg.kind === 'ok' ? 'bg-[#2E9E6A]/15 text-[#2E9E6A]' : 'bg-[#DC4B41]/15 text-[#DC4B41]'}`}>
              {importMsg.text}
            </div>
          )}

          {/* Filter tabs */}
          <div className="flex items-center gap-2 px-5 sm:px-6 py-3 border-b border-white/10">
            {([['unreconciled', 'Nereconciliate'], ['reconciled', 'Reconciliate'], ['all', 'Toate']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setFilter(key)}
                className={`px-3.5 h-10 rounded-full text-[14px] font-semibold transition-colors ${filter === key ? 'bg-[#E1FB15] text-[#0A2238] font-bold' : 'bg-white/10 border-0 text-[#9FB8CC] hover:bg-white/15'}`}>
                {label}
              </button>
            ))}
          </div>

          {loadingTx ? (
            <div className="px-6 py-12 text-center text-[15px] text-[#9FB8CC]">Se încarcă tranzacțiile...</div>
          ) : transactions.length === 0 ? (
            <div className="px-6 py-12 text-center text-[15px] text-[#9FB8CC]">
              {filter === 'reconciled' ? 'Nicio tranzacție reconciliată încă.' : 'Nicio tranzacție. Importă un extras de cont ca să începi.'}
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {(showAllTx ? transactions : transactions.slice(0, 3)).map((tx) => {
                const incoming = tx.amountCents >= 0;
                const open = openTxId === tx.id;
                return (
                  <div key={tx.id}>
                    <div className="flex items-center gap-3 sm:gap-4 px-5 sm:px-6 py-4">
                      <span className="shrink-0 w-[88px] text-[14px] text-[#9FB8CC] tabular-nums">{dateLabel(tx.bookingDate)}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[15px] font-semibold truncate text-white">{tx.counterparty || tx.description || '(fără detalii)'}</span>
                        <span className="block text-[13px] text-[#9FB8CC] truncate">
                          {[tx.reference, tx.counterparty ? tx.description : null].filter(Boolean).join(' · ') || tx.counterpartyIban || ''}
                        </span>
                      </span>
                      <span className={`shrink-0 text-[16px] font-bold tabular-nums ${incoming ? 'text-[#2E9E6A]' : 'text-white'}`}>
                        {incoming ? '+' : ''}{ron(tx.amountCents, tx.currency)}
                      </span>
                      {tx.reconciled ? (
                        <span className="shrink-0 hidden sm:inline-block px-2.5 py-1 rounded-full text-[13px] font-medium bg-[#2E9E6A]/15 text-[#2E9E6A]">Reconciliat</span>
                      ) : (
                        <span className="shrink-0 hidden sm:inline-block px-2.5 py-1 rounded-full text-[13px] font-medium bg-[#E8A33C]/15 text-[#E8A33C]">Nereconciliat</span>
                      )}
                      {tx.reconciled ? (
                        <button onClick={() => undoReconcile(tx)}
                          className="shrink-0 px-3.5 h-10 rounded-full bg-white/10 border-0 text-white hover:bg-white/15 text-[14px] font-semibold">
                          Anulează
                        </button>
                      ) : (
                        <button onClick={() => toggleSuggestions(tx)}
                          className="shrink-0 px-3.5 h-10 rounded-full bg-[#E1FB15] text-[#0A2238] font-bold hover:bg-[#D2EA0E] text-[14px]">
                          {open ? 'Închide' : 'Reconciliază'}
                        </button>
                      )}
                    </div>

                    {open && !tx.reconciled && (
                      <div className="px-5 sm:px-6 pb-5 bg-white/[0.03]">
                        {loadingSugg ? (
                          <p className="text-[14px] text-[#9FB8CC] py-3">Caut potriviri...</p>
                        ) : suggestions.length === 0 ? (
                          <p className="text-[14px] text-[#9FB8CC] py-3">
                            Nicio potrivire automată. {incoming ? 'Verifică facturile neîncasate.' : 'Verifică cheltuielile neplătite.'}
                          </p>
                        ) : (
                          <div className="space-y-2 pt-3">
                            <p className="text-[13px] font-semibold text-[#7C9AB4] uppercase tracking-wider">Potriviri sugerate</p>
                            {suggestions.map((s) => (
                              <div key={`${s.type}-${s.id}`} className="flex items-center gap-3 bg-white/5 border-0 rounded-xl px-4 py-3">
                                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[12px] font-semibold ${s.type === 'invoice' ? 'bg-[#34A0A4]/15 text-[#34A0A4]' : 'bg-[#E1FB15]/15 text-[#E1FB15]'}`}>
                                  {s.type === 'invoice' ? 'Factură' : 'Cheltuială'}
                                </span>
                                <span className="flex-1 min-w-0">
                                  <span className="block text-[15px] font-semibold truncate text-white">{s.number} · {s.party}</span>
                                  <span className="block text-[13px] text-[#9FB8CC]">
                                    De {s.type === 'invoice' ? 'încasat' : 'plătit'}: {s.amountLabel}
                                    {s.reason === 'exact' ? ' · sumă identică' : ' · număr în descriere'}
                                  </span>
                                </span>
                                <button onClick={() => reconcile(tx, s)} disabled={busyMatch === s.id}
                                  className="shrink-0 px-4 h-10 rounded-full bg-[#2E9E6A] text-white text-[14px] font-semibold hover:bg-[#2E9E6A]/80 disabled:opacity-60">
                                  {busyMatch === s.id ? 'Se aplică...' : 'Reconciliază'}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {transactions.length > 3 && (
                <button type="button" onClick={() => setShowAllTx((s) => !s)} className="mt-3 mx-auto w-fit flex items-center px-5 py-2.5 rounded-full bg-[#E1FB15] text-[#0A2238] text-[13.5px] font-semibold hover:bg-[#D2EA0E] active:scale-95 transition-all">
                  {showAllTx ? 'Arată mai puțin' : `Vezi toate (${transactions.length})`}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
