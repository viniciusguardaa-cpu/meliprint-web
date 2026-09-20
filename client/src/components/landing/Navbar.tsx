import { useEffect, useState } from 'react';
import { Menu, X, ArrowRight } from 'lucide-react';
import Logo from '../Logo';
import { cn } from '../../lib/utils';

const NAV_LINKS = [
  { label: 'Recursos', href: '#recursos' },
  { label: 'Como funciona', href: '#como-funciona' },
  { label: 'Planos', href: '#planos' },
  { label: 'Depoimentos', href: '#depoimentos' },
  { label: 'Dúvidas', href: '#duvidas' },
];

interface NavbarProps {
  isLoggedIn: boolean;
  onPrimaryCta: () => void;
  onLogin: () => void;
  onDashboard: () => void;
}

export default function Navbar({ isLoggedIn, onPrimaryCta, onLogin, onDashboard }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Lock body scroll while the drawer is open + close on Escape.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const go = (href: string) => {
    setOpen(false);
    document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 sm:px-6 pt-3 sm:pt-4">
      <div
        className={cn(
          'mx-auto flex items-center justify-between gap-4 px-4 sm:px-5 py-2.5 transition-all duration-300 max-w-7xl',
          scrolled || open
            ? 'bg-white/90 backdrop-blur-xl border border-black/[0.06] shadow-[0_12px_40px_-16px_rgba(16,24,39,0.18)] rounded-2xl'
            : 'bg-transparent border border-transparent'
        )}
      >
        <a href="/" className="flex-shrink-0 flex items-center" aria-label="LabelGo — início">
          <Logo className="h-8 sm:h-9" />
        </a>

        {/* Desktop links */}
        <nav className="hidden lg:flex items-center gap-1" aria-label="Navegação principal">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="px-3 py-2 text-sm font-medium text-foreground/70 hover:text-foreground rounded-lg hover:bg-black/[0.04] transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Desktop actions */}
        <div className="hidden lg:flex items-center gap-2">
          {isLoggedIn ? (
            <button
              onClick={onDashboard}
              className="btn-shine inline-flex items-center gap-2 bg-primary text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-all duration-150 hover:scale-[1.02] hover:shadow-[0_10px_30px_-8px_rgba(254,93,49,0.5)] active:scale-[0.98]"
            >
              Ir para o Dashboard
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <>
              <button
                onClick={onLogin}
                className="px-4 py-2.5 text-sm font-semibold text-foreground/80 hover:text-foreground rounded-xl hover:bg-black/[0.04] transition-colors"
              >
                Entrar
              </button>
              <button
                onClick={onPrimaryCta}
                className="btn-shine inline-flex items-center gap-2 bg-primary text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-all duration-150 hover:scale-[1.02] hover:shadow-[0_10px_30px_-8px_rgba(254,93,49,0.5)] active:scale-[0.98]"
              >
                Começar agora
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="lg:hidden inline-flex items-center justify-center w-11 h-11 rounded-xl text-foreground hover:bg-black/[0.04] transition-colors"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
        >
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile drawer */}
      <div
        id="mobile-menu"
        className={cn(
          'lg:hidden fixed inset-x-3 top-[68px] rounded-3xl bg-white border border-black/[0.06] shadow-[0_30px_80px_-20px_rgba(16,24,39,0.35)] p-3 transition-all duration-300 origin-top',
          open ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-[0.98] -translate-y-2 pointer-events-none invisible'
        )}
        aria-hidden={!open}
      >
        <nav className="flex flex-col" aria-label="Navegação móvel">
          {NAV_LINKS.map((link) => (
            <button
              key={link.href}
              onClick={() => go(link.href)}
              className="text-left px-4 py-3.5 text-[15px] font-medium text-foreground rounded-xl hover:bg-muted transition-colors"
            >
              {link.label}
            </button>
          ))}
        </nav>
        <div className="mt-2 pt-3 border-t border-border flex flex-col gap-2">
          {isLoggedIn ? (
            <button
              onClick={() => { setOpen(false); onDashboard(); }}
              className="btn-shine inline-flex items-center justify-center gap-2 bg-primary text-white font-semibold px-5 py-3.5 rounded-xl"
            >
              Ir para o Dashboard
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <>
              <button
                onClick={() => { setOpen(false); onPrimaryCta(); }}
                className="btn-shine inline-flex items-center justify-center gap-2 bg-primary text-white font-semibold px-5 py-3.5 rounded-xl"
              >
                Começar agora
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setOpen(false); onLogin(); }}
                className="inline-flex items-center justify-center px-5 py-3.5 text-[15px] font-semibold text-foreground rounded-xl hover:bg-muted transition-colors"
              >
                Entrar
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
