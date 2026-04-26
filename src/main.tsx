import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import App from '@/app/App';
import { ThemeProvider } from '@/app/ThemeProvider';
import ProvidersPage from '@/components/settings/ProvidersPage';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSessionsStore } from '@/stores/sessionsStore';
import { useTreeStore } from '@/stores/treeStore';
import '@/styles/index.css';

void useSettingsStore.getState().hydrate();
void useSessionsStore.getState().hydrate();

// 当前 session 变化 → treeStore 重载
useSessionsStore.subscribe((state, prev) => {
  if (state.currentSessionId !== prev.currentSessionId) {
    void useTreeStore.getState().loadSession(state.currentSessionId);
  }
});

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
