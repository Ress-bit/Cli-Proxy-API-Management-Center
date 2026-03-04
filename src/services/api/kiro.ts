/**
 * Kiro quota API service
 */

import { apiClient } from './client';
import type { KiroQuotaPayload } from '@/types';

const KIRO_TIMEOUT_MS = 30 * 1000;

export const kiroApi = {
  /**
   * Get Kiro quota for a specific auth index
   * If authIndex is not provided, server will use the first available Kiro credential
   */
  getQuota: (authIndex?: string) => {
    const params = authIndex ? `?auth_index=${encodeURIComponent(authIndex)}` : '';
    return apiClient.get<KiroQuotaPayload>(`/v0/management/kiro-quota${params}`, {
      timeout: KIRO_TIMEOUT_MS,
    });
  },
};
