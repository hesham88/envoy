import { DevPage } from '../dev/DevPage';

export function App() {
  if (typeof location !== 'undefined' && location.pathname.startsWith('/dev')) return <DevPage />;
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="flex items-center justify-between border-b border-line bg-surface px-8 py-5">
        <span className="text-xl font-bold tracking-tight">Envoy</span>
      </header>
      <main className="mx-auto max-w-[1200px] px-8 py-12">
        <h1 className="m-0 text-[44px] leading-[1.1] font-bold tracking-tight">
          Ask the cloud.{' '}
          <br />
          Keep your secrets.
        </h1>
      </main>
    </div>
  );
}
