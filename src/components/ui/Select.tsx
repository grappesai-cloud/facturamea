import * as React from 'react';
import * as RadixSelect from '@radix-ui/react-select';
import { cn } from '../../lib/utils';

export interface SelectProps {
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (e: { target: { value: string } }) => void;
  className?: string;
  children?: React.ReactNode;
  disabled?: boolean;
  placeholder?: string;
  name?: string;
  id?: string;
  style?: React.CSSProperties;
  /** Shows an actionable row inside the dropdown (always, but especially when empty). */
  onAddNew?: () => void;
  addNewLabel?: string;
  /** Message shown when there are no selectable options. */
  emptyLabel?: string;
}

// Global "only one popover open at a time" coordination — a Select opening
// closes any open DatePicker (and vice-versa) and any other open Select.
export const FM_POPOVER_EVENT = 'fm-popover-open';
export function broadcastPopoverOpen(id: string) {
  window.dispatchEvent(new CustomEvent(FM_POPOVER_EVENT, { detail: id }));
}

interface ParsedOption { value: string; label: string; disabled?: boolean }
interface Parsed { placeholder: string; items: ParsedOption[] }

function parseChildren(children: React.ReactNode, explicitPlaceholder?: string): Parsed {
  const items: ParsedOption[] = [];
  let placeholder = explicitPlaceholder ?? '';

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type === 'option') {
      const p = child.props as { value?: string | number; children?: React.ReactNode; disabled?: boolean };
      const label = String(p.children ?? p.value ?? '');
      // Native <select>: an option with no `value` attr uses its text as the value.
      // Only an EXPLICIT empty-string value means "placeholder / clear".
      const hasValue = p.value !== undefined && p.value !== null;
      const val = hasValue ? String(p.value) : label;
      if (val === '') { if (!placeholder) placeholder = label; return; }
      items.push({ value: val, label, disabled: p.disabled });
    } else if (child.type === 'optgroup') {
      const gp = child.props as { label?: string; children?: React.ReactNode };
      React.Children.forEach(gp.children, (gc) => {
        if (!React.isValidElement(gc)) return;
        const p = gc.props as { value?: string | number; children?: React.ReactNode; disabled?: boolean };
        const label = String(p.children ?? p.value ?? '');
        const hasValue = p.value !== undefined && p.value !== null;
        const val = hasValue ? String(p.value) : label;
        if (val === '') return;
        items.push({ value: val, label, disabled: p.disabled });
      });
    }
  });

  return { placeholder, items };
}

const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
  ({ value, defaultValue, onChange, className, children, disabled, placeholder, name, id, style, onAddNew, addNewLabel, emptyLabel }, ref) => {
    const strValue = value !== undefined ? String(value) : undefined;
    const strDefault = defaultValue !== undefined ? String(defaultValue) : undefined;
    const { placeholder: parsedPlaceholder, items } = parseChildren(children, placeholder);
    const effectivePlaceholder = placeholder ?? parsedPlaceholder;
    const selectedLabel = items.find((o) => o.value === strValue)?.label;

    const myId = React.useId();
    const [open, setOpen] = React.useState(false);
    // Close this dropdown when any other popover (Select or DatePicker) opens.
    React.useEffect(() => {
      const onOther = (e: Event) => { if ((e as CustomEvent).detail !== myId) setOpen(false); };
      window.addEventListener(FM_POPOVER_EVENT, onOther);
      return () => window.removeEventListener(FM_POPOVER_EVENT, onOther);
    }, [myId]);

    return (
      <RadixSelect.Root
        value={strValue}
        defaultValue={strDefault}
        onValueChange={(val) => onChange?.({ target: { value: val } })}
        disabled={disabled}
        name={name}
        open={open}
        onOpenChange={(o) => { setOpen(o); if (o) broadcastPopoverOpen(myId); }}
      >
        <RadixSelect.Trigger
          ref={ref}
          id={id}
          style={style}
          className={cn(
            'fm-select-trigger flex h-11 w-full items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-sm transition-all duration-150',
            'focus:outline-none focus:ring-2 focus:ring-[#E1FB15]/40',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
        >
          <RadixSelect.Value placeholder={effectivePlaceholder}>
            <span className="truncate block">{selectedLabel ?? effectivePlaceholder}</span>
          </RadixSelect.Value>
          <RadixSelect.Icon className="fm-select-muted shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </RadixSelect.Icon>
        </RadixSelect.Trigger>

        <RadixSelect.Portal>
          <RadixSelect.Content
            className="fm-select-content z-[9999] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl"
            style={{
              fontFamily: "'Outfit',ui-sans-serif,system-ui,sans-serif",
              // Stay anchored below the trigger and shrink to the space available
              // instead of flipping upward (which read as a "jump up" glitch).
              maxHeight: 'min(260px, var(--radix-select-content-available-height, 260px))',
            }}
            position="popper"
            side="bottom"
            sideOffset={6}
            avoidCollisions={false}
          >
            <RadixSelect.ScrollUpButton className="fm-select-muted flex items-center justify-center h-7">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 15-6-6-6 6" /></svg>
            </RadixSelect.ScrollUpButton>
            <RadixSelect.Viewport className="p-1.5">
              {items.map((opt, i) => (
                <RadixSelect.Item
                  key={`${i}-${opt.value}`}
                  value={opt.value}
                  disabled={opt.disabled}
                  className={cn(
                    'fm-select-item relative flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer select-none outline-none',
                    'data-[disabled]:opacity-40 data-[disabled]:cursor-not-allowed',
                  )}
                >
                  <RadixSelect.ItemText>{opt.label}</RadixSelect.ItemText>
                  <RadixSelect.ItemIndicator className="shrink-0">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 13l4 4L19 7" /></svg>
                  </RadixSelect.ItemIndicator>
                </RadixSelect.Item>
              ))}
              {items.length === 0 && !onAddNew && (
                <div className="fm-select-muted px-3 py-3 text-sm text-center">{emptyLabel ?? 'Nicio opțiune'}</div>
              )}
              {onAddNew && (
                <button
                  type="button"
                  onClick={() => { setOpen(false); onAddNew(); }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold text-[#E1FB15] hover:bg-[#E1FB15]/10 transition-colors outline-none',
                    items.length > 0 && 'mt-1 border-t border-white/10 rounded-t-none',
                  )}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" /></svg>
                  {addNewLabel ?? 'Adaugă'}
                </button>
              )}
            </RadixSelect.Viewport>
            <RadixSelect.ScrollDownButton className="fm-select-muted flex items-center justify-center h-7">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
            </RadixSelect.ScrollDownButton>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
    );
  },
);
Select.displayName = 'Select';

export { Select };
