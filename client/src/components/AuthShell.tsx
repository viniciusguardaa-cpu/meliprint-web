import Logo from './Logo';

interface AuthShellProps {
  children: React.ReactNode;
  subtitle?: string;
  footer?: React.ReactNode;
}

/** Shared layout for auth pages: light background, wasabi accent, centered card. */
export default function AuthShell({ children, subtitle, footer }: AuthShellProps) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Soft brand accent */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[560px] h-[560px] rounded-full bg-secondary/40 blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative">
        <div className="flex flex-col items-center mb-8">
          <Logo className="h-14 mb-6" />
          {subtitle && (
            <p className="text-muted-foreground text-lg text-center font-medium">
              {subtitle}
            </p>
          )}
        </div>

        <div className="bg-surface border border-border rounded-2xl shadow-sm p-6 sm:p-8">
          {children}
        </div>

        {footer && (
          <p className="text-center text-muted-foreground text-sm mt-6">
            {footer}
          </p>
        )}
      </div>
    </div>
  );
}
