import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { EASE_OUT } from '../utils/motion';

export interface SheetAction {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  image?: string;
  actions: SheetAction[];
}

/**
 * Glass bottom sheet for per-item actions. The backdrop and the sheet are siblings: if the sheet
 * sat inside the fading backdrop, that ancestor's opacity would cut its blur off mid-animation.
 */
export function ActionSheet({ open, onClose, title, subtitle, image, actions }: Props) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return createPortal(
    <>
      <AnimatePresence>
        {open && (
        <motion.div
          key="backdrop"
          className="sheet-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        />
        )}
      </AnimatePresence>
      <AnimatePresence>
      {open && (
        <motion.div
          key="sheet"
          className="sheet glass thick"
          role="menu"
          aria-label={typeof title === 'string' ? `Actions for ${title}` : 'Actions'}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 30, transition: { duration: 0.18, ease: EASE_OUT } }}
          transition={{ type: 'spring', duration: 0.4, bounce: 0 }}
          drag={reduceMotion ? false : 'y'}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0.04, bottom: 0.8 }}
          onDragEnd={(_, info) => {
            if (info.offset.y > 80 || (info.velocity.y > 500 && info.offset.y > 16)) onClose();
          }}
        >
          <div className="sheet-grip" aria-hidden />
          {(title || image) && (
            <div className="sheet-head">
              {image && <img src={image} alt="" />}
              <div style={{ minWidth: 0 }}>
                {title && (
                  <div className="sheet-title truncate" dir="auto">
                    {title}
                  </div>
                )}
                {subtitle && (
                  <div className="sheet-sub truncate" dir="auto">
                    {subtitle}
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="sheet-actions">
            {actions.map((a) => (
              <button
                key={a.label}
                type="button"
                role="menuitem"
                className={`sheet-action ${a.destructive ? 'destructive' : ''}`}
                onClick={() => {
                  onClose();
                  a.onSelect();
                }}
              >
                {a.icon && <span className="sheet-icon">{a.icon}</span>}
                {a.label}
              </button>
            ))}
          </div>
        </motion.div>
      )}
      </AnimatePresence>
    </>,
    document.body,
  );
}
