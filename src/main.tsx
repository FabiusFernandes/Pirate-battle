import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createQueryClient } from '@/api/queries';
import { RegistrationManager } from '@/api/RegistrationManager';
import { installAudioUnlock } from '@/game/audio/AudioManager';
import '@/game/debug/e2eBridge';
import { enableMocking } from '@/mocks/browser';
import '@/mocks/e2eControls';
import { App } from './App';
import './styles/global.css';

installAudioUnlock();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

const queryClient = createQueryClient();

// The mock API must intercept the very first request; the game itself never waits on it.
void enableMocking().finally(() => {
  createRoot(rootElement).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RegistrationManager />
        <App />
      </QueryClientProvider>
    </StrictMode>,
  );
});
