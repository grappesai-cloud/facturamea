// Gives the active company identity and the switch-company dropdown.
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
      <div className="group w-full flex items-center rounded-2xl text-[16px] text-[#D7E5F0] hover:bg-white/[0.07] transition-colors">
        {/* Firma name → Date firmă page (combined) */}
        <a href="/app/setari/companie" className="flex items-center gap-3.5 flex-1 min-w-0 px-3 py-3 hover:text-white transition-colors">
          <Building2 className="w-6 h-6 shrink-0 text-[#8AA0B4] group-hover:text-[#D9ED92] transition-colors" />
          <span className="flex-1 min-w-0">
            <span className="block truncate text-left leading-tight">{currentCompanyName}</span>
            <span className="block text-[12px] text-[#7E97AC] leading-tight">Date firmă</span>
          </span>
        </a>
        {/* Chevron → switch company */}
        <button
          onClick={() => { setOpen(!open); if (!open) load(); }}
          aria-label="Schimbă compania"
          className="shrink-0 self-stretch px-3.5 text-[#7E97AC] hover:text-white transition-colors"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 right-0 mt-1 bg-[#0B2236] rounded-2xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.7)] ring-1 ring-white/10 py-1 z-50 max-h-72 overflow-y-auto">
          <div className="px-3 py-2 border-b border-white/10">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[#7C9AB4] font-semibold">Companie activă</p>
            <p className="text-[13px] font-semibold text-white mt-0.5 truncate">{currentCompanyName}</p>
          </div>

          {loading && (
            <div className="flex justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-[#7C9AB4]" />
            </div>
          )}

          {!loading && items.length === 0 && (
            <p className="px-3 py-3 text-[11px] text-[#9FB8CC] leading-snug">
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
                      isCurrent ? 'bg-white/10' : 'hover:bg-white/5'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-white truncate">{m.name}</p>
                      <p className="text-[10px] uppercase tracking-wide text-[#7C9AB4] mt-0.5">{m.role}{m.is_default && ' · default'}</p>
                    </div>
                    {isCurrent && <Check className="w-4 h-4 text-[#D9ED92] shrink-0" />}
                    {switching === m.company_id && <Loader2 className="w-4 h-4 animate-spin text-[#9FB8CC] shrink-0" />}
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
