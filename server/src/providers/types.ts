/**
 * Marketplace provider contract.
 *
 * Each marketplace (Mercado Livre, Shopee, ...) implements this interface so
 * routes/jobs stay provider-agnostic. Providers only see an AccountContext —
 * a connected account row with decrypted tokens — never sessions or the DB.
 */

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms when the access token expires. */
  expiresAt?: number;
}

export interface ProviderIdentity {
  /** The marketplace-side account/shop id, as string (Shopee ids aren't numeric). */
  externalUserId: string;
  nickname?: string;
  email?: string;
  /**
   * True only when the provider guarantees the user proved ownership of
   * `email`. Only verified emails may be used to link/create accounts.
   */
  emailVerified?: boolean;
}

/** Result of an OAuth/code exchange: who the user is + their tokens. */
export interface ProviderAuthResult {
  identity: ProviderIdentity;
  tokens: TokenSet;
}

/** A connected marketplace_accounts row, decrypted, as passed to providers. */
export interface AccountContext {
  accountId: number;
  provider: string;
  externalUserId: string;
  nickname?: string;
  email?: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
}

/** Cross-marketplace shipment row (the shape the frontend renders). */
export interface NormalizedShipment {
  accountId: number;
  marketplace: string;
  /** Provider's external shipment id (string — not all providers are numeric). */
  shipmentId: string;
  orderId?: string;
  buyerNickname: string;
  /** Human-readable item summary, e.g. "2x Camiseta, 1x Caneca". */
  items: string;
  /** Normalized status vocabulary: 'ready_to_ship' | ... */
  status: string;
  /** Normalized substatus: 'ready_to_print' | 'invoice_pending' | '' */
  substatus: string;
  canPrint: boolean;
  city?: string;
  state?: string;
  /** Pro (sla_queue): dispatch deadline, ISO date. */
  dispatchDeadline?: string;
  /** Pro (packing_check): structured items for pre-print confirmation. */
  orderItems?: Array<{ title: string; quantity: number; sku?: string }>;
}

export interface ListShipmentsOptions {
  dateFrom?: string;
  dateTo?: string;
  /** Include dispatchDeadline (plan-gated by the route). */
  includeSla?: boolean;
  /** Include orderItems (plan-gated by the route). */
  includePacking?: boolean;
}

export type LabelFormat = 'zpl' | 'pdf';

export interface MarketplaceProvider {
  id: string;
  displayName: string;

  /**
   * Label formats this provider can produce. Providers without 'zpl' are
   * skipped by the auto-print poller (the agent only prints raw ZPL today)
   * but still work for browser printing via getLabelsPDF.
   */
  labelFormats: LabelFormat[];

  /**
   * Whether the provider's OAuth callback echoes back our `state` param.
   * Shopee's auth_partner redirect doesn't support state, so CSRF protection
   * there relies solely on the session-bound pending attempt.
   */
  oauthState: 'required' | 'unsupported';

  /** True when the env credentials the provider needs are present. */
  isConfigured(): boolean;

  /**
   * Extract the authorization code from the callback query.
   * Default is `query.code`; Amazon uses `spapi_oauth_code`.
   */
  getAuthorizationCode?(query: Record<string, unknown>): string | undefined;

  /** Build the provider-side authorization URL (OAuth2 + PKCE when supported). */
  getAuthUrl(redirectUri: string, state: string, codeChallenge: string): string;

  /** Exchange the OAuth callback code for identity + tokens. */
  exchangeCode(
    code: string,
    redirectUri: string,
    codeVerifier: string,
    callbackQuery?: Record<string, unknown>
  ): Promise<ProviderAuthResult>;

  /** Refresh an account's tokens. */
  refreshTokens(account: AccountContext): Promise<TokenSet>;

  /** List shipments ready to print, normalized. */
  listReadyShipments(ctx: AccountContext, opts: ListShipmentsOptions): Promise<NormalizedShipment[]>;

  /** External ids of shipments in printable state (used by auto-print). */
  listPrintableShipmentIds(ctx: AccountContext): Promise<string[]>;

  /** Raw ZPL for the given external shipment ids (ZPL-capable providers only). */
  getLabelsZPL?(ctx: AccountContext, externalIds: string[]): Promise<string>;

  /** Merged PDF for the given external shipment ids. */
  getLabelsPDF(ctx: AccountContext, externalIds: string[]): Promise<Buffer>;

  /** Invoice/fiscal data for one shipment, when the provider exposes it. */
  getInvoice?(ctx: AccountContext, externalId: string): Promise<any>;
}
