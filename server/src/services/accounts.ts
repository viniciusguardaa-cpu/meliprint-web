import { getProvider } from '../providers/index.js';
import type { AccountContext } from '../providers/types.js';
import { updateMarketplaceAccountTokens } from '../db.js';

/**
 * Central token lifecycle for connected marketplace accounts.
 * Every caller (routes, webhooks, pollers) goes through this so refresh
 * logic and persistence live in exactly one place.
 */

const REFRESH_WINDOW_MS = 5 * 60 * 1000; // refresh when <5min to expiry

/** Convert a marketplace_accounts row (decrypted) to a provider context. */
export function toAccountContext(account: any): AccountContext {
  return {
    accountId: account.id,
    provider: account.provider,
    externalUserId: account.external_user_id,
    nickname: account.nickname,
    email: account.email,
    accessToken: account.access_token,
    refreshToken: account.refresh_token,
    tokenExpiresAt: account.token_expires_at
  };
}

/**
 * Return an AccountContext guaranteed to hold a fresh access token.
 * Refreshes via the provider and persists new tokens when close to expiry.
 * Returns null when the token cannot be obtained (e.g. revoked grant).
 */
export async function getFreshAccountContext(account: any): Promise<AccountContext | null> {
  if (!account) return null;
  const provider = getProvider(account.provider);
  if (!provider) {
    console.error(`[accounts] Unknown provider: ${account.provider}`);
    return null;
  }

  const expiresAt = account.token_expires_at ?? 0;
  const needsRefresh = !account.access_token || Date.now() > expiresAt - REFRESH_WINDOW_MS;

  if (!needsRefresh) {
    return toAccountContext(account);
  }

  try {
    const tokens = await provider.refreshTokens(toAccountContext(account));
    await updateMarketplaceAccountTokens(account.id, tokens);
    return toAccountContext({
      ...account,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken ?? account.refresh_token,
      token_expires_at: tokens.expiresAt ?? account.token_expires_at
    });
  } catch (error) {
    console.error(`[accounts] Token refresh failed for account ${account.id} (${account.provider}):`, error);
    return null;
  }
}
