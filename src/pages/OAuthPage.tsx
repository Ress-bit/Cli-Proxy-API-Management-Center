import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentType,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuthStore, useNotificationStore, useThemeStore } from '@/stores';
import { oauthApi, type OAuthProvider, type IFlowCookieAuthResponse } from '@/services/api/oauth';
import { vertexApi, type VertexImportResponse } from '@/services/api/vertex';
import { kiroApi } from '@/services/api/kiro';
import { copyToClipboard } from '@/utils/clipboard';
import { IconGithub, type IconProps } from '@/components/ui/icons';
import styles from './OAuthPage.module.scss';
import iconCodex from '@/assets/icons/codex.svg';
import iconClaude from '@/assets/icons/claude.svg';
import iconAntigravity from '@/assets/icons/antigravity.svg';
import iconCodeBuddy from '@/assets/icons/codebuddy.svg';
import iconCursor from '@/assets/icons/cursor.svg';
import iconGemini from '@/assets/icons/gemini.svg';
import iconIflow from '@/assets/icons/iflow.svg';
import iconKilo from '@/assets/icons/kilo.svg';
import iconKimiLight from '@/assets/icons/kimi-light.svg';
import iconKimiDark from '@/assets/icons/kimi-dark.svg';
import iconQwen from '@/assets/icons/qwen.svg';
import iconVertex from '@/assets/icons/vertex.svg';
import iconKiroUpload from '@/assets/icons/kiro.svg';

interface ProviderState {
  url?: string;
  state?: string;
  status?: 'idle' | 'waiting' | 'success' | 'error';
  error?: string;
  polling?: boolean;
  projectId?: string;
  projectIdError?: string;
  callbackUrl?: string;
  callbackSubmitting?: boolean;
  callbackStatus?: 'success' | 'error';
  callbackError?: string;
}

interface VertexImportResult {
  projectId?: string;
  email?: string;
  location?: string;
  authFile?: string;
}

interface VertexImportState {
  file?: File;
  fileName: string;
  location: string;
  loading: boolean;
  error?: string;
  result?: VertexImportResult;
}

type KiroBuilderState = {
  status: 'idle' | 'starting' | 'pending' | 'success' | 'failed';
  authUrl?: string;
  stateId?: string;
  remainingSeconds?: number;
  expiresAt?: string;
  error?: string;
};

type KiroImportState = {
  fileName: string;
  refreshToken: string;
  loading: boolean;
  error?: string;
  result?: {
    message?: string;
    fileName?: string;
    email?: string;
  };
};

type IFlowCookieState = {
  cookie: string;
  loading: boolean;
  error?: string;
  errorType?: 'warning' | 'error';
  result?: IFlowCookieAuthResponse;
};

const KIRO_POLL_INTERVAL_MS = 3000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === 'string') return error.message;
  return typeof error === 'string' ? error : '';
}

function getErrorStatus(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined;
  return typeof error.status === 'number' ? error.status : undefined;
}

function parseKiroRefreshTokenFromFile(text: string): string {
  const payload = JSON.parse(text) as Record<string, unknown>;
  const candidates = [
    payload.refreshToken,
    payload.refresh_token,
    payload.RefreshToken,
    payload.token,
  ];
  const token = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
  return typeof token === 'string' ? token.trim() : '';
}

const PROVIDERS: {
  id: OAuthProvider;
  titleKey: string;
  hintKey: string;
  urlLabelKey: string;
  icon: string | { light: string; dark: string } | ComponentType<IconProps>;
}[] = [
  {
    id: 'codex',
    titleKey: 'auth_login.codex_oauth_title',
    hintKey: 'auth_login.codex_oauth_hint',
    urlLabelKey: 'auth_login.codex_oauth_url_label',
    icon: iconCodex,
  },
  {
    id: 'anthropic',
    titleKey: 'auth_login.anthropic_oauth_title',
    hintKey: 'auth_login.anthropic_oauth_hint',
    urlLabelKey: 'auth_login.anthropic_oauth_url_label',
    icon: iconClaude,
  },
  {
    id: 'antigravity',
    titleKey: 'auth_login.antigravity_oauth_title',
    hintKey: 'auth_login.antigravity_oauth_hint',
    urlLabelKey: 'auth_login.antigravity_oauth_url_label',
    icon: iconAntigravity,
  },
  {
    id: 'codebuddy',
    titleKey: 'auth_login.codebuddy_oauth_title',
    hintKey: 'auth_login.codebuddy_oauth_hint',
    urlLabelKey: 'auth_login.codebuddy_oauth_url_label',
    icon: iconCodeBuddy,
  },
  {
    id: 'cursor',
    titleKey: 'auth_login.cursor_oauth_title',
    hintKey: 'auth_login.cursor_oauth_hint',
    urlLabelKey: 'auth_login.cursor_oauth_url_label',
    icon: iconCursor,
  },
  {
    id: 'gemini-cli',
    titleKey: 'auth_login.gemini_cli_oauth_title',
    hintKey: 'auth_login.gemini_cli_oauth_hint',
    urlLabelKey: 'auth_login.gemini_cli_oauth_url_label',
    icon: iconGemini,
  },
  {
    id: 'github',
    titleKey: 'auth_login.github_oauth_title',
    hintKey: 'auth_login.github_oauth_hint',
    urlLabelKey: 'auth_login.github_oauth_url_label',
    icon: IconGithub,
  },
  {
    id: 'kilo',
    titleKey: 'auth_login.kilo_oauth_title',
    hintKey: 'auth_login.kilo_oauth_hint',
    urlLabelKey: 'auth_login.kilo_oauth_url_label',
    icon: iconKilo,
  },
  {
    id: 'kimi',
    titleKey: 'auth_login.kimi_oauth_title',
    hintKey: 'auth_login.kimi_oauth_hint',
    urlLabelKey: 'auth_login.kimi_oauth_url_label',
    icon: { light: iconKimiLight, dark: iconKimiDark },
  },
  {
    id: 'qwen',
    titleKey: 'auth_login.qwen_oauth_title',
    hintKey: 'auth_login.qwen_oauth_hint',
    urlLabelKey: 'auth_login.qwen_oauth_url_label',
    icon: iconQwen,
  },
];

const CALLBACK_SUPPORTED: OAuthProvider[] = ['codex', 'anthropic', 'antigravity', 'gemini-cli'];
const getProviderI18nPrefix = (provider: OAuthProvider) => provider.replace('-', '_');
const getAuthKey = (provider: OAuthProvider, suffix: string) =>
  `auth_login.${getProviderI18nPrefix(provider)}_${suffix}`;

const getIconSrc = (
  icon: string | { light: string; dark: string } | ComponentType<IconProps>,
  theme: 'light' | 'dark'
) => {
  if (typeof icon === 'string') return icon;
  if (typeof icon === 'function') return null;
  return icon[theme];
};

const getIconComponent = (
  icon: string | { light: string; dark: string } | ComponentType<IconProps>
) => {
  return typeof icon === 'function' ? icon : null;
};

export function OAuthPage() {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const apiBase = useAuthStore((state) => state.apiBase);
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const [states, setStates] = useState<Record<OAuthProvider, ProviderState>>(
    {} as Record<OAuthProvider, ProviderState>
  );
  const [kiroBuilderState, setKiroBuilderState] = useState<KiroBuilderState>({ status: 'idle' });
  const [kiroImportState, setKiroImportState] = useState<KiroImportState>({
    fileName: '',
    refreshToken: '',
    loading: false,
  });
  const [iflowCookie, setIflowCookie] = useState<IFlowCookieState>({ cookie: '', loading: false });
  const [vertexState, setVertexState] = useState<VertexImportState>({
    fileName: '',
    location: '',
    loading: false,
  });
  const timers = useRef<Record<string, number>>({});
  const kiroPollTimerRef = useRef<number | null>(null);
  const kiroFileInputRef = useRef<HTMLInputElement | null>(null);
  const vertexFileInputRef = useRef<HTMLInputElement | null>(null);

  const clearTimers = useCallback(() => {
    Object.values(timers.current).forEach((timer) => window.clearInterval(timer));
    timers.current = {};
    if (kiroPollTimerRef.current) {
      window.clearInterval(kiroPollTimerRef.current);
      kiroPollTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  const updateProviderState = (provider: OAuthProvider, next: Partial<ProviderState>) => {
    setStates((prev) => ({
      ...prev,
      [provider]: { ...(prev[provider] ?? {}), ...next },
    }));
  };

  const startPolling = (provider: OAuthProvider, state: string) => {
    if (timers.current[provider]) {
      clearInterval(timers.current[provider]);
    }
    const timer = window.setInterval(async () => {
      try {
        const res = await oauthApi.getAuthStatus(state);
        if (res.status === 'ok') {
          updateProviderState(provider, { status: 'success', polling: false });
          showNotification(t(getAuthKey(provider, 'oauth_status_success')), 'success');
          window.clearInterval(timer);
          delete timers.current[provider];
        } else if (res.status === 'error') {
          updateProviderState(provider, { status: 'error', error: res.error, polling: false });
          showNotification(
            `${t(getAuthKey(provider, 'oauth_status_error'))} ${res.error || ''}`,
            'error'
          );
          window.clearInterval(timer);
          delete timers.current[provider];
        }
      } catch (err: unknown) {
        updateProviderState(provider, {
          status: 'error',
          error: getErrorMessage(err),
          polling: false,
        });
        window.clearInterval(timer);
        delete timers.current[provider];
      }
    }, 3000);
    timers.current[provider] = timer;
  };

  const startAuth = async (provider: OAuthProvider) => {
    const geminiState = provider === 'gemini-cli' ? states[provider] : undefined;
    const rawProjectId = provider === 'gemini-cli' ? (geminiState?.projectId || '').trim() : '';
    const projectId = rawProjectId
      ? rawProjectId.toUpperCase() === 'ALL'
        ? 'ALL'
        : rawProjectId
      : undefined;
    // 项目 ID 可选：留空自动选择第一个可用项目；输入 ALL 获取全部项目
    if (provider === 'gemini-cli') {
      updateProviderState(provider, { projectIdError: undefined });
    }
    updateProviderState(provider, {
      status: 'waiting',
      polling: true,
      error: undefined,
      callbackStatus: undefined,
      callbackError: undefined,
      callbackUrl: '',
    });
    try {
      const res = await oauthApi.startAuth(
        provider,
        provider === 'gemini-cli' ? { projectId: projectId || undefined } : undefined
      );
      updateProviderState(provider, {
        url: res.url,
        state: res.state,
        status: 'waiting',
        polling: true,
      });
      if (res.state) {
        startPolling(provider, res.state);
      }
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      updateProviderState(provider, { status: 'error', error: message, polling: false });
      showNotification(
        `${t(getAuthKey(provider, 'oauth_start_error'))}${message ? ` ${message}` : ''}`,
        'error'
      );
    }
  };

  const copyLink = async (url?: string) => {
    if (!url) return;
    const copied = await copyToClipboard(url);
    showNotification(
      t(copied ? 'notification.link_copied' : 'notification.copy_failed'),
      copied ? 'success' : 'error'
    );
  };

  const submitCallback = async (provider: OAuthProvider) => {
    const redirectUrl = (states[provider]?.callbackUrl || '').trim();
    if (!redirectUrl) {
      showNotification(t('auth_login.oauth_callback_required'), 'warning');
      return;
    }
    updateProviderState(provider, {
      callbackSubmitting: true,
      callbackStatus: undefined,
      callbackError: undefined,
    });
    try {
      await oauthApi.submitCallback(provider, redirectUrl);
      updateProviderState(provider, { callbackSubmitting: false, callbackStatus: 'success' });
      showNotification(t('auth_login.oauth_callback_success'), 'success');
    } catch (err: unknown) {
      const status = getErrorStatus(err);
      const message = getErrorMessage(err);
      const errorMessage =
        status === 404
          ? t('auth_login.oauth_callback_upgrade_hint', {
              defaultValue: 'Please update CLI Proxy API or check the connection.',
            })
          : message || undefined;
      updateProviderState(provider, {
        callbackSubmitting: false,
        callbackStatus: 'error',
        callbackError: errorMessage,
      });
      const notificationMessage = errorMessage
        ? `${t('auth_login.oauth_callback_error')} ${errorMessage}`
        : t('auth_login.oauth_callback_error');
      showNotification(notificationMessage, 'error');
    }
  };

  const submitIflowCookie = async () => {
    const cookie = iflowCookie.cookie.trim();
    if (!cookie) {
      showNotification(t('auth_login.iflow_cookie_required'), 'warning');
      return;
    }
    setIflowCookie((prev) => ({
      ...prev,
      loading: true,
      error: undefined,
      errorType: undefined,
      result: undefined,
    }));
    try {
      const res = await oauthApi.iflowCookieAuth(cookie);
      if (res.status === 'ok') {
        setIflowCookie((prev) => ({ ...prev, loading: false, result: res }));
        showNotification(t('auth_login.iflow_cookie_status_success'), 'success');
      } else {
        setIflowCookie((prev) => ({
          ...prev,
          loading: false,
          error: res.error,
          errorType: 'error',
        }));
        showNotification(
          `${t('auth_login.iflow_cookie_status_error')} ${res.error || ''}`,
          'error'
        );
      }
    } catch (err: unknown) {
      if (getErrorStatus(err) === 409) {
        const message = t('auth_login.iflow_cookie_config_duplicate');
        setIflowCookie((prev) => ({
          ...prev,
          loading: false,
          error: message,
          errorType: 'warning',
        }));
        showNotification(message, 'warning');
        return;
      }
      const message = getErrorMessage(err);
      setIflowCookie((prev) => ({ ...prev, loading: false, error: message, errorType: 'error' }));
      showNotification(
        `${t('auth_login.iflow_cookie_start_error')}${message ? ` ${message}` : ''}`,
        'error'
      );
    }
  };

  const stopKiroPolling = () => {
    if (kiroPollTimerRef.current) {
      window.clearInterval(kiroPollTimerRef.current);
      kiroPollTimerRef.current = null;
    }
  };

  const pollKiroBuilderStatus = async (stateId: string) => {
    if (!apiBase) return;
    try {
      const status = await kiroApi.getOAuthStatus(apiBase, stateId);
      if (status.status === 'success') {
        stopKiroPolling();
        setKiroBuilderState((prev) => ({
          ...prev,
          status: 'success',
          expiresAt: status.expires_at,
          remainingSeconds: undefined,
          error: undefined,
        }));
        showNotification('Kiro AWS Builder ID login successful', 'success');
        return;
      }
      if (status.status === 'failed') {
        stopKiroPolling();
        const errorMsg = status.error || 'Kiro AWS Builder ID login failed';
        setKiroBuilderState((prev) => ({
          ...prev,
          status: 'failed',
          error: errorMsg,
          remainingSeconds: undefined,
        }));
        showNotification(errorMsg, 'error');
        return;
      }

      setKiroBuilderState((prev) => ({
        ...prev,
        status: 'pending',
        remainingSeconds: status.remaining_seconds,
      }));
    } catch (err: unknown) {
      stopKiroPolling();
      const message = getErrorMessage(err) || 'Failed to check Kiro OAuth status';
      setKiroBuilderState((prev) => ({
        ...prev,
        status: 'failed',
        error: message,
        remainingSeconds: undefined,
      }));
      showNotification(message, 'error');
    }
  };

  const startKiroBuilderAuth = async () => {
    if (!apiBase) {
      showNotification('API base URL is not configured', 'error');
      return;
    }

    stopKiroPolling();
    setKiroBuilderState({ status: 'starting' });

    try {
      const data = await kiroApi.startBuilderId(apiBase);
      setKiroBuilderState({
        status: 'pending',
        authUrl: data.authUrl,
        stateId: data.stateId,
        remainingSeconds: data.expiresIn,
      });

      window.open(data.authUrl, '_blank', 'noopener,noreferrer');
      kiroPollTimerRef.current = window.setInterval(() => {
        void pollKiroBuilderStatus(data.stateId);
      }, KIRO_POLL_INTERVAL_MS);
      void pollKiroBuilderStatus(data.stateId);
    } catch (err: unknown) {
      const message = getErrorMessage(err) || 'Failed to start Kiro OAuth flow';
      setKiroBuilderState({ status: 'failed', error: message });
      showNotification(message, 'error');
    }
  };

  const handleCopyKiroBuilderUrl = async () => {
    if (!kiroBuilderState.authUrl) return;
    const copied = await copyToClipboard(kiroBuilderState.authUrl);
    showNotification(
      t(copied ? 'notification.link_copied' : 'notification.copy_failed'),
      copied ? 'success' : 'error'
    );
  };

  const handlePickKiroImportFile = () => {
    kiroFileInputRef.current?.click();
  };

  const handleKiroImportFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const refreshToken = parseKiroRefreshTokenFromFile(text);
      if (!refreshToken) {
        throw new Error('Invalid file: refreshToken not found');
      }
      setKiroImportState({
        fileName: file.name,
        refreshToken,
        loading: false,
      });
    } catch (err: unknown) {
      const message = getErrorMessage(err) || 'Failed to parse auth file';
      setKiroImportState({
        fileName: file.name,
        refreshToken: '',
        loading: false,
        error: message,
      });
      showNotification(message, 'error');
    }
  };

  const importKiroAuthFile = async () => {
    if (!apiBase) {
      showNotification('API base URL is not configured', 'error');
      return;
    }
    if (!kiroImportState.refreshToken) {
      showNotification('Please choose a Kiro auth JSON file first', 'warning');
      return;
    }

    setKiroImportState((prev) => ({ ...prev, loading: true, error: undefined, result: undefined }));
    try {
      const result = await kiroApi.importRefreshToken(apiBase, kiroImportState.refreshToken);
      if (!result.success) {
        throw new Error(result.error || 'Import failed');
      }
      setKiroImportState((prev) => ({
        ...prev,
        loading: false,
        result: {
          message: result.message,
          fileName: result.fileName,
          email: result.email,
        },
      }));
      showNotification(result.message || 'Kiro auth imported successfully', 'success');
    } catch (err: unknown) {
      const message = getErrorMessage(err) || 'Import failed';
      setKiroImportState((prev) => ({ ...prev, loading: false, error: message }));
      showNotification(message, 'error');
    }
  };
  const handleVertexFilePick = () => {
    vertexFileInputRef.current?.click();
  };

  const handleVertexFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.json')) {
      showNotification(t('vertex_import.file_required'), 'warning');
      event.target.value = '';
      return;
    }
    setVertexState((prev) => ({
      ...prev,
      file,
      fileName: file.name,
      error: undefined,
      result: undefined,
    }));
    event.target.value = '';
  };

  const handleVertexImport = async () => {
    if (!vertexState.file) {
      const message = t('vertex_import.file_required');
      setVertexState((prev) => ({ ...prev, error: message }));
      showNotification(message, 'warning');
      return;
    }
    const location = vertexState.location.trim();
    setVertexState((prev) => ({ ...prev, loading: true, error: undefined, result: undefined }));
    try {
      const res: VertexImportResponse = await vertexApi.importCredential(
        vertexState.file,
        location || undefined
      );
      const result: VertexImportResult = {
        projectId: res.project_id,
        email: res.email,
        location: res.location,
        authFile: res['auth-file'] ?? res.auth_file,
      };
      setVertexState((prev) => ({ ...prev, loading: false, result }));
      showNotification(t('vertex_import.success'), 'success');
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setVertexState((prev) => ({
        ...prev,
        loading: false,
        error: message || t('notification.upload_failed'),
      }));
      const notification = message
        ? `${t('notification.upload_failed')}: ${message}`
        : t('notification.upload_failed');
      showNotification(notification, 'error');
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>{t('nav.oauth', { defaultValue: 'OAuth' })}</h1>

      <div className={styles.content}>
        {PROVIDERS.map((provider) => {
          const state = states[provider.id] || {};
          const canSubmitCallback = CALLBACK_SUPPORTED.includes(provider.id) && Boolean(state.url);
          return (
            <div key={provider.id}>
              <Card
                title={
                  <span className={styles.cardTitle}>
                    {(() => {
                      const IconComponent = getIconComponent(provider.icon);
                      if (IconComponent) {
                        return <IconComponent size={18} className={styles.cardTitleIcon} />;
                      }

                      const iconSrc = getIconSrc(provider.icon, resolvedTheme);
                      return <img src={iconSrc ?? ''} alt="" className={styles.cardTitleIcon} />;
                    })()}
                    {t(provider.titleKey)}
                  </span>
                }
                extra={
                  <Button onClick={() => startAuth(provider.id)} loading={state.polling}>
                    {t('common.login')}
                  </Button>
                }
              >
                <div className={styles.cardContent}>
                  <div className={styles.cardHint}>{t(provider.hintKey)}</div>
                  {provider.id === 'gemini-cli' && (
                    <div className={styles.geminiProjectField}>
                      <Input
                        label={t('auth_login.gemini_cli_project_id_label')}
                        hint={t('auth_login.gemini_cli_project_id_hint')}
                        value={state.projectId || ''}
                        error={state.projectIdError}
                        disabled={Boolean(state.polling)}
                        onChange={(e) =>
                          updateProviderState(provider.id, {
                            projectId: e.target.value,
                            projectIdError: undefined,
                          })
                        }
                        placeholder={t('auth_login.gemini_cli_project_id_placeholder')}
                      />
                    </div>
                  )}
                  {state.url && (
                    <div className={styles.authUrlBox}>
                      <div className={styles.authUrlLabel}>{t(provider.urlLabelKey)}</div>
                      <div className={styles.authUrlValue}>{state.url}</div>
                      <div className={styles.authUrlActions}>
                        <Button variant="secondary" size="sm" onClick={() => copyLink(state.url!)}>
                          {t(getAuthKey(provider.id, 'copy_link'))}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => window.open(state.url, '_blank', 'noopener,noreferrer')}
                        >
                          {t(getAuthKey(provider.id, 'open_link'))}
                        </Button>
                      </div>
                    </div>
                  )}
                  {canSubmitCallback && (
                    <div className={styles.callbackSection}>
                      <Input
                        label={t('auth_login.oauth_callback_label')}
                        hint={t('auth_login.oauth_callback_hint')}
                        value={state.callbackUrl || ''}
                        onChange={(e) =>
                          updateProviderState(provider.id, {
                            callbackUrl: e.target.value,
                            callbackStatus: undefined,
                            callbackError: undefined,
                          })
                        }
                        placeholder={t('auth_login.oauth_callback_placeholder')}
                      />
                      <div className={styles.callbackActions}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => submitCallback(provider.id)}
                          loading={state.callbackSubmitting}
                        >
                          {t('auth_login.oauth_callback_button')}
                        </Button>
                      </div>
                      {state.callbackStatus === 'success' && state.status === 'waiting' && (
                        <div className="status-badge success">
                          {t('auth_login.oauth_callback_status_success')}
                        </div>
                      )}
                      {state.callbackStatus === 'error' && (
                        <div className="status-badge error">
                          {t('auth_login.oauth_callback_status_error')} {state.callbackError || ''}
                        </div>
                      )}
                    </div>
                  )}
                  {state.status && state.status !== 'idle' && (
                    <div className="status-badge">
                      {state.status === 'success'
                        ? t(getAuthKey(provider.id, 'oauth_status_success'))
                        : state.status === 'error'
                          ? `${t(getAuthKey(provider.id, 'oauth_status_error'))} ${state.error || ''}`
                          : t(getAuthKey(provider.id, 'oauth_status_waiting'))}
                    </div>
                  )}
                </div>
              </Card>
            </div>
          );
        })}

        {/* Vertex JSON 登录 */}
        <Card
          title={
            <span className={styles.cardTitle}>
              <img src={iconVertex} alt="" className={styles.cardTitleIcon} />
              {t('vertex_import.title')}
            </span>
          }
          extra={
            <Button onClick={handleVertexImport} loading={vertexState.loading}>
              {t('vertex_import.import_button')}
            </Button>
          }
        >
          <div className={styles.cardContent}>
            <div className={styles.cardHint}>{t('vertex_import.description')}</div>
            <Input
              label={t('vertex_import.location_label')}
              hint={t('vertex_import.location_hint')}
              value={vertexState.location}
              onChange={(e) =>
                setVertexState((prev) => ({
                  ...prev,
                  location: e.target.value,
                }))
              }
              placeholder={t('vertex_import.location_placeholder')}
            />
            <div className={styles.formItem}>
              <label className={styles.formItemLabel}>{t('vertex_import.file_label')}</label>
              <div className={styles.filePicker}>
                <Button variant="secondary" size="sm" onClick={handleVertexFilePick}>
                  {t('vertex_import.choose_file')}
                </Button>
                <div
                  className={`${styles.fileName} ${
                    vertexState.fileName ? '' : styles.fileNamePlaceholder
                  }`.trim()}
                >
                  {vertexState.fileName || t('vertex_import.file_placeholder')}
                </div>
              </div>
              <div className={styles.cardHintSecondary}>{t('vertex_import.file_hint')}</div>
              <input
                ref={vertexFileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={handleVertexFileChange}
              />
            </div>
            {vertexState.error && <div className="status-badge error">{vertexState.error}</div>}
            {vertexState.result && (
              <div className={styles.connectionBox}>
                <div className={styles.connectionLabel}>{t('vertex_import.result_title')}</div>
                <div className={styles.keyValueList}>
                  {vertexState.result.projectId && (
                    <div className={styles.keyValueItem}>
                      <span className={styles.keyValueKey}>
                        {t('vertex_import.result_project')}
                      </span>
                      <span className={styles.keyValueValue}>{vertexState.result.projectId}</span>
                    </div>
                  )}
                  {vertexState.result.email && (
                    <div className={styles.keyValueItem}>
                      <span className={styles.keyValueKey}>{t('vertex_import.result_email')}</span>
                      <span className={styles.keyValueValue}>{vertexState.result.email}</span>
                    </div>
                  )}
                  {vertexState.result.location && (
                    <div className={styles.keyValueItem}>
                      <span className={styles.keyValueKey}>
                        {t('vertex_import.result_location')}
                      </span>
                      <span className={styles.keyValueValue}>{vertexState.result.location}</span>
                    </div>
                  )}
                  {vertexState.result.authFile && (
                    <div className={styles.keyValueItem}>
                      <span className={styles.keyValueKey}>{t('vertex_import.result_file')}</span>
                      <span className={styles.keyValueValue}>{vertexState.result.authFile}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* iFlow Cookie 登录 */}
        <Card
          title={
            <span className={styles.cardTitle}>
              <img src={iconIflow} alt="" className={styles.cardTitleIcon} />
              {t('auth_login.iflow_cookie_title')}
            </span>
          }
          extra={
            <Button onClick={submitIflowCookie} loading={iflowCookie.loading}>
              {t('auth_login.iflow_cookie_button')}
            </Button>
          }
        >
          <div className={styles.cardContent}>
            <div className={styles.cardHint}>{t('auth_login.iflow_cookie_hint')}</div>
            <div className={styles.cardHintSecondary}>{t('auth_login.iflow_cookie_key_hint')}</div>
            <div className={styles.formItem}>
              <label className={styles.formItemLabel}>{t('auth_login.iflow_cookie_label')}</label>
              <Input
                value={iflowCookie.cookie}
                onChange={(e) => setIflowCookie((prev) => ({ ...prev, cookie: e.target.value }))}
                placeholder={t('auth_login.iflow_cookie_placeholder')}
              />
            </div>
            {iflowCookie.error && (
              <div
                className={`status-badge ${iflowCookie.errorType === 'warning' ? 'warning' : 'error'}`}
              >
                {iflowCookie.errorType === 'warning'
                  ? t('auth_login.iflow_cookie_status_duplicate')
                  : t('auth_login.iflow_cookie_status_error')}{' '}
                {iflowCookie.error}
              </div>
            )}
            {iflowCookie.result && iflowCookie.result.status === 'ok' && (
              <div className={styles.connectionBox}>
                <div className={styles.connectionLabel}>
                  {t('auth_login.iflow_cookie_result_title')}
                </div>
                <div className={styles.keyValueList}>
                  {iflowCookie.result.email && (
                    <div className={styles.keyValueItem}>
                      <span className={styles.keyValueKey}>
                        {t('auth_login.iflow_cookie_result_email')}
                      </span>
                      <span className={styles.keyValueValue}>{iflowCookie.result.email}</span>
                    </div>
                  )}
                  {iflowCookie.result.expired && (
                    <div className={styles.keyValueItem}>
                      <span className={styles.keyValueKey}>
                        {t('auth_login.iflow_cookie_result_expired')}
                      </span>
                      <span className={styles.keyValueValue}>{iflowCookie.result.expired}</span>
                    </div>
                  )}
                  {iflowCookie.result.saved_path && (
                    <div className={styles.keyValueItem}>
                      <span className={styles.keyValueKey}>
                        {t('auth_login.iflow_cookie_result_path')}
                      </span>
                      <span className={styles.keyValueValue}>{iflowCookie.result.saved_path}</span>
                    </div>
                  )}
                  {iflowCookie.result.type && (
                    <div className={styles.keyValueItem}>
                      <span className={styles.keyValueKey}>
                        {t('auth_login.iflow_cookie_result_type')}
                      </span>
                      <span className={styles.keyValueValue}>{iflowCookie.result.type}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card
          title={
            <span className={styles.cardTitle}>
              <img src={iconKiroUpload} alt="" className={styles.cardTitleIcon} />
              Kiro OAuth
            </span>
          }
          extra={
            <Button onClick={startKiroBuilderAuth} loading={kiroBuilderState.status === 'starting'}>
              Start Login
            </Button>
          }
        >
          <div className={styles.cardContent}>
            <div className={styles.cardHint}>
              Login with AWS Builder ID, or import auth file from Kiro IDE.
            </div>

            {kiroBuilderState.authUrl && (
              <div className={styles.authUrlBox}>
                <div className={styles.authUrlLabel}>Authorization URL</div>
                <div className={styles.authUrlValue}>{kiroBuilderState.authUrl}</div>
                <div className={styles.authUrlActions}>
                  <Button variant="secondary" size="sm" onClick={handleCopyKiroBuilderUrl}>
                    {t('common.copy', { defaultValue: 'Copy' })}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      window.open(kiroBuilderState.authUrl, '_blank', 'noopener,noreferrer')
                    }
                  >
                    Open Link
                  </Button>
                </div>
              </div>
            )}

            {kiroBuilderState.status === 'pending' && (
              <div className="status-badge">
                Waiting for authorization...
                {typeof kiroBuilderState.remainingSeconds === 'number'
                  ? ` (${kiroBuilderState.remainingSeconds}s)`
                  : ''}
              </div>
            )}
            {kiroBuilderState.status === 'success' && (
              <div className="status-badge success">
                Login successful
                {kiroBuilderState.expiresAt
                  ? `, token expires at ${kiroBuilderState.expiresAt}`
                  : ''}
              </div>
            )}
            {kiroBuilderState.status === 'failed' && kiroBuilderState.error && (
              <div className="status-badge error">{kiroBuilderState.error}</div>
            )}

            <div className={styles.formItem}>
              <label className={styles.formItemLabel}>Kiro Auth JSON File</label>
              <div className={styles.filePicker}>
                <Button variant="secondary" size="sm" onClick={handlePickKiroImportFile}>
                  Choose JSON File
                </Button>
                <div
                  className={`${styles.fileName} ${kiroImportState.fileName ? '' : styles.fileNamePlaceholder}`.trim()}
                >
                  {kiroImportState.fileName || 'No file selected'}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={importKiroAuthFile}
                  loading={kiroImportState.loading}
                >
                  Import File
                </Button>
              </div>
              <input
                ref={kiroFileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={handleKiroImportFileChange}
              />
            </div>

            {kiroImportState.error && (
              <div className="status-badge error">{kiroImportState.error}</div>
            )}
            {kiroImportState.result && (
              <div className={styles.connectionBox}>
                <div className={styles.connectionLabel}>Import Result</div>
                {kiroImportState.result.message && <div>{kiroImportState.result.message}</div>}
                {kiroImportState.result.email && <div>Email: {kiroImportState.result.email}</div>}
                {kiroImportState.result.fileName && (
                  <div>Saved file: {kiroImportState.result.fileName}</div>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
