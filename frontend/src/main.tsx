import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DAppKitProvider } from '@mysten/dapp-kit-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { dappKit } from './lib/dapp-kit.ts';
import App from './App.tsx';
import './index.css';

// react-query throttling (lesson 2026-06-07 / 429): high staleTime, no focus refetch, bounded retry.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DAppKitProvider dAppKit={dappKit}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </DAppKitProvider>
  </StrictMode>,
);
