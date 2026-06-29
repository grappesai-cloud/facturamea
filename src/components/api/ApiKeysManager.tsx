import { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Plus, X, Loader2, KeyRound, Copy, Check, AlertTriangle } from 'lucide-react';
import { Select } from '../ui/Select';

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  mode: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string | null;
}

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Bucharest' }).format(new Date(iso));
  } catch {
    return '—';
  }
};

export default function ApiKeysManager() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'live' | 'test'>('live');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const refresh = async () => {
    try {
      const r = await fetch('/api/settings/api-keys');
      const d = await r.json();
      setKeys(d.keys || []);
    } catch {
      setError('Nu am putut încărca cheile.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const create = async () => {
    if (!name.trim()) { setError('Dă un nume cheii.'); return; }
    setBusy(true); setError(''); setNewKey(null); setCopied(false);
    try {
      const r = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), mode }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Eroare la generarea cheii.'); return; }
      setNewKey(d.key);
      setName('');
      setCreating(false);
      await refresh();
    } catch {
      setError('Eroare de conexiune.');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm('Revoci această cheie? Aplicațiile care o folosesc nu vor mai putea accesa API-ul.')) return;
    setError('');
    try {
      const r = await fetch(`/api/settings/api-keys/${id}`, { method: 'DELETE' });
      if (!r.ok) { const d = await r.json(); setError(d.error || 'Eroare la revocare.'); return; }
      await refresh();
    } catch {
      setError('Eroare de conexiune.');
    }
  };

  const copyKey = async () => {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked — utilizatorul poate copia manual */ }
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-[#DC4B41]">{error}</p>}

      {/* Raw key reveal — shown exactly once after creation. */}
      {newKey && (
        <Card className="bg-white/5 border-0 shadow-none">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-[#E8A33C] mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-white">Copiază cheia acum</p>
                <p className="text-xs text-[#A8BED2] mt-0.5">Din motive de securitate, nu o vom mai afișa. Dacă o pierzi, generează una nouă.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2.5 bg-black/40 text-white text-xs rounded-xl font-mono break-all">{newKey}</code>
              <Button size="sm" variant={copied ? 'success' : 'dark'} onClick={copyKey} className="bg-white/10 text-white hover:bg-white/15 rounded-full border-0 shadow-none">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copiat' : 'Copiază'}
              </Button>
            </div>
            <Button size="sm" variant="outline" onClick={() => setNewKey(null)} className="bg-white/10 border-0 text-white hover:bg-white/15 rounded-full">Am salvat cheia</Button>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-[#A8BED2]">Chei pentru autentificarea cererilor către <span className="font-mono text-white">/api/v1</span>.</p>
        {!creating && <Button onClick={() => { setCreating(true); setError(''); }} className="bg-[#E1FB15] text-[#07090f] hover:bg-[#D2EA0E] rounded-full font-bold shadow-none"><Plus className="w-4 h-4 mr-1" /> Cheie nouă</Button>}
      </div>

      {/* Create form */}
      {creating && (
        <Card className="bg-white/5 border-0 shadow-none">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold text-white">Cheie API nouă</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <Label className="mb-1 block text-xs text-[#A8BED2]">Nume *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Integrare ERP, Zapier..." className="bg-white/5 border border-white/[0.12] text-white placeholder:text-[#8FA6BC] focus:border-[#E1FB15]/50 focus:ring-2 focus:ring-[#E1FB15]/30 hover:border-white/25 transition" />
              </div>
              <div>
                <Label className="mb-1 block text-xs text-[#A8BED2]">Mod</Label>
                <Select
                  value={mode}
                  onChange={(e) => setMode(e.target.value === 'test' ? 'test' : 'live')}
                  className="w-full"
                >
                  <option value="live">Live</option>
                  <option value="test">Test</option>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={busy || !name.trim()} onClick={create} className="bg-[#E1FB15] text-[#07090f] hover:bg-[#D2EA0E] rounded-full font-bold shadow-none">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Generează cheia'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setCreating(false); setName(''); setError(''); }} className="bg-white/10 border-0 text-white hover:bg-white/15 rounded-full">Renunță</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* List */}
      <Card className="bg-white/5 border-0 shadow-none">
        <CardContent className="p-0">
          {loading ? (
            <p className="text-sm text-[#A8BED2] p-6 text-center"><Loader2 className="w-4 h-4 animate-spin inline mr-1" /> Se încarcă…</p>
          ) : keys.length === 0 ? (
            <div className="p-8 text-center">
              <KeyRound className="w-6 h-6 text-[#8FA6BC] mx-auto mb-2" />
              <p className="text-sm text-[#A8BED2]">Nu ai nicio cheie API. Creează prima cheie pentru a folosi API-ul.</p>
            </div>
          ) : (
            <>
            <ul className="divide-y divide-white/5">
              {(showAll ? keys : keys.slice(0, 3)).map((k) => {
                const revoked = !!k.revokedAt;
                return (
                  <li key={k.id} className="group flex items-center gap-3 px-4 py-3 hover:bg-white/10 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-sm font-semibold truncate ${revoked ? 'text-[#8FA6BC] line-through' : 'text-white'}`}>{k.name}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${k.mode === 'test' ? 'bg-[#E8A33C]/15 text-[#E8A33C]' : 'bg-[#34A0A4]/15 text-[#34A0A4]'}`}>{k.mode === 'test' ? 'test' : 'live'}</span>
                        {revoked && <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-[#DC4B41]/15 text-[#DC4B41]">revocată</span>}
                      </div>
                      <p className="text-xs text-[#A8BED2] truncate mt-0.5">
                        <span className="font-mono">{k.prefix}…</span>
                        <span className="mx-2">·</span>
                        creată {fmtDate(k.createdAt)}
                        <span className="mx-2">·</span>
                        folosită {fmtDate(k.lastUsedAt)}
                      </p>
                    </div>
                    {!revoked && (
                      <button onClick={() => revoke(k.id)} title="Revocă cheia" className="w-8 h-8 rounded-full grid place-items-center text-[#A8BED2] hover:text-[#DC4B41] hover:bg-white/10 transition-colors opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {keys.length > 3 && (
              <button type="button" onClick={() => setShowAll((s) => !s)} className="mt-3 mb-3 mx-auto w-fit flex items-center px-5 py-2.5 rounded-full bg-[#E1FB15] text-[#07090f] text-[13.5px] font-semibold hover:bg-[#D2EA0E] active:scale-95 transition-all">
                {showAll ? 'Arată mai puțin' : `Vezi toate (${keys.length})`}
              </button>
            )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
