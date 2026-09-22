import { cn } from '../lib/utils';

interface LogoProps {
  className?: string;
  /** `light` renders the wordmark in white for dark backgrounds. */
  variant?: 'default' | 'light';
}

export default function Logo({ className = '', variant = 'default' }: LogoProps) {
  return (
    <img
      src="/logo-wordmark.png"
      alt="LabelGo"
      width={256}
      height={85}
      className={cn('h-8 w-auto', variant === 'light' && 'brightness-0 invert', className)}
    />
  );
}
