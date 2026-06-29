import { useState } from 'react';
import { Select } from '../ui/Select';

interface GoodsLine { name: string; qty: string; value: string; ncCode: string; unit: string; }

const emptyLine: GoodsLine = { name: '', qty: '1', value: '', ncCode: '', unit: 'buc' };

const OPERATION_TYPES = [
  { value: 'AIC', label: 'Achiziție intracomunitară (import în RO)' },
  { value: 'LIC', label: 'Livrare intracomunitară (export din RO)' },
  { value: 'INTERN', label: 'Transport intern (fiscal-risc)' },
];

const ron = (n: number) =>
  new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format(n || 0);

const toNum = (v: string) => {
  const n = parseFloat((v || '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
};

const labelCls = 'block text-[13px] font-medium text-[#A8BED2] mb-1.5';
const inputCls = 'w-full rounded-xl bg-white/5 px-4 py-2.5 text-[14px] text-white placeholder:text-[#8FA6BC] border border-white/[0.12] focus:outline-none focus:border-[#E1FB15]/50 focus:ring-2 focus:ring-[#E1FB15]/30 hover:border-white/25 transition';
const card = 'bg-white/5 rounded-2xl p-4 sm:p-5';

export default function EtransportForm() {
  const [operationType, setOperationType] = useState('AIC');
  const [senderName, setSenderName] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [loadingAddress, setLoadingAddress] = useState('');
  const [unloadingAddress, setUnloadingAddress] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [goods, setGoods] = useState<GoodsLine[]>([{ ...emptyLine }]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const total = goods.reduce((s, g) => s + toNum(g.value), 0);

  const setLine = (i: number, patch: Partial<GoodsLine>) =>
    setGoods((prev) => prev.map((g, idx) => idx === i ? { ...g, ...patch } : g));
  const addLine = () => setGoods((prev) => [...prev, { ...emptyLine }]);
  const removeLine = (i: number) => setGoods((prev) => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);

  const submit = async () => {
    setMsg(null);
    if (!vehiclePlate.trim()) { setMsg({ kind: 'err', text: 'Completează numărul de înmatriculare.' }); return; }
    if (goods.every((g) => !g.name.trim())) { setMsg({ kind: 'err', text: 'Adaugă cel puțin un bun transportat.' }); return; }

    setBusy(true);
    try {
      const r = await fetch('/api/anaf/etransport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationType, senderName, recipientName, loadingAddress, unloadingAddress, vehiclePlate,
          goods: goods.filter((g) => g.name.trim()).map((g) => ({
            name: g.name, qty: toNum(g.qty), value: toNum(g.value), ncCode: g.ncCode, unit: g.unit,
          })),
        }),
      });
      const d = await r.json();
      if (d.ok) {
        if (d.status === 'sent') {
          setMsg({ kind: 'ok', text: `Declarație trimisă la ANAF. UIT: ${d.uit || 'în curs de alocare'}.` });
        } else {
          setMsg({ kind: 'ok', text: d.note || 'Declarația a fost salvată ca ciornă.' });
        }
        setTimeout(() => { window.location.href = '/app/etransport'; }, 1400);
      } else {
        setMsg({ kind: 'err', text: d.error || 'Nu s-a putut salva declarația.' });
      }
    } catch {
      setMsg({ kind: 'err', text: 'Eroare de rețea.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {msg && (
        <div className={`px-4 py-3 rounded-xl text-[14px] ${msg.kind === 'ok' ? 'bg-[#2E9E6A]/15 text-[#2E9E6A]' : 'bg-[#DC4B41]/15 text-[#DC4B41]'}`}>
          {msg.text}
        </div>
      )}

      <div className={card}>
        <label className={labelCls}>Tip operațiune</label>
        <Select value={operationType} onChange={(e) => setOperationType(e.target.value)}>
          {OPERATION_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </div>

      <div className={card}>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Expeditor</label>
            <input className={inputCls} value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Numele expeditorului" />
          </div>
          <div>
            <label className={labelCls}>Destinatar</label>
            <input className={inputCls} value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Numele destinatarului" />
          </div>
          <div>
            <label className={labelCls}>Adresă de încărcare</label>
            <input className={inputCls} value={loadingAddress} onChange={(e) => setLoadingAddress(e.target.value)} placeholder="Localitate, stradă" />
          </div>
          <div>
            <label className={labelCls}>Adresă de descărcare</label>
            <input className={inputCls} value={unloadingAddress} onChange={(e) => setUnloadingAddress(e.target.value)} placeholder="Localitate, stradă" />
          </div>
          <div>
            <label className={labelCls}>Număr înmatriculare</label>
            <input className={inputCls} value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())} placeholder="B 123 ABC" />
          </div>
        </div>
      </div>

      <div className={card}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[17px] font-bold text-white">Bunuri transportate</h2>
          <button onClick={addLine} type="button" className="px-4 py-2.5 rounded-full bg-white/10 text-white font-semibold text-[14px] hover:bg-white/15">
            + Adaugă rând
          </button>
        </div>
        <div className="space-y-3">
          {goods.map((g, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
              <div className="sm:col-span-5">
                <label className="text-[13px] text-[#A8BED2]">Denumire</label>
                <input className={inputCls} value={g.name} onChange={(e) => setLine(i, { name: e.target.value })} placeholder="Denumirea bunului" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[13px] text-[#A8BED2]">Cantitate</label>
                <input className={inputCls} value={g.qty} onChange={(e) => setLine(i, { qty: e.target.value })} inputMode="decimal" />
              </div>
              <div className="sm:col-span-3">
                <label className="text-[13px] text-[#A8BED2]">Valoare (RON, fără TVA)</label>
                <input className={inputCls} value={g.value} onChange={(e) => setLine(i, { value: e.target.value })} inputMode="decimal" placeholder="0" />
              </div>
              <div className="sm:col-span-2 flex justify-end items-end pb-0.5">
                <button type="button" onClick={() => removeLine(i)} disabled={goods.length === 1}
                  className="w-10 h-10 rounded-full bg-white/10 grid place-items-center text-[#A8BED2] hover:bg-[#DC4B41]/15 hover:text-[#DC4B41] transition-colors disabled:opacity-40"
                  title="Șterge rândul">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
          <span className="text-[15px] text-[#A8BED2]">Valoare totală (fără TVA)</span>
          <span className="text-[22px] font-bold tabular-nums text-white">{ron(total)}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={submit} disabled={busy}
          className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full bg-[#E1FB15] text-[#07090f] font-bold text-[14px] hover:bg-[#D2EA0E] disabled:opacity-50">
          {busy ? 'Se trimite...' : 'Salvează și trimite la ANAF'}
        </button>
        <a href="/app/etransport" className="px-4 py-2.5 inline-flex items-center rounded-full bg-white/10 text-white font-semibold text-[14px] hover:bg-white/15">
          Renunță
        </a>
      </div>
    </div>
  );
}
