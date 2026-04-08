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

/**
 * 将 API 错误转换为本地化的用户友好消息
 */
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

  // 根据 HTTP 状态码判断
  if (status === 401) {
    return t('login.error_unauthorized');
  }
  if (status === 403) {
    return t('login.error_forbidden');
  }
  if (status === 404) {
    return t('login.error_not_found');
  }
  if (status && status >= 500) {
    return t('login.error_server');
  }

  // 根据 axios 错误码判断
  if (code === 'ECONNABORTED' || message.toLowerCase().includes('timeout')) {
    return t('login.error_timeout');
  }
  if (code === 'ERR_NETWORK' || message.toLowerCase().includes('network error')) {
    return t('login.error_network');
  }
  if (code === 'ERR_CERT_AUTHORITY_INVALID' || message.toLowerCase().includes('certificate')) {
    return t('login.error_ssl');
  }

  // 检查 CORS 错误
  if (message.toLowerCase().includes('cors') || message.toLowerCase().includes('cross-origin')) {
    return t('login.error_cors');
  }

  // 默认错误消息
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
      if (!isSupportedLanguage(selectedLanguage)) {
        return;
      }
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
          // 延迟跳转，让用户看到成功动画
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
        if (!autoLoginSuccess) {
          setAutoLoading(false);
        }
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

  // 显示启动动画（自动登录中或自动登录成功）
  const showSplash = autoLoading || autoLoginSuccess;

    return (
    <div className={styles.container}>
      <div className={styles.decorativePanel}>
        <div className={styles.decorativeContent}>
          <div className={styles.decorativeIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
              <line x1="12" y1="22.08" x2="12" y2="12"></line>
            </svg>
          </div>
          <h2 className={styles.decorativeTitle}>{t('title.login', { defaultValue: 'Welcome Back' })}</h2>
          <p className={styles.decorativeSubtitle}>
            Securely connect and manage your CLI Proxy API configurations with ease.
          </p>
          <div className={styles.floatingShapes}>
            <div className={styles.shape1}></div>
            <div className={styles.shape2}></div>
            <div className={styles.shape3}></div>
          </div>
        </div>
      </div>

      <div className={styles.formPanel}>
        {showSplash ? (
          <div className={styles.splashContent}>
            <div className={styles.splashLoader}>
              <div className={styles.splashLoaderBar} />
            </div>
          </div>
        ) : (
          <div className={styles.formContent}>
            <div className={styles.loginHeader}>
              <div className={styles.titleRow}>
                <div className={styles.title}>{t('title.login')}</div>
                <Select
                  className={styles.languageSelect}
                  value={language}
                  options={languageOptions}
                  onChange={handleLanguageChange}
                  fullWidth={false}
                  ariaLabel={t('language.switch')}
                />
              </div>
              <div className={styles.subtitle}>{t('login.subtitle')}</div>
            </div>

            <div className={styles.formGroup}>
              <div className={styles.connectionBox}>
                <div className={styles.connectionHeader}>
                  <div className={styles.connectionStatus}>
                    <span className={styles.statusDot}></span>
                    <span className={styles.label}>{t('login.connection_current')}</span>
                  </div>
                  <span className={styles.value} title={apiBase || detectedBase}>
                    {apiBase || detectedBase}
                  </span>
                </div>
                <div className={styles.hint}>{t('login.connection_auto_hint')}</div>
              </div>

              <div className={styles.toggleAdvanced}>
                <SelectionCheckbox
                  checked={showCustomBase}
                  onChange={setShowCustomBase}
                  ariaLabel={t('login.custom_connection_label')}
                  label={t('login.custom_connection_label')}
                  labelClassName={styles.toggleLabel}
                />
              </div>

              {showCustomBase && (
                <div className={styles.inputWrapper}>
                  <Input
                    label={t('login.custom_connection_label')}
                    placeholder={t('login.custom_connection_placeholder')}
                    value={apiBase}
                    onChange={(e) => setApiBase(e.target.value)}
                    hint={t('login.custom_connection_hint')}
                  />
                </div>
              )}
            </div>

            <div className={styles.formGroup}>
              <div className={styles.inputWrapper}>
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
                      className={styles.passwordToggle}
                      onClick={() => setShowKey((prev) => !prev)}
                      aria-label={
                        showKey
                          ? t('login.hide_key', { defaultValue: '隐藏密钥' })
                          : t('login.show_key', { defaultValue: '显示密钥' })
                      }
                      title={
                        showKey
                          ? t('login.hide_key', { defaultValue: '隐藏密钥' })
                          : t('login.show_key', { defaultValue: '显示密钥' })
                      }
                    >
                      {showKey ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                    </button>
                  }
                />
              </div>

              <div className={styles.toggleAdvanced}>
                <SelectionCheckbox
                  checked={rememberPassword}
                  onChange={setRememberPassword}
                  ariaLabel={t('login.remember_password_label')}
                  label={t('login.remember_password_label')}
                  labelClassName={styles.toggleLabel}
                />
              </div>
            </div>

            {error && (
              <div className={styles.errorBox}>
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className={styles.errorIcon}>
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <span>{error}</span>
              </div>
            )}

            <Button 
              className={styles.submitButton}
              fullWidth 
              onClick={handleSubmit} 
              loading={loading}
            >
              {loading ? t('login.submitting') : t('login.submit_button')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
