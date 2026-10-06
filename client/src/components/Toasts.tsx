import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useToast } from '../store/toast';

export function Toasts() {
  const toasts = useToast((s) => s.toasts);
  const reduceMotion = useReducedMotion();
  // Enter from below, leave the same way; a spring so a burst of toasts retargets instead of restarting.
  // y/scale (not a transform string) so they compose with the layout animation when the stack reflows.
  const from = reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.97 };
  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout="position"
            className={`toast glass ${t.kind}`}
            initial={from}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.18 } }}
            transition={{ type: 'spring', duration: 0.4, bounce: 0 }}
          >
            <span className="toast-text">{t.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
