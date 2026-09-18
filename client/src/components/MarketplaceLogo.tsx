interface MarketplaceLogoProps {
  provider: string;
  size?: number;
}

/**
 * Brand badges for each marketplace. Simple rounded-square marks in each
 * company's brand colors — no copyrighted artwork, just recognizable
 * initials (same "avatar" pattern used by most integration UIs).
 */
export default function MarketplaceLogo({ provider, size = 40 }: MarketplaceLogoProps) {
  const rx = size * 0.25;
  const common = { width: size, height: size, style: { width: size, height: size } };

  switch (provider) {
    case 'mercadolivre':
      return (
        <svg viewBox="0 0 48 48" {...common} aria-label="Mercado Livre">
          <rect width="48" height="48" fill="#FFE600" rx={rx} />
          <text x="24" y="30" textAnchor="middle" fontSize="17" fontWeight="800" fill="#2D3277" fontFamily="system-ui, sans-serif">ML</text>
        </svg>
      );
    case 'shopee':
      return (
        <svg viewBox="0 0 48 48" {...common} aria-label="Shopee">
          <rect width="48" height="48" fill="#EE4D2D" rx={rx} />
          <path d="M15 18h18l-1.5 16a3 3 0 0 1-3 2.7h-9a3 3 0 0 1-3-2.7L15 18z" fill="#fff" />
          <path d="M20 18a4 4 0 0 1 8 0" fill="none" stroke="#fff" strokeWidth="2.4" />
          <text x="24" y="31" textAnchor="middle" fontSize="13" fontWeight="800" fill="#EE4D2D" fontFamily="system-ui, sans-serif">S</text>
        </svg>
      );
    case 'amazon':
      return (
        <svg viewBox="0 0 48 48" {...common} aria-label="Amazon">
          <rect width="48" height="48" fill="#232F3E" rx={rx} />
          <text x="24" y="24" textAnchor="middle" fontSize="20" fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">a</text>
          <path d="M14 30c6 4.5 14 4.5 20 0" fill="none" stroke="#FF9900" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M33 28.5l3 1.8-1.8 3" fill="none" stroke="#FF9900" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'magalu':
      return (
        <svg viewBox="0 0 48 48" {...common} aria-label="Magalu">
          <rect width="48" height="48" fill="#0086FF" rx={rx} />
          <text x="24" y="30" textAnchor="middle" fontSize="16" fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">Lu</text>
        </svg>
      );
    case 'bling':
      return (
        <svg viewBox="0 0 48 48" {...common} aria-label="Bling">
          <rect width="48" height="48" fill="#0E2A47" rx={rx} />
          <text x="22" y="30" textAnchor="middle" fontSize="17" fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">B</text>
          <circle cx="33" cy="33" r="3" fill="#7FEF6C" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 48 48" {...common} aria-label={provider}>
          <rect width="48" height="48" fill="#94A3B8" rx={rx} />
          <text x="24" y="30" textAnchor="middle" fontSize="17" fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">
            {provider.slice(0, 2).toUpperCase()}
          </text>
        </svg>
      );
  }
}
