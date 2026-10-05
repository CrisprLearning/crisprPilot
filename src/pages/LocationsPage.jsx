import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ToastRegion from '../components/ToastRegion';
import {
  LOCATION_TYPES,
  VENUE_TYPES,
  listLocations,
  addLocation,
  updateLocation,
  enablePublicAccess,
  disablePublicAccess,
  openLocation,
  closeLocation,
  listLocationVenues,
  addVenue,
  updateVenue,
  enableVenue,
  disableVenue,
  validateLocation,
  validateVenue,
  extractApiError,
} from '../lib/locationsApi';
import Icon from '../components/Icon';

function KebabMenu({ children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="kebab-menu-container" ref={ref}>
      <button
        type="button"
        className="kebab-button"
        onClick={(event) => { event.stopPropagation(); setOpen((v) => !v); }}
      >
        <Icon className="ti ti-more-alt" />
      </button>
      {open && (
        <div className="kebab-dropdown active">
          {children({ close: () => setOpen(false) })}
        </div>
      )}
    </div>
  );
}

function locationTypeLabel(type) {
  return LOCATION_TYPES.find((t) => t.value === type)?.label || '—';
}

function venueTypeLabel(type) {
  return VENUE_TYPES.find((t) => t.value === type)?.label || '—';
}

const EMPTY_LOC_FORM = {
  name: '', type: 2, address: '', latitude: '', longitude: '', contact: '', isPublicAccessible: true,
};

const EMPTY_VENUE_FORM = {
  locationId: null, type: 1, name: '', capacity: '',
  amenities: { AC: false, Studio: false, Premium: false },
};

export default function LocationsPage() {
  const navigate = useNavigate();

  const [locations, setLocations] = useState([]);
  const [locFilter] = useState('all');
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const [venues, setVenues] = useState([]);
  const [venueFilter] = useState('all');
  const [loadingVenues, setLoadingVenues] = useState(false);

  const [locModalOpen, setLocModalOpen] = useState(false);
  const [locEditMode, setLocEditMode] = useState(false);
  const [locForm, setLocForm] = useState(EMPTY_LOC_FORM);
  const [locFormErrors, setLocFormErrors] = useState({});
  const [savingLoc, setSavingLoc] = useState(false);

  const [venueModalOpen, setVenueModalOpen] = useState(false);
  const [venueEditMode, setVenueEditMode] = useState(false);
  const [venueForm, setVenueForm] = useState(EMPTY_VENUE_FORM);
  const [venueFormErrors, setVenueFormErrors] = useState({});
  const [savingVenue, setSavingVenue] = useState(false);

  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);
  const showToast = useCallback((type, title, message) => {
    const id = ++toastIdRef.current;
    setToasts((cur) => [...cur, { id, type, title, message }]);
    window.setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), 4500);
  }, []);

  const selected = useMemo(
    () => locations.find((l) => l.id === selectedId) || null,
    [locations, selectedId]
  );

  const loadLocations = useCallback(async () => {
    setLoadingLocations(true);
    try {
      const resp = await listLocations({ page: 1, size: 100, filterBy: locFilter });
      const rows = resp?.data || [];
      setLocations(rows);
      setSelectedId((cur) => {
        if (cur && rows.some((r) => r.id === cur)) return cur;
        return rows[0]?.id ?? null;
      });
    } catch (err) {
      const info = extractApiError(err);
      if (info.status === 401) { navigate('/login', { replace: true }); return; }
      showToast('error', 'Could not load locations', info.message);
      setLocations([]);
      setSelectedId(null);
    } finally {
      setLoadingLocations(false);
    }
  }, [locFilter, navigate, showToast]);

  useEffect(() => { loadLocations(); }, [loadLocations]);

  const loadVenues = useCallback(async (locationId) => {
    if (!locationId) { setVenues([]); return; }
    setLoadingVenues(true);
    try {
      const resp = await listLocationVenues(locationId, { filterBy: venueFilter });
      setVenues(resp?.data || []);
    } catch (err) {
      const info = extractApiError(err);
      if (info.status === 401) { navigate('/login', { replace: true }); return; }
      showToast('error', 'Could not load venues', info.message);
      setVenues([]);
    } finally {
      setLoadingVenues(false);
    }
  }, [venueFilter, navigate, showToast]);

  useEffect(() => { loadVenues(selectedId); }, [selectedId, loadVenues]);

  // ── Location modal ─────────────────────────────────────────────────
  function openAddLocation() {
    setLocEditMode(false);
    setLocForm(EMPTY_LOC_FORM);
    setLocFormErrors({});
    setLocModalOpen(true);
  }

  function openEditLocation(loc) {
    setLocEditMode(true);
    setLocForm({
      id: loc.id,
      name: loc.name,
      type: loc.type,
      address: loc.address,
      latitude: loc.latitude,
      longitude: loc.longitude,
      contact: loc.contact,
      isPublicAccessible: loc.isPublicAccessible,
    });
    setLocFormErrors({});
    setLocModalOpen(true);
  }

  async function saveLocation() {
    const errors = validateLocation(locForm);
    if (errors) { setLocFormErrors(errors); return; }
    setSavingLoc(true);
    try {
      if (locEditMode) {
        await updateLocation(locForm.id, {
          name: locForm.name,
          address: locForm.address,
          contact: locForm.contact,
        });
        showToast('success', 'Updated', 'Location updated.');
      } else {
        const created = await addLocation({
          name: locForm.name.trim(),
          type: Number(locForm.type),
          address: locForm.address.trim(),
          latitude: Number(locForm.latitude),
          longitude: Number(locForm.longitude),
          contact: locForm.contact.trim(),
          isPublicAccessible: !!locForm.isPublicAccessible,
        });
        if (created?.data?.id) setSelectedId(created.data.id);
        showToast('success', 'Created', 'Location added.');
      }
      setLocModalOpen(false);
      loadLocations();
    } catch (err) {
      const info = extractApiError(err);
      if (info.fields) setLocFormErrors(info.fields);
      else showToast('error', 'Save failed', info.message);
    } finally {
      setSavingLoc(false);
    }
  }

  async function toggleLocationOpen(loc) {
    try {
      if (loc.open) await closeLocation(loc.id);
      else await openLocation(loc.id);
      showToast('success', loc.open ? 'Closed' : 'Opened', `${loc.name} is now ${loc.open ? 'closed' : 'open'}.`);
      loadLocations();
    } catch (err) {
      showToast('error', 'Update failed', extractApiError(err).message);
    }
  }

  async function togglePublicAccess(loc) {
    try {
      if (loc.isPublicAccessible) await disablePublicAccess(loc.id);
      else await enablePublicAccess(loc.id);
      showToast('success', 'Updated', `Public access ${loc.isPublicAccessible ? 'disabled' : 'enabled'}.`);
      loadLocations();
    } catch (err) {
      showToast('error', 'Update failed', extractApiError(err).message);
    }
  }

  // ── Venue modal ────────────────────────────────────────────────────
  function openAddVenue() {
    if (!selectedId) return;
    setVenueEditMode(false);
    setVenueForm({ ...EMPTY_VENUE_FORM, locationId: selectedId });
    setVenueFormErrors({});
    setVenueModalOpen(true);
  }

  function openEditVenue(v) {
    setVenueEditMode(true);
    setVenueForm({
      id: v.id,
      locationId: v.locationId,
      type: v.type,
      name: v.name,
      capacity: v.capacity ?? '',
      amenities: { AC: !!v.amenities?.AC, Studio: !!v.amenities?.Studio, Premium: !!v.amenities?.Premium },
    });
    setVenueFormErrors({});
    setVenueModalOpen(true);
  }

  async function saveVenue() {
    const errors = validateVenue(venueForm);
    if (errors) { setVenueFormErrors(errors); return; }
    setSavingVenue(true);
    try {
      const payload = {
        locationId: Number(venueForm.locationId),
        type: Number(venueForm.type),
        name: venueForm.name.trim(),
        capacity: venueForm.capacity === '' ? null : Number(venueForm.capacity),
        amenities: {
          AC: !!venueForm.amenities.AC,
          Studio: !!venueForm.amenities.Studio,
          Premium: !!venueForm.amenities.Premium,
        },
      };
      if (venueEditMode) {
        await updateVenue(venueForm.id, payload);
        showToast('success', 'Updated', 'Venue updated.');
      } else {
        await addVenue(payload);
        showToast('success', 'Created', 'Venue added.');
      }
      setVenueModalOpen(false);
      loadVenues(selectedId);
    } catch (err) {
      const info = extractApiError(err);
      if (info.fields) setVenueFormErrors(info.fields);
      else showToast('error', 'Save failed', info.message);
    } finally {
      setSavingVenue(false);
    }
  }

  async function toggleVenueActive(v) {
    try {
      if (v.active) await disableVenue(v.id);
      else await enableVenue(v.id);
      showToast('success', 'Updated', `Venue ${v.active ? 'disabled' : 'enabled'}.`);
      loadVenues(selectedId);
    } catch (err) {
      showToast('error', 'Update failed', extractApiError(err).message);
    }
  }

  return (
    <section className="locations-page mentor-profiles-page data-table-page">
      <ToastRegion toasts={toasts} onDismiss={(id) => setToasts((cur) => cur.filter((t) => t.id !== id))} />

      <div className="page-header-section">
        <div className="page-header-title-group">
          <span className="page-header-icon-box"><Icon className="fa fa-map-marker" /></span>
          <div>
            <h2>Locations</h2>
            <p>Manage operational locations and the venues at each location.</p>
          </div>
        </div>
        <button type="button" className="create-mentor-button" onClick={openAddLocation}>
          <Icon className="ti ti-plus" /> New Location
        </button>
      </div>

      <div className="loc-split">
        {/* ── Master: locations list ───────────────────────── */}
        <aside className="loc-master">
          <div className="loc-list">
            {loadingLocations && locations.length === 0 ? (
              <div className="loc-empty">Loading…</div>
            ) : locations.length === 0 ? (
              <div className="loc-empty">
                <Icon className="ti ti-map-2" />
                <p>No locations yet.</p>
              </div>
            ) : (
              locations.map((loc) => (
                <button
                  key={loc.id}
                  type="button"
                  className={`loc-item ${selectedId === loc.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(loc.id)}
                >
                  <div className="loc-item-row">
                    <span className="loc-item-name">{loc.name}</span>
                    <span
                      className="loc-status-dot"
                      title={loc.open ? 'Open' : 'Permanently Closed Location'}
                      aria-label={loc.open ? 'Open' : 'Permanently Closed Location'}
                      style={{ background: loc.open ? '#16a34a' : '#dc2626' }}
                    />
                  </div>
                  <div className="loc-item-addr">{loc.address}</div>
                  <div className="loc-item-meta">
                    <span className="loc-item-type">{locationTypeLabel(loc.type)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* ── Detail: location info + venues ───────────────── */}
        <div className="loc-detail">
          {!selected ? (
            <div className="loc-detail-empty">
              <Icon className="ti ti-map-2" />
              <h3>Select a location</h3>
              <p>Choose one from the list, or add a new location to get started.</p>
            </div>
          ) : (
            <>
              <header className="loc-detail-head">
                <div>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      className="loc-status-dot"
                      title={selected.open ? 'Open' : 'Permanently Closed Location'}
                      aria-label={selected.open ? 'Open' : 'Permanently Closed Location'}
                      style={{ background: selected.open ? '#16a34a' : '#dc2626' }}
                    />
                    {selected.name}
                  </h3>
                  <div className="loc-detail-sub">
                    <span className="subject-badge">{locationTypeLabel(selected.type)}</span>
                    {selected.isPublicAccessible && <span className="loc-mini-pill">Public access</span>}
                  </div>
                </div>
                <div className="loc-detail-actions">
                  <KebabMenu>
                    {({ close }) => (
                      <>
                        <button type="button" className="kebab-dropdown-item" onClick={() => { close(); openEditLocation(selected); }}>
                          <Icon className="ti ti-pencil" /><span>Edit</span>
                        </button>
                        <button type="button" className="kebab-dropdown-item" onClick={() => { close(); togglePublicAccess(selected); }}>
                          <Icon className="ti ti-eye" /><span>{selected.isPublicAccessible ? 'Make Private' : 'Make Public'}</span>
                        </button>
                        <button type="button" className="kebab-dropdown-item" onClick={() => { close(); toggleLocationOpen(selected); }}>
                          <Icon className={`ti ${selected.open ? 'ti-na' : 'ti-check'}`} /><span>{selected.open ? 'Close Permanently' : 'Re-open Location'}</span>
                        </button>
                      </>
                    )}
                  </KebabMenu>
                </div>
              </header>

              <div className="loc-info-grid">
                <div><label>Address</label><div>{selected.address}</div></div>
                <div><label>Contact</label><div>{selected.contact || '—'}</div></div>
                <div><label>Latitude</label><div>{selected.latitude}</div></div>
                <div><label>Longitude</label><div>{selected.longitude}</div></div>
              </div>

              <section className="loc-venues">
                <div className="loc-venues-head">
                  <div>
                    <h4>Venues at this Location</h4>
                  </div>
                  <div className="loc-venues-head-actions">
                    <button type="button" className="loc-add-venue-btn" onClick={openAddVenue}>
                      <Icon className="ti ti-plus" /> Add Venue
                    </button>
                  </div>
                </div>

                {!loadingVenues && venues.length === 0 ? (
                  <div className="loc-empty-row">No venues here yet.</div>
                ) : (
                <div className="students-table-container">
                  <table className={`students-table ${loadingVenues ? 'thead-loading' : ''}`}>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Capacity</th>
                        <th>Amenities</th>
                        <th className="actions-column" />
                      </tr>
                    </thead>
                    {loadingVenues ? (
                    <tbody>
                      {Array.from({ length: 8 }, (_, i) => (
                        <tr key={`sk-${i}`}>
                          {Array.from({ length: 5 }, (_, j) => (
                            <td key={j}><div className="table-skeleton medium" /></td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    ) : (
                    <tbody>
                      {venues.map((v) => (
                          <tr key={v.id}>
                            <td>
                              <div className="profile-name" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span
                                  className="loc-status-dot"
                                  title={v.active ? 'Enabled' : 'Disabled'}
                                  aria-label={v.active ? 'Enabled' : 'Disabled'}
                                  style={{ background: v.active ? '#16a34a' : '#dc2626' }}
                                />
                                {v.name}
                              </div>
                            </td>
                            <td><span className="subject-badge">{venueTypeLabel(v.type)}</span></td>
                            <td>{v.capacity ?? '—'}</td>
                            <td>
                              <div className="loc-amen-row">
                                {v.amenities?.AC && <span className="loc-mini-pill">AC</span>}
                                {v.amenities?.Studio && <span className="loc-mini-pill">Studio</span>}
                                {v.amenities?.Premium && <span className="loc-mini-pill premium">Premium</span>}
                                {!v.amenities?.AC && !v.amenities?.Studio && !v.amenities?.Premium && (
                                  <span style={{ color: '#9ca3af' }}>—</span>
                                )}
                              </div>
                            </td>
                            <td className="mentor-actions-cell">
                              <KebabMenu>
                                {({ close }) => (
                                  <>
                                    <button type="button" className="kebab-dropdown-item" onClick={() => { close(); toggleVenueActive(v); }}>
                                      <Icon className={`ti ${v.active ? 'ti-na' : 'ti-check'}`} /><span>{v.active ? 'Disable Venue' : 'Enable Venue'}</span>
                                    </button>
                                    <button type="button" className="kebab-dropdown-item" onClick={() => { close(); openEditVenue(v); }}>
                                      <Icon className="ti ti-pencil" /><span>Edit</span>
                                    </button>
                                  </>
                                )}
                              </KebabMenu>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                    )}
                  </table>
                </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>

      {/* ── Location modal ─────────────────────────────── */}
      <div className={`legacy-modal-backdrop ${locModalOpen ? 'active' : ''}`} onClick={() => setLocModalOpen(false)}>
        <div className="legacy-modal-dialog legacy-large" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          <div className="legacy-modal-header">
            <h3><Icon className="ti ti-map-2" /> {locEditMode ? 'Edit Location' : 'New Location'}</h3>
            <button type="button" className="legacy-modal-close" onClick={() => setLocModalOpen(false)}>
              <Icon className="ti ti-close" />
            </button>
          </div>
          <form className="form-modal" onSubmit={(e) => { e.preventDefault(); saveLocation(); }}>
          <div className="legacy-modal-body">
            <div className="asset-form-section">
              <div className="asset-form-section-title"><Icon className="ti ti-info-circle" /> Details</div>
              <div className="asset-form-grid">
                <label className="field-cell full-span">
                  <div className={`float-field ${locFormErrors.name ? 'has-error' : ''}`}>
                    <input
                      type="text"
                      className="float-control"
                      placeholder=" "
                      maxLength={80}
                      value={locForm.name}
                      onChange={(e) => setLocForm((f) => ({ ...f, name: e.target.value }))}
                    />
                    <span className="float-label">Name <span className="req">*</span></span>
                  </div>
                  {locFormErrors.name && <span className="field-error">{locFormErrors.name}</span>}
                </label>
                <label className="field-cell">
                  <div className={`float-field float-always ${locFormErrors.type ? 'has-error' : ''}`}>
                    <select
                      className="float-control"
                      value={locForm.type}
                      disabled={locEditMode}
                      onChange={(e) => setLocForm((f) => ({ ...f, type: Number(e.target.value) }))}
                    >
                      {LOCATION_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                    <span className="float-label">Type <span className="req">*</span></span>
                  </div>
                  {locFormErrors.type
                    ? <span className="field-error">{locFormErrors.type}</span>
                    : locEditMode && <span className="field-hint">Type cannot be changed after creation.</span>}
                </label>
                <label className="field-cell">
                  <div className={`float-field ${locFormErrors.contact ? 'has-error' : ''}`}>
                    <input
                      type="tel"
                      className="float-control"
                      placeholder=" "
                      maxLength={15}
                      value={locForm.contact}
                      onChange={(e) => setLocForm((f) => ({ ...f, contact: e.target.value }))}
                    />
                    <span className="float-label">Contact <span className="req">*</span></span>
                  </div>
                  {locFormErrors.contact && <span className="field-error">{locFormErrors.contact}</span>}
                </label>
                <label className="field-cell full-span">
                  <div className={`float-field float-textarea ${locFormErrors.address ? 'has-error' : ''}`}>
                    <textarea
                      className="float-control"
                      placeholder=" "
                      maxLength={240}
                      value={locForm.address}
                      onChange={(e) => setLocForm((f) => ({ ...f, address: e.target.value }))}
                    />
                    <span className="float-label">Address <span className="req">*</span></span>
                  </div>
                  {locFormErrors.address && <span className="field-error">{locFormErrors.address}</span>}
                </label>
                <label className="field-cell">
                  <div className={`float-field ${locFormErrors.latitude ? 'has-error' : ''}`}>
                    <input
                      type="number"
                      step="any"
                      className="float-control"
                      placeholder=" "
                      value={locForm.latitude}
                      disabled={locEditMode}
                      onChange={(e) => setLocForm((f) => ({ ...f, latitude: e.target.value }))}
                    />
                    <span className="float-label">Latitude <span className="req">*</span></span>
                  </div>
                  {locFormErrors.latitude && <span className="field-error">{locFormErrors.latitude}</span>}
                </label>
                <label className="field-cell">
                  <div className={`float-field ${locFormErrors.longitude ? 'has-error' : ''}`}>
                    <input
                      type="number"
                      step="any"
                      className="float-control"
                      placeholder=" "
                      value={locForm.longitude}
                      disabled={locEditMode}
                      onChange={(e) => setLocForm((f) => ({ ...f, longitude: e.target.value }))}
                    />
                    <span className="float-label">Longitude <span className="req">*</span></span>
                  </div>
                  {locFormErrors.longitude && <span className="field-error">{locFormErrors.longitude}</span>}
                </label>
                {!locEditMode && (
                  <div className="field-cell field-cell-inline full-span">
                    <span className="static-field-label">Publicly accessible</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!!locForm.isPublicAccessible}
                      className={`mas-switch ${locForm.isPublicAccessible ? 'on' : ''}`}
                      onClick={() => setLocForm((f) => ({ ...f, isPublicAccessible: !f.isPublicAccessible }))}
                    >
                      <span className="mas-switch-label">{locForm.isPublicAccessible ? 'Yes' : 'No'}</span>
                      <span className="mas-switch-track" />
                    </button>
                  </div>
                )}
                {locEditMode && (
                  <div className="field-cell full-span">
                    <span className="field-hint">Coordinates, type, and public access are managed separately after creation.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="legacy-modal-footer">
            <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setLocModalOpen(false)} disabled={savingLoc}>
              Cancel
            </button>
            <button type="submit" className="legacy-btn legacy-btn-success" disabled={savingLoc}>
              <Icon className="ti ti-check" /> {savingLoc ? 'Saving…' : (locEditMode ? 'Update' : 'Create')} Location
            </button>
          </div>
          </form>
        </div>
      </div>

      {/* ── Venue modal ────────────────────────────────── */}
      <div className={`legacy-modal-backdrop ${venueModalOpen ? 'active' : ''}`} onClick={() => setVenueModalOpen(false)}>
        <div className="legacy-modal-dialog legacy-large" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          <div className="legacy-modal-header">
            <h3><Icon className="ti ti-home" /> {venueEditMode ? 'Edit Venue' : 'New Venue'}</h3>
            <button type="button" className="legacy-modal-close" onClick={() => setVenueModalOpen(false)}>
              <Icon className="ti ti-close" />
            </button>
          </div>
          <form className="form-modal" onSubmit={(e) => { e.preventDefault(); saveVenue(); }}>
          <div className="legacy-modal-body">
            <div className="asset-form-section">
              <div className="asset-form-section-title"><Icon className="ti ti-info-circle" /> Details</div>
              <div className="asset-form-grid">
                <label className="field-cell full-span">
                  <div className={`float-field ${venueFormErrors.name ? 'has-error' : ''}`}>
                    <input
                      type="text"
                      className="float-control"
                      placeholder=" "
                      maxLength={80}
                      value={venueForm.name}
                      onChange={(e) => setVenueForm((f) => ({ ...f, name: e.target.value }))}
                    />
                    <span className="float-label">Name <span className="req">*</span></span>
                  </div>
                  {venueFormErrors.name && <span className="field-error">{venueFormErrors.name}</span>}
                </label>
                <label className="field-cell">
                  <div className={`float-field float-always ${venueFormErrors.type ? 'has-error' : ''}`}>
                    <select
                      className="float-control"
                      value={venueForm.type}
                      onChange={(e) => setVenueForm((f) => ({ ...f, type: Number(e.target.value) }))}
                    >
                      {VENUE_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                    <span className="float-label">Type <span className="req">*</span></span>
                  </div>
                  {venueFormErrors.type && <span className="field-error">{venueFormErrors.type}</span>}
                </label>
                <label className="field-cell">
                  <div className={`float-field ${venueFormErrors.capacity ? 'has-error' : ''}`}>
                    <input
                      type="number"
                      min={0}
                      max={255}
                      className="float-control"
                      placeholder=" "
                      value={venueForm.capacity}
                      onChange={(e) => setVenueForm((f) => ({ ...f, capacity: e.target.value }))}
                    />
                    <span className="float-label">Capacity</span>
                  </div>
                  {venueFormErrors.capacity && <span className="field-error">{venueFormErrors.capacity}</span>}
                </label>
              </div>
            </div>
            <div className="asset-form-section">
              <div className="asset-form-section-title"><Icon className="ti ti-sparkles" /> Amenities</div>
              <div className="asset-form-grid config-grid">
                {['AC', 'Studio', 'Premium'].map((k) => (
                  <div key={k} className="field-cell field-cell-inline">
                    <span className="static-field-label">{k}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!!venueForm.amenities[k]}
                      className={`mas-switch ${venueForm.amenities[k] ? 'on' : ''}`}
                      onClick={() => setVenueForm((f) => ({ ...f, amenities: { ...f.amenities, [k]: !f.amenities[k] } }))}
                    >
                      <span className="mas-switch-label">{venueForm.amenities[k] ? 'Yes' : 'No'}</span>
                      <span className="mas-switch-track" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="legacy-modal-footer">
            <button type="button" className="legacy-btn legacy-btn-default" onClick={() => setVenueModalOpen(false)} disabled={savingVenue}>
              Cancel
            </button>
            <button type="submit" className="legacy-btn legacy-btn-success" disabled={savingVenue}>
              <Icon className="ti ti-check" /> {savingVenue ? 'Saving…' : (venueEditMode ? 'Update' : 'Create')} Venue
            </button>
          </div>
          </form>
        </div>
      </div>

      <style>{`
        .loc-split {
          display: grid;
          grid-template-columns: 340px 1fr;
          gap: 16px;
          align-items: start;
        }
        @media (max-width: 960px) { .loc-split { grid-template-columns: 1fr; } }

        .loc-master {
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          max-height: calc(100vh - 220px);
        }
        .loc-master-head { padding: 12px; border-bottom: 1px solid #f1f5f9; }
        .loc-tabs { display: inline-flex; background: #f1f5f9; border-radius: 8px; padding: 3px; gap: 2px; }
        .loc-tab {
          border: 0; background: transparent;
          padding: 6px 10px; border-radius: 6px;
          font-size: 12px; color: #475569; cursor: pointer;
        }
        .loc-tab.active { background: #fff; color: #0f172a; box-shadow: 0 1px 2px rgba(0,0,0,.06); }

        .loc-list { overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 4px; }
        .loc-item {
          text-align: left; background: #fff; border: 1px solid transparent;
          border-radius: 8px; padding: 10px 12px; cursor: pointer;
          display: flex; flex-direction: column; gap: 6px;
        }
        .loc-item:hover { background: #f8fafc; }
        .loc-item.active { background: #eff6ff; border-color: #bfdbfe; }
        .loc-item-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
        .loc-item-name { font-weight: 600; color: #0f172a; }
        .loc-status-dot { flex-shrink: 0; width: 10px; height: 10px; border-radius: 50%; cursor: default; }
        .loc-item-meta { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
        .loc-item-addr { color: #64748b; font-size: 12px; line-height: 1.4; }
        .loc-item-type {
          font-size: 10px; font-weight: 600; letter-spacing: .03em;
          text-transform: uppercase; color: #94a3b8;
        }

        .loc-pill {
          font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px;
        }
        .loc-pill.ok { background: #dcfce7; color: #166534; }
        .loc-pill.off { background: #fee2e2; color: #991b1b; }
        .loc-mini-pill {
          font-size: 11px; padding: 2px 8px; border-radius: 999px;
          background: #e0e7ff; color: #3730a3;
        }
        .loc-mini-pill.premium { background: #fef3c7; color: #92400e; }

        .loc-detail {
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 20px;
          min-height: 400px;
        }
        .loc-detail-empty {
          padding: 60px 20px;
          text-align: center; color: #64748b;
        }
        .loc-detail-empty i { font-size: 36px; color: #94a3b8; margin-bottom: 8px; display: block; }
        .loc-detail-head {
          display: flex; justify-content: space-between; gap: 16px; align-items: flex-start;
          margin-bottom: 16px;
        }
        .loc-detail-head h3 { margin: 0 0 6px; }
        .loc-detail-sub { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
        .loc-detail-actions { display: flex; gap: 8px; flex-wrap: wrap; }

        .loc-info-grid {
          display: grid; grid-template-columns: repeat(2, 1fr);
          gap: 12px 24px; padding: 12px 0 20px;
          border-bottom: 1px solid #f1f5f9; margin-bottom: 20px;
        }
        .loc-info-grid label {
          display: block; text-transform: uppercase; font-size: 11px;
          font-weight: 600; color: #64748b; letter-spacing: .04em; margin-bottom: 2px;
        }
        .loc-info-grid > div > div { color: #0f172a; }

        .loc-venues-head {
          display: flex; justify-content: space-between; gap: 12px;
          margin-bottom: 12px; flex-wrap: wrap;
        }
        .loc-venues-head h4 { margin: 0 0 2px; }
        .loc-venues-head p { margin: 0; color: #64748b; font-size: 13px; }
        .loc-venues-head-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .loc-add-venue-btn {
          display: inline-flex; align-items: center; gap: 6px;
          background: transparent; color: #006073;
          border: 1px solid #cbd5e1; border-radius: 6px;
          padding: 6px 12px; font-size: 13px; font-weight: 500;
          cursor: pointer; transition: background .15s ease, border-color .15s ease;
        }
        .loc-add-venue-btn:hover { background: #f1f5f9; border-color: #94a3b8; }

        .loc-amen-row { display: flex; gap: 4px; flex-wrap: wrap; }

        .loc-empty {
          padding: 40px 12px; text-align: center; color: #64748b;
        }
        .loc-empty i { font-size: 32px; color: #94a3b8; display: block; margin-bottom: 6px; }
        .loc-empty-row { padding: 24px; text-align: center; color: #64748b; }
      `}</style>
    </section>
  );
}
