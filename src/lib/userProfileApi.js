import { api } from './api';

const BASE = '/admin/user-profile';

export async function getProfile() {
  const { data } = await api.get(BASE);
  return data;
}

export async function updateProfileName(name) {
  const { data } = await api.put(`${BASE}/update`, { name });
  return data;
}

export async function changePassword({ currentPassword, newPassword }) {
  const { data } = await api.put(`${BASE}/update-password`, {
    currentPassword,
    newPassword,
  });
  return data;
}
