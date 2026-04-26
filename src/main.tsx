import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import App from '@/app/App';
import { ThemeProvider } from '@/app/ThemeProvider';
import ProvidersPage from '@/components/settings/ProvidersPage';
import { useSettingsStore } from '@/stores/settingsStore';
import '@/styles/index.css';

void useSettingsStore.getState().hydrate();

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/settings" element={<ProvidersPage />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
);
