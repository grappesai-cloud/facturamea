import { useState } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Select } from '../ui/Select';
import { Plus, Loader2 } from 'lucide-react';

const CATEGORIES = [
  'Echipamente tehnologice',
  'Aparate și instalații de măsurare',
  'Mijloace de transport',
  'Mobilier și birotică',
  'Calculatoare și echipamente IT',
  'Construcții',
  'Altele',
];

const METHOD_LABELS: Record<string, string> = {
  liniara: 'Liniară',
  degresiva: 'Degresivă',
  accelerata: 'Accelerată',
};

const emptyForm = {
  name: '',
  inventoryNumber: '',
  category: CATEGORIES[0],
  acquisitionDate: new Date().toISOString().slice(0, 10),
  value: '',
  usefulLifeMonths: '60',
  method: 'liniara',
};

const ron = (cents: number) =>
  new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format((cents || 0) / 100);

export default function AssetForm() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const valueCents = Math.round((Number(form.value) || 0) * 100);
  const months = Math.max(1, Math.round(Number(form.usefulLifeMonths) || 1));
  const monthlyEstimate = valueCents > 0 ? Math.round(valueCents / months) : 0;

  const save = async () => {
    setError('');
    if (!form.name.trim()) { setError('Numele e obligatoriu.'); return; }
    if (valueCents <= 0) { setError('Valoarea trebuie să fie mai mare ca 0.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/mijloace-fixe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          inventoryNumber: form.inventoryNumber.trim() || null,
          category: form.category,
          acquisitionDate: form.acquisitionDate || null,
          valueCents,
          usefulLifeMonths: months,
          method: form.method,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Eroare la salvare.'); return; }
      window.location.reload();
    } catch {
      setError('Eroare de conexiune.');
    } finally {
      setBusy(false);
    }
  };

  const inputCls = 'rounded-xl bg-white/5 text-white placeholder:text-[#7C9AB4] border-0 focus:ring-2 focus:ring-[#E1FB15]/40 hover:border-0';
  const selectCls = `${inputCls} [color-scheme:dark]`;
  const btnPrimary = 'rounded-full bg-[#E1FB15] text-[#0A2238] font-bold hover:bg-[#D2EA0E] shadow-none';
  const btnSecondary = 'rounded-full bg-white/10 text-white font-semibold hover:bg-white/15 border-0';

  if (!open) {
    return (
      <Button className={btnPrimary} onClick={() => { setForm({ ...emptyForm }); setOpen(true); }}>
        <Plus className="w-4 h-4" /> Adaugă mijloc fix
      </Button>
    );
  }

  return (
    <Card className="bg-white/5 border-0 rounded-2xl shadow-none hover:shadow-none hover:translate-y-0">
      <CardContent className="p-4 sm:p-5 space-y-4">
        <h3 className="text-[18px] font-bold text-white">Mijloc fix nou</h3>
        {error && <p className="text-[14px] text-[#DC4B41]">{error}</p>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label className="mb-1.5 block text-[13px] font-medium text-[#9FB8CC]">Denumire</Label>
            <Input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ex. Autoutilitară Ford Transit" />
          </div>
          <div>
            <Label className="mb-1.5 block text-[13px] font-medium text-[#9FB8CC]">Număr inventar</Label>
            <Input className={inputCls} value={form.inventoryNumber} onChange={(e) => setForm({ ...form, inventoryNumber: e.target.value })} placeholder="ex. MF-0001" />
          </div>
          <div>
            <Label className="mb-1.5 block text-[13px] font-medium text-[#9FB8CC]">Categorie</Label>
            <Select className={selectCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <div>
            <Label className="mb-1.5 block text-[13px] font-medium text-[#9FB8CC]">Data achiziției</Label>
            <Input className={`${inputCls} [color-scheme:dark]`} type="date" value={form.acquisitionDate} onChange={(e) => setForm({ ...form, acquisitionDate: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1.5 block text-[13px] font-medium text-[#9FB8CC]">Valoare de intrare (RON)</Label>
            <Input className={`${inputCls} [color-scheme:dark]`} type="number" step="any" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="0.00" />
          </div>
          <div>
            <Label className="mb-1.5 block text-[13px] font-medium text-[#9FB8CC]">Durata de amortizare (luni)</Label>
            <Input className={`${inputCls} [color-scheme:dark]`} type="number" min={1} value={form.usefulLifeMonths} onChange={(e) => setForm({ ...form, usefulLifeMonths: e.target.value })} placeholder="60" />
          </div>
          <div>
            <Label className="mb-1.5 block text-[13px] font-medium text-[#9FB8CC]">Metodă de amortizare</Label>
            <Select className={selectCls} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              {Object.entries(METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </div>
        </div>

        {valueCents > 0 && (
          <p className="text-[14px] text-[#9FB8CC]">
            Amortizare lunară estimată (liniară): <strong className="text-white tabular-nums">{ron(monthlyEstimate)}</strong> pe {months} luni.
          </p>
        )}

        <div className="flex gap-2">
          <Button className={btnPrimary} disabled={busy} onClick={save}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvează'}
          </Button>
          <Button className={btnSecondary} variant="outline" onClick={() => setOpen(false)}>Renunță</Button>
        </div>
      </CardContent>
    </Card>
  );
}
