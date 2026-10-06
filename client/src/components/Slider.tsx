import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { clamp } from '../utils/format';

interface Props {
  value: number;
  max: number;
  buffered?: number;
  onChange?: (v: number) => void;
  onCommit?: (v: number) => void;
  ariaLabel: string;
  valueText?: (v: number) => string;
  disabled?: boolean;
  className?: string;
}

/** Pointer-driven slider used for the timeline and the volume control. Tracks the pointer 1:1 while dragging. */
export function Slider({ value, max, buffered = 0, onChange, onCommit, ariaLabel, valueText, disabled = false, className = '' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragValue, setDragValue] = useState(value);
  // Callbacks are recreated on every render (the timeline re-renders several times a second);
  // read them through refs so an in-progress drag never re-subscribes its listeners.
  const onChangeRef = useRef(onChange);
  const onCommitRef = useRef(onCommit);
  useLayoutEffect(() => {
    onChangeRef.current = onChange;
    onCommitRef.current = onCommit;
  });

  const safeMax = max > 0 ? max : 1;
  const shown = dragging ? dragValue : value;
  const pct = clamp((shown / safeMax) * 100, 0, 100);
  const bufPct = clamp((buffered / safeMax) * 100, 0, 100);

  const valueFromEvent = useCallback(
    (clientX: number) => {
      const el = ref.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      return clamp((clientX - rect.left) / rect.width, 0, 1) * safeMax;
    },
    [safeMax],
  );

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const v = valueFromEvent(e.clientX);
      setDragValue(v);
      onChangeRef.current?.(v);
    };
    const end = (e: PointerEvent) => {
      const v = valueFromEvent(e.clientX);
      setDragging(false);
      onCommitRef.current?.(v);
    };
    const cancel = () => setDragging(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [dragging, valueFromEvent]);

  const commitKey = (v: number) => {
    const next = clamp(v, 0, safeMax);
    onChangeRef.current?.(next);
    onCommitRef.current?.(next);
  };

  return (
    <div
      ref={ref}
      className={`slider ${dragging ? 'dragging' : ''} ${className}`}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={Math.round(safeMax)}
      aria-valuenow={Math.round(shown)}
      aria-valuetext={valueText?.(shown)}
      aria-disabled={disabled || undefined}
      style={disabled ? { pointerEvents: 'none', opacity: 0.5 } : undefined}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const v = valueFromEvent(e.clientX);
        setDragValue(v);
        setDragging(true);
        onChangeRef.current?.(v);
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        const step = safeMax / 20;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') commitKey(value + step);
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') commitKey(value - step);
        else if (e.key === 'Home') commitKey(0);
        else if (e.key === 'End') commitKey(safeMax);
        else return;
        e.preventDefault();
      }}
    >
      <div className="slider-track">
        <div className="slider-buffer" style={{ width: `${bufPct}%` }} />
        <div className="slider-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="slider-thumb" style={{ left: `${pct}%` }} />
    </div>
  );
}
