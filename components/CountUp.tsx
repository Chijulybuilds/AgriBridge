import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "motion/react";

/**
 * A figure that counts up from zero once, the first time its value is known, so the eye lands on
 * it; later changes show at once. The final value reserves its width, so nothing around it shifts
 * while it counts, and screen readers only ever hear the final value. Off under reduced motion.
 */
export function CountUp({
  value,
  format,
  delay = 0,
  duration = 0.72,
}: {
  value: number | undefined;
  format: (value: number) => string;
  /** Seconds to wait before counting, to land on a beat of a larger sequence. */
  delay?: number;
  duration?: number;
}) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState<number>();
  const counted = useRef(false);

  useEffect(() => {
    if (value === undefined) return;
    if (counted.current || reduce || value === 0) {
      counted.current = true;
      setShown(value);
      return;
    }
    counted.current = true;
    let done = false;
    const controls = animate(0, value, {
      duration,
      delay,
      ease: [0.2, 0, 0, 1],
      onUpdate: setShown,
      onComplete: () => (done = true),
    });
    return () => {
      controls.stop();
      // Interrupted before it finished (e.g. React re-running effects): let the next run count.
      if (!done) counted.current = false;
    };
  }, [value, reduce, delay, duration]);

  const final = value === undefined ? "—" : format(value);
  return (
    <span className="count-up">
      <span className="count-reserve" aria-hidden="true">
        {final}
      </span>
      <span className="count-live" aria-hidden="true">
        {shown === undefined ? (value === undefined || reduce ? final : format(0)) : format(shown)}
      </span>
      <span className="visually-hidden">{final}</span>
    </span>
  );
}
