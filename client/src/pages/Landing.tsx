import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { rememberTrialIntent } from '../lib/trialIntent';
import { useAuth } from '../hooks/useAuth';
import { getVisitorKey, track, captureUTM } from '../lib/analytics';
import Navbar from '../components/landing/Navbar';
import BatchDemo from '../components/landing/BatchDemo';
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
  const [plansLoaded, setPlansLoaded] = useState(false);

  useEffect(() => {
    captureUTM();
    track('landing_view', { path: window.location.pathname });
    const controller = new AbortController();
    // Slow or hung API: stop waiting after 4s and show the regular prices instead of hiding them.
    const timer = window.setTimeout(() => controller.abort(), 4000);
    const fetchPlans = async () => {
      try {
        const visitorKey = getVisitorKey();
        const res = await fetch(`/api/plans?visitor_key=${encodeURIComponent(visitorKey)}`, { signal: controller.signal });
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
        // ignore — fallback to regular price once the request settles
      } finally {
        window.clearTimeout(timer);
        setPlansLoaded(true);
      }
    };
    fetchPlans();
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, []);

  const handleCTA = () => {
    if (user) {
      navigate('/dashboard');
    } else {
      rememberTrialIntent();
      navigate('/cadastro');
    }
  };

  // Motion is the default; ?hero=copy preserves the copy-only comparison.
  // Read the query string after mount: window does not exist during the build-time prerender.
  const [motionAlternative, setMotionAlternative] = useState(true);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('hero') === 'copy') setMotionAlternative(false);
  }, []);
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
        <Hero pricesReady={plansLoaded} founderPriceLabel={founderPrice !== null && founderRemaining !== null && founderRemaining > 0 ? founderPriceLabel : null} slotsCap={founderCap} priceLabel={priceLabel} onPrimaryCta={handleCTA} motionAlternative={motionAlternative} />
        {plansLoaded && founderRemaining !== null && <FounderOffer founderPriceLabel={founderPriceLabel} proPriceLabel={priceLabel} slotsRemaining={founderRemaining} slotsCap={founderCap} onCta={handleCTA} />}
        <BatchDemo />
        <TrustBar />
        <BentoFeatures />
        <Workflow />
        <ProductStory />
        <LogisticsEditorial onCta={handleCTA} />
        <Testimonials />
        {plansLoaded && <PricingCta priceLabel={founderPrice !== null && founderRemaining !== null && founderRemaining > 0 ? founderPriceLabel : priceLabel} regularPriceLabel={founderPrice !== null && founderRemaining !== null && founderRemaining > 0 ? priceLabel : null} slotsCap={founderCap} onCta={handleCTA} />}
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
