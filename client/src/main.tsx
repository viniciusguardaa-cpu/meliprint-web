import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import Root from './Root';
import './index.css';
import { getMarketingConsent } from './lib/metaPixel';
import { updateGoogleConsent } from './lib/googleConsent';

// Reaplica a escolha de consentimento salva antes de qualquer evento do gtag.
const savedConsent = getMarketingConsent();
if (savedConsent) updateGoogleConsent(savedConsent);

const container = document.getElementById('root')!;
const tree = (
  <BrowserRouter>
    <Root />
  </BrowserRouter>
);

// Prerendered public pages ship their markup inside #root — hydrate it so
// React attaches listeners without wiping the server HTML. The bare SPA shell
// (spa.html, private routes) has an empty #root and mounts normally.
if (container.hasChildNodes()) {
  ReactDOM.hydrateRoot(container, tree);
} else {
  ReactDOM.createRoot(container).render(tree);
}
