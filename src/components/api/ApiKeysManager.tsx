import { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Plus, Trash2, Loader2, KeyRound, Copy, Check, AlertTriangle } from 'lucide-react';

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
    return new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso));
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
      {error && <p className="text-sm text-[#B91C1C]">{error}</p>}

      {/* Raw key reveal — shown exactly once after creation. */}
      {newKey && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-[#FF5C00] mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-[#0A0A0A]">Copiază cheia acum</p>
                <p className="text-xs text-[#6B6B68] mt-0.5">Din motive de securitate, nu o vom mai afișa. Dacă o pierzi, generează una nouă.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2.5 bg-[#0A0A0A] text-[#E8E8E4] text-xs rounded-xl font-mono break-all">{newKey}</code>
              <Button size="sm" variant={copied ? 'success' : 'dark'} onClick={copyKey}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copiat' : 'Copiază'}
              </Button>
            </div>
            <Button size="sm" variant="outline" onClick={() => setNewKey(null)}>Am salvat cheia</Button>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-[#6B6B68]">Chei pentru autentificarea cererilor către <span className="font-mono text-[#0A0A0A]">/api/v1</span>.</p>
        {!creating && <Button onClick={() => { setCreating(true); setError(''); }}><Plus className="w-4 h-4 mr-1" /> Cheie nouă</Button>}
      </div>

      {/* Create form */}
      {creating && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold text-[#0A0A0A]">Cheie API nouă</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <Label className="mb-1 block text-xs">Nume *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Integrare ERP, Zapier..." />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Mod</Label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value === 'test' ? 'test' : 'live')}
                  className="flex h-11 w-full rounded-xl border border-[#E8E8E4] bg-white px-4 py-2.5 text-sm text-[#0A0A0A] focus:outline-none focus:ring-2 focus:ring-[#0A0A0A]/15 focus:border-[#0A0A0A]"
                >
                  <option value="live">Live</option>
                  <option value="test">Test</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={busy || !name.trim()} onClick={create}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Generează cheia'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setCreating(false); setName(''); setError(''); }}>Renunță</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* List */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-sm text-[#6B6B68] p-6 text-center"><Loader2 className="w-4 h-4 animate-spin inline mr-1" /> Se încarcă…</p>
          ) : keys.length === 0 ? (
            <div className="p-8 text-center">
              <KeyRound className="w-6 h-6 text-[#A8A8A4] mx-auto mb-2" />
              <p className="text-sm text-[#6B6B68]">Nu ai nicio cheie API. Creează prima cheie pentru a folosi API-ul.</p>
            </div>
          ) : (
            <ul className="divide-y divide-[#E8E8E4]">
              {keys.map((k) => {
                const revoked = !!k.revokedAt;
                return (
                  <li key={k.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[#FAFAF8] transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-sm font-semibold truncate ${revoked ? 'text-[#A8A8A4] line-through' : 'text-[#0A0A0A]'}`}>{k.name}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${k.mode === 'test' ? 'bg-[#FEF3C7] text-[#92400E]' : 'bg-[#DBEAFE] text-[#1E3A8A]'}`}>{k.mode === 'test' ? 'test' : 'live'}</span>
                        {revoked && <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-[#FDECEC] text-[#B91C1C]">revocată</span>}
                      </div>
                      <p className="text-xs text-[#6B6B68] truncate mt-0.5">
                        <span className="font-mono">{k.prefix}…</span>
                        <span className="mx-2">·</span>
                        creată {fmtDate(k.createdAt)}
                        <span className="mx-2">·</span>
                        folosită {fmtDate(k.lastUsedAt)}
                      </p>
                    </div>
                    {!revoked && (
                      <button onClick={() => revoke(k.id)} title="Revocă cheia" className="p-1.5 text-[#A8A8A4] hover:text-[#B91C1C]">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
