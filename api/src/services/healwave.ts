import { capabilities } from '../config.js';

/**
 * Boundary for a future Healwave integration. It intentionally exposes reads only.
 * Use a dedicated PostgreSQL role with SELECT privileges on an allow-list of views.
 */
export interface HealwaveReadOnlySource {
  getPatientSnapshot(externalPatientId: string): Promise<unknown>;
  getRecentEncounters(externalPatientId: string, since: Date): Promise<unknown[]>;
}

export function buildHealwaveReadOnlyStatus() {
  return {
    enabled: capabilities.healwaveReadOnly,
    mode: 'read-only' as const,
    writesSupported: false,
    strategy: 'dedicated-select-only-role-and-allowlisted-views',
  };
}
