// Yields a reusable bottom-sheet: slide-up panel on mobile, centered modal on desktop.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Reusable bottom-sheet (slide-up on mobile, centered modal on desktop) with the
 * same drag-to-dismiss feel as the app menus: drag the grab handle or pull from the
 * top on touch devices. Esc + backdrop click + X button also close.
 */
export function BottomSheet({ open, onClose, children, cardClassName }: { open: boolean; onClose: () => void; children: ReactNode; cardClassName?: string }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
    } else {
      setShown(false);
      const t = window.setTimeout(() => setMounted(false), 420);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  // Once mounted, flip to the open resting state AND explicitly play the entrance
  // with the Web Animations API. A CSS transition is unreliable for a freshly
  // mounted element (no painted "from" frame → the card snaps open); .animate()
  // always slides up (mobile) / scale-fades (desktop), the same as the app menus.
  useEffect(() => {
    if (!mounted) return;
    setShown(true);
    const card = cardRef.current;
    if (card && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const mobile = window.matchMedia('(max-width: 639.5px)').matches;
      card.parentElement?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease' });
      card.animate(
        mobile
          ? [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }]
          : [{ transform: 'translateY(16px) scale(.96)', opacity: 0 }, { transform: 'translateY(0) scale(1)', opacity: 1 }],
        { duration: mobile ? 440 : 340, easing: 'cubic-bezier(.22,1,.36,1)' },
      );
    }
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.classList.add('sheet-lock');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.documentElement.classList.remove('sheet-lock'); window.removeEventListener('keydown', onKey); };
  }, [mounted]);

  useEffect(() => {
    // Swipe/drag-to-close gestures disabled — closing is via X button, backdrop, Esc only.
    const GESTURES_DISABLED = true;
    if (GESTURES_DISABLED) return;
    if (!mounted) return;
    const card = cardRef.current; const handle = handleRef.current;
    if (!card) return;
    const threshold = () => Math.min(110, card.offsetHeight * 0.2);
    const snap = () => { card.classList.remove('dragging'); card.style.transform = ''; };
    const swipeOut = () => { card.classList.remove('dragging'); card.style.transform = 'translateY(100%)'; onClose(); };

    // Pointer drag on handle — touch devices only (not mouse/trackpad)
    const isMouse = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;
    let pd = false, psy = 0, pdy = 0;
    const onPDown = (e: PointerEvent) => { pd = true; psy = e.clientY; pdy = 0; card.classList.add('dragging'); handle?.setPointerCapture?.(e.pointerId); };
    const onPMove = (e: PointerEvent) => { if (!pd) return; pdy = Math.max(0, e.clientY - psy); card.style.transform = `translateY(${pdy}px)`; };
    const onPUp = () => { if (!pd) return; pd = false; if (pdy > threshold()) swipeOut(); else snap(); };
    if (!isMouse && handle) {
      handle.addEventListener('pointerdown', onPDown);
      handle.addEventListener('pointermove', onPMove);
      handle.addEventListener('pointerup', onPUp);
      handle.addEventListener('pointercancel', onPUp);
    }

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

    return () => {
      if (!isMouse && handle) {
        handle.removeEventListener('pointerdown', onPDown);
        handle.removeEventListener('pointermove', onPMove);
        handle.removeEventListener('pointerup', onPUp);
        handle.removeEventListener('pointercancel', onPUp);
      }
      card.removeEventListener('touchstart', onTStart);
      card.removeEventListener('touchmove', onTMove);
      card.removeEventListener('touchend', onTEnd);
      card.removeEventListener('touchcancel', onTEnd);
    };
  }, [mounted]);

  if (!mounted || typeof document === 'undefined') return null;
  // Portal to <body> so `position: fixed` is relative to the VIEWPORT, not to a
  // transformed/filtered ancestor (e.g. the dashboard shell). Without this, the
  // overlay sizes itself to the page content and the card lands off-screen below
  // the fold — the "backdrop shows but the sheet doesn't open" bug.
  return createPortal(
    <div className={`app-sheet ${shown ? 'is-open' : ''} fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70`} onClick={onClose} style={{ fontFamily: "'Outfit',ui-sans-serif,system-ui,sans-serif" }}>
      <div ref={cardRef} className={`app-sheet-card relative w-full max-h-[80vh] sm:max-h-[86vh] overflow-y-auto bg-[#07090f] rounded-t-[28px] sm:rounded-[28px] shadow-[0_-12px_60px_-12px_rgba(0,0,0,0.7)] sm:shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)] ${cardClassName ?? 'sm:max-w-[520px]'}`} onClick={(e) => e.stopPropagation()}>
        {/* X sits on the same level as the sheet's title (top-right) */}
        <button type="button" onClick={onClose} aria-label="Închide" className="absolute top-4 right-4 z-10 fm-close-btn">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}
