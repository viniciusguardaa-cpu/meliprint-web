import { mercadolivreProvider } from './mercadolivre.js';
import type { MarketplaceProvider } from './types.js';

/**
 * Registry of supported marketplace providers. Add new providers here
 * (e.g. shopeeProvider) and everything downstream picks them up.
 */
const providers = new Map<string, MarketplaceProvider>([
  [mercadolivreProvider.id, mercadolivreProvider]
]);

export function getProvider(id: string): MarketplaceProvider | undefined {
  return providers.get(id);
}

export function listProviders(): MarketplaceProvider[] {
  return Array.from(providers.values());
}

export type { MarketplaceProvider, AccountContext, NormalizedShipment, TokenSet } from './types.js';
