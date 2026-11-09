/**
 * Consent Mode v2 do Google Ads.
 *
 * O `index.html` declara tudo como "denied" por padrão; este helper atualiza
 * para o valor escolhido no banner (MarketingConsent) e reaplica a escolha
 * salva em cada carregamento de página.
 */
export type GoogleConsentValue = 'granted' | 'denied';

export function updateGoogleConsent(value: GoogleConsentValue) {
  const gtag = (window as typeof window & { gtag?: (...args: unknown[]) => void }).gtag;
  if (!gtag) return;
  gtag('consent', 'update', {
    ad_storage: value,
    ad_user_data: value,
    ad_personalization: value,
    analytics_storage: value,
  });
}
