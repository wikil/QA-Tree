import { useSessionsStore, selectCurrentSession } from '@/stores/sessionsStore';
import { useSettingsStore, selectProviderById } from '@/stores/settingsStore';
import type { ProviderConfig, ProxyConfig, Session } from '@/types';

export interface ResolvedProvider {
  session: Session | null;
  provider: ProviderConfig | null;
  proxy: ProxyConfig;
}

/**
 * Single source of truth for "which provider should this prompt use?":
 * session-pinned providerId wins, otherwise fall back to the global default.
 * Returned proxy is always the global setting.
 */
export function useResolvedProvider(): ResolvedProvider {
  const session = useSessionsStore(selectCurrentSession);
  const defaultProviderId = useSettingsStore((s) => s.defaultProviderId);
  const proxy = useSettingsStore((s) => s.proxy);
  const provider = useSettingsStore(
    selectProviderById(session?.providerId ?? defaultProviderId),
  );
  return { session, provider, proxy };
}
