/**
 * Kiro quota API service
 */

import { apiClient } from './client';
import type { KiroQuotaPayload } from '@/types';
import { normalizeApiBase } from '@/utils/connection';
import { DEFAULT_API_PORT } from '@/utils/constants';

const KIRO_TIMEOUT_MS = 30 * 1000;

export interface KiroOAuthStartResponse {
  authUrl: string;
  stateId: string;
  expiresIn?: number;
}

export interface KiroOAuthStatusResponse {
  status: 'pending' | 'success' | 'failed';
  remaining_seconds?: number;
  completed_at?: string;
  expires_at?: string;
  failed_at?: string;
  error?: string;
}

export interface KiroOAuthImportResponse {
  success: boolean;
  message?: string;
  fileName?: string;
  email?: string;
  error?: string;
}

const decodeHtmlAttr = (value: string): string =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

const resolveKiroOAuthBase = (apiBase: string): string => {
  const normalized = normalizeApiBase(apiBase);
  if (!normalized) {
    throw new Error('Missing API base URL');
  }

  const withoutHash = normalized.split('#')[0]?.split('?')[0] || normalized;
  try {
    const parsed = new URL(withoutHash);
    const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
    const isViteDevOrigin =
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') && port === '5173';
    const targetOrigin = isViteDevOrigin
      ? `${parsed.protocol}//${parsed.hostname}:${DEFAULT_API_PORT}`
      : parsed.origin;
    const pathPrefix = parsed.pathname
      .replace(/\/management\.html$/i, '')
      .replace(/\/+$/g, '');
    const prefix = pathPrefix ? pathPrefix : '';
    return `${targetOrigin}${prefix}/v0/oauth/kiro`;
  } catch {
    const safeBase = withoutHash.replace(/\/management\.html$/i, '').replace(/\/+$/g, '');
    return `${safeBase}/v0/oauth/kiro`;
  }
};

const extractBuilderStartData = (html: string): KiroOAuthStartResponse => {
  const stateMatch =
    html.match(/const\s+stateID\s*=\s*["']([^"']+)["']/i) ||
    html.match(/\/status\?state=([^"'\s<]+)/i);
  const authUrlMatch =
    html.match(/id=["']authBtn["'][^>]*href=["']([^"']+)["']/i) ||
    html.match(/href=["']([^"']+)["'][^>]*id=["']authBtn["']/i);
  const expiresInMatch = html.match(/let\s+remainingSeconds\s*=\s*(\d+)/i);

  const stateId = stateMatch?.[1]?.trim() || '';
  const authUrlRaw = authUrlMatch?.[1]?.trim() || '';
  const authUrl = decodeHtmlAttr(authUrlRaw);

  if (!stateId || !authUrl) {
    const hasSelectPageMarker = html.includes('Select Authentication Method');
    if (hasSelectPageMarker) {
      throw new Error('Kiro OAuth start did not receive method=builder-id. Please retry.');
    }

    const errorMatch = html.match(/<div\s+class=["']error["']>([^<]+)<\/div>/i);
    if (errorMatch?.[1]) {
      throw new Error(errorMatch[1].trim());
    }

    throw new Error('Failed to parse Kiro OAuth start response');
  }

  const expiresIn = expiresInMatch?.[1] ? Number(expiresInMatch[1]) : undefined;
  return {
    authUrl,
    stateId,
    expiresIn: Number.isFinite(expiresIn) ? expiresIn : undefined
  };
};

export const kiroApi = {
  /**
   * Get Kiro quota for a specific auth index
   * If authIndex is not provided, server will use the first available Kiro credential
   */
  getQuota: (authIndex?: string) => {
    const params = authIndex ? `?auth_index=${encodeURIComponent(authIndex)}` : '';
    return apiClient.get<KiroQuotaPayload>(`/kiro-quota${params}`, {
      timeout: KIRO_TIMEOUT_MS,
    });
  },

  getOAuthEntryUrl: (apiBase: string) => resolveKiroOAuthBase(apiBase),

  startBuilderId: async (apiBase: string) => {
    const base = resolveKiroOAuthBase(apiBase);
    const response = await apiClient.requestRaw({
      method: 'GET',
      url: `${base}/start?method=builder-id`,
      responseType: 'text',
      timeout: KIRO_TIMEOUT_MS,
    });

    return extractBuilderStartData(typeof response.data === 'string' ? response.data : String(response.data || ''));
  },

  getOAuthStatus: (apiBase: string, stateId: string) => {
    const base = resolveKiroOAuthBase(apiBase);
    return apiClient.get<KiroOAuthStatusResponse>(`${base}/status`, {
      params: { state: stateId },
      timeout: KIRO_TIMEOUT_MS,
    });
  },

  importRefreshToken: (apiBase: string, refreshToken: string) => {
    const base = resolveKiroOAuthBase(apiBase);
    return apiClient.post<KiroOAuthImportResponse>(`${base}/import`, {
      refreshToken,
    }, {
      timeout: KIRO_TIMEOUT_MS,
    });
  },
};
