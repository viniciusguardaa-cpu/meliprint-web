export interface Subscriber {
  user_id: number;
  ml_user_id: number | null;
  nickname: string;
  email: string | null;
  user_created_at: string;
  blocked_at: string | null;
  trial_started_at: string | null;
  status: string | null;
  plan_id: string | null;
  price: number | null;
  contracted_amount: number | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  mp_preapproval_id: string | null;
  subscription_created_at: string | null;
  agent_status: string | null;
  last_heartbeat_at: string | null;
  prints_total: number | null;
  last_print_at: string | null;
  has_free_access: boolean;
}

export interface Stats {
  totalUsers: number;
  activeSubscriptions: number;
  mrr: number;
  cancelledSubscriptions: number;
  agentsOnline: number;
  agentsOffline: number;
  mrrByPlan: Array<{ planId: string; planName: string | null; count: number; mrr: number }>;
  trials: { active: number; expired: number; expiring24h: number };
}

export interface Timeseries {
  days: number;
  series: Array<{ day: string; signups: number; prints: number; cancellations: number }>;
  totals: {
    prints30d: number;
    signups30d: number;
    cancelled30d: number;
    activeTrials: number;
    trialsTotal: number;
    paidSubs: number;
    convertedFromTrial: number;
    blockedUsers: number;
  };
}

export interface UserDetail {
  user: {
    id: number;
    ml_user_id: number | null;
    nickname: string;
    email: string | null;
    email_verified: boolean;
    blocked_at: string | null;
    trial_started_at: string | null;
    created_at: string;
    updated_at: string;
  };
  subscriptions: Array<{
    id: number;
    status: string;
    plan_id: string | null;
    plan_name: string | null;
    price: number | null;
    contracted_amount: number | null;
    trial_ends_at: string | null;
    current_period_start: string | null;
    current_period_end: string | null;
    mp_preapproval_id: string | null;
    created_at: string;
  }>;
  accounts: Array<{
    id: number;
    provider: string;
    external_user_id: string;
    nickname: string | null;
    email: string | null;
    status: string;
    created_at: string;
  }>;
  agent: {
    enabled: boolean;
    agent_status: string | null;
    agent_id: string | null;
    printer_name: string | null;
    last_heartbeat_at: string | null;
    last_polled_at: string | null;
  } | null;
  prints: {
    events_total: number;
    browser_prints: number;
    agent_events: number;
    agent_prints: number;
    prints_30d: number;
    last_print_at: string | null;
  };
  queue: {
    pending: number; processing: number; printed: number; failed: number; needs_review: number;
  };
  recentPrints: Array<{ provider: string; shipment_id: string; source: string; created_at: string }>;
  recentJobs: Array<{
    provider: string; shipment_id: string; status: string; attempts: number;
    last_error: string | null; created_at: string; printed_at: string | null;
  }>;
  utm: {
    utm_source: string | null; utm_medium: string | null; utm_campaign: string | null;
    referrer: string | null; landing_path: string | null;
  } | null;
}

export interface FreeAccessEntry {
  id: number;
  email: string;
  note: string | null;
  created_at: string;
}

export interface GrowthMetrics {
  days: number;
  funnel: {
    page_views: number;
    unique_visitors: number;
    landing_visitors: number;
    registered: number;
    oauth_started: number;
    ml_connected: number;
    pricing_visitors: number;
    checkouts_started: number;
    trials_started: number;
    subscriptions_activated: number;
    subscriptions_cancelled: number;
  };
  abandonment: {
    checkout_abandoned: number;
    trials_not_converted: number;
    pricing_no_checkout: number;
  };
  top_pages: Array<{ path: string; views: number; visitors: number }>;
  visitors_by_day: Array<{ day: string; views: number; visitors: number }>;
  traffic_sources: Array<{ source: string; visitors: number; signups: number }>;
  utm_performance: Array<{
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
    visitors: number;
    signups: number;
  }>;
  agents: { agents_online: number; agents_offline: number };
  prints: { prints_success: number; prints_failed: number };
}
