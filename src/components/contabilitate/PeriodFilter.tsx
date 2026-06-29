import { useState } from 'react';
import { DatePicker } from '../ui/DatePicker';

interface Account {
  code: string;
  name: string;
}

interface Props {
  /** Target path (GET). Defaults to current path. */
  action?: string;
  from: string;
  to: string;
  submitLabel: string;
  /** When provided, renders an account selector (used on the Fișa contului page). */
  accounts?: Account[];
  /** Currently selected account code (Fișa). */
  cont?: string;
}

/**
 * Period filter for the accounting pages (Balanță, Jurnal, Fișă). Replaces the
 * native <input type="date"> with the app's custom DatePicker, then navigates
 * with a GET query so the server still renders the filtered data.
 */
export default function PeriodFilter({ action, from: initFrom, to: initTo, submitLabel, accounts, cont: initCont }: Props) {
  const [from, setFrom] = useState(initFrom);
  const [to, setTo] = useState(initTo);
  const [cont, setCont] = useState(initCont || '');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (accounts) params.set('cont', cont);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const path = action || (typeof window !== 'undefined' ? window.location.pathname : '');
    window.location.href = `${path}?${params.toString()}`;
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3 mb-6 rounded-2xl p-5 bg-white/5">
      {accounts && (
        <div className="min-w-0 w-full sm:w-auto">
          <label className="block text-[13px] text-[#A8BED2] mb-1.5">Cont</label>
          <select
            value={cont}
            onChange={(e) => setCont(e.target.value)}
            className="w-full sm:w-auto rounded-xl bg-white/5 px-4 py-2.5 text-[14px] text-white border border-white/[0.12] focus:outline-none [color-scheme:dark] sm:min-w-[220px]"
          >
            <option value="">Alege contul</option>
            {accounts.map((a) => (
              <option key={a.code} value={a.code}>{a.code} · {a.name}</option>
            ))}
          </select>
        </div>
      )}
      <div className="min-w-0 w-[calc(50%-0.375rem)] sm:w-auto">
        <label className="block text-[13px] text-[#A8BED2] mb-1.5">De la</label>
        <DatePicker value={from} onChange={setFrom} className="sm:w-[170px]" />
      </div>
      <div className="min-w-0 w-[calc(50%-0.375rem)] sm:w-auto">
        <label className="block text-[13px] text-[#A8BED2] mb-1.5">Până la</label>
        <DatePicker value={to} onChange={setTo} className="sm:w-[170px]" />
      </div>
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[#E1FB15] text-[#07090f] font-bold text-[14px] hover:bg-[#D2EA0E] transition-colors shrink-0"
      >
        {submitLabel}
      </button>
    </form>
  );
}
