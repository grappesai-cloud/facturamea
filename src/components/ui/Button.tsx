import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        default: 'bg-[#FF5C00] text-white shadow-sm hover:bg-[#E04E00] active:scale-[0.98] focus-visible:ring-[#FF5C00]',
        dark: 'bg-[#0A0A0A] text-white shadow-sm hover:bg-[#2E2E2C] active:scale-[0.98] focus-visible:ring-[#0A0A0A]',
        destructive: 'bg-[#B91C1C] text-white shadow-sm hover:bg-[#991818] active:scale-[0.98] focus-visible:ring-[#B91C1C]',
        outline: 'border border-[#E8E8E4] bg-white text-[#0A0A0A] hover:border-[#0A0A0A] hover:bg-[#FAFAF8] active:scale-[0.98] focus-visible:ring-[#0A0A0A]',
        secondary: 'bg-[#F0F0EC] text-[#0A0A0A] hover:bg-[#E5E2DA] active:scale-[0.98] focus-visible:ring-[#0A0A0A]',
        ghost: 'text-[#3D3D3A] hover:bg-[#F0F0EC] hover:text-[#0A0A0A] focus-visible:ring-[#0A0A0A]',
        link: 'text-[#0A0A0A] underline-offset-4 hover:underline focus-visible:ring-[#0A0A0A]',
        success: 'bg-[#15803D] text-white shadow-sm hover:bg-[#126632] active:scale-[0.98] focus-visible:ring-[#15803D]',
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
