import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getMarketingConsent, setMarketingConsent, trackMetaPageView, flushConfirmedMetaSubscription } from '../lib/metaPixel';

export default function MarketingConsent() {
  const { pathname, search, hash } = useLocation();
  const [consent, setConsent] = useState<ReturnType<typeof getMarketingConsent>>(null);
  const [editing, setEditing] = useState(false);
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
  return <section aria-label="Preferências de cookies de publicidade" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-3xl rounded-xl border border-border bg-surface p-4 shadow-xl sm:p-5">
    <h2 className="font-semibold text-foreground">Cookies de publicidade (opcionais)</h2>
    <p className="mt-2 text-sm text-muted-foreground">Com sua permissão, usamos o Pixel da Meta para medir visitas, cadastros, testes e assinaturas e melhorar nossos anúncios no Facebook e Instagram. A Meta recebe dados técnicos do navegador e esses eventos. Recusar não impede o uso do LabelGo. Você pode mudar sua escolha aqui. <Link className="underline" to="/privacidade">Política de privacidade</Link>.</p>
    <div className="mt-3 flex flex-wrap gap-3">
      <button className="rounded-lg border border-border px-4 py-2 text-sm font-medium" onClick={() => choose('denied')}>Recusar publicidade</button>
      <button className="rounded-lg border border-border px-4 py-2 text-sm font-medium" onClick={() => choose('granted')}>Aceitar publicidade</button>
    </div>
  </section>;
}
