import { useState } from 'react';
import { Select } from '../ui/Select';

const PROVIDERS: { id: 'sameday' | 'fan' | 'dpd' | 'cargus'; label: string }[] = [
  { id: 'sameday', label: 'Sameday' },
  { id: 'fan', label: 'FAN Courier' },
  { id: 'dpd', label: 'DPD' },
  { id: 'cargus', label: 'Cargus' },
];

const COUNTIES = [
  'Alba', 'Arad', 'Argeș', 'Bacău', 'Bihor', 'Bistrița-Năsăud', 'Botoșani', 'Brașov', 'Brăila', 'Buzău',
  'Caraș-Severin', 'Călărași', 'Cluj', 'Constanța', 'Covasna', 'Dâmbovița', 'Dolj', 'Galați', 'Giurgiu',
  'Gorj', 'Harghita', 'Hunedoara', 'Ialomița', 'Iași', 'Ilfov', 'Maramureș', 'Mehedinți', 'Mureș', 'Neamț',
  'Olt', 'Prahova', 'Satu Mare', 'Sălaj', 'Sibiu', 'Suceava', 'Teleorman', 'Timiș', 'Tulcea', 'Vaslui',
  'Vâlcea', 'Vrancea', 'București',
];

interface Props {
  onCreated?: () => void;
}

export default function ShipmentForm({ onCreated }: Props = {}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    provider: 'sameday' as 'sameday' | 'fan' | 'dpd' | 'cargus',
    recipientName: '',
    recipientPhone: '',
    address: '',
    city: '',
    county: '',
    parcels: '1',
    weightKg: '',
    codRon: '',
  });

  const reset = () =>
    setForm({
      provider: 'sameday',
      recipientName: '',
      recipientPhone: '',
      address: '',
      city: '',
      county: '',
      parcels: '1',
      weightKg: '',
      codRon: '',
    });

  const submit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setError('');
    if (!form.recipientName.trim()) {
      setError('Numele destinatarului este obligatoriu.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/curierat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: form.provider,
          recipientName: form.recipientName.trim(),
          recipientPhone: form.recipientPhone.trim(),
          address: form.address.trim(),
          city: form.city.trim(),
          county: form.county.trim(),
          parcels: parseInt(form.parcels || '1', 10) || 1,
          weightKg: form.weightKg ? parseFloat(form.weightKg) : null,
          codRon: form.codRon ? parseFloat(form.codRon) : 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Eroare la salvare');
        return;
      }
      reset();
      setOpen(false);
      if (onCreated) onCreated();
      else window.location.reload();
    } catch {
      setError('Eroare de conexiune');
    } finally {
      setBusy(false);
    }
  };

  const inputCls = 'w-full rounded-xl bg-white/10 px-4 py-2.5 text-[14px] text-white placeholder:text-[#8FA6BC] border border-white/[0.12] focus:outline-none focus:border-[#E1FB15]/50 focus:ring-2 focus:ring-[#E1FB15]/40';
  const labelCls = 'block text-[13px] font-medium text-[#A8BED2] mb-1.5';
  const btnPrimary = 'inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full bg-[#E1FB15] text-[#07090f] font-bold text-[14px] hover:bg-[#D2EA0E]';
  const btnGhost = 'inline-flex items-center justify-center px-4 py-2.5 rounded-full bg-white/10 text-white font-semibold text-[14px] hover:bg-white/15';

  if (!open) {
    return (
      <button className={btnPrimary} onClick={() => setOpen(true)}>
        AWB nou
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="bg-white/5 rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[17px] font-semibold text-white">Expediere nouă</h3>
        <button
          type="button"
          className="text-[14px] font-semibold text-[#A8BED2] hover:text-white"
          onClick={() => {
            setOpen(false);
            setError('');
          }}
        >
          Închide
        </button>
      </div>

      <div className="rounded-xl bg-[#E8A33C]/15 px-4 py-3 text-[14px] text-[#E8A33C]">
        Conectează contul de curier ca să generezi AWB real. Deocamdată salvăm expedierea ca ciornă.
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-[#DC4B41]/15 text-[14px] text-[#DC4B41]">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Curier</label>
          <Select
            value={form.provider}
            onChange={(e) => setForm({ ...form, provider: e.target.value as typeof form.provider })}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className={labelCls}>Nume destinatar *</label>
          <input
            className={inputCls}
            placeholder="ex: Ion Popescu"
            value={form.recipientName}
            onChange={(e) => setForm({ ...form, recipientName: e.target.value })}
            required
          />
        </div>
        <div>
          <label className={labelCls}>Telefon</label>
          <input
            className={inputCls}
            placeholder="ex: 07xx xxx xxx"
            value={form.recipientPhone}
            onChange={(e) => setForm({ ...form, recipientPhone: e.target.value })}
          />
        </div>
        <div>
          <label className={labelCls}>Oraș / localitate</label>
          <input
            className={inputCls}
            placeholder="ex: Cluj-Napoca"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Adresă</label>
          <input
            className={inputCls}
            placeholder="Stradă, număr, bloc, apartament"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </div>
        <div>
          <label className={labelCls}>Județ</label>
          <Select
            value={form.county}
            onChange={(e) => setForm({ ...form, county: e.target.value })}
          >
            <option value="">Alege județul</option>
            {COUNTIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Colete</label>
            <input
              type="number"
              min="1"
              className={`${inputCls} [color-scheme:dark]`}
              value={form.parcels}
              onChange={(e) => setForm({ ...form, parcels: e.target.value })}
            />
          </div>
          <div>
            <label className={labelCls}>Greutate (kg)</label>
            <input
              type="number"
              min="0"
              step="0.1"
              className={`${inputCls} [color-scheme:dark]`}
              placeholder="ex: 2.5"
              value={form.weightKg}
              onChange={(e) => setForm({ ...form, weightKg: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label className={labelCls}>Ramburs / COD (RON)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            className={`${inputCls} [color-scheme:dark]`}
            placeholder="0"
            value={form.codRon}
            onChange={(e) => setForm({ ...form, codRon: e.target.value })}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-3 pt-1">
        <button type="submit" className={btnPrimary} disabled={busy}>
          {busy ? 'Se salvează…' : 'Salvează expedierea'}
        </button>
        <button
          type="button"
          className={btnGhost}
          onClick={() => {
            setOpen(false);
            setError('');
          }}
        >
          Anulează
        </button>
      </div>
    </form>
  );
}
