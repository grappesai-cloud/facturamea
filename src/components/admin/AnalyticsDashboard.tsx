import { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Skeleton, SkeletonStats } from '../ui/Skeleton';

interface Stats {
  totals: { users: number; companies: number; freight: number; orders: number; incidents: number };
  last30: { newUsers: number; newOrders: number };
  ordersPerMonth: { month: string; count: number }[];
  topLoadingCountries: { country: string; count: number }[];
  orderStatuses: { status: string; count: number }[];
}

function Bar({ value, max, label, suffix }: { value: number; max: number; label: string; suffix?: string }) {
  const pct = max > 0 ? Math.max((value / max) * 100, 2) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="w-32 shrink-0 truncate text-[#0A0A0A]">{label}</div>
      <div className="flex-1 h-6 bg-[#F0F0EC] rounded-xl overflow-hidden">
        <div className="h-full bg-[#FF5C00]" style={{ width: `${pct}%` }} />
      </div>
      <div className="w-16 text-right text-[#0A0A0A] font-medium tabular-nums">{value.toLocaleString()}{suffix}</div>
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  open: 'Deschisă', accepted: 'Acceptată', loaded: 'Încărcată',
  in_transit: 'În tranzit', delivered: 'Livrată', closed: 'Închisă',
};

export default function AnalyticsDashboard() {
  const [data, setData] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/analytics')
      .then((r) => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl">{error}</div>;
  if (!data) return <div className="space-y-4"><SkeletonStats /><Skeleton className="h-48 w-full" /></div>;

  const maxOrders = Math.max(...data.ordersPerMonth.map((m) => m.count), 1);
  const maxCountry = Math.max(...data.topLoadingCountries.map((c) => c.count), 1);
  const maxStatus = Math.max(...data.orderStatuses.map((s) => s.count), 1);

  return (
    <div className="space-y-6 text-[#0A0A0A]">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-[#6B6B68]">Utilizatori</div><div className="text-2xl font-bold">{data.totals.users}</div><div className="text-[11px] text-emerald-600">+{data.last30.newUsers} (30 zile)</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-[#6B6B68]">Companii</div><div className="text-2xl font-bold">{data.totals.companies}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-[#6B6B68]">Marfă postată</div><div className="text-2xl font-bold">{data.totals.freight}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-[#6B6B68]">Comenzi</div><div className="text-2xl font-bold">{data.totals.orders}</div><div className="text-[11px] text-emerald-600">+{data.last30.newOrders} (30 zile)</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-[#6B6B68]">Incidente</div><div className="text-2xl font-bold">{data.totals.incidents}</div></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-5">
          <h3 className="font-semibold mb-3">Comenzi pe lună (ultimele 6)</h3>
          <div className="space-y-2">
            {data.ordersPerMonth.length === 0 ? (
              <div className="text-sm text-[#6B6B68]">Date insuficiente.</div>
            ) : data.ordersPerMonth.map((m) => (
              <Bar key={m.month} label={m.month} value={m.count} max={maxOrders} />
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold mb-3">Top țări încărcare (30 zile)</h3>
            <div className="space-y-2">
              {data.topLoadingCountries.length === 0 ? (
                <div className="text-sm text-[#6B6B68]">Date insuficiente.</div>
              ) : data.topLoadingCountries.map((c) => (
                <Bar key={c.country} label={c.country || '—'} value={c.count} max={maxCountry} />
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold mb-3">Comenzi după status</h3>
            <div className="space-y-2">
              {data.orderStatuses.length === 0 ? (
                <div className="text-sm text-[#6B6B68]">Date insuficiente.</div>
              ) : data.orderStatuses.map((s) => (
                <Bar key={s.status} label={STATUS_LABELS[s.status] ?? s.status} value={s.count} max={maxStatus} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
