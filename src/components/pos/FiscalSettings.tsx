import { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Loader2, ShieldCheck, RefreshCw, FileText } from 'lucide-react';
import {
  getFiscalConfig, saveFiscalConfig, listPrinters, getPrinterStatus, printZReport,
  DEFAULT_TAX_GROUPS, type FiscalConfig, type FpPrinterInfo,
} from '../../lib/fiscal';

const VAT_RATES = ['21', '11', '9', '5', '0'];

export default function FiscalSettings() {
  const [cfg, setCfg] = useState<FiscalConfig | null>(null);
  const [printers, setPrinters] = useState<FpPrinterInfo[]>([]);
  const [busy, setBusy] = useState<'' | 'scan' | 'status' | 'z'>('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setCfg(getFiscalConfig()); }, []);

  if (!cfg) return null;
  const set = (patch: Partial<FiscalConfig>) => { setCfg({ ...cfg, ...patch }); setSaved(false); };

  const scan = async () => {
    setBusy('scan'); setMsg(null);
    try {
      const list = await listPrinters(cfg.baseUrl);
      setPrinters(list);
      if (list.length === 0) setMsg({ kind: 'err', text: 'Niciun aparat detectat de driver.' });
      else {
        if (!cfg.printerId) set({ printerId: list[0].id });
        setMsg({ kind: 'ok', text: `${list.length} aparat(e) detectat(e).` });
      }
    } catch (e: any) {
      setMsg({ kind: 'err', text: e?.message || 'Driverul nu răspunde. Rulează ErpNet.FP la casă.' });
    } finally { setBusy(''); }
  };

  const test = async () => {
    setBusy('status'); setMsg(null);
    try {
      const st = await getPrinterStatus(cfg.baseUrl, cfg.printerId);
      const ok = st.ok === true || (st as any).ok === 'true';
      setMsg({ kind: ok ? 'ok' : 'err', text: ok ? 'Aparatul fiscal răspunde. Conexiune OK.' : 'Aparatul a raportat o problemă (vezi statusul).' });
    } catch (e: any) {
      setMsg({ kind: 'err', text: e?.message || 'Nu mă pot conecta la aparat.' });
    } finally { setBusy(''); }
  };

  const zReport = async () => {
    if (!confirm('Emit raportul Z (închidere zi) pe aparatul fiscal?')) return;
    setBusy('z'); setMsg(null);
    try {
      await printZReport(cfg);
      setMsg({ kind: 'ok', text: 'Raport Z emis.' });
    } catch (e: any) {
      setMsg({ kind: 'err', text: e?.message || 'Eroare la raportul Z.' });
    } finally { setBusy(''); }
  };

  const save = () => { saveFiscalConfig(cfg); setSaved(true); setMsg({ kind: 'ok', text: 'Setări salvate pe acest dispozitiv.' }); };

  const inputCls = 'bg-white/10 text-white border-0 [color-scheme:dark] placeholder:text-[#7C9AB4] focus:ring-2 focus:ring-[#E1FB15]/40';

  return (
    <div className="max-w-2xl space-y-4">
      <Card className="bg-white/5 border-0 shadow-none rounded-2xl">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#E1FB15]" />
              <div>
                <p className="font-semibold text-white text-sm">Aparat fiscal (ErpNet.FP)</p>
                <p className="text-xs text-[#9FB8CC]">Emite bon fiscal real prin driverul local. Setări per dispozitiv.</p>
              </div>
            </div>
            <button
              onClick={() => set({ enabled: !cfg.enabled })}
              className={`relative h-7 w-12 rounded-full transition-colors ${cfg.enabled ? 'bg-[#2E9E6A]' : 'bg-white/15'}`}
              aria-pressed={cfg.enabled}
            >
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${cfg.enabled ? 'left-6' : 'left-1'}`} />
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label className="mb-1 block text-xs text-[#9FB8CC]">URL driver (server local)</Label>
              <Input className={inputCls} value={cfg.baseUrl} onChange={(e) => set({ baseUrl: e.target.value })} placeholder="http://localhost:8001" />
            </div>
            <div>
              <Label className="mb-1 block text-xs text-[#9FB8CC]">Operator</Label>
              <Input className={inputCls} value={cfg.operator || ''} onChange={(e) => set({ operator: e.target.value })} placeholder="1" />
            </div>
            <div>
              <Label className="mb-1 block text-xs text-[#9FB8CC]">Parolă operator</Label>
              <Input className={inputCls} value={cfg.operatorPassword || ''} onChange={(e) => set({ operatorPassword: e.target.value })} placeholder="0000" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs text-[#9FB8CC]">Aparat detectat</Label>
              <Button variant="outline" className="h-7 rounded-full bg-white/10 text-white border-0 text-xs hover:bg-white/15" disabled={busy === 'scan'} onClick={scan}>
                {busy === 'scan' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><RefreshCw className="w-3.5 h-3.5 mr-1" /> Caută aparate</>}
              </Button>
            </div>
            {printers.length > 0 ? (
              <select
                className={`w-full rounded-md px-3 py-2 text-sm ${inputCls}`}
                value={cfg.printerId}
                onChange={(e) => set({ printerId: e.target.value })}
              >
                {printers.map((p) => (
                  <option key={p.id} value={p.id}>{p.id} {p.model ? `· ${p.model}` : ''} {p.fiscalMemorySerialNumber ? `· ${p.fiscalMemorySerialNumber}` : ''}</option>
                ))}
              </select>
            ) : (
              <Input className={inputCls} value={cfg.printerId} onChange={(e) => set({ printerId: e.target.value })} placeholder="id aparat (apasă „Caută aparate”)" />
            )}
          </div>

          <div>
            <Label className="mb-1 block text-xs text-[#9FB8CC]">Mapare cote TVA → grupa de taxă pe aparat</Label>
            <p className="text-[11px] text-[#7C9AB4] mb-2">Depinde de fiscalizarea aparatului. Implicit RO: A=standard, B=redusă, C=5%, D=0%.</p>
            <div className="grid grid-cols-5 gap-2">
              {VAT_RATES.map((rate) => (
                <div key={rate}>
                  <Label className="mb-1 block text-[11px] text-[#9FB8CC] text-center">{rate}%</Label>
                  <Input
                    className={`${inputCls} text-center px-1`}
                    type="number" min={1} max={8}
                    value={cfg.taxGroups[rate] ?? DEFAULT_TAX_GROUPS[rate] ?? 1}
                    onChange={(e) => set({ taxGroups: { ...cfg.taxGroups, [rate]: Number(e.target.value) || 1 } })}
                  />
                </div>
              ))}
            </div>
          </div>

          {msg && (
            <p className={`text-sm ${msg.kind === 'ok' ? 'text-[#2E9E6A]' : 'text-[#DC4B41]'}`}>{msg.text}</p>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button className="rounded-full bg-[#E1FB15] text-[#0A2238] font-bold hover:bg-[#D2EA0E]" onClick={save}>
              {saved ? 'Salvat ✓' : 'Salvează'}
            </Button>
            <Button variant="outline" className="rounded-full bg-white/10 text-white border-0 hover:bg-white/15" disabled={busy === 'status'} onClick={test}>
              {busy === 'status' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Testează conexiunea'}
            </Button>
            <Button variant="outline" className="rounded-full bg-white/10 text-white border-0 hover:bg-white/15" disabled={busy === 'z'} onClick={zReport}>
              {busy === 'z' ? <Loader2 className="w-4 h-4 animate-spin" /> : <><FileText className="w-4 h-4 mr-1" /> Raport Z</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-[#7C9AB4] leading-relaxed">
        Driverul <a href="https://github.com/erpnet/ErpNet.FP" target="_blank" rel="noopener" className="text-[#9FB8CC] underline">ErpNet.FP</a> trebuie instalat și pornit pe calculatorul de la casă, conectat la aparatul fiscal (Datecs, Daisy, Tremol, Eltrade). Cât timp e dezactivat, POS-ul salvează doar bon intern, fără efect fiscal.
      </p>
    </div>
  );
}
