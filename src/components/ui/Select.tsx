import * as React from 'react';
import { cn } from '../../lib/utils';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, style, ...props }, ref) => {
    return (
      <select
        className={cn(
          'flex h-11 w-full appearance-none rounded-xl border-0 bg-white/5 px-4 py-2.5 pr-10 text-sm text-white transition-all duration-200 [color-scheme:dark]',
          'focus:outline-none focus:ring-2 focus:ring-[#E1FB15]/40',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%237C9AB4%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E")',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 14px center',
          backgroundSize: '18px',
          ...style,
        }}
        ref={ref}
        {...props}
      >
        {children}
      </select>
    );
  },
);
Select.displayName = 'Select';

export { Select };
