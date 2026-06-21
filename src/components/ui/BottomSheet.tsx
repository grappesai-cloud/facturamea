import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Reusable bottom-sheet (slide-up on mobile, centered modal on desktop) with the
 * same drag-to-dismiss feel as the app menus: drag the grab handle, pull from the
 * top, or trackpad-overscroll up to close. Esc + backdrop click also close.
 */
export function BottomSheet({ open, onClose, children, cardClassName }: { open: boolean; onClose: () => void; children: ReactNode; cardClassName?: string }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    } else {
      setShown(false);
      const t = window.setTimeout(() => setMounted(false), 420);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.classList.add('sheet-lock');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.documentElement.classList.remove('sheet-lock'); window.removeEventListener('keydown', onKey); };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    const card = cardRef.current; const handle = handleRef.current;
    if (!card) return;
    const threshold = () => Math.min(110, card.offsetHeight * 0.2);
    const snap = () => { card.classList.remove('dragging'); card.style.transform = ''; };
    const swipeOut = () => { card.classList.remove('dragging'); card.style.transform = 'translateY(100%)'; onClose(); };

    let pd = false, psy = 0, pdy = 0;
    const onPDown = (e: PointerEvent) => { pd = true; psy = e.clientY; pdy = 0; card.classList.add('dragging'); handle?.setPointerCapture?.(e.pointerId); };
    const onPMove = (e: PointerEvent) => { if (!pd) return; pdy = Math.max(0, e.clientY - psy); card.style.transform = `translateY(${pdy}px)`; };
    const onPUp = () => { if (!pd) return; pd = false; if (pdy > threshold()) swipeOut(); else snap(); };
    handle?.addEventListener('pointerdown', onPDown);
    handle?.addEventListener('pointermove', onPMove);
    handle?.addEventListener('pointerup', onPUp);
    handle?.addEventListener('pointercancel', onPUp);

    let sy = 0, ss = 0, act = false, dy = 0, onH = false;
    const onTStart = (e: TouchEvent) => { if (e.touches.length !== 1) return; onH = !!handle && handle.contains(e.target as Node); sy = e.touches[0].clientY; ss = card.scrollTop; act = false; dy = 0; };
    const onTMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const d = e.touches[0].clientY - sy;
      if (!act) {
        if (onH && d > 0) { act = true; card.classList.add('dragging'); }
        else if (!onH && ss <= 0 && d > 6) { act = true; card.classList.add('dragging'); }
        else return;
      }
      dy = Math.max(0, d); card.style.transform = `translateY(${dy}px)`; if (e.cancelable) e.preventDefault();
    };
    const onTEnd = () => { if (!act) return; act = false; if (dy > threshold()) swipeOut(); else snap(); };
    card.addEventListener('touchstart', onTStart, { passive: true });
    card.addEventListener('touchmove', onTMove, { passive: false });
    card.addEventListener('touchend', onTEnd);
    card.addEventListener('touchcancel', onTEnd);

    let wdist = 0, wTimer = 0;
    const snapW = () => { wdist = 0; card.classList.remove('dragging'); card.style.transform = ''; };
    const onWheel = (e: WheelEvent) => {
      const atTop = card.scrollTop <= 0;
      const noScroll = card.scrollHeight <= card.clientHeight + 2;
      if (!(e.deltaY < 0 && (atTop || noScroll))) { if (wdist > 0) snapW(); return; }
      e.preventDefault();
      if (wdist === 0) card.classList.add('dragging');
      wdist += Math.abs(e.deltaY);
      card.style.transform = `translateY(${Math.min(wdist * 0.5, 220)}px)`;
      window.clearTimeout(wTimer);
      if (wdist > 150) { wdist = 0; swipeOut(); return; }
      wTimer = window.setTimeout(snapW, 160);
    };
    card.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      handle?.removeEventListener('pointerdown', onPDown);
      handle?.removeEventListener('pointermove', onPMove);
      handle?.removeEventListener('pointerup', onPUp);
      handle?.removeEventListener('pointercancel', onPUp);
      card.removeEventListener('touchstart', onTStart);
      card.removeEventListener('touchmove', onTMove);
      card.removeEventListener('touchend', onTEnd);
      card.removeEventListener('touchcancel', onTEnd);
      card.removeEventListener('wheel', onWheel);
      window.clearTimeout(wTimer);
    };
  }, [mounted]);

  if (!mounted) return null;
  return (
    <div className={`app-sheet ${shown ? 'is-open' : ''} fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm`} onClick={onClose} style={{ fontFamily: "'Outfit',ui-sans-serif,system-ui,sans-serif" }}>
      <div ref={cardRef} className={`app-sheet-card w-full max-h-[90vh] overflow-y-auto bg-[#0A2238] rounded-t-[28px] sm:rounded-[28px] shadow-[0_-12px_60px_-12px_rgba(0,0,0,0.7)] sm:shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)] ${cardClassName ?? 'sm:max-w-[520px]'}`} onClick={(e) => e.stopPropagation()}>
        <div ref={handleRef} className="flex justify-center pt-3.5 pb-1 touch-none select-none cursor-grab active:cursor-grabbing"><span className="w-10 h-1.5 rounded-full fm-grab" /></div>
        {children}
      </div>
    </div>
  );
}
