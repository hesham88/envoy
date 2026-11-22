import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import { DevPage } from './dev/DevPage';

function App() {
  if (location.pathname.startsWith('/dev')) return <DevPage />;
  return (
    <main style={{ maxWidth: 720, margin: '15vh auto', padding: '0 24px' }}>
      <h1 style={{ fontSize: 44, lineHeight: 1.1, margin: 0 }}>Ask the cloud. Keep your secrets.</h1>
      <p style={{ color: 'var(--muted)', fontSize: 18 }}>
        Envoy is being built for #BuildHybridAI 2026. The full app arrives soon. Developers:{' '}
        <a href="/dev">/dev</a>.
      </p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
