import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { BottomSheet } from '../ui/BottomSheet';
import SuppliersManager from './SuppliersManager';

// "Furnizori" as a popup (replaces the standalone page). Opens via the button,
// or automatically when arriving at /app/cheltuieli?furnizori=1 (old page link).
export default function FurnizoriSheet() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('furnizori') === '1') setOpen(true);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 text-white text-[14px] font-semibold hover:bg-white/15 transition-colors"
      >
        <Building2 className="w-4 h-4" /> Furnizori
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} cardClassName="sm:max-w-[760px]">
        <div className="px-4 sm:px-6 pt-2 pb-6">
          <h2 className="text-[20px] font-bold text-white mb-4">Furnizori</h2>
          <SuppliersManager />
        </div>
      </BottomSheet>
    </>
  );
}
