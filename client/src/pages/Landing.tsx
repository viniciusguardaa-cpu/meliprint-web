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
import FounderOffer from '../components/landing/FounderOffer';
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
  const [founderPrice, setFounderPrice] = useState<number | null>(null);
  const [founderRemaining, setFounderRemaining] = useState<number | null>(null);
  const [founderCap, setFounderCap] = useState<number | null>(null);

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
          const founder = (data.plans || []).find((p: Plan) => p.id === 'founder');
          if (founder?.price) setFounderPrice(founder.price.amount);
          if (data.founder && typeof data.founder.remaining === 'number') {
            setFounderRemaining(data.founder.remaining);
            setFounderCap(typeof data.founder.cap === 'number' ? data.founder.cap : null);
          }
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

  // Motion is the default in this unmerged PR; ?hero=copy preserves the copy-only comparison.
  const motionAlternative = new URLSearchParams(window.location.search).get('hero') !== 'copy';
  const priceLabel = proPrice !== null ? `R$ ${formatBRL(proPrice)}` : 'R$ 19,90';
  const founderPriceLabel = founderPrice !== null ? `R$ ${formatBRL(founderPrice)}` : 'R$ 7,90';

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        isLoggedIn={!!user}
        onPrimaryCta={handleCTA}
        onLogin={() => navigate('/login')}
        onDashboard={() => navigate('/dashboard')}
      />
      <main>
        <Hero priceLabel={priceLabel} onPrimaryCta={handleCTA} motionAlternative={motionAlternative} />
        <FounderOffer founderPriceLabel={founderPriceLabel} proPriceLabel={priceLabel} slotsRemaining={founderRemaining} slotsCap={founderCap} onCta={handleCTA} />
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
