import { useEffect, useMemo, useState } from 'react';

interface Account {
  code: string;
  name: string;
  type: string;
}

interface Line {
  accountCode: string;
  debit: string; // raw RON input
  credit: string;
  note: string;
}

const ron = (cents: number) =>
  new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format((cents || 0) / 100);

const emptyLine = (): Line => ({ accountCode: '', debit: '', credit: '', note: '' });

function toCents(v: string): number {
  const n = Number((v || '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export default function EntryForm() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [open, setOpen] = useState(false);
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<Line[]>([emptyLine(), emptyLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [activeAuto, setActiveAuto] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/contabilitate/accounts')
      .then((r) => r.json())
      .then((d) => setAccounts(d.results || []))
      .catch(() => {});
  }, []);

  const accountName = (code: string) => accounts.find((a) => a.code === code)?.name || '';

  const totals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const l of lines) {
      debit += toCents(l.debit);
      credit += toCents(l.credit);
    }
    return { debit, credit, balanced: debit === credit && debit > 0, diff: debit - credit };
  }, [lines]);

  const setLine = (i: number, patch: Partial<Line>) => {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };
  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (i: number) =>
    setLines((prev) => (prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i)));

  const reset = () => {
    setEntryDate(new Date().toISOString().slice(0, 10));
    setDescription('');
    setLines([emptyLine(), emptyLine()]);
    setError('');
  };

  const save = async () => {
    setError('');
    if (!totals.balanced) {
      setError('Nota nu este echilibrată. Total debit trebuie să fie egal cu total credit.');
      return;
    }
    const payloadLines = lines
      .filter((l) => l.accountCode.trim() && (toCents(l.debit) !== 0 || toCents(l.credit) !== 0))
      .map((l) => ({
        accountCode: l.accountCode.trim(),
        debitCents: toCents(l.debit),
        creditCents: toCents(l.credit),
        note: l.note.trim() || null,
      }));
    if (payloadLines.length < 2) {
      setError('Completează cel puțin două rânduri cu cont și sumă.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/contabilitate/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryDate, description: description.trim() || null, lines: payloadLines }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Eroare la salvare.');
        return;
      }
      reset();
      setOpen(false);
      window.location.reload();
    } catch {
      setError('Eroare de conexiune.');
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    'w-full rounded-xl bg-white/10 px-4 py-2.5 text-[14px] text-white placeholder:text-[#7C9AB4] border-0 focus:outline-none focus:ring-2 focus:ring-[#E1FB15]/40';

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full bg-[#E1FB15] text-[#0A2238] font-bold text-[14px] hover:bg-[#D2EA0E]"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Notă contabilă nouă
      </button>
    );
  }

  return (
    <div className="bg-white/5 rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-[18px] font-bold text-white">Notă contabilă nouă</h2>
        <button
          onClick={() => { setOpen(false); reset(); }}
          className="w-9 h-9 rounded-full bg-white/10 grid place-items-center text-white hover:bg-white/15"
          aria-label="Închide"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        <div>
          <label className="block text-[13px] font-medium text-[#9FB8CC] mb-1.5">Data</label>
          <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className={`${inputCls} [color-scheme:dark]`} />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-[#9FB8CC] mb-1.5">Descriere</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: Înregistrare factură furnizor"
            className={inputCls}
          />
        </div>
      </div>

      <div className="space-y-2.5">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-start">
            <div className="col-span-12 sm:col-span-4 relative">
              <input
                type="text"
                value={l.accountCode}
                onChange={(e) => { setLine(i, { accountCode: e.target.value }); setActiveAuto(i); }}
                onFocus={() => setActiveAuto(i)}
                onBlur={() => setTimeout(() => setActiveAuto((a) => (a === i ? null : a)), 150)}
                placeholder="Cont (ex: 4111)"
                className={inputCls}
                autoComplete="off"
              />
              {l.accountCode && accountName(l.accountCode) && (
                <p className="text-[12px] text-[#7C9AB4] mt-1 truncate">{accountName(l.accountCode)}</p>
              )}
              {activeAuto === i && l.accountCode.trim() && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-[#0B2236] ring-1 ring-white/10 rounded-2xl shadow-lg max-h-56 overflow-y-auto">
                  {accounts
                    .filter(
                      (a) =>
                        a.code.startsWith(l.accountCode.trim()) ||
                        a.name.toLowerCase().includes(l.accountCode.trim().toLowerCase()),
                    )
                    .slice(0, 12)
                    .map((a) => (
                      <button
                        key={a.code}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); setLine(i, { accountCode: a.code }); setActiveAuto(null); }}
                        className="w-full text-left px-3 py-2 hover:bg-white/5 flex items-center gap-2"
                      >
                        <span className="font-mono font-semibold text-[14px] text-white w-[56px] shrink-0">{a.code}</span>
                        <span className="text-[13px] text-[#9FB8CC] truncate">{a.name}</span>
                      </button>
                    ))}
                </div>
              )}
            </div>
            <div className="col-span-5 sm:col-span-3">
              <input
                type="text"
                inputMode="decimal"
                value={l.debit}
                onChange={(e) => setLine(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })}
                placeholder="Debit"
                className={inputCls}
              />
            </div>
            <div className="col-span-5 sm:col-span-3">
              <input
                type="text"
                inputMode="decimal"
                value={l.credit}
                onChange={(e) => setLine(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })}
                placeholder="Credit"
                className={inputCls}
              />
            </div>
            <div className="col-span-2 sm:col-span-2 flex justify-end">
              <button
                onClick={() => removeLine(i)}
                disabled={lines.length <= 2}
                className="w-11 h-11 rounded-full bg-white/10 grid place-items-center text-[#DC4B41] hover:bg-[#DC4B41]/15 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Șterge rând"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </button>
            </div>
            {l.note !== undefined && (
              <div className="col-span-12 sm:col-start-1 sm:col-span-10">
                <input
                  type="text"
                  value={l.note}
                  onChange={(e) => setLine(i, { note: e.target.value })}
                  placeholder="Notă rând (opțional)"
                  className="w-full rounded-xl bg-white/10 px-4 py-2 text-[14px] text-white placeholder:text-[#7C9AB4] border-0 focus:outline-none focus:ring-2 focus:ring-[#E1FB15]/40"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={addLine}
        className="mt-3 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-white/10 text-white font-semibold text-[14px] hover:bg-white/15"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Adaugă rând
      </button>

      <div className="mt-5 flex flex-wrap items-center gap-4 px-4 py-3 rounded-2xl bg-white/5">
        <div className="flex-1 min-w-[120px]">
          <p className="text-[12px] text-[#7C9AB4] uppercase tracking-wide">Total debit</p>
          <p className="text-[22px] font-bold tabular-nums text-white">{ron(totals.debit)}</p>
        </div>
        <div className="flex-1 min-w-[120px]">
          <p className="text-[12px] text-[#7C9AB4] uppercase tracking-wide">Total credit</p>
          <p className="text-[22px] font-bold tabular-nums text-white">{ron(totals.credit)}</p>
        </div>
        <div className="flex-1 min-w-[120px]">
          <p className="text-[12px] text-[#7C9AB4] uppercase tracking-wide">Diferență</p>
          <p className={`text-[22px] font-bold tabular-nums ${totals.balanced ? 'text-[#2E9E6A]' : 'text-[#DC4B41]'}`}>
            {totals.balanced ? 'Echilibrată' : ron(totals.diff)}
          </p>
        </div>
      </div>

      {error && <p className="mt-3 text-[14px] text-[#DC4B41]">{error}</p>}

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy || !totals.balanced}
          className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full bg-[#E1FB15] text-[#0A2238] font-bold text-[14px] hover:bg-[#D2EA0E] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? 'Se salvează...' : 'Salvează nota'}
        </button>
        <button
          onClick={() => { setOpen(false); reset(); }}
          className="px-4 py-2.5 rounded-full bg-white/10 text-white font-semibold text-[14px] hover:bg-white/15"
        >
          Renunță
        </button>
      </div>
    </div>
  );
}
