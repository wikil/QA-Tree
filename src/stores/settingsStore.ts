import { create } from 'zustand';
import { db, KV_KEYS } from '@/lib/db';
import type { Locale, ProviderConfig, ProxyConfig } from '@/types';

const DEFAULT_PROXY: ProxyConfig = {
  enabled: false,
  url: 'http://localhost:8787',
};

interface SettingsState {
  hydrated: boolean;
  providers: ProviderConfig[];
  defaultProviderId: string | null;
  proxy: ProxyConfig;
  locale: Locale;

  hydrate: () => Promise<void>;
  upsertProvider: (provider: ProviderConfig) => Promise<void>;
  removeProvider: (id: string) => Promise<void>;
  setDefaultProviderId: (id: string | null) => Promise<void>;
  setProxy: (proxy: ProxyConfig) => Promise<void>;
  setLocale: (locale: Locale) => Promise<void>;
}

let hydratePromise: Promise<void> | null = null;

export const useSettingsStore = create<SettingsState>((set, get) => ({
  hydrated: false,
  providers: [],
  defaultProviderId: null,
  proxy: DEFAULT_PROXY,
  locale: 'zh',

  hydrate: async () => {
    if (get().hydrated) return;
    if (hydratePromise) return hydratePromise;
    hydratePromise = (async () => {
      const [providers, defaultProviderRecord, proxyRecord, localeRecord] = await Promise.all([
        db.providers.toArray(),
        db.kv.get(KV_KEYS.defaultProviderId),
        db.kv.get(KV_KEYS.proxy),
        db.kv.get(KV_KEYS.locale),
      ]);
      const locale = localeRecord?.value === 'en' ? 'en' : 'zh';
      set({
        hydrated: true,
        providers,
        defaultProviderId: (defaultProviderRecord?.value as string | null) ?? null,
        proxy: (proxyRecord?.value as ProxyConfig | undefined) ?? DEFAULT_PROXY,
        locale,
      });
    })();
    return hydratePromise;
  },

  upsertProvider: async (provider) => {
    await db.providers.put(provider);
    set((s) => {
      const idx = s.providers.findIndex((p) => p.id === provider.id);
      const next =
        idx === -1
          ? [...s.providers, provider]
          : s.providers.map((p) => (p.id === provider.id ? provider : p));
      return { providers: next };
    });
    if (get().defaultProviderId === null) {
      await get().setDefaultProviderId(provider.id);
    }
  },

  removeProvider: async (id) => {
    await db.providers.delete(id);
    set((s) => ({ providers: s.providers.filter((p) => p.id !== id) }));
    if (get().defaultProviderId === id) {
      const fallback = get().providers[0]?.id ?? null;
      await get().setDefaultProviderId(fallback);
    }
  },

  setDefaultProviderId: async (id) => {
    await db.kv.put({ key: KV_KEYS.defaultProviderId, value: id });
    set({ defaultProviderId: id });
  },

  setProxy: async (proxy) => {
    await db.kv.put({ key: KV_KEYS.proxy, value: proxy });
    set({ proxy });
  },

  setLocale: async (locale) => {
    await db.kv.put({ key: KV_KEYS.locale, value: locale });
    set({ locale });
  },
}));

export const selectProviderById = (id: string | null) => (state: SettingsState) =>
  id ? state.providers.find((p) => p.id === id) ?? null : null;
