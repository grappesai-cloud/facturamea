import { useRef, useState } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { DatePicker } from '../ui/DatePicker';
import { Select } from '../ui/Select';
import { Camera, Upload, Loader2, Check, FileText, RotateCcw } from 'lucide-react';

// Senior-friendly receipt scanner: big "Fă o poză / Încarcă" buttons, a single
// editable confirmation form, then save to the existing expenses endpoint.

const CATEGORIES = ['utilitati', 'chirie', 'combustibil', 'servicii', 'marfa', 'salarii', 'taxe', 'altele'];
const CAT_LABELS: Record<string, string> = {
  utilitati: 'Utilități', chirie: 'Chirie', combustibil: 'Combustibil', servicii: 'Servicii',
  marfa: 'Marfă', salarii: 'Salarii', taxe: 'Taxe', altele: 'Altele',
};

interface OcrFields {
  supplierName: string | null;
  supplierCui: string | null;
  documentNumber: string | null;
  issueDate: string | null;
  netCents: number;
  vatCents: number;
  totalCents: number;
  currency: string;
  category: string | null;
}

interface FormState {
  supplierName: string;
  documentNumber: string;
  issueDate: string;
  category: string;
  net: string;   // RON (decimal string)
  vat: string;
  total: string;
}

const centsToStr = (c: number) => (c > 0 ? (c / 100).toFixed(2) : '');

function fieldsToForm(f: OcrFields): FormState {
  return {
    supplierName: f.supplierName || '',
    documentNumber: f.documentNumber || '',
    issueDate: f.issueDate || new Date().toISOString().slice(0, 10),
    category: f.category && CATEGORIES.includes(f.category) ? f.category : 'servicii',
    net: centsToStr(f.netCents),
    vat: centsToStr(f.vatCents),
    total: centsToStr(f.totalCents),
  };
}

type Phase = 'idle' | 'scanning' | 'review' | 'saving' | 'done';

export default function ReceiptScanner() {
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [fileName, setFileName] = useState('');
  const [form, setForm] = useState<FormState | null>(null);

  const reset = () => {
    setPhase('idle'); setError(''); setNote(''); setFileName(''); setForm(null);
    if (cameraInput.current) cameraInput.current.value = '';
    if (fileInput.current) fileInput.current.value = '';
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(''); setNote(''); setFileName(file.name); setPhase('scanning');

    // On the native iOS app, read images on-device with Apple Vision (free, no AI
    // cost). PDFs and the web/Android build fall through to the server OCR below.
    try {
      const { isNativeOcrAvailable, recognizeTextNative, fileToBase64 } = await import('../../lib/native-ocr');
      if (isNativeOcrAvailable() && file.type.startsWith('image/')) {
        const text = await recognizeTextNative(await fileToBase64(file));
        if (text.trim()) {
          const { parseReceiptText } = await import('../../lib/receipt-parse');
          setForm(fieldsToForm(parseReceiptText(text)));
          setNote('Am citit datele pe dispozitiv. Verifică-le și salvează.');
          setPhase('review');
          return;
        }
      }
    } catch {
      // Native OCR unavailable or failed — fall back to server OCR.
    }

    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/cheltuieli/ocr', { method: 'POST', body });
      const data = await res.json().catch(() => ({ ok: false, error: 'Răspuns invalid de la server.' }));

      if (res.status === 503) {
        setError(data.error || 'Scanarea automată nu este disponibilă momentan. Completează manual.');
        // Still let them fill the form by hand.
        setForm(fieldsToForm({ supplierName: null, supplierCui: null, documentNumber: null, issueDate: null, netCents: 0, vatCents: 0, totalCents: 0, currency: 'RON', category: null }));
        setPhase('review');
        return;
      }

      if (data.ok && data.fields) {
        setForm(fieldsToForm(data.fields as OcrFields));
        setNote('Am citit datele de pe document. Verifică-le și salvează.');
        setPhase('review');
      } else {
        setError(data.error || 'Nu am putut citi documentul. Completează datele manual.');
        setForm(fieldsToForm({ supplierName: null, supplierCui: null, documentNumber: null, issueDate: null, netCents: 0, vatCents: 0, totalCents: 0, currency: 'RON', category: null }));
        setPhase('review');
      }
    } catch {
      setError('Eroare de rețea. Completează datele manual.');
      setForm(fieldsToForm({ supplierName: null, supplierCui: null, documentNumber: null, issueDate: null, netCents: 0, vatCents: 0, totalCents: 0, currency: 'RON', category: null }));
      setPhase('review');
    }
  };

  const save = async () => {
    if (!form) return;
    const net = Math.round((Number(form.net) || 0) * 100);
    const vat = Math.round((Number(form.vat) || 0) * 100);
    const total = Math.round((Number(form.total) || 0) * 100);
    const totalCents = total > 0 ? total : net + vat;
    if (totalCents <= 0) { setError('Introdu cel puțin totalul cheltuielii.'); return; }

    setPhase('saving'); setError('');
    try {
      const payload = {
        supplierNameSnap: form.supplierName.trim() || null,
        category: form.category,
        documentType: 'bon',
        documentNumber: form.documentNumber.trim() || null,
        issueDate: form.issueDate || null,
        netCents: net,
        vatCents: vat,
        totalCents,
      };
      const res = await fetch('/api/cheltuieli/expenses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Eroare la salvare.'); setPhase('review'); return; }
      setPhase('done');
    } catch {
      setError('Eroare de conexiune.'); setPhase('review');
    }
  };

  const set = (k: keyof FormState, v: string) => setForm((f) => (f ? { ...f, [k]: v } : f));

  // --- DONE -----------------------------------------------------------------
  if (phase === 'done') {
    return (
      <Card className="bg-white/5 border-0 shadow-none">
        <CardContent className="p-8 text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-[#2E9E6A]/15 flex items-center justify-center">
            <Check className="w-8 h-8 text-[#2E9E6A]" />
          </div>
          <div>
            <h2 className="text-[20px] font-bold text-white">Cheltuiala a fost salvată</h2>
            <p className="text-[15px] text-[#A8BED2] mt-1">O găsești în lista de cheltuieli.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <Button size="lg" onClick={reset} className="bg-[#E1FB15] text-[#07090f] hover:bg-[#D2EA0E] rounded-full font-bold shadow-none"><Camera className="w-5 h-5 mr-1" /> Scanează altă chitanță</Button>
            <a href="/app/cheltuieli"><Button size="lg" variant="outline" className="bg-white/10 border-0 text-white hover:bg-white/15 rounded-full">Vezi cheltuielile</Button></a>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <input ref={cameraInput} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={onPick} />
      <input ref={fileInput} type="file" accept="image/*,application/pdf" className="hidden" onChange={onPick} />

      {/* --- UPLOAD / SCAN ---------------------------------------------------- */}
      {(phase === 'idle' || phase === 'scanning') && (
        <Card className="bg-white/5 border-0 shadow-none">
          <CardContent className="p-6 sm:p-8">
            <div className="text-center max-w-xl mx-auto">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-[#E1FB15]/15 flex items-center justify-center mb-4">
                <FileText className="w-7 h-7 text-[#E1FB15]" />
              </div>
              <h2 className="text-[20px] font-bold text-white">Fă o poză la bon sau factură</h2>
              <p className="text-[15px] text-[#A8BED2] mt-2 leading-relaxed">
                Fotografiază sau încarcă documentul. Citim automat furnizorul, numărul, data și sumele.
                Verifici și salvezi într-un singur pas.
              </p>

              {phase === 'scanning' ? (
                <div className="mt-6 flex flex-col items-center gap-3 py-4">
                  <Loader2 className="w-8 h-8 text-[#E1FB15] animate-spin" />
                  <p className="text-[15px] font-semibold text-white">Se citește documentul...</p>
                  {fileName && <p className="text-[13px] text-[#8FA6BC] truncate max-w-[260px]">{fileName}</p>}
                </div>
              ) : (
                <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                  <Button size="xl" onClick={() => cameraInput.current?.click()} className="bg-[#E1FB15] text-[#07090f] hover:bg-[#D2EA0E] rounded-full font-bold shadow-none w-full sm:w-auto">
                    <Camera className="w-6 h-6 mr-1" /> Fă o poză
                  </Button>
                  <Button size="xl" variant="outline" onClick={() => fileInput.current?.click()} className="bg-white/10 border-0 text-white hover:bg-white/15 rounded-full w-full sm:w-auto">
                    <Upload className="w-6 h-6 mr-1" /> Încarcă fișier
                  </Button>
                </div>
              )}

              {phase === 'idle' && (
                <p className="text-[13px] text-[#8FA6BC] mt-4">Acceptăm poze (JPG, PNG) și PDF-uri.</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* --- REVIEW / SAVE ---------------------------------------------------- */}
      {(phase === 'review' || phase === 'saving') && form && (
        <Card className="bg-white/5 border-0 shadow-none">
          <CardContent className="p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[18px] font-bold text-white">Verifică datele</h2>
                {fileName && <p className="text-[13px] text-[#8FA6BC] mt-0.5 truncate max-w-[280px]">{fileName}</p>}
              </div>
              <Button size="sm" variant="ghost" onClick={reset} title="Reia" className="text-[#A8BED2] hover:bg-white/10 hover:text-white rounded-full"><RotateCcw className="w-4 h-4 mr-1" /> Reia</Button>
            </div>

            {note && <p className="text-[14px] text-[#2E9E6A] bg-[#2E9E6A]/15 rounded-xl px-3.5 py-2.5">{note}</p>}
            {error && <p className="text-[14px] text-[#DC4B41] bg-[#DC4B41]/15 rounded-xl px-3.5 py-2.5">{error}</p>}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label className="mb-1.5 block text-[14px] text-[#A8BED2]">Furnizor</Label>
                <Input className="h-12 text-[16px] bg-white/5 border-0 text-white placeholder:text-[#8FA6BC] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" value={form.supplierName} onChange={(e) => set('supplierName', e.target.value)} placeholder="Numele furnizorului" />
              </div>
              <div>
                <Label className="mb-1.5 block text-[14px] text-[#A8BED2]">Număr document</Label>
                <Input className="h-12 text-[16px] bg-white/5 border-0 text-white placeholder:text-[#8FA6BC] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" value={form.documentNumber} onChange={(e) => set('documentNumber', e.target.value)} placeholder="ex: 12345" />
              </div>
              <div>
                <Label className="mb-1.5 block text-[14px] text-[#A8BED2]">Data emiterii</Label>
                <DatePicker value={form.issueDate} onChange={(v) => set('issueDate', v)} />
              </div>
              <div>
                <Label className="mb-1.5 block text-[14px] text-[#A8BED2]">Categorie</Label>
                <Select className="h-12 text-[16px] bg-white/5 border-0 text-white placeholder:text-[#8FA6BC] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" value={form.category} onChange={(e) => set('category', e.target.value)}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
                </Select>
              </div>
              <div>
                <Label className="mb-1.5 block text-[14px] text-[#A8BED2]">Total (RON)</Label>
                <Input className="h-12 text-[16px] font-semibold bg-white/5 border-0 text-white placeholder:text-[#8FA6BC] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" type="number" step="any" value={form.total} onChange={(e) => set('total', e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <Label className="mb-1.5 block text-[14px] text-[#A8BED2]">Bază fără TVA (RON)</Label>
                <Input className="h-12 text-[16px] bg-white/5 border-0 text-white placeholder:text-[#8FA6BC] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" type="number" step="any" value={form.net} onChange={(e) => set('net', e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <Label className="mb-1.5 block text-[14px] text-[#A8BED2]">TVA (RON)</Label>
                <Input className="h-12 text-[16px] bg-white/5 border-0 text-white placeholder:text-[#8FA6BC] focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]" type="number" step="any" value={form.vat} onChange={(e) => set('vat', e.target.value)} placeholder="0.00" />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <Button size="lg" disabled={phase === 'saving'} onClick={save} className="bg-[#E1FB15] text-[#07090f] hover:bg-[#D2EA0E] rounded-full font-bold shadow-none w-full sm:w-auto">
                {phase === 'saving' ? <><Loader2 className="w-5 h-5 mr-1 animate-spin" /> Se salvează...</> : <><Check className="w-5 h-5 mr-1" /> Salvează cheltuiala</>}
              </Button>
              <Button size="lg" variant="outline" disabled={phase === 'saving'} onClick={reset} className="bg-white/10 border-0 text-white hover:bg-white/15 rounded-full w-full sm:w-auto">Renunță</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
