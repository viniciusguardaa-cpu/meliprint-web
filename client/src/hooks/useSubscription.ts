import { useState, useEffect } from 'react';

interface SubscriptionStatus {
  hasSubscription: boolean;
  status: string | null;
  currentPeriodEnd: string | null;
  planName: string | null;
  price: number | null;
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
