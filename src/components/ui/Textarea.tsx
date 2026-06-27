import * as React from 'react';
import { cn } from '../../lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[100px] w-full rounded-xl border-0 bg-white/5 px-4 py-3 text-sm text-white transition-all duration-200',
          'placeholder:text-[#8FA6BC]',
          'focus:outline-none focus:ring-2 focus:ring-[#E1FB15]/40',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'resize-none',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export { Textarea };
