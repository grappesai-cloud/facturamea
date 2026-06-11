import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  locale?: 'ro' | 'en';
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const messages = {
  ro: {
    title: 'A apărut o eroare',
    description: 'Componenta nu a putut fi afișată. Reîncarcă pagina sau încearcă din nou.',
    retry: 'Reîncarcă',
  },
  en: {
    title: 'Something went wrong',
    description: 'This component failed to render. Reload the page or try again.',
    retry: 'Reload',
  },
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    const m = messages[this.props.locale ?? 'ro'];
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-white border border-red-200 flex items-center justify-center mx-auto mb-3 text-red-500">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h3 className="font-semibold text-red-900 mb-1">{m.title}</h3>
        <p className="text-sm text-red-700 mb-4">{m.description}</p>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-red-200 text-red-700 hover:bg-red-100 text-sm font-medium"
        >
          <RefreshCw className="w-4 h-4" /> {m.retry}
        </button>
      </div>
    );
  }
}
