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
      {/* Dynamic Aurora Background */}
      <div className={styles.auroraBackground}>
        <div className={styles.aurora1}></div>
        <div className={styles.aurora2}></div>
        <div className={styles.aurora3}></div>
        <div className={styles.aurora4}></div>
      </div>
      
      {/* Noise Overlay for texture */}
      <div className={styles.noiseOverlay}></div>

      {/* Floating Header */}
      <header className={styles.topHeader}>
        <div className={styles.brandContainer}>
          <div className={styles.brandLogo}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
              <path d="M2 17l10 5 10-5"></path>
              <path d="M2 12l10 5 10-5"></path>
            </svg>
          </div>
          <span className={styles.brandName}>API Management</span>
        </div>
        
        <div className={styles.glassSelect}>
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
            <div className={styles.orbLoader}>
              <div className={styles.orbInner}></div>
            </div>
            <div className={styles.splashText}>Establishing connection...</div>
          </div>
        ) : (
          <div className={styles.glassCard}>
            <div className={styles.cardGlow}></div>
            
            <div className={styles.formContainer}>
              <div className={styles.header}>
                <h1 className={styles.title}>{t('title.login', { defaultValue: 'Welcome Back' })}</h1>
                <p className={styles.subtitle}>{t('login.subtitle', { defaultValue: 'Authenticate to access the dashboard.' })}</p>
              </div>

              <div className={styles.formBody}>
                {/* Visual Connection Node */}
                <div className={styles.connectionNode}>
                  <div className={styles.nodeIcon}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                      <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                      <line x1="6" y1="6" x2="6.01" y2="6"></line>
                      <line x1="6" y1="18" x2="6.01" y2="18"></line>
                    </svg>
                  </div>
                  <div className={styles.nodeDetails}>
                    <span className={styles.nodeLabel}>{t('login.connection_current', { defaultValue: 'Target Endpoint' })}</span>
                    <span className={styles.nodeValue} title={apiBase || detectedBase}>
                      {apiBase || detectedBase}
                    </span>
                  </div>
                  <div className={styles.nodeStatus}>
                    <div className={styles.statusPing}></div>
                  </div>
                </div>

                <div className={styles.overrideToggle}>
                  <SelectionCheckbox
                    checked={showCustomBase}
                    onChange={setShowCustomBase}
                    ariaLabel={t('login.custom_connection_label')}
                    label={t('login.custom_connection_label', { defaultValue: 'Override Endpoint' })}
                    labelClassName={styles.checkboxLabel}
                  />
                </div>

                {showCustomBase && (
                  <div className={styles.animatedReveal}>
                    <div className={styles.customInputWrapper}>
                      <Input
                        placeholder={t('login.custom_connection_placeholder')}
                        value={apiBase}
                        onChange={(e) => setApiBase(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <div className={styles.keyInputWrapper}>
                  <label className={styles.inputLabel}>{t('login.management_key_label', { defaultValue: 'Management Key' })}</label>
                  <div className={styles.glassInputGroup}>
                    <div className={styles.inputIcon}>
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                      </svg>
                    </div>
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
                          className={styles.visibilityToggle}
                          onClick={() => setShowKey((prev) => !prev)}
                          aria-label="Toggle Password Visibility"
                        >
                          {showKey ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                        </button>
                      }
                    />
                  </div>
                </div>

                <div className={styles.rememberToggle}>
                  <SelectionCheckbox
                    checked={rememberPassword}
                    onChange={setRememberPassword}
                    ariaLabel={t('login.remember_password_label')}
                    label={t('login.remember_password_label', { defaultValue: 'Remember Me' })}
                    labelClassName={styles.checkboxLabel}
                  />
                </div>

                {error && (
                  <div className={styles.errorToast}>
                    <div className={styles.errorIcon}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </div>
                    <div className={styles.errorText}>{error}</div>
                  </div>
                )}

                <button 
                  className={`${styles.masterSubmitBtn} ${loading ? styles.loading : ''}`}
                  onClick={handleSubmit}
                  disabled={loading}
                >
                  <span className={styles.btnText}>
                    {loading ? t('login.submitting', { defaultValue: 'Authenticating...' }) : t('login.submit_button', { defaultValue: 'Sign In' })}
                  </span>
                  {!loading && (
                    <span className={styles.btnArrow}>
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                        <polyline points="12 5 19 12 12 19"></polyline>
                      </svg>
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
      
      <footer className={styles.footer}>
        <div className={styles.footerText}>
          API Management Engine &bull; System Operational
        </div>
      </footer>
    </div>
  );
}

