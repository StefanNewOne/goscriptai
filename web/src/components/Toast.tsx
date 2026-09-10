// Toast — transient confirmation of an action (Design Brief §8). Provider +
// useToast hook; toasts auto-dismiss. `signal` is never used here (a toast is
// feedback, not a decision-for-you) — only ok / neutral / fail tones.
import { createContext, useCallback, useContext, useRef, useState } from 'react';

type ToastTone = 'ok' | 'fail' | 'neutral';
interface ToastItem {
  id: number;
  text: string;
  tone: ToastTone;
}

const ToastContext = createContext<(text: string, tone?: ToastTone) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

const TONE_CLASS: Record<ToastTone, string> = {
  ok: 'border-ok/40 text-ok',
  fail: 'border-fail/40 text-fail',
  neutral: 'border-rule text-ink',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const push = useCallback((text: string, tone: ToastTone = 'neutral') => {
    const id = ++counter.current;
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-control border bg-sheet px-4 py-2 text-14 shadow-float ${TONE_CLASS[t.tone]}`}
            role="status"
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
