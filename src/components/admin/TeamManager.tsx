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

const inputCls = 'w-full px-4 py-2.5 bg-white border border-[#E8E8E4] rounded-xl text-[14px] text-[#0A0A0A] placeholder:text-[#A8A8A4] focus:border-[#0A0A0A] focus:outline-none transition-colors';
const labelCls = 'block text-[12px] font-medium text-[#0A0A0A] mb-1.5';

export default function TeamManager({ canManage }: { canManage: boolean }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('operator');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

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
        <div className="bg-white border border-[#E8E8E4] rounded-2xl p-6">
          <h3 className="font-semibold text-[#0A0A0A] text-[14px] mb-4 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-[#FF5C00]" /> Adaugă membru
          </h3>
          {error && (
            <div className="mb-4 px-4 py-3 bg-white border border-[#B91C1C]/30 rounded-xl text-[13px] text-[#B91C1C]">{error}</div>
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
            <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#FF5C00] hover:bg-[#E04E00] disabled:opacity-60 text-white font-semibold rounded-xl text-[13px] transition-colors">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Adaugă membru
            </button>
          </form>
        </div>
      )}

      <div className="bg-white border border-[#E8E8E4] rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#F0F0EC]">
          <h3 className="text-[14px] font-semibold text-[#0A0A0A]">Membrii echipei ({members.length})</h3>
        </div>
        {loading ? (
          <div className="px-5 py-12 flex items-center justify-center text-[#6B6B68]">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : members.length === 0 ? (
          <div className="px-5 py-12 text-center text-[14px] text-[#6B6B68]">Niciun membru încă.</div>
        ) : (
          <div className="divide-y divide-[#F0F0EC]">
            {members.map((m) => (
              <div key={m.userId} className="px-5 py-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-[#0A0A0A] truncate">
                    {m.name}
                    {m.isSelf && <span className="ml-2 text-[11px] text-[#6B6B68] font-normal">(tu)</span>}
                  </p>
                  <p className="text-[12px] text-[#6B6B68] truncate">{m.email} · <span className="font-mono">{m.platformId}</span></p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {canManage && !m.isSelf ? (
                    <select
                      value={m.role}
                      disabled={busyId === m.userId}
                      onChange={(e) => changeRole(m.userId, e.target.value as Role)}
                      className="px-3 py-1.5 bg-white border border-[#E8E8E4] rounded-lg text-[12px] text-[#0A0A0A] focus:border-[#0A0A0A] focus:outline-none transition-colors disabled:opacity-60"
                    >
                      {ROLE_ORDER.map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-[#F0F0EC] text-[#6B6B68]">{m.roleLabel}</span>
                  )}
                  {canManage && !m.isSelf && (
                    <button
                      onClick={() => removeMember(m.userId)}
                      disabled={busyId === m.userId}
                      className="p-1.5 text-[#B91C1C] hover:bg-[#FDECEC] rounded-lg transition-colors disabled:opacity-60"
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
