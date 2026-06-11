import * as React from 'react';
import { cn } from '../../lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[100px] w-full rounded-xl border border-[#E8E8E4] bg-white px-4 py-3 text-sm text-[#0A0A0A] shadow-sm transition-all duration-200',
          'placeholder:text-[#A8A8A4]',
          'focus:outline-none focus:ring-2 focus:ring-[#FF5C00]/40 focus:border-[#FF5C00]',
          'hover:border-[#A8A8A4]',
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[#FAFAF8]',
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
