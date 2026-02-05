interface LogoProps {
  className?: string;
}

export default function Logo({ className = '' }: LogoProps) {
  return (
    <div className={`flex items-center ${className}`}>
      <img
        src="/logo.svg"
        alt="Printly Logo"
        className="h-8 w-auto"
      />
    </div>
  );
}
