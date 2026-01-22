// Initialize Wails v3 runtime (side-effect import - must be first)
// This enables context menus, window dragging, and runtime features
import '@wailsio/runtime';

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ToastProvider } from './components/Toast';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>
);
