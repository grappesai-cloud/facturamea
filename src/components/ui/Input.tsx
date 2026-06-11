import * as React from 'react';
import { cn } from '../../lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-11 w-full rounded-xl border border-[#E8E8E4] bg-white px-4 py-2.5 text-sm text-[#0A0A0A] transition-all duration-200',
          'placeholder:text-[#A8A8A4]',
          'focus:outline-none focus:ring-2 focus:ring-[#0A0A0A]/15 focus:border-[#0A0A0A]',
          'hover:border-[#A8A8A4]',
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[#FAFAF8]',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
