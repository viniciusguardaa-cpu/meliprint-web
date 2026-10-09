import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { rememberTrialIntent } from '../lib/trialIntent';
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

function BatchDemo() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPlayback = () => {
      const video = videoRef.current;
      if (!video) return;
      if (preference.matches) video.pause();
      else void video.play().catch(() => { /* Native controls remain available. */ });
    };
    syncPlayback();
    preference.addEventListener('change', syncPlayback);
    return () => preference.removeEventListener('change', syncPlayback);
  }, []);

  return (
    <section className="px-4 py-8 sm:py-12" aria-labelledby="batch-demo-title">
      <div className="mx-auto max-w-3xl">
        <h2 id="batch-demo-title" className="mb-4 text-center text-xl font-semibold text-foreground sm:text-2xl">
          Veja como imprimir em lote
        </h2>
        <video
          ref={videoRef}
          className="block aspect-video w-full rounded-2xl border border-border bg-background shadow-sm"
          width={1280}
          height={720}
          autoPlay
          muted
          loop
          playsInline
          controls
          preload="metadata"
          poster="/labelgo-demo-poster.jpg"
          aria-label="Demonstração: selecionar os pedidos, clicar em Imprimir e gerar um PDF com todas as etiquetas."
        >
          <source src="/labelgo-demo-rapido.mp4" type="video/mp4" />
          Seu navegador não reproduz este vídeo. Selecione os pedidos e clique em Imprimir para gerar um PDF com as etiquetas.
        </video>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Animação ilustrativa com pedidos fictícios. Você seleciona os pedidos antes de imprimir.
        </p>
      </div>
    </section>
  );
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
      rememberTrialIntent();
      navigate('/cadastro');
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
        <Hero founderPriceLabel={founderPrice !== null && founderRemaining !== null && founderRemaining > 0 ? founderPriceLabel : null} slotsCap={founderCap} priceLabel={priceLabel} onPrimaryCta={handleCTA} motionAlternative={motionAlternative} />
        <FounderOffer founderPriceLabel={founderPriceLabel} proPriceLabel={priceLabel} slotsRemaining={founderRemaining} slotsCap={founderCap} onCta={handleCTA} />
        <BatchDemo />
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
