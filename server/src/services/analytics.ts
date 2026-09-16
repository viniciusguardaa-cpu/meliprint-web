import pool from '../db.js';

export interface AnalyticsEvent {
  event_name: string;
  user_id?: number;
  visitor_key?: string;
  session_id?: string;
  properties?: Record<string, any>;
}

/**
 * Record an analytics event. No tokens/secrets should be in properties
 * (enforced by caller; this function does not log the payload).
 */
export async function trackEvent(event: AnalyticsEvent): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO "analytics_events" ("event_name", "user_id", "visitor_key", "session_id", "properties")
       VALUES ($1, $2, $3, $4, $5)`,
      [
        event.event_name,
        event.user_id ?? null,
        event.visitor_key ?? null,
        event.session_id ?? null,
        event.properties ? JSON.stringify(event.properties) : null,
      ]
    );
  } catch (err) {
    // Analytics should never break the request flow
    console.error('[analytics] Failed to track event:', err);
  }
}

/**
 * Capture UTM params from a request. Records both first-touch and last-touch.
 * First-touch is set once (UNIQUE constraint); last-touch is updated each visit.
 */
export async function captureUTM(
  visitorKey: string,
  utm: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    utm_term?: string;
    referrer?: string;
    landing_path?: string;
  },
  userId?: number
): Promise<void> {
  try {
    // First-touch: insert, ignore if already exists
    try {
      await pool.query(
        `INSERT INTO "utm_attribution" ("visitor_key", "user_id", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "referrer", "landing_path", "touch_type")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'first')`,
        [
          visitorKey,
          userId ?? null,
          utm.utm_source ?? null,
          utm.utm_medium ?? null,
          utm.utm_campaign ?? null,
          utm.utm_content ?? null,
          utm.utm_term ?? null,
          utm.referrer ?? null,
          utm.landing_path ?? null,
        ]
      );
    } catch (err: any) {
      // Unique violation → first-touch already recorded, that's fine
      if (err.code !== '23505') throw err;
    }

    // Last-touch: upsert (update if exists)
    await pool.query(
      `INSERT INTO "utm_attribution" ("visitor_key", "user_id", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "referrer", "landing_path", "touch_type")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'last')
       ON CONFLICT ("visitor_key", "touch_type") DO UPDATE SET
         "user_id" = COALESCE(EXCLUDED."user_id", "utm_attribution"."user_id"),
         "utm_source" = EXCLUDED."utm_source",
         "utm_medium" = EXCLUDED."utm_medium",
         "utm_campaign" = EXCLUDED."utm_campaign",
         "utm_content" = EXCLUDED."utm_content",
         "utm_term" = EXCLUDED."utm_term",
         "referrer" = EXCLUDED."referrer",
         "landing_path" = EXCLUDED."landing_path"`,
      [
        visitorKey,
        userId ?? null,
        utm.utm_source ?? null,
        utm.utm_medium ?? null,
        utm.utm_campaign ?? null,
        utm.utm_content ?? null,
        utm.utm_term ?? null,
        utm.referrer ?? null,
        utm.landing_path ?? null,
      ]
    );
  } catch (err) {
    console.error('[analytics] Failed to capture UTM:', err);
  }
}

// ---------------------------------------------------------------------------
// Referrals
// ---------------------------------------------------------------------------

export async function createReferral(code: string, ownerUserId: number, name?: string) {
  const result = await pool.query(
    `INSERT INTO "referrals" ("code", "owner_user_id", "name") VALUES ($1, $2, $3) RETURNING *`,
    [code, ownerUserId, name ?? null]
  );
  return result.rows[0];
}

export async function getReferralByCode(code: string) {
  const result = await pool.query(`SELECT * FROM "referrals" WHERE "code" = $1 AND "is_active" = true`, [code]);
  return result.rows[0] || null;
}

export async function recordReferralSignup(referralId: number, referredUserId: number, visitorKey?: string) {
  try {
    await pool.query(
      `INSERT INTO "referral_signups" ("referral_id", "referred_user_id", "visitor_key") VALUES ($1, $2, $3)`,
      [referralId, referredUserId, visitorKey ?? null]
    );
  } catch (err: any) {
    if (err.code !== '23505') throw err; // ignore duplicate
  }
}

export async function markReferralSubscribed(referredUserId: number) {
  await pool.query(
    `UPDATE "referral_signups" SET "subscribed_at" = CURRENT_TIMESTAMP WHERE "referred_user_id" = $1`,
    [referredUserId]
  );
}

// ---------------------------------------------------------------------------
// Admin: growth metrics
// ---------------------------------------------------------------------------

export async function getGrowthMetrics() {
  const [funnel, utm, agents, prints] = await Promise.all([
    pool.query(`
      SELECT
        (SELECT COUNT(*) FROM "analytics_events" WHERE "event_name" = 'landing_view') AS landing_views,
        (SELECT COUNT(*) FROM "analytics_events" WHERE "event_name" = 'ml_oauth_started') AS oauth_started,
        (SELECT COUNT(*) FROM "analytics_events" WHERE "event_name" = 'ml_connected') AS ml_connected,
        (SELECT COUNT(*) FROM "analytics_events" WHERE "event_name" = 'pricing_view') AS pricing_views,
        (SELECT COUNT(*) FROM "analytics_events" WHERE "event_name" = 'checkout_started') AS checkouts_started,
        (SELECT COUNT(*) FROM "analytics_events" WHERE "event_name" = 'trial_started') AS trials_started,
        (SELECT COUNT(*) FROM "analytics_events" WHERE "event_name" = 'subscription_activated') AS subscriptions_activated,
        (SELECT COUNT(*) FROM "analytics_events" WHERE "event_name" = 'subscription_cancelled') AS subscriptions_cancelled
    `),
    pool.query(`
      SELECT "utm_source", "utm_medium", "utm_campaign",
             COUNT(*) AS visitors,
             COUNT(DISTINCT "user_id") AS signups
      FROM "utm_attribution" WHERE "touch_type" = 'first'
      GROUP BY "utm_source", "utm_medium", "utm_campaign"
      ORDER BY visitors DESC LIMIT 20
    `),
    pool.query(`
      SELECT
        (SELECT COUNT(*) FROM "auto_print_config" WHERE "agent_status" = 'online') AS agents_online,
        (SELECT COUNT(*) FROM "auto_print_config" WHERE "agent_status" = 'offline' AND "enabled" = true) AS agents_offline
    `),
    pool.query(`
      SELECT
        (SELECT COUNT(*) FROM "print_queue" WHERE "status" = 'printed') AS prints_success,
        (SELECT COUNT(*) FROM "print_queue" WHERE "status" = 'failed') AS prints_failed
    `),
  ]);

  return {
    funnel: funnel.rows[0],
    utm_performance: utm.rows,
    agents: agents.rows[0],
    prints: prints.rows[0],
  };
}
