import { useEffect, useRef, useState } from 'react';

// Lightweight canvas signature pad. Captures mouse + touch input,
// outputs base64 PNG. No deps.
//
// Usage:
//   <SignaturePad
//     orderId="..."
//     party="sender"
//     onSigned={(hash) => ...}
//   />

export default function SignaturePad({
  orderId,
  party,
  defaultName = '',
  endpoint,
  extraFields,
  onSigned,
}: {
  // Legacy mode (order-bound): pass orderId; the component POSTs to
  // /api/orders/{orderId}/sign-cmr. New callers (e-CMR module) pass
  // `endpoint` directly and skip orderId.
  orderId?: string;
  party: 'sender' | 'carrier' | 'receiver' | 'recipient';
  defaultName?: string;
  endpoint?: string;
  // Additional fields merged into the POST body (e.g. signedByRole).
  extraFields?: Record<string, unknown>;
  onSigned?: (hash: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [empty, setEmpty] = useState(true);
  const [name, setName] = useState(defaultName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [signedHash, setSignedHash] = useState<string | null>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    // Retina sharpness
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * dpr;
    c.height = rect.height * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0A2238';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, rect.width, rect.height);
  }, []);

  const ptFromEvent = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    if ('touches' in e) {
      const t = e.touches[0] || e.changedTouches[0];
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    setEmpty(false);
    const { x, y } = ptFromEvent(e);
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const { x, y } = ptFromEvent(e);
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const end = () => setIsDrawing(false);

  const clear = () => {
    const c = canvasRef.current!;
    const ctx = c.getContext('2d')!;
    const rect = c.getBoundingClientRect();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, rect.width, rect.height);
    setEmpty(true);
    setSignedHash(null);
  };

  const submit = async () => {
    if (empty) { setError('Te rog semnează în casetă'); return; }
    if (!name.trim()) { setError('Numele este obligatoriu'); return; }
    setError('');
    setSubmitting(true);
    try {
      const dataUrl = canvasRef.current!.toDataURL('image/png');
      const url = endpoint ?? (orderId ? `/api/orders/${orderId}/sign-cmr` : null);
      if (!url) { setError('Endpoint lipsă'); return; }
      const payload = endpoint
        ? { party, signaturePng: dataUrl, signedByName: name.trim(), ...(extraFields ?? {}) }
        : { party, signaturePng: dataUrl, signedByName: name.trim() };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Eroare');
      setSignedHash(data.hash);
      onSigned?.(data.hash);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare');
    } finally {
      setSubmitting(false);
    }
  };

  if (signedHash) {
    return (
      <div className="p-5 bg-white border border-[#15803D]/30 rounded-xl">
        <p className="text-[13px] font-semibold text-[#0A2238]">Semnătură înregistrată ✓</p>
        <p className="text-[11px] text-[#46627A] mt-1">Hash SHA-256: <code className="font-mono">{signedHash.slice(0, 16)}…</code></p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[12px] font-medium text-[#0A2238] mb-1.5">Nume semnatar</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ion Popescu"
          className="w-full px-4 py-2.5 bg-white border border-[#E3EAF1] rounded-xl text-[14px] focus:border-[#0A2238] focus:outline-none transition-colors"
        />
      </div>
      <div>
        <label className="block text-[12px] font-medium text-[#0A2238] mb-1.5">Semnătură</label>
        <div className="border border-[#E3EAF1] rounded-xl overflow-hidden">
          <canvas
            ref={canvasRef}
            onMouseDown={start} onMouseMove={draw} onMouseUp={end} onMouseLeave={end}
            onTouchStart={start} onTouchMove={draw} onTouchEnd={end}
            className="w-full h-[180px] touch-none"
            style={{ cursor: 'crosshair' }}
          />
        </div>
        <button type="button" onClick={clear} className="mt-1.5 text-[12px] text-[#46627A] hover:text-[#1A759F] transition-colors">
          ↻ Şterge
        </button>
      </div>
      {error && <p className="text-[12px] text-[#B91C1C]">{error}</p>}
      <button
        onClick={submit}
        disabled={submitting || empty}
        className="px-5 py-2.5 bg-[#1A759F] hover:bg-[#168AAD] disabled:bg-[#1A759F]/40 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-[13px] transition-colors"
      >
        {submitting ? 'Se înregistrează...' : 'Confirmă semnătura'}
      </button>
    </div>
  );
}
