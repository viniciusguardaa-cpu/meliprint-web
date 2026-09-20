import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getVisitorKey, track, captureUTM } from '../lib/analytics';
import Navbar from '../components/landing/Navbar';
import Hero from '../components/landing/Hero';
import TrustBar from '../components/landing/TrustBar';
import BentoFeatures from '../components/landing/BentoFeatures';
import Workflow from '../components/landing/Workflow';
import ProductStory from '../components/landing/ProductStory';
import LogisticsEditorial from '../components/landing/LogisticsEditorial';
import Testimonials from '../components/landing/Testimonials';
import PricingCta from '../components/landing/PricingCta';
import Faq from '../components/landing/Faq';
import Footer from '../components/landing/Footer';

interface Plan {
  id: string;
  name: string;
  description: string;
  autoPrint: boolean;
  features: string[];
  price: { amount: number; currency: string; billingPeriod: string } | null;
  experimentVariant: string | null;
}

function formatBRL(amount: number): string {
  return amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Landing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [proPrice, setProPrice] = useState<number | null>(null);

  useEffect(() => {
    captureUTM();
    track('landing_view', { path: window.location.pathname });
    const fetchPlans = async () => {
      try {
        const visitorKey = getVisitorKey();
        const res = await fetch(`/api/plans?visitor_key=${encodeURIComponent(visitorKey)}`);
        if (res.ok) {
          const data = await res.json();
          const pro = (data.plans || []).find((p: Plan) => p.id === 'pro');
          if (pro?.price) setProPrice(pro.price.amount);
        }
      } catch {
        // ignore — fallback to no price display
      }
    };
    fetchPlans();
  }, []);

  const handleCTA = () => {
    if (user) {
      navigate('/dashboard');
    } else {
      navigate('/pricing');
    }
  };

  const priceLabel = proPrice !== null ? `R$ ${formatBRL(proPrice)}` : 'R$ 59,90';

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        isLoggedIn={!!user}
        onPrimaryCta={handleCTA}
        onLogin={() => navigate('/login')}
        onDashboard={() => navigate('/dashboard')}
      />
      <main>
        <Hero priceLabel={priceLabel} onPrimaryCta={handleCTA} />
        <TrustBar />
        <BentoFeatures />
        <Workflow />
        <ProductStory />
        <LogisticsEditorial onCta={handleCTA} />
        <Testimonials />
        <PricingCta priceLabel={priceLabel} onCta={handleCTA} />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
