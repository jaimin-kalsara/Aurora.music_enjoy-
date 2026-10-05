// Mirrors the --ease / --ease-io / --ease-drawer tokens in styles.css so JS and CSS motion agree.
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
export const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;
export const EASE_DRAWER = [0.32, 0.72, 0, 1] as const;

/** Critically damped: settles without overshoot. The default for anything that wasn't flicked. */
export const SPRING_SETTLE = { type: 'spring', duration: 0.45, bounce: 0 } as const;
/** A touch of life for direct-manipulation results (tab pill, sheet released after a drag). */
export const SPRING_LIVELY = { type: 'spring', duration: 0.4, bounce: 0.14 } as const;
