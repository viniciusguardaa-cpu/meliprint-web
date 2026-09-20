import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Stagger delay in ms. */
  delay?: number;
  /**
   * Also animate a `.draw-line` / `.draw-line-y` descendant once visible.
   * Used by the workflow connector.
   */
  draw?: boolean;
}

/**
 * Scroll-reveal wrapper. Uses a single IntersectionObserver per element and
 * pure CSS transitions (transform/opacity) — no animation library needed.
 * Honors prefers-reduced-motion via the .reveal CSS rules.
 */
export default function Reveal({ children, className, delay = 0, draw = false }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('is-visible');
      if (draw) el.querySelectorAll('.draw-line, .draw-line-y').forEach((n) => n.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          el.classList.add('is-visible');
          if (draw) el.querySelectorAll('.draw-line, .draw-line-y').forEach((n) => n.classList.add('is-visible'));
          observer.disconnect();
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [draw]);

  return (
    <div
      ref={ref}
      className={cn('reveal', className)}
      style={{ '--reveal-delay': `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}
