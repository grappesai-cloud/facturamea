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
        'flex flex-col items-center justify-center text-center py-12 px-4 rounded-2xl border-2 border-dashed border-white/10 bg-white/5',
        className
      )}
    >
      {icon && (
        <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center mb-4 text-[#7C9AB4]">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-white mb-1">{title}</h3>
      {description && <p className="text-sm text-[#9FB8CC] max-w-md mb-4">{description}</p>}
      {action}
    </div>
  );
}
