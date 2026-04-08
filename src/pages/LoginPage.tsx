import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { IconEye, IconEyeOff } from '@/components/ui/icons';
import { useAuthStore, useLanguageStore, useNotificationStore } from '@/stores';
import { detectApiBaseFromLocation, normalizeApiBase } from '@/utils/connection';
import { LANGUAGE_LABEL_KEYS, LANGUAGE_ORDER } from '@/utils/constants';
import { isSupportedLanguage } from '@/utils/language';
import type { ApiError } from '@/types';
import styles from './LoginPage.module.scss';

type RedirectState = { from?: { pathname?: string } };

function getLocalizedErrorMessage(error: unknown, t: (key: string) => string): string {
  const apiError = error as Partial<ApiError>;
  const status = typeof apiError.status === 'number' ? apiError.status : undefined;
  const code = typeof apiError.code === 'string' ? apiError.code : undefined;
  const message =
    error instanceof Error
      ? error.message
      : typeof apiError.message === 'string'
        ? apiError.message
        : typeof error === 'string'
          ? error
          : '';

  if (status === 401) return t('login.error_unauthorized');
  if (status === 403) return t('login.error_forbidden');
  if (status === 404) return t('login.error_not_found');
  if (status && status >= 500) return t('login.error_server');

  if (code === 'ECONNABORTED' || message.toLowerCase().includes('timeout')) return t('login.error_timeout');
  if (code === 'ERR_NETWORK' || message.toLowerCase().includes('network error')) return t('login.error_network');
  if (code === 'ERR_CERT_AUTHORITY_INVALID' || message.toLowerCase().includes('certificate')) return t('login.error_ssl');
  if (message.toLowerCase().includes('cors') || message.toLowerCase().includes('cross-origin')) return t('login.error_cors');

  return t('login.error_invalid');
}

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { showNotification } = useNotificationStore();
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const login = useAuthStore((state) => state.login);
  const restoreSession = useAuthStore((state) => state.restoreSession);
  const storedBase = useAuthStore((state) => state.apiBase);
  const storedKey = useAuthStore((state) => state.managementKey);
  const storedRememberPassword = useAuthStore((state) => state.rememberPassword);

  const [apiBase, setApiBase] = useState('');
  const [managementKey, setManagementKey] = useState('');
  const [showCustomBase, setShowCustomBase] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [rememberPassword, setRememberPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [autoLoading, setAutoLoading] = useState(true);
  const [autoLoginSuccess, setAutoLoginSuccess] = useState(false);
  const [error, setError] = useState('');

  const detectedBase = useMemo(() => detectApiBaseFromLocation(), []);
  const languageOptions = useMemo(
    () =>
      LANGUAGE_ORDER.map((lang) => ({
        value: lang,
        label: t(LANGUAGE_LABEL_KEYS[lang])
      })),
    [t]
  );

  const handleLanguageChange = useCallback(
    (selectedLanguage: string) => {
      if (!isSupportedLanguage(selectedLanguage)) return;
      setLanguage(selectedLanguage);
    },
    [setLanguage]
  );

  useEffect(() => {
    const init = async () => {
      try {
        const autoLoggedIn = await restoreSession();
        if (autoLoggedIn) {
          setAutoLoginSuccess(true);
          setTimeout(() => {
            const redirect = (location.state as RedirectState | null)?.from?.pathname || '/';
            navigate(redirect, { replace: true });
          }, 1500);
        } else {
          setApiBase(storedBase || detectedBase);
          setManagementKey(storedKey || '');
          setRememberPassword(storedRememberPassword || Boolean(storedKey));
        }
      } finally {
        if (!autoLoginSuccess) setAutoLoading(false);
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!managementKey.trim()) {
      setError(t('login.error_required'));
      return;
    }

    const baseToUse = apiBase ? normalizeApiBase(apiBase) : detectedBase;
    setLoading(true);
    setError('');
    try {
      await login({
        apiBase: baseToUse,
        managementKey: managementKey.trim(),
        rememberPassword
      });
      showNotification(t('common.connected_status'), 'success');
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const message = getLocalizedErrorMessage(err, t);
      setError(message);
      showNotification(`${t('notification.login_failed')}: ${message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [apiBase, detectedBase, login, managementKey, navigate, rememberPassword, showNotification, t]);

  const handleSubmitKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' && !loading) {
        event.preventDefault();
        handleSubmit();
      }
    },
    [loading, handleSubmit]
  );

  if (isAuthenticated && !autoLoading && !autoLoginSuccess) {
    const redirect = (location.state as RedirectState | null)?.from?.pathname || '/';
    return <Navigate to={redirect} replace />;
  }

  const showSplash = autoLoading || autoLoginSuccess;

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.branding}>
          <div className={styles.logoBlock}></div>
          <span className={styles.logoText}>MANAGEMENT_</span>
        </div>

        <div className={styles.heroTextContainer}>
          <h1 className={styles.heroHeadline}>
            Secure<br />
            Config<br />
            Gateway.
          </h1>
          <p className={styles.heroSubtext}>
            Authenticate with your management key to establish an encrypted tunnel to the proxy administration center.
          </p>
        </div>

        <div className={styles.sidebarFooter}>
          <div className={styles.metaData}>
            <span>SYS_VERSION: 1.0.0</span>
            <span>NODE_ENV: PRODUCTION</span>
          </div>
        </div>
      </aside>

      <main className={styles.mainContent}>
        <header className={styles.topHeader}>
          <div className={styles.spacer}></div>
          <Select
            className={styles.languageSelect}
            value={language}
            options={languageOptions}
            onChange={handleLanguageChange}
            fullWidth={false}
            ariaLabel={t('language.switch')}
          />
        </header>

        <div className={styles.authContainer}>
          {showSplash ? (
            <div className={styles.loadingScreen}>
              <div className={styles.loaderLine}></div>
              <span className={styles.loaderText}>INITIALIZING_HANDSHAKE...</span>
            </div>
          ) : (
            <div className={styles.authForm}>
              <div className={styles.formHeader}>
                <h2 className={styles.formTitle}>{t('title.login', { defaultValue: 'Authenticate' })}</h2>
                <div className={styles.divider}></div>
              </div>

              <div className={styles.connectionPanel}>
                <div className={styles.panelHeader}>
                  <div className={styles.panelLabel}>TARGET_ENDPOINT</div>
                  <div className={styles.statusPulse}></div>
                </div>
                <div className={styles.panelValue} title={apiBase || detectedBase}>
                  {apiBase || detectedBase}
                </div>
                
                <div className={styles.panelActions}>
                  <SelectionCheckbox
                    checked={showCustomBase}
                    onChange={setShowCustomBase}
                    ariaLabel={t('login.custom_connection_label')}
                    label="OVERRIDE_ENDPOINT"
                    labelClassName={styles.monoLabel}
                  />
                </div>
              </div>

              {showCustomBase && (
                <div className={styles.animatedField}>
                  <Input
                    label={t('login.custom_connection_label', { defaultValue: 'URL OVERRIDE' })}
                    placeholder={t('login.custom_connection_placeholder')}
                    value={apiBase}
                    onChange={(e) => setApiBase(e.target.value)}
                  />
                </div>
              )}

              <div className={styles.fieldGroup}>
                <Input
                  autoFocus
                  label={t('login.management_key_label', { defaultValue: 'MANAGEMENT_KEY' })}
                  placeholder={t('login.management_key_placeholder')}
                  type={showKey ? 'text' : 'password'}
                  value={managementKey}
                  onChange={(e) => setManagementKey(e.target.value)}
                  onKeyDown={handleSubmitKeyDown}
                  rightElement={
                    <button
                      type="button"
                      className={styles.visibilityToggle}
                      onClick={() => setShowKey((prev) => !prev)}
                      aria-label="Toggle visibility"
                    >
                      {showKey ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                    </button>
                  }
                />

                <div className={styles.persistToggle}>
                  <SelectionCheckbox
                    checked={rememberPassword}
                    onChange={setRememberPassword}
                    ariaLabel={t('login.remember_password_label')}
                    label={t('login.remember_password_label', { defaultValue: 'PERSIST_SESSION' })}
                    labelClassName={styles.monoLabel}
                  />
                </div>
              </div>

              {error && (
                <div className={styles.errorBanner}>
                  <div className={styles.errorHeader}>ERR_AUTH_FAILED</div>
                  <div className={styles.errorBody}>{error}</div>
                </div>
              )}

              <Button 
                onClick={handleSubmit} 
                loading={loading}
                className={styles.actionButton}
                fullWidth
              >
                {loading ? 'AUTHORIZING...' : 'INITIATE_CONNECTION'}
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
