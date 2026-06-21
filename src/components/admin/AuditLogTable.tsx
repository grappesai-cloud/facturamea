import { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { SkeletonList } from '../ui/Skeleton';
import { EmptyState } from '../ui/EmptyState';
import { Activity } from 'lucide-react';

interface Row {
  id: string;
  userId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  ipAddress: string | null;
  metadata: string | null;
  createdAt: string | Date | null;
  userName: string | null;
  userEmail: string | null;
}

const ACTION_VARIANT: Record<string, any> = {
  'auth.login': 'success',
  'auth.logout': 'secondary',
  'auth.register': 'info',
  'admin.action': 'danger',
};

export default function AuditLogTable() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (action) params.set('action', action);
      params.set('page', String(page));
      const res = await fetch(`/api/admin/audit?${params}`);
      const data = await res.json();
      setRows(data.results || []);
      setTotal(data.total || 0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page]);

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4 flex items-end gap-2 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <Input placeholder="Filtru acțiune (ex. auth.login)" value={action} onChange={(e) => setAction(e.target.value)} />
          </div>
          <Button onClick={() => { setPage(1); load(); }}>Aplică</Button>
        </CardContent>
      </Card>

      {loading ? <SkeletonList count={6} /> : rows.length === 0 ? (
        <EmptyState icon={<Activity className="w-6 h-6" />} title="Niciun eveniment" description="Nu există intrări în jurnalul de audit pentru filtrele selectate." />
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-[#FAFAF8] border-b border-[#E8E8E4]">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-[#0A0A0A]">Data</th>
                  <th className="text-left px-3 py-2 font-medium text-[#0A0A0A]">User</th>
                  <th className="text-left px-3 py-2 font-medium text-[#0A0A0A]">Acțiune</th>
                  <th className="text-left px-3 py-2 font-medium text-[#0A0A0A]">Entitate</th>
                  <th className="text-left px-3 py-2 font-medium text-[#0A0A0A]">IP</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-[#E8E8E4] hover:bg-[#FAFAF8]/50">
                    <td className="px-3 py-2 text-xs text-[#6B6B68] whitespace-nowrap">{r.createdAt ? new Date(r.createdAt).toLocaleString('ro-RO') : ''}</td>
                    <td className="px-3 py-2">{r.userName ?? '—'} <span className="text-xs text-[#A8A8A4]">{r.userEmail}</span></td>
                    <td className="px-3 py-2"><Badge variant={ACTION_VARIANT[r.action] || 'outline'}>{r.action}</Badge></td>
                    <td className="px-3 py-2 text-xs text-[#3D3D3A]">{r.entityType ?? ''} {r.entityId ?? ''}</td>
                    <td className="px-3 py-2 text-xs text-[#6B6B68]">{r.ipAddress ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between text-sm text-[#6B6B68]">
        <span>{total} înregistrări</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(p - 1, 1))}>← Anterior</Button>
          <Button variant="outline" size="sm" disabled={rows.length < 50} onClick={() => setPage((p) => p + 1)}>Următor →</Button>
        </div>
      </div>
    </div>
  );
}
