import { useEffect, useState } from 'react';
import { Loader2, Trash2, UserPlus } from 'lucide-react';

type Role = 'owner' | 'accountant' | 'operator' | 'viewer';

interface Member {
  userId: string;
  name: string;
  email: string;
  platformId: string;
  isActive: boolean | null;
  role: Role;
  roleLabel: string;
  isSelf: boolean;
}

const ROLE_LABELS: Record<Role, string> = {
  owner: 'Administrator',
  accountant: 'Contabil',
  operator: 'Operator',
  viewer: 'Vizualizare',
};
const ROLE_ORDER: Role[] = ['owner', 'accountant', 'operator', 'viewer'];

const inputCls = 'w-full rounded-xl bg-white/5 px-4 py-2.5 text-[14px] text-white placeholder:text-[#7C9AB4] border-0 focus:outline-none focus:ring-2 focus:ring-[#E1FB15]/40';
const labelCls = 'block text-[13px] font-medium text-[#9FB8CC] mb-1.5';

export default function TeamManager({ canManage }: { canManage: boolean }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('operator');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState<{ code: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings/team');
      const data = await res.json();
      setMembers(data.members || []);
    } catch {
      setMembers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim() || !email.trim()) { setError('Nume și email obligatorii'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/settings/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), role }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.code) { setJoinCode({ code: data.code, name: name.trim() }); setCopied(false); }
        setName(''); setEmail(''); setRole('operator');
        await load();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Eroare la adăugare');
      }
    } catch {
      setError('Eroare de conectare');
    } finally {
      setSubmitting(false);
    }
  };

  const changeRole = async (userId: string, newRole: Role) => {
    setBusyId(userId);
    try {
      const res = await fetch(`/api/settings/team/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        setMembers((prev) => prev.map((m) => (m.userId === userId ? { ...m, role: newRole, roleLabel: ROLE_LABELS[newRole] } : m)));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Eroare la schimbarea rolului');
      }
    } catch {
      alert('Eroare de conectare');
    } finally {
      setBusyId(null);
    }
  };

  const removeMember = async (userId: string) => {
    if (!confirm('Sigur vrei să elimini acest membru?')) return;
    setBusyId(userId);
    try {
      const res = await fetch(`/api/settings/team/${userId}`, { method: 'DELETE' });
      if (res.ok) {
        setMembers((prev) => prev.filter((m) => m.userId !== userId));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Eroare la ștergere');
      }
    } catch {
      alert('Eroare de conectare');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {canManage && (
        <div className="bg-white/5 rounded-2xl p-6">
          <h3 className="font-semibold text-white text-[14px] mb-4 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-[#E1FB15]" /> Adaugă membru
          </h3>
          {error && (
            <div className="mb-4 px-4 py-3 bg-[#DC4B41]/15 border-0 rounded-xl text-[13px] text-[#DC4B41]">{error}</div>
          )}
          <form onSubmit={addMember} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Nume *</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Email *</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputCls} />
              </div>
            </div>
            <div className="sm:max-w-xs">
              <label className={labelCls}>Rol</label>
              <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={inputCls}>
                {ROLE_ORDER.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#E1FB15] text-[#0A2238] hover:bg-[#D2EA0E] disabled:opacity-60 font-bold text-[14px] transition-colors">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Adaugă membru
            </button>
          </form>

          {joinCode && (
            <div className="mt-5 p-4 rounded-2xl bg-[#0A2238] text-white">
              <p className="text-[13px] font-semibold">Cod de acces pentru {joinCode.name || 'membru'}</p>
              <p className="text-[12px] text-[#9FB8CC] mt-0.5">Trimite-i acest cod (WhatsApp, în persoană). Intră pe <span className="font-mono">facturamea.com/auth/membru</span>, îl introduce și își setează parola. Nu e nevoie de email.</p>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 px-4 py-3 rounded-xl bg-white/10 text-[20px] font-mono tracking-[3px] font-bold text-[#E1FB15]">{joinCode.code}</code>
                <button
                  type="button"
                  onClick={() => { navigator.clipboard?.writeText(joinCode.code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); }}
                  className="px-4 py-3 rounded-xl bg-[#E1FB15] text-[#0A2238] text-[13px] font-bold hover:bg-[#D2EA0E] transition-colors"
                >{copied ? 'Copiat!' : 'Copiază'}</button>
                <button type="button" onClick={() => setJoinCode(null)} className="px-3 py-3 rounded-xl bg-white/10 text-white text-[13px] hover:bg-white/20 transition-colors">Închide</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-white/5 rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/10">
          <h3 className="text-[14px] font-semibold text-white">Membrii echipei ({members.length})</h3>
        </div>
        {loading ? (
          <div className="px-5 py-12 flex items-center justify-center text-[#9FB8CC]">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : members.length === 0 ? (
          <div className="px-5 py-12 text-center text-[14px] text-[#9FB8CC]">Niciun membru încă.</div>
        ) : (
          <div className="divide-y divide-white/10">
            {members.map((m) => (
              <div key={m.userId} className="px-5 py-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-white truncate">
                    {m.name}
                    {m.isSelf && <span className="ml-2 text-[11px] text-[#7C9AB4] font-normal">(tu)</span>}
                  </p>
                  <p className="text-[12px] text-[#9FB8CC] truncate">{m.email} · <span className="font-mono">{m.platformId}</span></p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {canManage && !m.isSelf ? (
                    <select
                      value={m.role}
                      disabled={busyId === m.userId}
                      onChange={(e) => changeRole(m.userId, e.target.value as Role)}
                      className="px-3 py-1.5 bg-white/5 border-0 rounded-lg text-[12px] text-white focus:outline-none focus:ring-2 focus:ring-[#E1FB15]/40 transition-colors disabled:opacity-60"
                    >
                      {ROLE_ORDER.map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/10 text-[#9FB8CC]">{m.roleLabel}</span>
                  )}
                  {canManage && !m.isSelf && (
                    <button
                      onClick={() => removeMember(m.userId)}
                      disabled={busyId === m.userId}
                      className="p-1.5 text-[#DC4B41] hover:bg-white/10 rounded-lg transition-colors disabled:opacity-60"
                      title="Elimină membru"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
