export interface PartnerSummary {
  visitors: number;
  signups: number;
  trials: number;
  paid: number;
  cancelled: number;
  commission: { monthly: number | null; accrued: number | null };
}

export interface AdminPartner extends PartnerSummary {
  id: number;
  name: string;
  contact_email: string | null;
  ref_code: string;
  link: string;
  is_active: boolean;
  created_at: string;
  commission_pct: number | null;
  commission_months: number | null;
}

export interface PartnerDashboardData {
  partner: { name: string; ref_code: string; link: string; is_active: boolean; commission_pct: number | null; commission_months: number | null };
  summary: PartnerSummary;
  referrals: Array<{ label: string; signed_up_at: string; status: 'paid' | 'trial' | 'cancelled' | 'none'; first_paid_at: string | null }>;
}

export const brl2 = (n: number | null | undefined) =>
  n === null || n === undefined ? '-' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
