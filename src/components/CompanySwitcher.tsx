import { useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, Loader2 } from 'lucide-react';

interface Membership {
  company_id: string;
  name: string;
  role: string;
  is_default: boolean;
}

export default function CompanySwitcher({ currentCompanyId, currentCompanyName }: {
  currentCompanyId: string | null;
  currentCompanyName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const load = async () => {
    if (items.length > 0) return;
    setLoading(true);
    try {
      const res = await fetch('/api/companies/switch');
      const data = await res.json();
      setItems(data.results || []);
    } finally {
      setLoading(false);
    }
  };

  const switchTo = async (companyId: string) => {
    setSwitching(companyId);
    try {
      const res = await fetch('/api/companies/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        const data = await res.json();
        alert(data.error);
        setSwitching(null);
      }
    } catch (err: any) {
      alert(err.message);
      setSwitching(null);
    }
  };

  // Hide entirely if user has only 1 (default) membership and it's the current
  const showSwitcher = items.length > 1 || (currentCompanyName && items.length > 0);
  // Always render the trigger button — only hide dropdown if there's nothing meaningful to show
  if (!currentCompanyName) return null;

  return (
    <div className="relative w-full" ref={ref}>
      <button
        onClick={() => { setOpen(!open); if (!open) load(); }}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl text-[13px] font-medium text-[#0A0A0A] hover:bg-[#FAFAF8] transition-colors"
      >
        <Building2 className="w-4 h-4 text-[#6B6B68] shrink-0" />
        <span className="flex-1 min-w-0 truncate text-left">{currentCompanyName}</span>
        <ChevronDown className={`w-3 h-3 text-[#6B6B68] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-[#E8E8E4] py-1 z-50 max-h-72 overflow-y-auto">
          <div className="px-3 py-2 border-b border-[#E8E8E4]">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[#8A8A85] font-semibold">Companie activă</p>
            <p className="text-[13px] font-semibold text-[#0A0A0A] mt-0.5 truncate">{currentCompanyName}</p>
          </div>

          {loading && (
            <div className="flex justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-[#A8A8A4]" />
            </div>
          )}

          {!loading && items.length === 0 && (
            <p className="px-3 py-3 text-[11px] text-[#6B6B68] leading-snug">
              Ești membru într-o singură companie.
            </p>
          )}

          {!loading && items.length > 0 && (
            <div className="py-1">
              {items.map((m) => {
                const isCurrent = m.company_id === currentCompanyId;
                return (
                  <button
                    key={m.company_id}
                    onClick={() => !isCurrent && switchTo(m.company_id)}
                    disabled={isCurrent || switching === m.company_id}
                    className={`flex items-center justify-between gap-2 w-full px-3 py-2 text-[13px] text-left transition-colors ${
                      isCurrent ? 'bg-[#F0F0EC]' : 'hover:bg-[#FAFAF8]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-[#0A0A0A] truncate">{m.name}</p>
                      <p className="text-[10px] uppercase tracking-wide text-[#8A8A85] mt-0.5">{m.role}{m.is_default && ' · default'}</p>
                    </div>
                    {isCurrent && <Check className="w-4 h-4 text-[#0A0A0A] shrink-0" />}
                    {switching === m.company_id && <Loader2 className="w-4 h-4 animate-spin text-[#6B6B68] shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
