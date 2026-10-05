import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ToastRegion from '../components/ToastRegion';
import { listRoles, getPermissionTree, extractApiError } from '../lib/rbacApi';
import PermissionsMatrixTab from './permissions/PermissionsMatrixTab';
import Icon from '../components/Icon';

function normalizeRole(r) {
  return {
    id: r?.id,
    name: r?.key,
    label: r?.label || r?.key,
    badgeColor: r?.badge_color || null,
    isSystem: !!r?.is_system,
    permissionCount: typeof r?.permissionCount === 'number' ? r.permissionCount : 0,
  };
}

export default function PermissionsPage() {
  const navigate = useNavigate();

  const [roles, setRoles] = useState([]);
  const [tree, setTree] = useState([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [treeLoading, setTreeLoading] = useState(true);

  // ── Toasts ───────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);
  const showToast = useCallback((type, title, message) => {
    const id = ++toastIdRef.current;
    setToasts((cur) => [...cur, { id, type, title, message }]);
    window.setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), 4500);
  }, []);

  const refetchRoles = useCallback(async () => {
    setRolesLoading(true);
    try {
      const resp = await listRoles();
      const rs = (resp?.data || []).map(normalizeRole).filter((r) => r.id != null && r.name);
      setRoles(rs);
    } catch (err) {
      const info = extractApiError(err);
      if (info.status === 401) { navigate('/login', { replace: true }); return; }
      showToast('error', 'Could not load roles', info.message);
    } finally {
      setRolesLoading(false);
    }
  }, [navigate, showToast]);

  const fetchTree = useCallback(async () => {
    setTreeLoading(true);
    try {
      const resp = await getPermissionTree();
      setTree(Array.isArray(resp?.data) ? resp.data : []);
    } catch (err) {
      const info = extractApiError(err);
      if (info.status === 401) { navigate('/login', { replace: true }); return; }
      showToast('error', 'Could not load permissions', info.message);
    } finally {
      setTreeLoading(false);
    }
  }, [navigate, showToast]);

  useEffect(() => {
    refetchRoles();
    fetchTree();
  }, [refetchRoles, fetchTree]);

  return (
    <div className="permissions-page data-table-page">
      <div className="page-header-section">
        <div className="page-header-title-group">
          <span className="page-header-icon-box"><Icon className="fa fa-shield" /></span>
          <div>
            <h2>Roles &amp; permissions</h2>
            <p>Define roles and control what each role can access across the platform.</p>
          </div>
        </div>
      </div>

      <PermissionsMatrixTab
        roles={roles}
        tree={tree}
        showToast={showToast}
        refetchRoles={refetchRoles}
        loading={rolesLoading || treeLoading}
      />

      <ToastRegion
        toasts={toasts}
        onDismiss={(id) => setToasts((cur) => cur.filter((t) => t.id !== id))}
      />
    </div>
  );
}
