import React from 'react';
import { Toaster } from 'react-hot-toast';
import App from './App';
import SeoManager from './components/SeoManager';

/**
 * Shared application tree rendered by both the browser entry (main.tsx, under
 * BrowserRouter) and the prerender entry (entry-server.tsx, under
 * StaticRouter) — keeping them identical is what makes hydration clean.
 */
export default function Root() {
  return (
    <React.StrictMode>
      <SeoManager />
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            borderRadius: '12px',
            padding: '12px 16px',
            fontSize: '14px',
            border: '1px solid rgb(var(--border))',
            background: 'rgb(var(--surface))',
            color: 'rgb(var(--foreground))',
          },
          success: { iconTheme: { primary: 'rgb(var(--success))', secondary: '#fff' } },
          error: { iconTheme: { primary: 'rgb(var(--danger))', secondary: '#fff' } },
        }}
      />
    </React.StrictMode>
  );
}
