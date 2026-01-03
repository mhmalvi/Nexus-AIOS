import React from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { StoreProvider } from './context/StoreContext';
import App from './App';

const container = document.getElementById('root');

if (container) {
  const root = createRoot(container);
  root.render(
    <ErrorBoundary>
      <StoreProvider>
        <App />
      </StoreProvider>
    </ErrorBoundary>
  );
} else {
  console.error("Critical: Root element not found.");
}
