import axios from 'axios';
import { api, BASE_URL } from './api';

// Admin sign-in with a one-time passcode, and "forgot password"
// (crispr-api docs/ADMIN_AUTH_OTP.md).
//
//   requestAdminOtp(username, purpose)  → { key, sentTo, expiresIn, resendAfter }
//   verifyAdminOtp({ ... })             → { response: token, status, error, user, temporary }
//
// A verify with purpose 'reset' returns a short-lived token that only works
// for GET /admin/auth/me and POST /admin/auth/password/reset. It is never
// stored as the session: the calls that use it go through `resetClient`, a
// bare axios instance, because the shared `api` instance would swap in any
// stored session token and treat a 401 as "session dead".

export async function requestAdminOtp(username, purpose = 'login') {
  const { data } = await api.post('/admin/auth/otp/request', { username, purpose });
  return data?.data;
}

export async function verifyAdminOtp({ username, key, otp, purpose = 'login' }) {
  const { data } = await api.post('/admin/auth/otp/verify', { username, key, otp, purpose });
  return data;
}

const resetClient = axios.create({ baseURL: BASE_URL });

// Who the reset token belongs to: { id, name, email, mobile, roles, permissions }.
export async function fetchResetIdentity(resetToken) {
  const { data } = await resetClient.get('/admin/auth/me', { headers: { 'X-Access-Token': resetToken } });
  return data?.user ?? null;
}

// Sets the new password. Every session of the admin ends, the reset token
// included, so the caller must drop it and show the password form.
export async function resetAdminPassword(resetToken, newPassword) {
  const { data } = await resetClient.post(
    '/admin/auth/password/reset',
    { newPassword },
    { headers: { 'X-Access-Token': resetToken, 'Content-Type': 'application/json' } }
  );
  return data;
}
