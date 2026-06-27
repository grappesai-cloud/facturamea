import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        default: 'bg-[#E1FB15] text-[#07090f] hover:bg-[#D2EA0E] active:scale-[0.98] focus-visible:ring-[#E1FB15]/40',
        dark: 'bg-white/10 text-white hover:bg-white/15 active:scale-[0.98] focus-visible:ring-white/30',
        destructive: 'bg-[#DC4B41] text-white hover:bg-[#C23E35] active:scale-[0.98] focus-visible:ring-[#DC4B41]/40',
        outline: 'bg-white/10 text-white hover:bg-white/15 active:scale-[0.98] focus-visible:ring-white/30',
        secondary: 'bg-white/10 text-white hover:bg-white/15 active:scale-[0.98] focus-visible:ring-white/30',
        ghost: 'text-[#A8BED2] hover:bg-white/10 hover:text-white focus-visible:ring-white/30',
        link: 'text-[#E1FB15] underline-offset-4 hover:underline focus-visible:ring-[#E1FB15]/40',
        success: 'bg-[#2E9E6A] text-white hover:bg-[#27885B] active:scale-[0.98] focus-visible:ring-[#2E9E6A]/40',
      },
      size: {
        default: 'h-11 px-6 py-2.5',
        sm: 'h-9 px-4 text-xs',
        lg: 'h-12 px-8 text-base',
        xl: 'h-14 px-10 text-lg',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
