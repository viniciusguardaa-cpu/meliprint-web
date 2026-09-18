import { mercadolivreProvider } from './mercadolivre.js';
import { shopeeProvider } from './shopee.js';
import { blingProvider } from './bling.js';
import { magaluProvider } from './magalu.js';
import { amazonProvider } from './amazon.js';
import type { MarketplaceProvider } from './types.js';

/**
 * Registry of supported marketplace providers. All providers are registered
 * unconditionally so OAuth routes can return a proper "not configured" error;
 * the /api/auth/providers listing exposes each provider's `configured` flag
 * (env credentials present) and the UI only offers connect for configured ones.
 */
const providers = new Map<string, MarketplaceProvider>([
  [mercadolivreProvider.id, mercadolivreProvider],
  [shopeeProvider.id, shopeeProvider],
  [blingProvider.id, blingProvider],
  [magaluProvider.id, magaluProvider],
  [amazonProvider.id, amazonProvider]
]);

export function getProvider(id: string): MarketplaceProvider | undefined {
  return providers.get(id);
}

export function listProviders(): MarketplaceProvider[] {
  return Array.from(providers.values());
}

export type { MarketplaceProvider, AccountContext, NormalizedShipment, TokenSet } from './types.js';
