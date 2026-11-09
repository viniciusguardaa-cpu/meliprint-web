import { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';

export default function BatchDemo({ variant = 'section' }: { variant?: 'section' | 'hero' }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    // Mobile: não baixa/reproduz o MP4 automaticamente. O poster é o LCP e o
    // play fica por conta do usuário (controles nativos). Desktop: autoplay
    // só quando o bloco entra na viewport.
    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !preference.matches && !isMobile) {
          setPlaying(true);
        } else if (!entry.isIntersecting) {
          videoRef.current?.pause();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(container);
    const syncPlayback = () => {
      if (preference.matches) videoRef.current?.pause();
    };
    preference.addEventListener('change', syncPlayback);
    return () => {
      observer.disconnect();
      preference.removeEventListener('change', syncPlayback);
    };
  }, []);

  // O vídeo só é montado depois do clique/autoplay; aqui ele começa a tocar.
  useEffect(() => {
    if (!playing) return;
    void videoRef.current?.play().catch(() => { /* Native controls remain available. */ });
  }, [playing]);

  return (
    <section id={variant === 'hero' ? 'demo-hero' : undefined} className={variant === 'hero' ? 'mt-4 scroll-mt-4' : 'hidden md:block px-4 py-8 sm:py-12'} aria-labelledby={`batch-demo-title-${variant}`}>
      <div className="mx-auto max-w-3xl">
        <h2 id={`batch-demo-title-${variant}`} className={variant === 'hero' ? 'sr-only' : 'mb-4 text-center text-xl font-semibold text-foreground sm:text-2xl'}>
          Veja como imprimir em lote
        </h2>
        <div ref={containerRef}>
          {!playing ? (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              className="group relative block w-full overflow-hidden rounded-2xl border border-border bg-background shadow-sm"
              aria-label="Reproduzir demonstração"
            >
              <img
                {...{ fetchpriority: 'high' }}
                src="/2-labelgo-demo-poster.jpg"
                alt="Demonstração: selecionar os pedidos, clicar em Imprimir e gerar um PDF com todas as etiquetas."
                width={1280}
                height={720}
                className="block aspect-video w-full object-cover"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/30">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 shadow-lg">
                  <Play className="h-6 w-6 text-foreground" fill="currentColor" />
                </span>
              </span>
            </button>
          ) : (
            <video
              ref={videoRef}
              className="block aspect-video w-full rounded-2xl border border-border bg-background shadow-sm"
              width={1280}
              height={720}
              muted
              loop
              playsInline
              controls
              preload="none"
              poster="/2-labelgo-demo-poster.jpg"
              aria-label="Demonstração: selecionar os pedidos, clicar em Imprimir e gerar um PDF com todas as etiquetas."
            >
              <source src="/1-labelgo-demo-rapido.mp4" type="video/mp4" />
              Seu navegador não reproduz este vídeo. Selecione os pedidos e clique em Imprimir para gerar um PDF com as etiquetas.
            </video>
          )}
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Animação ilustrativa, pedidos fictícios. Você seleciona os pedidos antes de imprimir.
        </p>
      </div>
    </section>
  );
}
