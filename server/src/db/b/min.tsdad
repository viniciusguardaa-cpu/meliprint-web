import pool, { markTrialUsed } from '../db.js';

// Admin operations
export async function getAllSubscribers() {
  const result = await pool.query(
    `SELECT
       u."id" AS user_id,
       u."ml_user_id",
       u."nickname",
       u."email",
       u."blocked_at",
       u."trial_started_at",
       u."created_at" AS user_created_at,
       s."status",
       s."plan_id",
       s."price",
       s."contracted_amount",
       s."trial_ends_at",
       s."current_period_start",
       s."current_period_end",
       s."mp_preapproval_id",
       s."created_at" AS subscription_created_at,
       c."agent_status",
       c."last_heartbeat_at",
       pe."prints_total",
       pe."last_print_at",
       (fa."id" IS NOT NULL) AS has_free_access
     FROM "users" u
     LEFT JOIN LATERAL (
       SELECT * FROM "subscriptions"
       WHERE "user_id" = u."id"
       ORDER BY "created_at" DESC
       LIMIT 1
     ) s ON true
     LEFT JOIN "auto_print_config" c ON c."user_id" = u."id"
     LEFT JOIN LATERAL (
       SELECT
         (SELECT COUNT(*) FROM "print_events" e WHERE e."user_id" = u."id")
         + (SELECT COUNT(*) FROM "print_queue" q WHERE q."user_id" = u."id" AND q."status" = 'printed')
         AS prints_total,
         GREATEST(
           (SELECT MAX(e."created_at") FROM "print_events" e WHERE e."user_id" = u."id"),
           (SELECT MAX(q."printed_at") FROM "print_queue" q WHERE q."user_id" = u."id")
         ) AS last_print_at
     ) pe ON true
     LEFT JOIN "free_access" fa ON u."email" IS NOT NULL AND LOWER(fa."email") = LOWER(u."email")
     ORDER BY u."created_at" DESC`
  );
  return result.rows;
}

export async function getAdminStats() {
  // Paid MRR only: authorized/active subscriptions, excluding free-access
  // courtesy accounts and trials (trialing is not paid revenue).
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM "users") AS total_users,
       (SELECT COUNT(*) FROM "subscriptions" WHERE "status" IN ('authorized', 'active')) AS active_subscriptions,
       (SELECT COALESCE(SUM(s."contracted_amount"), 0)
          FROM "subscriptions" s
          JOIN "users" u ON u."id" = s."user_id"
          WHERE s."status" IN ('authorized', 'active')
            AND NOT EXISTS (
              SELECT 1 FROM "free_access" f WHERE LOWER(f."email") = LOWER(u."email")
            )) AS mrr,
       (SELECT COUNT(*) FROM "subscriptions" WHERE "status" = 'cancelled') AS cancelled_subscriptions`
  );
  return result.rows[0];
}

/**
 * Full client detail for the admin panel. Never returns secrets: agent and
 * marketplace tokens are intentionally not selected.
 */
export async function getAdminUserDetail(userId: number) {
  const [user, subscriptions, accounts, agent, prints, queue, recentPrints, recentJobs, utm] = await Promise.all([
    pool.query(
      `SELECT "id", "ml_user_id", "nickname", "email", "email_verified",
              "blocked_at", "trial_started_at", "created_at", "updated_at"
       FROM "users" WHERE "id" = $1`,
      [userId]
    ),
    pool.query(
      `SELECT s.*, p."name" AS plan_name
       FROM "subscriptions" s
       LEFT JOIN "plans" p ON p."id" = s."plan_id"
       WHERE s."user_id" = $1
       ORDER BY s."created_at" DESC`,
      [userId]
    ),
    pool.query(
      `SELECT "id", "provider", "external_user_id", "nickname", "email",
              "status", "created_at"
       FROM "marketplace_accounts" WHERE "user_id" = $1
       ORDER BY "created_at" ASC`,
      [userId]
    ),
    pool.query(
      `SELECT "enabled", "agent_status", "agent_id", "printer_name",
              "last_heartbeat_at", "last_polled_at"
       FROM "auto_print_config" WHERE "user_id" = $1`,
      [userId]
    ),
    pool.query(
      `SELECT
         (SELECT COUNT(*) FROM "print_events" e WHERE e."user_id" = $1) AS events_total,
         (SELECT COUNT(*) FROM "print_events" e WHERE e."user_id" = $1 AND e."source" = 'browser') AS browser_prints,
         (SELECT COUNT(*) FROM "print_events" e WHERE e."user_id" = $1 AND e."source" = 'agent') AS agent_events,
         (SELECT COUNT(*) FROM "print_queue" q WHERE q."user_id" = $1 AND q."status" = 'printed') AS agent_prints,
         (SELECT COUNT(*) FROM "print_events" e WHERE e."user_id" = $1 AND e."created_at" > CURRENT_TIMESTAMP - INTERVAL '30 days') AS prints_30d,
         GREATEST(
           (SELECT MAX(e."created_at") FROM "print_events" e WHERE e."user_id" = $1),
           (SELECT MAX(q."printed_at") FROM "print_queue" q WHERE q."user_id" = $1)
         ) AS last_print_at`,
      [userId]
    ),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE "status" = 'pending') AS pending,
         COUNT(*) FILTER (WHERE "status" = 'processing') AS processing,
         COUNT(*) FILTER (WHERE "status" = 'printed') AS printed,
         COUNT(*) FILTER (WHERE "status" = 'failed') AS failed,
         COUNT(*) FILTER (WHERE "status" = 'needs_review') AS needs_review
       FROM "print_queue" WHERE "user_id" = $1`,
      [userId]
    ),
    pool.query(
      `SELECT "provider", "shipment_id", "source", "created_at"
       FROM "print_events" WHERE "user_id" = $1
       ORDER BY "created_at" DESC LIMIT 15`,
      [userId]
    ),
    pool.query(
      `SELECT "provider", "shipment_id", "status", "attempts", "last_error",
              "created_at", "printed_at"
       FROM "print_queue" WHERE "user_id" = $1
       ORDER BY "created_at" DESC LIMIT 15`,
      [userId]
    ),
    pool.query(
      `SELECT "utm_source", "utm_medium", "utm_campaign", "referrer", "landing_path"
       FROM "utm_attribution" WHERE "user_id" = $1 AND "touch_type" = 'first'
       LIMIT 1`,
      [userId]
    ),
  ]);

  return {
    user: user.rows[0] || null,
    subscriptions: subscriptions.rows,
    accounts: accounts.rows,
    agent: agent.rows[0] || null,
    prints: prints.rows[0],
    queue: queue.rows[0],
    recentPrints: recentPrints.rows,
    recentJobs: recentJobs.rows,
    utm: utm.rows[0] || null,
  };
}

/** Suspend (blocked=true) or reactivate a user account. */
export async function setUserBlocked(userId: number, blocked: boolean) {
  const result = await pool.query(
    `UPDATE "users" SET
       "blocked_at" = CASE WHEN $2 THEN CURRENT_TIMESTAMP ELSE NULL END,
       "updated_at" = CURRENT_TIMESTAMP
     WHERE "id" = $1
     RETURNING "id", "blocked_at"`,
    [userId, blocked]
  );
  return result.rows[0] || null;
}

/**
 * Admin-granted trial: extends the current trialing subscription if one
 * exists, otherwise creates a new trialing row on the Pro plan.
 * Records on users.trial_started_at so the trial uniqueness invariant holds.
 */
export async function grantUserTrialDays(userId: number, days: number) {
  const extended = await pool.query(
    `UPDATE "subscriptions" SET
       "trial_ends_at" = GREATEST(COALESCE("trial_ends_at", CURRENT_TIMESTAMP), CURRENT_TIMESTAMP) + ($2 || ' days')::INTERVAL,
       "status" = 'trialing',
       "updated_at" = CURRENT_TIMESTAMP
     WHERE "id" = (
       SELECT "id" FROM "subscriptions"
       WHERE "user_id" = $1 AND "status" = 'trialing'
       ORDER BY "created_at" DESC LIMIT 1
     )
     RETURNING *`,
    [userId, String(days)]
  );
  if (extended.rows[0]) {
    await markTrialUsed(userId);
    return { subscription: extended.rows[0], created: false };
  }

  // No trialing subscription: create an admin trial (unique key per grant so
  // repeated grants never collide on mp_preapproval_id / idempotency_key).
  const stamp = Date.now();
  const result = await pool.query(
    `INSERT INTO "subscriptions" (
       "user_id", "mp_preapproval_id", "status", "plan_id",
       "trial_ends_at", "current_period_start", "current_period_end",
       "contracted_currency", "idempotency_key"
     )
     VALUES ($1, $2, 'trialing', 'pro',
             CURRENT_TIMESTAMP + ($3 || ' days')::INTERVAL,
             CURRENT_TIMESTAMP,
             CURRENT_TIMESTAMP + ($3 || ' days')::INTERVAL,
             'BRL', $4)
     RETURNING *`,
    [userId, `trial_admin_${userId}_${stamp}`, String(days), `trial_admin_u${userId}_${stamp}`]
  );
  await markTrialUsed(userId);
  return { subscription: result.rows[0], created: true };
}

/** Daily series for admin charts: signups and prints per day, last N days. */
export async function getAdminTimeseries(days = 30) {
  const safeDays = Math.min(Math.max(Math.floor(days) || 30, 7), 365);
  const result = await pool.query(
    `WITH days AS (
       SELECT generate_series(
         (CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day')::date,
         CURRENT_DATE, INTERVAL '1 day'
       )::date AS day
     ),
     signups AS (
       SELECT "created_at"::date AS day, COUNT(*) AS n
       FROM "users"
       WHERE "created_at" >= CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day'
       GROUP BY 1
     ),
     browser_prints AS (
       SELECT "created_at"::date AS day, COUNT(*) AS n
       FROM "print_events"
       WHERE "created_at" >= CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day'
       GROUP BY 1
     ),
     agent_prints AS (
       SELECT "printed_at"::date AS day, COUNT(*) AS n
       FROM "print_queue"
       WHERE "printed_at" >= CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day'
         AND "status" = 'printed'
       GROUP BY 1
     ),
     cancellations AS (
       SELECT "updated_at"::date AS day, COUNT(*) AS n
       FROM "subscriptions"
       WHERE "status" = 'cancelled'
         AND "updated_at" >= CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day'
       GROUP BY 1
     )
     SELECT
       d.day,
       COALESCE(s.n, 0) AS signups,
       COALESCE(bp.n, 0) + COALESCE(ap.n, 0) AS prints,
       COALESCE(cx.n, 0) AS cancellations
     FROM days d
     LEFT JOIN signups s ON s.day = d.day
     LEFT JOIN browser_prints bp ON bp.day = d.day
     LEFT JOIN agent_prints ap ON ap.day = d.day
     LEFT JOIN cancellations cx ON cx.day = d.day
     ORDER BY d.day ASC`,
    [safeDays]
  );

  const totals = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM "print_events" e
         WHERE e."created_at" > CURRENT_TIMESTAMP - INTERVAL '30 days')
       + (SELECT COUNT(*) FROM "print_queue" q
         WHERE q."printed_at" > CURRENT_TIMESTAMP - INTERVAL '30 days' AND q."status" = 'printed')
       AS prints_30d,
       (SELECT COUNT(*) FROM "users"
         WHERE "created_at" > CURRENT_TIMESTAMP - INTERVAL '30 days') AS signups_30d,
       (SELECT COUNT(*) FROM "subscriptions"
         WHERE "status" = 'cancelled'
           AND "updated_at" > CURRENT_TIMESTAMP - INTERVAL '30 days') AS cancelled_30d,
       (SELECT COUNT(*) FROM "subscriptions" WHERE "status" = 'trialing') AS active_trials,
       (SELECT COUNT(*) FROM "users" WHERE "trial_started_at" IS NOT NULL) AS trials_total,
       (SELECT COUNT(*) FROM "subscriptions"
         WHERE "status" IN ('authorized', 'active')) AS paid_subs,
       (SELECT COUNT(*) FROM "subscriptions" s2
         WHERE s2."status" IN ('authorized', 'active')
           AND EXISTS (
             SELECT 1 FROM "subscriptions" t
             WHERE t."user_id" = s2."user_id" AND t."status" IN ('trialing', 'converted')
           )) AS converted_from_trial,
       (SELECT COUNT(*) FROM "users" WHERE "blocked_at" IS NOT NULL) AS blocked_users`
  );

  return {
    days: safeDays,
    series: result.rows.map((r: any) => ({
      day: r.day,
      signups: Number(r.signups),
      prints: Number(r.prints),
      cancellations: Number(r.cancellations),
    })),
    totals: {
      prints30d: Number(totals.rows[0].prints_30d),
      signups30d: Number(totals.rows[0].signups_30d),
      cancelled30d: Number(totals.rows[0].cancelled_30d),
      activeTrials: Number(totals.rows[0].active_trials),
      trialsTotal: Number(totals.rows[0].trials_total),
      paidSubs: Number(totals.rows[0].paid_subs),
      convertedFromTrial: Number(totals.rows[0].converted_from_trial),
      blockedUsers: Number(totals.rows[0].blocked_users),
    },
  };
}
