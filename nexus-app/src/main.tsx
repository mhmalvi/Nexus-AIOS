import React from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { StoreProvider } from './context/StoreContext';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <StoreProvider>
        <App />
      </StoreProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
