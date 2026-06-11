import * as React from 'react';
import { cn } from '../../lib/utils';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <select
        className={cn(
          'flex h-11 w-full appearance-none rounded-xl border border-[#E8E8E4] bg-white px-4 py-2.5 text-sm text-[#0A0A0A] shadow-sm transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-[#FF5C00]/40 focus:border-[#FF5C00]',
          'hover:border-[#A8A8A4]',
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[#FAFAF8]',
          'bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23627d98%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E")] bg-[length:20px] bg-[right_12px_center] bg-no-repeat pr-10',
          className
        )}
        ref={ref}
        {...props}
      >
        {children}
      </select>
    );
  }
);
Select.displayName = 'Select';

export { Select };
