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

/** Domínios conhecidos → nome amigável da origem. */
const SOURCE_MAP: Array<[RegExp, string]> = [
  [/instagram/, 'instagram'],
  [/facebook|fb\.me|l\.facebook/, 'facebook'],
  [/google\./, 'google'],
  [/bing\./, 'bing'],
  [/tiktok/, 'tiktok'],
  [/youtube|youtu\.be/, 'youtube'],
  [/t\.co|twitter|x\.com/, 'twitter/x'],
  [/linkedin/, 'linkedin'],
  [/whatsapp|wa\.me/, 'whatsapp'],
  [/labelgo\.com\.br|railway\.app|netlify\.app/, 'direto'],
];

function normalizeSource(raw: string): string {
  if (raw === 'direto') return raw;
  const domain = raw.replace(/^www\./, '');
  for (const [re, name] of SOURCE_MAP) {
    if (re.test(domain)) return name;
  }
  return domain;
}

/**
 * Growth dashboard metrics. `days` limits the event window (0 = all time).
 * Funnel steps count DISTINCT actors: visitor_key for anonymous events,
 * user_id for server-side events — raw counts would double-count reloads.
 */
export async function getGrowthMetrics(days = 30) {
  const window = days > 0 ? `AND "created_at" >= NOW() - ($1::int * INTERVAL '1 day')` : '';
  const params = days > 0 ? [days] : [];

  const [funnel, abandonment, topPages, visitorsByDay, sources, utm, agents, prints] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE "event_name" = 'page_view') AS page_views,
        COUNT(DISTINCT "visitor_key") FILTER (WHERE "event_name" IN ('page_view', 'landing_view')) AS unique_visitors,
        COUNT(DISTINCT "visitor_key") FILTER (WHERE "event_name" = 'landing_view') AS landing_visitors,
        COUNT(DISTINCT "user_id") FILTER (WHERE "event_name" = 'user_registered') AS registered,
        COUNT(DISTINCT "visitor_key") FILTER (WHERE "event_name" = 'ml_oauth_started') AS oauth_started,
        COUNT(DISTINCT "user_id") FILTER (WHERE "event_name" = 'ml_connected') AS ml_connected,
        COUNT(DISTINCT "visitor_key") FILTER (WHERE "event_name" = 'pricing_view') AS pricing_visitors,
        COUNT(DISTINCT "user_id") FILTER (WHERE "event_name" = 'checkout_started') AS checkouts_started,
        COUNT(DISTINCT "user_id") FILTER (WHERE "event_name" = 'trial_started') AS trials_started,
        COUNT(DISTINCT "user_id") FILTER (WHERE "event_name" = 'subscription_activated') AS subscriptions_activated,
        COUNT(DISTINCT "user_id") FILTER (WHERE "event_name" = 'subscription_cancelled') AS subscriptions_cancelled
      FROM "analytics_events"
      WHERE 1=1 ${window}
    `, params),
    // Abandonment: started in the window but never converted (all-time check
    // for the conversion event, so late conversions don't count as abandoned).
    pool.query(`
      SELECT
        (SELECT COUNT(DISTINCT s."user_id") FROM "analytics_events" s
          WHERE s."event_name" = 'checkout_started' AND s."user_id" IS NOT NULL ${window.replaceAll('"created_at"', 's."created_at"')}
            AND NOT EXISTS (SELECT 1 FROM "analytics_events" a
              WHERE a."event_name" = 'subscription_activated' AND a."user_id" = s."user_id")) AS checkout_abandoned,
        (SELECT COUNT(DISTINCT s."user_id") FROM "analytics_events" s
          WHERE s."event_name" = 'trial_started' AND s."user_id" IS NOT NULL ${window.replaceAll('"created_at"', 's."created_at"')}
            AND NOT EXISTS (SELECT 1 FROM "analytics_events" a
              WHERE a."event_name" = 'subscription_activated' AND a."user_id" = s."user_id")) AS trials_not_converted,
        (SELECT COUNT(DISTINCT p."visitor_key") FROM "analytics_events" p
          WHERE p."event_name" = 'pricing_view' AND p."visitor_key" IS NOT NULL ${window.replaceAll('"created_at"', 'p."created_at"')}
            AND NOT EXISTS (SELECT 1 FROM "analytics_events" c
              WHERE c."visitor_key" = p."visitor_key" AND c."event_name" IN ('checkout_started', 'trial_started'))) AS pricing_no_checkout
    `, params),
    pool.query(`
      SELECT COALESCE("properties"->>'path', '(sem path)') AS path,
             COUNT(*) AS views,
             COUNT(DISTINCT "visitor_key") AS visitors
      FROM "analytics_events"
      WHERE "event_name" IN ('page_view', 'landing_view') ${window}
      GROUP BY 1 ORDER BY views DESC LIMIT 15
    `, params),
    pool.query(`
      SELECT "created_at"::date AS day,
             COUNT(*) FILTER (WHERE "event_name" = 'page_view') AS views,
             COUNT(DISTINCT "visitor_key") AS visitors
      FROM "analytics_events"
      WHERE "event_name" IN ('page_view', 'landing_view') ${window}
      GROUP BY 1 ORDER BY 1
    `, params),
    // Origem do primeiro toque: utm_source > domínio do referrer > 'direto'.
    // Domínios conhecidos são normalizados em JS (veja normalizeSource).
    pool.query(`
      SELECT
        CASE
          WHEN "utm_source" IS NOT NULL AND "utm_source" <> '' THEN LOWER("utm_source")
          WHEN "referrer" IS NULL OR "referrer" = '' THEN 'direto'
          ELSE LOWER(regexp_replace("referrer", '^https?://([^/]+).*$', '\\1'))
        END AS source_raw,
        COUNT(*) AS visitors,
        COUNT(DISTINCT "user_id") AS signups
      FROM "utm_attribution"
      WHERE "touch_type" = 'first' ${window}
      GROUP BY 1 ORDER BY visitors DESC LIMIT 40
    `, params),
    pool.query(`
      SELECT "utm_source", "utm_medium", "utm_campaign",
             COUNT(*) AS visitors,
             COUNT(DISTINCT "user_id") AS signups
      FROM "utm_attribution" WHERE "touch_type" = 'first' ${window}
      GROUP BY "utm_source", "utm_medium", "utm_campaign"
      ORDER BY visitors DESC LIMIT 20
    `, params),
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

  const toNumbers = (row: Record<string, any>) =>
    Object.fromEntries(Object.entries(row ?? {}).map(([k, v]) => [k, Number(v)]));

  // Junta domínios que colapsam na mesma origem (ex.: l.instagram.com +
  // instagram.com + utm_source=instagram) somando visitantes/cadastros.
  const sourceAgg = new Map<string, { visitors: number; signups: number }>();
  for (const r of sources.rows) {
    const name = normalizeSource(r.source_raw);
    const agg = sourceAgg.get(name) ?? { visitors: 0, signups: 0 };
    agg.visitors += Number(r.visitors);
    agg.signups += Number(r.signups);
    sourceAgg.set(name, agg);
  }
  const trafficSources = [...sourceAgg.entries()]
    .map(([source, v]) => ({ source, ...v }))
    .sort((a, b) => b.visitors - a.visitors);

  return {
    days,
    funnel: toNumbers(funnel.rows[0]),
    abandonment: toNumbers(abandonment.rows[0]),
    traffic_sources: trafficSources,
    top_pages: topPages.rows.map((r: any) => ({
      path: r.path,
      views: Number(r.views),
      visitors: Number(r.visitors),
    })),
    visitors_by_day: visitorsByDay.rows.map((r: any) => ({
      day: r.day,
      views: Number(r.views),
      visitors: Number(r.visitors),
    })),
    utm_performance: utm.rows,
    agents: agents.rows[0],
    prints: prints.rows[0],
  };
}
