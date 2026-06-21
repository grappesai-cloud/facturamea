import { useMemo, useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, ArrowLeft, ArrowRight } from 'lucide-react';

type Source = 'oblio' | 'smartbill' | 'fgo' | 'csv';
type Entity = 'clients' | 'products' | 'invoices';

interface TargetField {
  key: string;
  label: string;
  required?: boolean;
}

interface PreviewResponse {
  headers: string[];
  sample: Record<string, string>[];
  totalRows: number;
  truncated: boolean;
  suggestedMapping: Record<string, string>;
  targetFields: TargetField[];
}

interface CommitResponse {
  jobId: string;
  importedRows: number;
  errorRows: number;
  totalRows: number;
  truncated: boolean;
  sourceRowCount: number;
  errors: { row: number; message: string }[];
}

const SOURCES: { value: Source; label: string; note: string }[] = [
  { value: 'oblio', label: 'Oblio', note: 'Export .xlsx / .csv din Oblio' },
  { value: 'smartbill', label: 'SmartBill', note: 'Export .xlsx / .csv din SmartBill' },
  { value: 'fgo', label: 'FGO', note: 'Export .xlsx / .csv din FGO' },
  { value: 'csv', label: 'CSV / Excel generic', note: 'Orice fișier .csv sau .xlsx' },
];

const ENTITIES: { value: Entity; label: string; note: string }[] = [
  { value: 'clients', label: 'Clienți', note: 'Denumire, CUI, adresă, contact' },
  { value: 'products', label: 'Produse & servicii', note: 'Denumire, cod, preț, TVA' },
  { value: 'invoices', label: 'Facturi (istoric)', note: 'Documente emise anterior' },
];

type Step = 'setup' | 'mapping' | 'done';

export default function ImportWizard() {
  const [step, setStep] = useState<Step>('setup');
  const [source, setSource] = useState<Source>('csv');
  const [entity, setEntity] = useState<Entity>('clients');
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<CommitResponse | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requiredFields = useMemo(
    () => preview?.targetFields.filter((f) => f.required) ?? [],
    [preview],
  );
  const mappedFieldKeys = useMemo(() => new Set(Object.values(mapping).filter(Boolean)), [mapping]);
  const missingRequired = useMemo(
    () => requiredFields.filter((f) => !mappedFieldKeys.has(f.key)),
    [requiredFields, mappedFieldKeys],
  );

  const onPickFile = (f: File | null) => {
    setFile(f);
    setError(null);
  };

  const runPreview = async () => {
    if (!file) {
      setError('Alege un fișier .csv sau .xlsx.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('source', source);
      fd.append('entity', entity);
      const res = await fetch('/api/import/preview', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Eroare la citirea fișierului.');
        return;
      }
      setPreview(data);
      setMapping(data.suggestedMapping || {});
      setStep('mapping');
    } catch {
      setError('Eroare de rețea. Încearcă din nou.');
    } finally {
      setBusy(false);
    }
  };

  const setColMap = (header: string, fieldKey: string) => {
    setMapping((prev) => {
      const next = { ...prev };
      // Keep mapping 1:1 — clear any other column pointing at this field.
      if (fieldKey) {
        for (const h of Object.keys(next)) {
          if (h !== header && next[h] === fieldKey) delete next[h];
        }
        next[header] = fieldKey;
      } else {
        delete next[header];
      }
      return next;
    });
  };

  const runCommit = async () => {
    if (!file || !preview) return;
    if (missingRequired.length) {
      setError(`Mapează câmpurile obligatorii: ${missingRequired.map((f) => f.label).join(', ')}.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('source', source);
      fd.append('entity', entity);
      fd.append('mapping', JSON.stringify(mapping));
      const res = await fetch('/api/import/commit', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Eroare la import.');
        return;
      }
      setResult(data);
      setStep('done');
      // Let the page refresh its jobs list.
      window.dispatchEvent(new CustomEvent('import:done'));
    } catch {
      setError('Eroare de rețea. Încearcă din nou.');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setStep('setup');
    setFile(null);
    setPreview(null);
    setMapping({});
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="bg-white/5 rounded-2xl overflow-hidden">
      {/* Stepper header */}
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/10 text-[12px]">
        <StepBadge n={1} active={step === 'setup'} done={step !== 'setup'} label="Sursă & fișier" />
        <span className="text-[#7C9AB4]">→</span>
        <StepBadge n={2} active={step === 'mapping'} done={step === 'done'} label="Mapare coloane" />
        <span className="text-[#7C9AB4]">→</span>
        <StepBadge n={3} active={step === 'done'} done={false} label="Finalizare" />
      </div>

      <div className="p-5">
        {error && (
          <div className="mb-4 flex items-start gap-2 px-3.5 py-2.5 bg-[#DC4B41]/15 rounded-xl text-[13px] text-[#DC4B41]">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {step === 'setup' && (
          <div className="space-y-6">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#7C9AB4] mb-2.5">
                1. De unde imporți?
              </p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {SOURCES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setSource(s.value)}
                    className={`text-left p-3.5 rounded-xl transition-colors ${
                      source === s.value
                        ? 'bg-[#E1FB15]/15 ring-1 ring-[#E1FB15]/40'
                        : 'bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <span className="block text-[13px] font-semibold text-white">{s.label}</span>
                    <span className="block text-[11px] text-[#9FB8CC] mt-0.5">{s.note}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#7C9AB4] mb-2.5">
                2. Ce vrei să imporți?
              </p>
              <div className="grid sm:grid-cols-3 gap-2.5">
                {ENTITIES.map((e) => (
                  <button
                    key={e.value}
                    type="button"
                    onClick={() => setEntity(e.value)}
                    className={`text-left p-3.5 rounded-xl transition-colors ${
                      entity === e.value
                        ? 'bg-[#E1FB15]/15 ring-1 ring-[#E1FB15]/40'
                        : 'bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <span className="block text-[13px] font-semibold text-white">{e.label}</span>
                    <span className="block text-[11px] text-[#9FB8CC] mt-0.5">{e.note}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#7C9AB4] mb-2.5">
                3. Încarcă fișierul
              </p>
              <label className="flex flex-col items-center justify-center gap-2 px-4 py-8 border-2 border-dashed border-white/15 rounded-xl cursor-pointer hover:border-[#E1FB15]/50 hover:bg-white/5 transition-colors">
                <UploadCloud className="w-7 h-7 text-[#7C9AB4]" />
                {file ? (
                  <span className="flex items-center gap-2 text-[13px] font-medium text-white">
                    <FileSpreadsheet className="w-4 h-4 text-[#76C893]" />
                    {file.name}
                  </span>
                ) : (
                  <>
                    <span className="text-[13px] font-medium text-white">
                      Trage fișierul aici sau click pentru a selecta
                    </span>
                    <span className="text-[11px] text-[#7C9AB4]">Acceptăm .csv și .xlsx (max. 15 MB)</span>
                  </>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            <div className="flex justify-end">
              <Button onClick={runPreview} disabled={busy || !file} className="rounded-full bg-[#E1FB15] text-[#0A2238] font-bold hover:bg-[#D2EA0E]">
                {busy ? 'Se citește…' : 'Continuă'}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 'mapping' && preview && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] text-[#9FB8CC]">
                Am detectat <strong>{preview.headers.length}</strong> coloane și{' '}
                <strong>{preview.totalRows}</strong> rânduri. Verifică maparea:
              </p>
              {preview.truncated && (
                <span className="text-[11px] text-[#E8A33C] bg-[#E8A33C]/15 px-2 py-0.5 rounded-full">
                  Se vor importa doar primele 5000 rânduri
                </span>
              )}
            </div>

            {/* Mapping table */}
            <div className="bg-white/5 rounded-xl overflow-hidden">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-[#7C9AB4] border-b border-white/10">
                    <th className="px-4 py-2.5 font-medium">Coloană din fișier</th>
                    <th className="px-4 py-2.5 font-medium">Câmp facturamea</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.headers.map((h) => (
                    <tr key={h} className="border-b border-white/5 last:border-0">
                      <td className="px-4 py-2.5 font-medium text-white truncate max-w-[260px]">{h}</td>
                      <td className="px-4 py-2">
                        <Select
                          value={mapping[h] || ''}
                          onChange={(e) => setColMap(h, e.target.value)}
                          className="h-9 text-[13px] bg-white/10 text-white placeholder:text-[#7C9AB4] border-0 [color-scheme:dark]"
                        >
                          <option value="">— Ignoră coloana —</option>
                          {preview.targetFields.map((f) => (
                            <option key={f.key} value={f.key}>
                              {f.label}
                              {f.required ? ' *' : ''}
                            </option>
                          ))}
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {missingRequired.length > 0 && (
              <p className="text-[12px] text-[#E8A33C]">
                Câmpuri obligatorii nemapate: {missingRequired.map((f) => f.label).join(', ')}
              </p>
            )}

            {/* Sample preview */}
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#7C9AB4] mb-2">
                Previzualizare (primele {preview.sample.length} rânduri)
              </p>
              <div className="bg-white/5 rounded-xl overflow-x-auto">
                <table className="w-full text-[12px] whitespace-nowrap">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wider text-[#7C9AB4] border-b border-white/10">
                      {preview.headers.map((h) => (
                        <th key={h} className="px-3 py-2 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map((row, i) => (
                      <tr key={i} className="border-b border-white/5 last:border-0">
                        {preview.headers.map((h) => (
                          <td key={h} className="px-3 py-2 text-[#9FB8CC] truncate max-w-[180px]">
                            {row[h]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep('setup')} disabled={busy} className="rounded-full bg-white/10 text-white hover:bg-white/15">
                <ArrowLeft className="w-4 h-4" />
                Înapoi
              </Button>
              <Button onClick={runCommit} disabled={busy || missingRequired.length > 0} className="rounded-full bg-[#E1FB15] text-[#0A2238] font-bold hover:bg-[#D2EA0E]">
                {busy ? 'Se importă…' : 'Importă datele'}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 'done' && result && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              {result.importedRows > 0 ? (
                <CheckCircle2 className="w-9 h-9 text-[#76C893]" />
              ) : (
                <AlertTriangle className="w-9 h-9 text-[#E8A33C]" />
              )}
              <div>
                <h3 className="text-[16px] font-bold text-white">
                  {result.importedRows > 0 ? 'Import finalizat' : 'Niciun rând importat'}
                </h3>
                <p className="text-[13px] text-[#9FB8CC]">
                  {result.importedRows} importate · {result.errorRows} cu erori · din{' '}
                  {result.sourceRowCount} rânduri în fișier
                </p>
              </div>
            </div>

            {result.truncated && (
              <p className="text-[12px] text-[#E8A33C] bg-[#E8A33C]/15 px-3 py-2 rounded-xl">
                Fișierul depășea 5000 de rânduri. Au fost procesate doar primele 5000.
              </p>
            )}

            {result.errors.length > 0 && (
              <div className="bg-white/5 rounded-xl overflow-hidden">
                <p className="px-4 py-2 text-[11px] uppercase tracking-wider text-[#DC4B41] bg-[#DC4B41]/15 font-semibold">
                  Erori ({result.errorRows})
                </p>
                <div className="max-h-56 overflow-y-auto divide-y divide-white/5">
                  {result.errors.map((e, i) => (
                    <p key={i} className="px-4 py-1.5 text-[12px] text-[#9FB8CC]">
                      <span className="font-mono text-[#7C9AB4]">Rând {e.row}:</span> {e.message}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button variant="outline" onClick={reset} className="rounded-full bg-white/10 text-white border-0 hover:bg-white/15">
                Import nou
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StepBadge({
  n,
  active,
  done,
  label,
}: {
  n: number;
  active: boolean;
  done: boolean;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
          done
            ? 'bg-[#2E9E6A] text-white'
            : active
              ? 'bg-[#E1FB15] text-[#0A2238]'
              : 'bg-white/10 text-[#7C9AB4]'
        }`}
      >
        {done ? '✓' : n}
      </span>
      <span className={`${active ? 'text-white font-semibold' : 'text-[#7C9AB4]'}`}>{label}</span>
    </span>
  );
}
