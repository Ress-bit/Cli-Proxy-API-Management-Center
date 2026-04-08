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
      <div className={styles.formContainer}>
        {showSplash ? (
          <div className={styles.splashState}>
            <div className={styles.spinner} />
            <div className={styles.splashText}>Authenticating...</div>
          </div>
        ) : (
          <div className={styles.loginCard}>
            <div className={styles.header}>
              <div className={styles.brand}>
                <div className={styles.brandIcon}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                    <line x1="12" y1="22.08" x2="12" y2="12"></line>
                  </svg>
                </div>
                <span>API Management</span>
              </div>
              <h1 className={styles.title}>{t('title.login', { defaultValue: 'Sign In' })}</h1>
              <p className={styles.subtitle}>{t('login.subtitle', { defaultValue: 'Welcome back. Please enter your credentials.' })}</p>
            </div>

            <div className={styles.formBody}>
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>{t('login.connection_current', { defaultValue: 'Endpoint' })}</label>
                <div className={styles.endpointBox}>
                  <div className={styles.endpointValue} title={apiBase || detectedBase}>
                    {apiBase || detectedBase}
                  </div>
                  <div className={styles.endpointStatus}></div>
                </div>
                
                <div className={styles.customEndpointToggle}>
                  <SelectionCheckbox
                    checked={showCustomBase}
                    onChange={setShowCustomBase}
                    ariaLabel={t('login.custom_connection_label')}
                    label={t('login.custom_connection_label', { defaultValue: 'Override Endpoint' })}
                    labelClassName={styles.checkboxLabel}
                  />
                </div>
                
                {showCustomBase && (
                  <div className={styles.revealInput}>
                    <Input
                      placeholder={t('login.custom_connection_placeholder')}
                      value={apiBase}
                      onChange={(e) => setApiBase(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>{t('login.management_key_label', { defaultValue: 'Management Key' })}</label>
                <Input
                  autoFocus
                  placeholder={t('login.management_key_placeholder')}
                  type={showKey ? 'text' : 'password'}
                  value={managementKey}
                  onChange={(e) => setManagementKey(e.target.value)}
                  onKeyDown={handleSubmitKeyDown}
                  rightElement={
                    <button
                      type="button"
                      className={styles.passwordToggle}
                      onClick={() => setShowKey((prev) => !prev)}
                      aria-label="Toggle Password Visibility"
                    >
                      {showKey ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                    </button>
                  }
                />
                
                <div className={styles.rememberToggle}>
                  <SelectionCheckbox
                    checked={rememberPassword}
                    onChange={setRememberPassword}
                    ariaLabel={t('login.remember_password_label')}
                    label={t('login.remember_password_label', { defaultValue: 'Remember Me' })}
                    labelClassName={styles.checkboxLabel}
                  />
                </div>
              </div>

              {error && (
                <div className={styles.alertBox}>
                  <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className={styles.alertIcon}>
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
                className={styles.submitBtn}
              >
                {loading ? t('login.submitting', { defaultValue: 'Signing In...' }) : t('login.submit_button', { defaultValue: 'Sign In' })}
              </Button>
            </div>
          </div>
        )}
      </div>
      
      <div className={styles.imageContainer}>
        <div className={styles.imageOverlay}>
          <div className={styles.overlayContent}>
            <h2>API Management</h2>
            <p>Control, monitor, and scale your proxy infrastructure with an elegant centralized dashboard.</p>
          </div>
        </div>
      </div>
      
      <div className={styles.floatingLang}>
        <Select
          className={styles.languageSelect}
          value={language}
          options={languageOptions}
          onChange={handleLanguageChange}
          fullWidth={false}
          ariaLabel={t('language.switch')}
        />
      </div>
    </div>
  );
}

