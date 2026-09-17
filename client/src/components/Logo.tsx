import { cn } from '../lib/utils';

interface LogoProps {
  className?: string;
  /** `light` renders the wordmark in white for dark backgrounds. */
  variant?: 'default' | 'light';
}

export default function Logo({ className = '', variant = 'default' }: LogoProps) {
  return (
    <img
      src="/logo.png"
      alt="LabelGo"
      className={cn('h-8 w-auto', variant === 'light' && 'brightness-0 invert', className)}
    />
  );
}
