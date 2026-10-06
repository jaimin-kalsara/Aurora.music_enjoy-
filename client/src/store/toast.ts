import { create } from 'zustand';

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'error';
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, kind?: Toast['kind']) => void;
  dismiss: (id: number) => void;
}

const DURATION = 2600;
let seq = 0;

/** Count down only while the page is visible, so a toast fired in a background tab is still seen. */
function whenVisibleFor(ms: number, done: () => void) {
  let remaining = ms;
  let started = Date.now();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const run = () => {
    started = Date.now();
    timer = setTimeout(finish, remaining);
  };
  const onVisibility = () => {
    if (document.hidden) {
      if (timer) clearTimeout(timer);
      timer = null;
      remaining -= Date.now() - started;
    } else if (!timer) {
      run();
    }
  };
  const finish = () => {
    document.removeEventListener('visibilitychange', onVisibility);
    done();
  };
  document.addEventListener('visibilitychange', onVisibility);
  if (!document.hidden) run();
}

export const useToast = create<ToastState>()((set) => ({
  toasts: [],
  push: (message, kind = 'info') => {
    const id = ++seq;
    // Same message twice in a row (e.g. rapid likes) replaces the old one instead of stacking.
    set((s) => ({ toasts: [...s.toasts.filter((t) => t.message !== message).slice(-2), { id, message, kind }] }));
    whenVisibleFor(DURATION, () => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })));
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = (message: string, kind: Toast['kind'] = 'info') => useToast.getState().push(message, kind);
