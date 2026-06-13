import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { setApiBaseUrl } from './services/apiClient';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

const defaultApiBaseUrl = (window as any).__AACP_API_BASE_URL__ ?? '';
setApiBaseUrl(defaultApiBaseUrl);

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
