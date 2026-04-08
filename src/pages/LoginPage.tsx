import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
      {/* Decorative architectural background */}
      <div className={styles.architecturalLines}></div>

      {/* Floating Header */}
      <header className={styles.topHeader}>
        <div className={styles.brandBox}>
          <div className={styles.brandLogo}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"></polygon>
              <line x1="12" y1="22" x2="12" y2="15.5"></line>
              <polyline points="22 8.5 12 15.5 2 8.5"></polyline>
              <polyline points="2 15.5 12 8.5 22 15.5"></polyline>
              <line x1="12" y1="2" x2="12" y2="8.5"></line>
            </svg>
          </div>
          <span className={styles.brandName}>API Management</span>
        </div>
        
        <div className={styles.selectWrapper}>
          <Select
            className={styles.languageSelect}
            value={language}
            options={languageOptions}
            onChange={handleLanguageChange}
            fullWidth={false}
            ariaLabel={t('language.switch')}
          />
        </div>
      </header>

      <main className={styles.mainContent}>
        {showSplash ? (
          <div className={styles.splashState}>
            <div className={styles.spinner}></div>
            <div className={styles.splashText}>Authenticating...</div>
          </div>
        ) : (
          <div className={styles.cardWrapper}>
            <div className={styles.cardHeader}>
              {/* Hardcode the title to override the translation that shows 'CLI Proxy...' */}
              <h1 className={styles.title}>API Management</h1>
              <p className={styles.subtitle}>Enter your connection details to access the management interface</p>
            </div>

            <div className={styles.cardBody}>
              {/* Endpoint Display */}
              <div className={styles.endpointCard}>
                <div className={styles.endpointHeader}>
                  <span className={styles.endpointLabel}>CURRENT URL</span>
                  <span className={styles.statusBadge}>
                    <span className={styles.statusDot}></span>
                    Connected
                  </span>
                </div>
                <div className={styles.endpointValue} title={apiBase || detectedBase}>
                  {apiBase || detectedBase}
                </div>
              </div>

              <div className={styles.toggleRow}>
                <SelectionCheckbox
                  checked={showCustomBase}
                  onChange={setShowCustomBase}
                  ariaLabel="Custom Connection URL"
                  label="Custom Connection URL"
                  labelClassName={styles.checkboxLabel}
                />
              </div>

              {showCustomBase && (
                <div className={styles.revealBox}>
                  <Input
                    placeholder="Enter custom URL"
                    value={apiBase}
                    onChange={(e) => setApiBase(e.target.value)}
                  />
                </div>
              )}

              <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>Management Key</label>
                <div className={styles.passwordWrapper}>
                  <Input
                    autoFocus
                    placeholder="Enter the management key"
                    type={showKey ? 'text' : 'password'}
                    value={managementKey}
                    onChange={(e) => setManagementKey(e.target.value)}
                    onKeyDown={handleSubmitKeyDown}
                  />
                  <button
                    type="button"
                    className={styles.visibilityToggle}
                    onClick={() => setShowKey((prev) => !prev)}
                    aria-label="Toggle Password Visibility"
                  >
                    {showKey ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                  </button>
                </div>
              </div>

              <div className={styles.toggleRow}>
                <SelectionCheckbox
                  checked={rememberPassword}
                  onChange={setRememberPassword}
                  ariaLabel="Remember password"
                  label="Remember password"
                  labelClassName={styles.checkboxLabel}
                />
              </div>

              {error && (
                <div className={styles.errorAlert}>
                  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              <button 
                className={`${styles.primaryButton} ${loading ? styles.loading : ''}`}
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <span className={styles.btnSpinner}></span>
                ) : (
                  <span>Login</span>
                )}
              </button>
            </div>
          </div>
        )}
      </main>
      
      <footer className={styles.footer}>
        <div className={styles.footerLinks}>
          <a href="#">Help & Support</a>
          <span className={styles.footerDot}>&bull;</span>
          <a href="#">System Status</a>
        </div>
      </footer>
    </div>
  );
}

