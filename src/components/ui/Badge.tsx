import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-[#0A0A0A] text-white',
        secondary: 'bg-[#F0F0EC] text-[#0A0A0A]',
        success: 'bg-[#CDD2BB] text-[#15803D]',
        warning: 'bg-[#E8DCBC] text-[#B45309]',
        danger: 'bg-[#E2C5B7] text-[#B91C1C]',
        info: 'bg-[#D7DEE6] text-[#1E40AF]',
        outline: 'border border-[#E8E8E4] text-[#3D3D3A]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
