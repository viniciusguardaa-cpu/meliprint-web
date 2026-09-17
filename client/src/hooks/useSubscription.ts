import { useState, useEffect } from 'react';

export interface SubscriptionStatus {
  hasSubscription: boolean;
  status: string | null;
  currentPeriodEnd: string | null;
  /** For cancelled subs still inside the paid period: last day of access. */
  accessUntil?: string | null;
  trialEndsAt?: string | null;
  /** Days left in the trial (only when status === 'trialing'). */
  trialDaysRemaining?: number | null;
  planId?: string | null;
  planName: string | null;
  price: number | null;
  autoPrint?: boolean;
  /** Pro: dispatch-deadline queue on the dashboard. */
  slaQueue?: boolean;
  /** Pro: packing check (items confirmation) before printing. */
  packingCheck?: boolean;
  /** Pro: browser print history tab. */
  printHistory?: boolean;
  isFreeAccess?: boolean;
  /** Whether this account can still start a free trial (one per account). */
  canTrial?: boolean;
}

export function useSubscription() {
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSubscription = async () => {
      try {
        const res = await fetch('/api/subscription/status', {
          credentials: 'include'
        });
        
        if (res.ok) {
          const data = await res.json();
          setSubscription(data);
        } else {
          setSubscription({ hasSubscription: false, status: null, currentPeriodEnd: null, planName: null, price: null });
        }
      } catch {
        setSubscription({ hasSubscription: false, status: null, currentPeriodEnd: null, planName: null, price: null });
      } finally {
        setLoading(false);
      }
    };

    checkSubscription();
  }, []);

  return { subscription, loading, isActive: subscription?.hasSubscription ?? false };
}
