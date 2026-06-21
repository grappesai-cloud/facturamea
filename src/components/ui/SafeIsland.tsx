import type { ComponentType } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

export function safeIsland<P extends object>(Inner: ComponentType<P>, locale?: 'ro' | 'en') {
  function Safe(props: P) {
    return (
      <ErrorBoundary locale={locale}>
        <Inner {...props} />
      </ErrorBoundary>
    );
  }
  Safe.displayName = `Safe(${Inner.displayName || Inner.name || 'Component'})`;
  return Safe;
}
