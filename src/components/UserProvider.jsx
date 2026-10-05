import React, { useState, useEffect, useCallback } from 'react';
import {
  UserContext,
  getCachedUser, setCachedUser,
  getLocalPrefs, setLocalPrefs, syncPrefsToServer,
  decodeToken, getInitials,
} from '../lib/userStore';
import { ROLES } from '../lib/roles';
import { getToken } from '../lib/auth';
import { api } from '../lib/api';
import { updateProfileName } from '../lib/userProfileApi';

export default function UserProvider({ children }) {
  const [user, setUser]   = useState(getCachedUser);
  const [prefs, setPrefs] = useState(getLocalPrefs);

  // ── Fetch user profile on mount ────────────────────────────────────
  useEffect(() => {
    const token = getToken();
    if (!token) return;

    api.get('/admin/user-profile')
      .then((res) => {
        if (res.data?.status && res.data?.response) {
          const raw = res.data.response;
          const resolved = normalizeUser(raw);
          setCachedUser(resolved);
          setUser(resolved);
          // Merge server preferences (server wins for shape; local wins for values)
          if (raw.preferences) {
            const merged = { ...getLocalPrefs(), ...raw.preferences };
            setLocalPrefs(merged);
            setPrefs(merged);
          }
        }
      })
      .catch(() => {
        // Fallback: decode JWT payload
        if (!user) {
          const payload = decodeToken(token);
          if (payload) {
            const resolved = normalizeUser(payload);
            setCachedUser(resolved);
            setUser(resolved);
          }
        }
      });

    // Also fetch RBAC identity so `roles` / `permissions` are available for guards.
    // A 401 here (like any other API call) logs the user out via the global
    // interceptor in lib/api.js.
    api.get('/admin/auth/me')
      .then((res) => {
        const me = res.data?.user;
        if (!me) return;
        setUser((prev) => {
          const next = {
            ...(prev || {}),
            roles: Array.isArray(me.roles) ? me.roles : [],
            permissions: Array.isArray(me.permissions) ? me.permissions : [],
            email: prev?.email || me.email || '',
            phone: prev?.phone || me.mobile || '',
            name: prev?.name || me.name || 'Admin',
          };
          setCachedUser(next);
          return next;
        });
      })
      .catch(() => {
        // Non-fatal — guards will just deny SUPER_ADMIN-only pages.
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Preferences helpers ────────────────────────────────────────────
  const updatePrefs = useCallback((next) => {
    setLocalPrefs(next);
    setPrefs(next);
    syncPrefsToServer(next);
  }, []);

  const togglePin = useCallback((path) => {
    setPrefs((prev) => {
      const pins = prev.pinnedPaths || [];
      const next = pins.includes(path)
        ? pins.filter((p) => p !== path)
        : [...pins, path];
      const updated = { ...prev, pinnedPaths: next };
      setLocalPrefs(updated);
      syncPrefsToServer(updated);
      return updated;
    });
  }, []);

  const reorderPins = useCallback((newOrder) => {
    setPrefs((prev) => {
      const updated = { ...prev, pinnedPaths: newOrder };
      setLocalPrefs(updated);
      syncPrefsToServer(updated);
      return updated;
    });
  }, []);

  // ── Profile update ─────────────────────────────────────────────────
  // Only `name` is server-mutable on the profile endpoint.
  const updateUser = useCallback(async (patch) => {
    const next = { ...(user || {}), ...patch };
    if (patch.name) next.initials = getInitials(patch.name);
    const prev = user;
    setUser(next);
    setCachedUser(next);
    if (typeof patch.name !== 'string') {
      return { ok: true };
    }
    try {
      await updateProfileName(patch.name);
      return { ok: true };
    } catch (err) {
      setUser(prev);
      setCachedUser(prev);
      return { ok: false, error: err };
    }
  }, [user]);

  return (
    <UserContext.Provider value={{ user, prefs, togglePin, updatePrefs, reorderPins, updateUser }}>
      {children}
    </UserContext.Provider>
  );
}

// ─── Normalise whatever shape the API/JWT gives into our user shape ───────────
function normalizeUser(raw) {
  const role      = raw.role || raw.userRole || 'super_admin';
  const roleMeta  = ROLES[role] || ROLES.super_admin;
  const name      = raw.name || raw.fullName || raw.username || 'Admin';
  const roles     = Array.isArray(raw.roles) ? raw.roles : [];
  const permissions = Array.isArray(raw.permissions) ? raw.permissions : [];
  return {
    name,
    initials:  getInitials(name),
    role,
    roles,
    permissions,
    roleLabel: raw.roleLabel || roleMeta.label,
    badgeColor: roleMeta.badgeColor,
    email:     raw.email || '',
    phone:     raw.phone || raw.mobile || raw.phoneNumber || raw.contactNumber || '',
  };
}
