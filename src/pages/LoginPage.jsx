import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, apiErrorMessage } from '../lib/api';
import { setToken } from '../lib/auth';
import { defaultProtectedRoute } from '../lib/legacyScreens';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();

  // Where to send the user after a successful login. Honors `?next=`
  // (set by the 401 interceptor) but only for safe in-app paths.
  function resolveNextPath() {
    const params = new URLSearchParams(location.search);
    const next = params.get('next');
    if (next && next.startsWith('/') && !next.startsWith('//') && next !== '/login') {
      return next;
    }
    return defaultProtectedRoute;
  }
  
  // View states: 'password', 'otp', 'forgot'
  const [view, setView] = useState('password');
  
  // Form fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  
  // OTP logic
  const [otpSent, setOtpSent] = useState(false);
  const [otpTimer, setOtpTimer] = useState(0);
  
  const [state, setState] = useState({ loading: false, error: '', success: '' });

  // Handle countdown for OTP
  useEffect(() => {
    let interval;
    if (otpTimer > 0) {
      interval = setInterval(() => setOtpTimer((t) => t - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [otpTimer]);

  const resetState = () => setState({ loading: false, error: '', success: '' });

  async function handlePasswordLogin(e) {
    if (e) e.preventDefault();
    setState({ loading: true, error: '', success: '' });

    try {
      const response = await api.post(
        '/admin/auth/authenticate',
        { username, password },
        { headers: { 'Content-Type': 'application/json' } }
      );

      if (response.data?.status && response.data?.response) {
        // Wipe any cached identity from a previous session so the new user's
        // details don't flash before /me resolves.
        try {
          window.localStorage.removeItem('vp_user');
          window.localStorage.removeItem('vp_prefs');
          window.localStorage.removeItem('sb_collapsed');
        } catch {
          // ignore storage errors
        }
        setToken(response.data.response);
        // Hard navigation forces UserProvider to remount and refetch identity
        // from scratch — avoids stale React state carrying over across users.
        window.location.assign(resolveNextPath());
        return;
      }
      setState({ loading: false, error: 'Authentication failed.', success: '' });
    } catch (error) {
      // Refusals arrive as HTTP errors: 422 validation_error (missing field),
      // 401 invalid_credentials, 403 account_disabled, 429 rate_limited.
      setState({ loading: false, error: apiErrorMessage(error, 'Authentication failed.'), success: '' });
    }
  }

  async function handleSendOtp(e) {
    if (e) e.preventDefault();
    if (!username) return setState({ loading: false, error: 'Please enter your username/email.', success: '' });
    
    setState({ loading: true, error: '', success: '' });
    // Mocking API delay for OTP
    setTimeout(() => {
      setOtpSent(true);
      setOtpTimer(120); // 2 mins
      setState({ loading: false, error: '', success: 'OTP sent to your registered email/phone.' });
    }, 1000);
  }

  async function handleOtpLogin(e) {
    if (e) e.preventDefault();
    setState({ loading: true, error: '', success: '' });
    // Mock OTP logic, then fallback to standard login
    setTimeout(() => {
      // In a real app this would verify OTP. For now, pretend standard login works
      setState({ loading: false, error: 'Invalid OTP entered. Mock mode prevents real login.', success: '' });
    }, 1000);
  }

  async function handleForgotPassword(e) {
    if (e) e.preventDefault();
    if (!username) return setState({ loading: false, error: 'Please enter your registered email.', success: '' });
    
    setState({ loading: true, error: '', success: '' });
    // Mocking API delay
    setTimeout(() => {
      setState({ loading: false, error: '', success: 'Temporary password sent to your email.' });
    }, 1500);
  }

  const [showPassword, setShowPassword] = useState(false);

  const brandPanel = (
    <div className="login-brand-side">
      <div className="login-brand-orb orb-a" aria-hidden="true" />
      <div className="login-brand-orb orb-b" aria-hidden="true" />
      <div className="login-brand-grid" aria-hidden="true" />

      <div className="login-brand-logo-block">
        <img
          src="/assets/logo/crispr-logo-for-dark-bg.png"
          alt="Crispr Logo"
          className="login-brand-logo-img"
          onError={(e) => { e.target.style.display = 'none'; }}
        />
        <span className="login-brand-wordmark">PILOT</span>
      </div>

      <div className="login-brand-content">
        <h2>Run your institute from one cockpit.</h2>
        <p className="desc">
          Courses, batches, attendance, exams and payouts — everything your team needs, in a single console.
        </p>
      </div>

      <ul className="login-brand-points">
        <li><span className="dot" />Role-based access for every team</li>
        <li><span className="dot" />Live class scheduling & attendance</li>
        <li><span className="dot" />Exams, quizzes & question banks</li>
      </ul>

      <div className="login-brand-footer">© {new Date().getFullYear()} Crispr Pilot</div>
    </div>
  );

  const renderAlerts = () => (
    <>
      {state.error && (
        <div className="login-alert error" role="alert">
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.5a.75.75 0 00-1.5 0v4a.75.75 0 001.5 0v-4zM10 14a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
          <span>{state.error}</span>
        </div>
      )}
      {state.success && (
        <div className="login-alert success" role="status">
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z" clipRule="evenodd" /></svg>
          <span>{state.success}</span>
        </div>
      )}
    </>
  );

  return (
    <div className="login-wrapper">
      <div className="login-card">
        {brandPanel}

        {/* Right Side: Form Panel */}
        <div className="login-form-side">

          {view === 'password' && (
            <div className="login-form-inner fade-in" key="password">
              <div className="login-header">
                <span className="login-eyebrow">Admin console</span>
                <h3>Welcome back</h3>
                <p>Sign in with your registered credentials</p>
              </div>

              <form onSubmit={handlePasswordLogin}>
                <label className="login-field">
                  <span className="login-label">Username or email</span>
                  <div className="login-input-wrap">
                    <svg className="login-input-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 10a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 1114 0H3z" /></svg>
                    <input
                      className="login-input"
                      placeholder="you@institute.com"
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                  </div>
                </label>

                <label className="login-field">
                  <span className="login-label">Password</span>
                  <div className="login-input-wrap">
                    <svg className="login-input-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" /></svg>
                    <input
                      className="login-input has-trailing"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="login-input-trailing"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M3.3 2.3a1 1 0 00-1.4 1.4l14.4 14.4a1 1 0 001.4-1.4l-2-2A10.9 10.9 0 0019 10s-2.5-6-9-6a8.7 8.7 0 00-3.5.7L3.3 2.3zM1 10s2.5 6 9 6a9 9 0 002.7-.4l-2-2a3 3 0 01-3.9-3.9L4.4 7.3A11.3 11.3 0 001 10z" /></svg>
                      ) : (
                        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 4C3.5 4 1 10 1 10s2.5 6 9 6 9-6 9-6-2.5-6-9-6zm0 9a3 3 0 110-6 3 3 0 010 6z" /></svg>
                      )}
                    </button>
                  </div>
                </label>

                {renderAlerts()}

                <button type="submit" className="login-btn primary" disabled={state.loading}>
                  {state.loading ? <><span className="login-spinner" />Logging in…</> : 'Login'}
                </button>

                <div className="login-options">
                  <button type="button" className="text-btn" onClick={() => { setView('otp'); resetState(); }}>Login with OTP</button>
                  <button type="button" className="text-btn" onClick={() => { setView('forgot'); resetState(); }}>Forgot password?</button>
                </div>
              </form>
            </div>
          )}

          {view === 'otp' && (
            <div className="login-form-inner fade-in" key="otp">
              <div className="login-header">
                <span className="login-eyebrow">One-time password</span>
                <h3>Login with OTP</h3>
                <p>{otpSent ? `We sent a 4-digit code for ${username}` : 'We will send a one-time code to your registered email or phone.'}</p>
              </div>

              <form onSubmit={otpSent ? handleOtpLogin : handleSendOtp}>
                <label className="login-field">
                  <span className="login-label">Username or email</span>
                  <div className="login-input-wrap">
                    <svg className="login-input-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 10a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 1114 0H3z" /></svg>
                    <input
                      className="login-input"
                      placeholder="you@institute.com"
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      disabled={otpSent}
                    />
                  </div>
                </label>

                {otpSent && (
                  <label className="login-field">
                    <span className="login-label">4-digit OTP</span>
                    <input
                      className="login-input login-otp-input"
                      placeholder="0000"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      maxLength={4}
                      autoFocus
                    />
                  </label>
                )}

                {otpSent && (
                  <div className="login-options">
                    {otpTimer > 0 ? (
                      <span className="timer-text">Resend in {Math.floor(otpTimer/60)}:{(otpTimer%60).toString().padStart(2, '0')}</span>
                    ) : (
                      <button type="button" className="text-btn" onClick={handleSendOtp}>Resend OTP</button>
                    )}
                  </div>
                )}

                {renderAlerts()}

                <button type="submit" className="login-btn primary" disabled={state.loading}>
                  {state.loading ? <><span className="login-spinner" />Processing…</> : (otpSent ? 'Login' : 'Send OTP')}
                </button>
              </form>

              <div className="login-secondary-actions">
                <button type="button" className="text-btn with-arrow" onClick={() => { setView('password'); resetState(); }}>
                  <span aria-hidden="true">←</span> Login with password
                </button>
              </div>
            </div>
          )}

          {view === 'forgot' && (
            <div className="login-form-inner fade-in" key="forgot">
              <div className="login-header">
                <span className="login-eyebrow">Account recovery</span>
                <h3>Recover password</h3>
                <p>Enter your registered email and we will send a temporary password.</p>
              </div>

              <form onSubmit={handleForgotPassword}>
                <label className="login-field">
                  <span className="login-label">Email address</span>
                  <div className="login-input-wrap">
                    <svg className="login-input-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M3 4h14a1 1 0 011 1v.4l-8 4.6-8-4.6V5a1 1 0 011-1zm-1 3.7V15a1 1 0 001 1h14a1 1 0 001-1V7.7l-8 4.6-8-4.6z" /></svg>
                    <input
                      className="login-input"
                      placeholder="you@institute.com"
                      autoComplete="email"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                  </div>
                </label>

                {renderAlerts()}

                <button type="submit" className="login-btn primary" disabled={state.loading}>
                  {state.loading ? <><span className="login-spinner" />Sending…</> : 'Send temporary password'}
                </button>
              </form>

              <div className="login-secondary-actions">
                <button type="button" className="text-btn with-arrow" onClick={() => { setView('password'); resetState(); }}>
                  <span aria-hidden="true">←</span> Back to login
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
