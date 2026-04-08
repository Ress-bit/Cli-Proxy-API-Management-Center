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
    <main className={styles.wrapper}>
      <div className={styles.topNav}>
        <div className={styles.navBrand}>
          <div className={styles.brandDot} />
          <span>Management Center</span>
        </div>
        <Select
          className={styles.languageSelect}
          value={language}
          options={languageOptions}
          onChange={handleLanguageChange}
          fullWidth={false}
          ariaLabel={t('language.switch')}
        />
      </div>

      <div className={styles.content}>
        {showSplash ? (
          <div className={styles.splashState}>
            <div className={styles.spinner} />
            <div className={styles.splashText}>Authenticating...</div>
          </div>
        ) : (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h1 className={styles.title}>{t('title.login', { defaultValue: 'Welcome Back' })}</h1>
              <p className={styles.subtitle}>{t('login.subtitle', { defaultValue: 'Enter your management key to continue.' })}</p>
            </div>

            <div className={styles.cardBody}>
              <div className={styles.serverBlock}>
                <div className={styles.serverStatus}>
                  <div className={styles.statusIndicator} />
                  <span>{t('login.connection_current', { defaultValue: 'Target Server' })}</span>
                </div>
                <div className={styles.serverUrl} title={apiBase || detectedBase}>
                  {apiBase || detectedBase}
                </div>
              </div>

              <div className={styles.advancedToggle}>
                <SelectionCheckbox
                  checked={showCustomBase}
                  onChange={setShowCustomBase}
                  ariaLabel={t('login.custom_connection_label')}
                  label={t('login.custom_connection_label', { defaultValue: 'Customize Server URL' })}
                  labelClassName={styles.checkboxLabel}
                />
              </div>

              {showCustomBase && (
                <div className={styles.animateReveal}>
                  <Input
                    label={t('login.custom_connection_label')}
                    placeholder={t('login.custom_connection_placeholder')}
                    value={apiBase}
                    onChange={(e) => setApiBase(e.target.value)}
                  />
                </div>
              )}

              <div className={styles.inputGroup}>
                <Input
                  autoFocus
                  label={t('login.management_key_label')}
                  placeholder={t('login.management_key_placeholder')}
                  type={showKey ? 'text' : 'password'}
                  value={managementKey}
                  onChange={(e) => setManagementKey(e.target.value)}
                  onKeyDown={handleSubmitKeyDown}
                  rightElement={
                    <button
                      type="button"
                      className={styles.iconButton}
                      onClick={() => setShowKey((prev) => !prev)}
                      aria-label="Toggle Password"
                    >
                      {showKey ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                    </button>
                  }
                />
              </div>

              <div className={styles.advancedToggle}>
                <SelectionCheckbox
                  checked={rememberPassword}
                  onChange={setRememberPassword}
                  ariaLabel={t('login.remember_password_label')}
                  label={t('login.remember_password_label')}
                  labelClassName={styles.checkboxLabel}
                />
              </div>

              {error && (
                <div className={styles.alert}>
                  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              <Button 
                fullWidth 
                onClick={handleSubmit} 
                loading={loading}
                className={styles.primaryButton}
              >
                {loading ? t('login.submitting', { defaultValue: 'Connecting...' }) : t('login.submit_button', { defaultValue: 'Connect' })}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className={styles.footer}>
        Secure Connection &bull; End-to-End Encrypted
      </div>
    </main>
  );
}
