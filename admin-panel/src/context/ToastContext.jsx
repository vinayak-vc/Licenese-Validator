import { createContext, useContext, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', persist = false) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type, persist }]);

    if (!persist) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    }
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex items-center justify-between gap-4 p-4 rounded-lg border shadow-lg transition-all min-w-[300px]',
              {
                'bg-slate-800 border-slate-700 text-slate-100': toast.type === 'info',
                'bg-emerald-900/50 border-emerald-800 text-emerald-100': toast.type === 'success',
                'bg-red-900/50 border-red-800 text-red-100': toast.type === 'error',
                'bg-amber-900/50 border-amber-800 text-amber-100': toast.type === 'warning',
              }
            )}
          >
            <p className="text-sm font-medium">{toast.message}</p>
            <button
              onClick={() => removeToast(toast.id)}
              className="p-1 rounded-md hover:bg-black/20 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
