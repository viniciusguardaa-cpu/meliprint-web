interface LogoProps {
  className?: string;
  showText?: boolean;
}

export default function Logo({ className = '', showText = true }: LogoProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Printer Icon */}
      <svg
        width="40"
        height="40"
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
      >
        <rect x="10" y="8" width="20" height="5" rx="1.5" fill="currentColor" />
        <rect x="6" y="13" width="28" height="16" rx="2" fill="currentColor" />
        <rect x="10" y="23" width="20" height="12" rx="1.5" fill="currentColor" />
        <rect x="12" y="26" width="16" height="2" rx="1" fill="white" opacity="0.3" />
        <rect x="12" y="29" width="12" height="2" rx="1" fill="white" opacity="0.3" />
      </svg>
      {/* Text */}
      {showText && (
        <span className="text-xl font-bold whitespace-nowrap">MeliPrint Web</span>
      )}
    </div>
  );
}
