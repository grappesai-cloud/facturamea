import * as React from 'react';
import { cn } from '../../lib/utils';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-12 px-4 rounded-xl border-2 border-dashed border-[#E8E8E4] bg-[#FAFAF8]/50',
        className
      )}
    >
      {icon && (
        <div className="w-14 h-14 rounded-full bg-white border border-[#E8E8E4] flex items-center justify-center mb-4 text-[#A8A8A4]">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-[#0A0A0A] mb-1">{title}</h3>
      {description && <p className="text-sm text-[#6B6B68] max-w-md mb-4">{description}</p>}
      {action}
    </div>
  );
}
