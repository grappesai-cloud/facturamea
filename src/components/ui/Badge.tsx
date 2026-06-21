import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-white/10 text-white',
        secondary: 'bg-white/10 text-[#9FB8CC]',
        success: 'bg-[#2E9E6A]/15 text-[#2E9E6A]',
        warning: 'bg-[#E8A33C]/15 text-[#E8A33C]',
        danger: 'bg-[#DC4B41]/15 text-[#DC4B41]',
        info: 'bg-[#34A0A4]/15 text-[#34A0A4]',
        outline: 'bg-white/5 text-[#9FB8CC]',
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
