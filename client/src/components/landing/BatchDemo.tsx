import { useEffect, useRef } from 'react';

export default function BatchDemo({ variant = 'section' }: { variant?: 'section' | 'hero' }) {
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
    <section id={variant === 'hero' ? 'demo-hero' : undefined} className={variant === 'hero' ? 'mt-4 scroll-mt-4' : 'hidden md:block px-4 py-8 sm:py-12'} aria-labelledby={`batch-demo-title-${variant}`}>
      <div className="mx-auto max-w-3xl">
        <h2 id={`batch-demo-title-${variant}`} className={variant === 'hero' ? 'sr-only' : 'mb-4 text-center text-xl font-semibold text-foreground sm:text-2xl'}>
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
          poster="/2-labelgo-demo-poster.jpg"
          aria-label="Demonstração: selecionar os pedidos, clicar em Imprimir e gerar um PDF com todas as etiquetas."
        >
          <source src="/1-labelgo-demo-rapido.mp4" type="video/mp4" />
          Seu navegador não reproduz este vídeo. Selecione os pedidos e clique em Imprimir para gerar um PDF com as etiquetas.
        </video>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Animação ilustrativa, pedidos fictícios. Você seleciona os pedidos antes de imprimir.
        </p>
      </div>
    </section>
  );
}
