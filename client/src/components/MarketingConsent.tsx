import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getMarketingConsent, setMarketingConsent, trackMetaPageView, flushConfirmedMetaSubscription } from '../lib/metaPixel';

export default function MarketingConsent() {
  const { pathname, search, hash } = useLocation();
  const [consent, setConsent] = useState<ReturnType<typeof getMarketingConsent>>(null);
  const [editing, setEditing] = useState(false);
  const [details, setDetails] = useState(false);
  useEffect(() => {
    const sync = () => setConsent(getMarketingConsent());
    sync(); window.addEventListener('labelgo:marketing-consent', sync);
    return () => window.removeEventListener('labelgo:marketing-consent', sync);
  }, []);
  useEffect(() => {
    if (consent === 'granted') { trackMetaPageView(pathname); flushConfirmedMetaSubscription(); }
  }, [consent, pathname, search, hash]);
  const choose = (value: 'granted' | 'denied') => { setMarketingConsent(value); setEditing(false); };
  if (consent && !editing) return <button className="fixed bottom-3 left-3 z-50 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-sm" onClick={() => setEditing(true)}>Cookies de publicidade</button>;
  return <section aria-label="Preferências de cookies de publicidade" className="relative z-50 border-b border-border bg-surface px-4 py-3 text-sm">
    <div className="mx-auto max-w-5xl">
      <p className="text-muted-foreground">Cookies opcionais ajudam a medir nossos anúncios. Recusar não impede o uso do LabelGo.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button className="rounded-lg border border-border px-3 py-2 text-xs font-medium" onClick={() => choose('denied')}>Recusar publicidade</button>
        <button className="rounded-lg border border-border px-3 py-2 text-xs font-medium" onClick={() => choose('granted')}>Aceitar publicidade</button>
        <button className="text-xs underline" aria-expanded={details} onClick={() => setDetails(!details)}>Detalhes</button>
      </div>
      {details && <p className="mt-3 text-muted-foreground">Com sua permissão, usamos o Pixel da Meta para medir visitas, cadastros, testes e assinaturas. A Meta recebe dados técnicos do navegador e esses eventos. Você pode mudar sua escolha pelo botão de cookies. <Link className="underline" to="/privacidade">Política de privacidade</Link>.</p>}
    </div>
  </section>;
}
