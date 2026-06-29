import { useRef, useState, type ReactNode } from 'react';
import { UploadCloud, FileText } from 'lucide-react';

interface DropzoneProps {
  /** Called with the chosen file(s). Single-file pickers get the first file. */
  onFiles: (files: File[]) => void;
  /** `accept` attribute forwarded to the hidden <input>. */
  accept?: string;
  /** Allow selecting / dropping multiple files. Default false. */
  multiple?: boolean;
  /** Name of the currently selected file, shown inside the box. */
  fileName?: string;
  /** Main helper line. */
  title?: string;
  /** Secondary helper line (accepted formats, size limit…). */
  hint?: ReactNode;
  /** `capture` attribute (e.g. "environment") for mobile camera. */
  capture?: 'user' | 'environment';
  disabled?: boolean;
  className?: string;
}

/**
 * Reusable drag-and-drop dropzone. Dashed rounded box that highlights on
 * drag-over, shows the selected file name, and falls back to click-to-browse
 * (works on mobile via tap). It only surfaces the chosen File(s) — callers keep
 * their own upload/submit logic.
 */
export function Dropzone({
  onFiles,
  accept,
  multiple = false,
  fileName,
  title = 'Trage fișierul aici sau apasă pentru a alege',
  hint,
  capture,
  disabled = false,
  className = '',
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const emit = (list: FileList | null | undefined) => {
    if (!list || list.length === 0) return;
    const files = multiple ? Array.from(list) : [list[0]];
    onFiles(files);
  };

  const openPicker = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPicker();
    }
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={openPicker}
      onKeyDown={onKeyDown}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragOver(false);
      }}
      onDrop={(e) => {
        if (disabled) return;
        e.preventDefault();
        setDragOver(false);
        emit(e.dataTransfer.files);
      }}
      className={`flex flex-col items-center justify-center gap-2 px-4 py-8 text-center rounded-2xl border-2 border-dashed transition-colors outline-none ${
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
      } ${
        dragOver
          ? 'border-[#E1FB15]/60 bg-[#E1FB15]/[0.06]'
          : 'border-white/15 hover:border-[#E1FB15]/50 hover:bg-white/[0.04] focus-visible:border-[#E1FB15]/50 focus-visible:bg-white/[0.04]'
      } ${className}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        capture={capture}
        className="hidden"
        onChange={(e) => {
          emit(e.target.files);
          // Reset so picking the same file again re-fires onChange.
          e.target.value = '';
        }}
      />

      {fileName ? (
        <>
          <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-[#2E9E6A]/15">
            <FileText className="w-5 h-5 text-[#76C893]" />
          </span>
          <span className="flex items-center gap-2 max-w-full text-[13px] font-semibold text-white">
            <span className="truncate max-w-[260px]">{fileName}</span>
          </span>
          <span className="text-[11px] text-[#8FA6BC]">Apasă pentru a schimba fișierul</span>
        </>
      ) : (
        <>
          <span
            className={`flex items-center justify-center w-11 h-11 rounded-xl transition-colors ${
              dragOver ? 'bg-[#E1FB15]/20' : 'bg-white/5'
            }`}
          >
            <UploadCloud className={`w-5 h-5 ${dragOver ? 'text-[#E1FB15]' : 'text-[#8FA6BC]'}`} />
          </span>
          <span className="text-[13px] font-medium text-white">{title}</span>
          {hint && <span className="text-[11px] text-[#8FA6BC]">{hint}</span>}
        </>
      )}
    </div>
  );
}

export default Dropzone;
