import { Link, router, usePage } from '@inertiajs/react';
import { AppWindow, ArrowLeft, Battery, BatteryCharging, Building2, Clock3, Cpu, Database, Download, Fingerprint, Folders, Gauge, HardDrive, Library, LockKeyhole, MapPinned, MemoryStick, MonitorSmartphone, Pencil, RefreshCw, RotateCcw, Save, Settings2, ShieldCheck, SlidersHorizontal, Sun, Tablet, Trash2, Volume2, Wifi, WifiOff, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import Layout from './Layout';
import KioskFields, { LibraryPicker } from './KioskFields';
import { PlatformBadge, PlatformIcon, platformCatalog } from './Platform';
import { api, dateLabel } from './api';

const baseTabs = [['overview', 'Overview'], ['kiosk', 'Kiosk configuration'], ['management', 'Management']];
const commandLabels = { agent_update: 'Agent update', shell: 'Remote terminal', set_volume: 'Volume', set_brightness: 'Brightness', capture_screen: 'Kiosk screenshot', request_location: 'Location request' };
const statusLabels = { pending: 'Pending', dispatched: 'Dispatched', applied: 'Applied', failed: 'Failed', cancelled: 'Replaced', recorded: 'Recorded', expired: 'Expired' };
const policyHistoryLabels = { DEVICE_CONFIGURATION_ASSIGNED: 'Profile assigned', DEVICE_CONFIGURATION_UPDATED: 'Profile updated', DEVICE_CONFIGURATION_DETACHED: 'Independent settings enabled', DEVICE_POLICY_UPDATED: 'Custom settings', KIOSK_ENABLED: 'Kiosk enabled', KIOSK_DISABLED: 'Kiosk disabled' };
const parameterLabels = { kiosk_enabled: 'Kiosk mode', kiosk_type: 'Kiosk type', url: 'URL', allowed_origins: 'Allowed websites', allowed_apps: 'Allowed applications', orientation: 'Orientation', keep_screen_on: 'Screen on', sync_interval_minutes: 'Synchronization', default_volume: 'Volume', default_brightness: 'Brightness', launcher_background_color: 'Background color', launcher_background: 'Background image', launcher_auto_grant_permissions: 'Automatic permissions', library_items: 'Applications and files', admin_pin: 'Maintenance PIN' };

function Metric({ icon, label, value, detail }) {
  return <div className="device-metric"><span className="device-metric-icon">{icon}</span><div><small>{label}</small><strong>{value}</strong>{detail && <span>{detail}</span>}</div></div>;
}

function Fact({ icon, label, value, mono = false }) {
  return <div className="device-fact"><span>{icon}</span><div><small>{label}</small><strong className={mono ? 'mono' : ''}>{value}</strong></div></div>;
}

// Circular gauge for a used/total pair (storage, memory, etc.).
// - used/total in bytes (or any consistent unit)
// - tone calculated from the usage percentage
function UsageRing({ icon, label, used, total, formatValue = formatCapacity }) {
  const hasData = used != null && total != null && total > 0;
  const pct = hasData ? Math.min(100, Math.max(0, Math.round((used / total) * 100))) : null;
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const offset = pct == null ? circumference : circumference - (pct / 100) * circumference;
  const tone = pct == null ? 'unknown' : pct >= 90 ? 'critical' : pct >= 75 ? 'warning' : 'normal';

  return (
    <div className="usage-ring-card">
      <div className={`usage-ring tone-${tone}`}>
        <svg viewBox="0 0 72 72" className="usage-ring-svg">
          <circle cx="36" cy="36" r={radius} className="usage-ring-track" />
          {pct != null && (
            <circle
              cx="36" cy="36" r={radius}
              className="usage-ring-value"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
            />
          )}
        </svg>
        <div className="usage-ring-center">
          <strong>{pct == null ? '—' : `${pct}%`}</strong>
        </div>
      </div>
      <div className="usage-ring-info">
        <span className="usage-ring-icon">{icon}</span>
        <small>{label}</small>
        <strong>{hasData ? `${formatValue(used)} used / ${formatValue(total)}` : 'Unavailable'}</strong>
        {hasData && <span className="usage-ring-remaining">{formatValue(total - used)} remaining</span>}
      </div>
    </div>
  );
}

export default function DeviceDetail() {
  const { url, props } = usePage();
  const id = url.split('/').filter(Boolean).pop();
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [tab, setTab] = useState('overview');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState(null);
  const [confirmation, setConfirmation] = useState('');
  const [identityEditing, setIdentityEditing] = useState(false);
  const [identityForm, setIdentityForm] = useState({ name: '', organization_id: '', group_id: '' });
  const [configurationId, setConfigurationId] = useState('');
  const [profileEnabled, setProfileEnabled] = useState(false);

  function applyPayload(payload) {
    setData(payload);
    setIdentityForm({ name: payload.device.name, organization_id: payload.device.organization_id || '', group_id: payload.device.group_id || '' });
    setConfigurationId(payload.device.configuration_id || '');
    setProfileEnabled(Boolean(payload.device.configuration_id));
    setForm({ name: payload.device.name, kiosk_enabled: payload.policy.kiosk_enabled, kiosk_type: payload.policy.kiosk_type, allowed_apps: (payload.policy.allowed_apps || []).join('\n'), library_item_ids: (payload.policy.library_items || []).map((asset) => asset.id), launcher_background_color: payload.policy.launcher_background_color || '#7E7F7B', launcher_background_image_id: payload.policy.launcher_background?.id || '', launcher_auto_grant_permissions: payload.policy.launcher_auto_grant_permissions !== false, url: payload.policy.url, allowed_origins: (payload.policy.allowed_origins || []).join('\n'), orientation: payload.policy.orientation, keep_screen_on: payload.policy.keep_screen_on, sync_interval_minutes: payload.policy.sync_interval_minutes || 5, default_volume: payload.policy.default_volume ?? null, default_brightness: payload.policy.default_brightness ?? null, admin_pin: '' });
  }

  async function load() { setError(''); applyPayload(await api(`/api/v1/devices/${id}`)); }
  useEffect(() => { load().catch((e) => setError(e.message)); }, [id]);

  async function run(operation, successMessage) {
    setBusy(true); setError(''); setMessage('');
    try { await operation(); setMessage(successMessage); return true; } catch (e) { setError(e.message); return false; } finally { setBusy(false); }
  }

  async function save(event) {
    event.preventDefault();
    await run(async () => {
      const payload = { ...form, allowed_apps: form.allowed_apps.split('\n').map((item) => item.trim()).filter(Boolean), allowed_origins: form.allowed_origins.split('\n').map((item) => item.trim()).filter(Boolean) };
      applyPayload(await api(`/api/v1/devices/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }));
    }, 'Configuration saved.');
  }

  async function saveLibrary() {
    await run(async () => {
      const payload = { ...form, allowed_apps: form.allowed_apps.split('\n').map((item) => item.trim()).filter(Boolean), allowed_origins: form.allowed_origins.split('\n').map((item) => item.trim()).filter(Boolean) };
      applyPayload(await api(`/api/v1/devices/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }));
    }, 'Library sent to the device. Installation will start on its next sync.');
  }

  async function sendCommand(type, value, force = false) {
    await run(async () => {
      const body = value === undefined ? { type, force } : { type, value };
      applyPayload(await api(`/api/v1/devices/${id}/commands`, { method: 'POST', body: JSON.stringify(body) }));
    }, 'Command queued. It will run on the next sync.');
  }

  async function saveIdentity(event) {
    event.preventDefault();
    await run(async () => {
      applyPayload(await api(`/api/v1/devices/${id}/identity`, { method: 'PATCH', body: JSON.stringify({ ...identityForm, group_id: identityForm.group_id || null }) }));
      setIdentityEditing(false);
    }, 'Device identity, organization and group saved.');
  }

  async function assignConfiguration(nextId) {
    setConfigurationId(nextId);
    const assigned = await run(async () => {
      applyPayload(await api(`/api/v1/devices/${id}/configuration`, { method: 'POST', body: JSON.stringify({ configuration_id: nextId }) }));
    }, 'Profile applied.');
    if (!assigned) setConfigurationId(data.device.configuration_id || '');
    return assigned;
  }

  async function toggleProfile(enabled) {
    if (enabled) {
      setProfileEnabled(true);
      if (configurationId) {
        const assigned = await assignConfiguration(configurationId);
        if (!assigned) setProfileEnabled(Boolean(data.device.configuration_id));
      }
      return;
    }
    if (!data.device.configuration_id) { setProfileEnabled(false); return; }
    const previousId = configurationId;
    await run(async () => {
      applyPayload(await api(`/api/v1/devices/${id}/configuration`, { method: 'DELETE' }));
      setConfigurationId(previousId);
    }, 'Independent settings enabled.');
  }

  async function executeAction(event) {
    event.preventDefault();
    await run(async () => {
      if (action === 'delete') {
        await api(`/api/v1/devices/${id}`, { method: 'DELETE', body: JSON.stringify({ confirmation }) });
        router.visit('/devices');
      } else {
        applyPayload(await api(`/api/v1/devices/${id}/factory-reset`, { method: 'POST', body: JSON.stringify({ confirmation }) }));
        setAction(null); setConfirmation('');
      }
    }, action === 'delete' ? '' : 'Factory reset queued for the next sync.');
  }

  if (!data || !form) return <Layout title="Device">{error ? <p className="error">{error}</p> : <div className="panel loading-state">Loading device…</div>}</Layout>;
  const device = data.device;
  const canEdit = data.permissions?.includes('update');
  const canDelete = data.permissions?.includes('delete');
  const canCommand = data.permissions?.includes('commands');
  const platform = platformCatalog[device.platform] || platformCatalog.android;
  const online = device.last_seen_at && (Date.now() - new Date(device.last_seen_at).getTime()) < 7 * 60 * 1000;
  const location = deviceLocation(device.metrics);
  const managedByConfiguration = Boolean(device.configuration_id);
  const tabs = data.policy.kiosk_type === 'launcher' ? [baseTabs[0], baseTabs[1], ['applications', 'Applications'], baseTabs[2]] : baseTabs;

  return <Layout title="Device">
    <Link className="back-link" href="/devices"><ArrowLeft size={16} />All devices</Link>
    <header className="device-detail-header">
      <span className={`device-hero-icon platform-${device.platform}`}><PlatformIcon platform={device.platform} size={34} /></span><div><h2>{device.name}</h2><p>{[device.manufacturer, device.model].filter(Boolean).join(' ') || 'Unknown model'} · {platform.label} {device.os_version || '?'}</p><div className="device-header-meta"><PlatformBadge platform={device.platform} />{device.organization && <span><Building2 size={12} />{device.organization.name}</span>}{device.group && <span><Folders size={12} />{device.group.name}</span>}<span>Agent {device.agent_version || 'unknown'}</span><span>Last seen {dateLabel(device.last_seen_at)}</span></div></div>
      <span className={`status-pill ${online ? 'online' : 'offline'}`}>{online ? <Wifi size={14} /> : <WifiOff size={14} />}{online ? 'Online' : 'Offline'}</span>
      <button className="secondary-button" disabled={!canEdit} onClick={() => setIdentityEditing((editing) => !editing)}><Pencil size={16} />Edit</button>
      <button className="secondary-button" disabled={busy} onClick={() => run(load, 'Data refreshed.')}><RefreshCw size={16} />Refresh</button>
    </header>
    <nav className="device-tabs" aria-label="Device sections">{tabs.map(([value, label]) => <button key={value} className={tab === value ? 'active' : ''} onClick={() => { setTab(value); setMessage(''); setError(''); }}>{label}</button>)}</nav>
    {identityEditing && <form className="panel device-identity-editor" onSubmit={saveIdentity}><div><label>Device name<input required maxLength="255" value={identityForm.name} onChange={(event) => setIdentityForm({ ...identityForm, name: event.target.value })} /></label><label>Organization<select required value={identityForm.organization_id} onChange={(event) => setIdentityForm({ ...identityForm, organization_id: event.target.value, group_id: '' })}>{data.organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label><label>Group<select value={identityForm.group_id} onChange={(event) => setIdentityForm({ ...identityForm, group_id: event.target.value })}><option value="">No group</option>{data.groups.filter((group) => group.organization_id === identityForm.organization_id).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label></div><button className="icon-text" type="submit" disabled={busy || !identityForm.name.trim() || !identityForm.organization_id}><Save size={16} />Save</button><button className="secondary-button" type="button" onClick={() => { setIdentityEditing(false); setIdentityForm({ name: device.name, organization_id: device.organization_id || '', group_id: device.group_id || '' }); }}><X size={16} />Cancel</button></form>}
    {error && <p className="error alert-box" role="alert">{error}</p>}{message && <p className="success alert-box" role="status">{message}</p>}

    {tab === 'overview' && <div className="device-overview">
      <section className="device-resource-dashboard"><div className="device-resource-dashboard-head"><div><span className="eyebrow">Device dashboard</span><h3>Live resource usage</h3><p>Latest metrics received during sync.</p></div><span className="resource-dashboard-status">{dateLabel(device.last_seen_at)}</span></div><div className="device-usage-grid">
        <UsageRing icon={<Cpu size={18} />} label="CPU usage" used={device.metrics?.cpu_percent} total={device.metrics?.cpu_percent == null ? null : 100} formatValue={formatPercentValue} />
        <UsageRing icon={<MemoryStick size={18} />} label="RAM usage" used={device.metrics?.memory_total_bytes != null && device.metrics?.memory_free_bytes != null ? device.metrics.memory_total_bytes - device.metrics.memory_free_bytes : null} total={device.metrics?.memory_total_bytes} />
        <UsageRing icon={<HardDrive size={18} />} label="Storage usage" used={device.metrics?.storage_total_bytes != null && device.metrics?.storage_free_bytes != null ? device.metrics.storage_total_bytes - device.metrics.storage_free_bytes : null} total={device.metrics?.storage_total_bytes} />
      </div></section>
      <section className="device-metrics-grid">
        <Metric icon={device.battery_charging ? <BatteryCharging /> : <Battery />} label="Battery" value={device.battery_level === null ? 'Pending' : `${device.battery_level}%`} detail={device.battery_charging ? 'Charging' : null} />
        <Metric icon={<Volume2 />} label="Media volume" value={device.volume_level === null ? 'Pending' : `${device.volume_level}%`} />
        <Metric icon={<Sun />} label="Brightness" value={device.brightness_level === null ? 'Pending' : `${device.brightness_level}%`} />
        <Metric icon={<ShieldCheck />} label="MyMDM agent" value={device.agent_version || 'Pending'} detail={`Code ${device.agent_version_code || '—'}`} />
      </section>

      <section className="device-visual-grid">
        <article className="panel visual-card screen-preview"><div className="section-heading"><div><span className="eyebrow">Display</span><h3>Kiosk screenshot</h3><p>Updated automatically on every sync.</p></div><span className="section-icon"><MonitorSmartphone /></span></div>{device.screen?.available ? <div className="visual-card-stage screen-preview-display has-image"><img src={`${device.screen.url}?v=${encodeURIComponent(device.screen.updated_at || '')}`} alt={`Latest kiosk screenshot from ${device.name}`} /></div> : <div className="visual-card-stage screen-preview-display"><MonitorSmartphone size={48} /><strong>No screenshots received</strong><span>{online ? 'A screenshot will be sent on the next sync.' : 'Device offline'}</span></div>}<footer className="visual-card-footer"><div className="visual-card-info"><strong>{device.screen?.available ? 'Latest screenshot' : 'Screenshot unavailable'}</strong><span>{device.screen?.available ? dateLabel(device.screen.updated_at) : 'Waiting for the next sync.'}</span></div></footer></article>
        <article className="panel visual-card device-location"><div className="section-heading"><div><span className="eyebrow">Location</span><h3>Latest location</h3><p>Updated automatically on every sync.</p></div><span className="section-icon"><MapPinned /></span></div>{location ? <div className="visual-card-stage device-location-map"><iframe title={`Location of ${device.name}`} src={osmEmbedUrl(location)} loading="lazy" referrerPolicy="no-referrer" /></div> : <div className="visual-card-stage location-empty"><MapPinned size={46} /><strong>Location unavailable</strong><span>{locationEmptyMessage(device.metrics, device.agent_version_code)}</span></div>}<footer className="visual-card-footer"><div className="visual-card-info">{location ? <><strong>{location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</strong><span>{location.accuracy == null ? 'Unknown accuracy' : `Accuracy ±${Math.round(location.accuracy)} m`} · {location.timestamp ? dateLabel(new Date(location.timestamp).toISOString()) : 'unknown date'} · {device.metrics?.location_provider || 'unknown source'}</span></> : <><strong>No readings</strong><span>The device will retry on its next sync.</span><small>{locationDiagnosticLabel(device.metrics)}</small></>}</div></footer></article>
      </section>
      <section className="device-details-grid">
        <article className="panel device-information"><div className="section-heading"><div><span className="eyebrow">Inventory</span><h3>Device identity</h3><p>Identifiers used to track this device.</p></div><span className="section-icon"><Fingerprint /></span></div><div className="device-facts-grid"><Fact icon={<Fingerprint />} label="MyMDM ID" value={device.id} mono /><Fact icon={<PlatformIcon platform={device.platform} />} label="Serial number" value={device.serial_number || device.metrics?.serial || 'Unavailable'} mono /><Fact icon={<Clock3 />} label="Enrolled on" value={dateLabel(device.enrolled_at)} /><Fact icon={<ShieldCheck />} label="Policy" value={policyStatusLabel(data, device)} /></div></article>
        <article className="panel extended-metrics"><div className="section-heading"><div><span className="eyebrow">System</span><h3>Technical metrics</h3><p>Latest values reported by the agent.</p></div><span className="section-icon"><Database /></span></div><div className="system-metrics-grid"><Fact icon={<Wifi />} label="Wi-Fi network" value={`${device.metrics?.wifi_ssid || 'Unavailable'}${device.metrics?.wifi_link_mbps != null ? ` · ${device.metrics.wifi_link_mbps} Mb/s` : ''}`} /><Fact icon={<MonitorSmartphone />} label="Display" value={device.metrics?.screen_width ? `${device.metrics.screen_width} × ${device.metrics.screen_height} · ${device.metrics.screen_density_dpi} dpi` : 'Unavailable'} /><Fact icon={<AppWindow />} label="Visible applications" value={device.metrics?.installed_app_count ?? 'Unavailable'} /><Fact icon={<Clock3 />} label="Uptime" value={formatUptime(device.metrics?.uptime_seconds)} /></div><div className={`owner-state ${device.metrics?.device_owner ? 'active' : ''}`}><ShieldCheck size={18} /><span>Device Owner</span><strong>{device.metrics?.device_owner == null ? 'Unavailable' : device.metrics.device_owner ? 'Active' : 'Inactive'}</strong></div></article>
      </section>
    </div>}

    {tab === 'kiosk' && <div className="device-kiosk-layout"><section className="panel device-configuration-assignment"><div className="section-heading profile-assignment-heading"><h3>Reusable profile</h3><button type="button" role="switch" aria-checked={profileEnabled} aria-label="Reusable profile" disabled={busy || !canEdit || !props.auth_user?.is_admin} className={`profile-toggle ${profileEnabled ? 'enabled' : ''}`} onClick={() => toggleProfile(!profileEnabled)}><span className="profile-toggle-label">{profileEnabled ? 'ON' : 'OFF'}</span><span className="profile-toggle-track"><span /></span></button></div>{profileEnabled && <label>Configuration<select value={configurationId} disabled={busy || !props.auth_user?.is_admin} onChange={(event) => { if (event.target.value) assignConfiguration(event.target.value); }}><option value="" disabled>Select a configuration</option>{data.configurations.map((configuration) => <option value={configuration.id} key={configuration.id}>{configuration.name}</option>)}</select></label>}</section><form className="panel form-grid device-kiosk-form device-kiosk-compact" onSubmit={save}>
      <div className="section-heading"><h3>Kiosk configuration</h3>{profileEnabled ? managedByConfiguration && props.auth_user?.is_admin && <Link className="secondary-button" href={`/configurations?configuration_id=${device.configuration_id}`}><Settings2 size={16} />Edit profile</Link> : <button className="icon-text" type="submit" disabled={busy || !canEdit}><Save size={16} />Save</button>}</div>
      {profileEnabled && !managedByConfiguration ? <p className="muted">Select a configuration above.</p> : <>
      {profileEnabled && <span className="profile-readonly-label"><LockKeyhole size={14} />Read-only</span>}
      <fieldset className="device-managed-fields" disabled={busy || profileEnabled || !canEdit}>
        <label className="switch"><input type="checkbox" checked={form.kiosk_enabled} onChange={(e) => setForm({ ...form, kiosk_enabled: e.target.checked })} />Kiosk mode enabled</label>
        <KioskFields compact form={form} change={(key, value) => setForm((previous) => ({ ...previous, [key]: value }))} assets={data.library_assets} />
        <label>Orientation<select value={form.orientation} onChange={(e) => setForm({ ...form, orientation: e.target.value })}><option value="auto">Automatic</option><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label><label>Sync interval<select value={form.sync_interval_minutes} onChange={(e) => setForm({ ...form, sync_interval_minutes: Number(e.target.value) })}><option value={1}>Every minute</option><option value={5}>Every 5 minutes</option><option value={15}>Every 15 minutes</option><option value={30}>Every 30 minutes</option><option value={60}>Every hour</option><option value={180}>Every 3 hours</option><option value={360}>Every 6 hours</option><option value={720}>Every 12 hours</option><option value={1440}>Every 24 hours</option></select></label><label className="switch"><input type="checkbox" checked={form.keep_screen_on} onChange={(e) => setForm({ ...form, keep_screen_on: e.target.checked })} />Keep the screen on</label><PolicyDefaultPercentage label="Media volume" value={form.default_volume} fallback={50} onChange={(value) => setForm({ ...form, default_volume: value })} /><PolicyDefaultPercentage label="Screen brightness" value={form.default_brightness} fallback={70} onChange={(value) => setForm({ ...form, default_brightness: value })} /><label>Maintenance PIN<input value={form.admin_pin} onChange={(e) => setForm({ ...form, admin_pin: e.target.value })} type="password" placeholder={data.policy.admin_pin_enabled ? 'Already configured' : '6 to 12 digits'} /></label>
      </fieldset></>}
    </form></div>}

    {tab === 'applications' && data.policy.kiosk_type === 'launcher' && <section className="panel device-library-panel">
      <div className="section-heading"><div><span className="eyebrow"><Library size={14} />Launcher kiosk</span><h3>Applications and files for this device</h3><p>{managedByConfiguration ? `Library managed by the “${device.configuration_name}” profile.` : 'Select content to install and display in the device’s MyMDM home menu.'}</p></div><button className="icon-text" disabled={busy || managedByConfiguration || !canEdit} onClick={saveLibrary}><Save size={16} />Apply to device</button></div>
      {managedByConfiguration && <p className="notice">Edit the library in the main configuration or disable the reusable profile.</p>}
      <fieldset className="device-managed-fields" disabled={busy || managedByConfiguration || !canEdit}><LibraryPicker assets={data.library_assets} selected={form.library_item_ids || []} onChange={(ids) => setForm((previous) => ({ ...previous, library_item_ids: ids }))} /></fieldset>
      <div className="library-selection-summary"><AppWindow size={18} /><strong>{(form.library_item_ids || []).length}</strong><span>item(s) selected. The device verifies their checksums before installing or opening them.</span></div>
    </section>}

    {tab === 'management' && <div className="management-layout"><section className="panel management-controls"><div className="section-heading"><h3>Remote controls</h3><span className="section-icon"><SlidersHorizontal /></span></div>
      <div className="control-card"><div><span className="control-icon"><Download /></span><div><strong>Agent update</strong><p>Installed: {device.agent_version || 'unknown'} · code {device.agent_version_code || 'unknown'}<br />Target: {data.available_agent.available ? `${data.available_agent.version} · code ${data.available_agent.version_code}` : 'no active agent'}</p></div></div><button className="icon-text" disabled={busy || !canCommand || !data.available_agent.available} onClick={() => sendCommand('agent_update', undefined, !data.update_available)}>{data.update_available ? 'Update' : 'Reinstall'}</button></div>
    </section><section className="panel management-panel"><div className="section-heading"><h3>Device management</h3><span className="section-icon"><ShieldCheck /></span></div>
      {device.reset_status && <div className="notice">Factory reset: {{ pending: 'pending', dispatched: 'dispatched', failed: 'failed' }[device.reset_status] || device.reset_status}{device.reset_error && ` — ${device.reset_error}`}</div>}
      <div className="management-action"><span className="control-icon"><RotateCcw /></span><div><strong>Factory reset</strong><p>Wipes all data and requires re-enrollment.</p></div><button className="danger-button" disabled={busy || !canDelete || device.revoked || ['pending', 'dispatched'].includes(device.reset_status)} onClick={() => { setAction('reset'); setConfirmation(''); }}>Reset</button></div>
      {device.reset_status === 'pending' && <button className="secondary-button" disabled={busy || !canDelete} onClick={() => run(async () => applyPayload(await api(`/api/v1/devices/${id}/factory-reset`, { method: 'DELETE' })), 'Factory reset cancelled.')}>Cancel pending factory reset</button>}
      <div className="management-action"><span className="control-icon danger-icon"><Trash2 /></span><div><strong>Remove from console</strong><p>Revokes MDM access without wiping the device.</p></div><button className="danger-button" disabled={busy || !canDelete} onClick={() => { setAction('delete'); setConfirmation(''); }}>Delete</button></div>
      {action && <form className="confirmation-box" onSubmit={executeAction}><h3>{action === 'delete' ? 'Delete this device?' : 'Wipe this device?'}</h3><p>{action === 'delete' ? 'Any pending factory reset will be cancelled.' : 'This action cannot be undone once received by the device.'}</p><label>Type {action === 'delete' ? 'DELETE' : 'RESET'}<input autoComplete="off" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></label><div><button className="danger-button" type="submit" disabled={busy || confirmation !== (action === 'delete' ? 'DELETE' : 'RESET')}>Confirm</button><button className="secondary-button" type="button" disabled={busy} onClick={() => setAction(null)}>Cancel</button></div></form>}
    </section><section className="panel management-history"><div className="section-heading"><h3>Action history</h3><span className="section-icon"><Clock3 /></span></div><div className="command-history">{(data.history || data.commands).map((entry) => <HistoryEntry entry={entry} key={entry.id} />)}{(data.history || data.commands).length === 0 && <p className="muted">No actions recorded.</p>}</div></section></div>}
  </Layout>;
}

export function HistoryEntry({ entry, children }) {
  const payload = entry.payload || {};
  return <div><span className={`command-status ${entry.status}`}>{statusLabels[entry.status] || entry.status}</span><div><strong>{policyHistoryLabels[entry.type] || commandLabels[entry.type] || entry.type}{payload.configuration_name && ` · ${payload.configuration_name}`}</strong><small>{payload.value !== undefined ? `${payload.value}% · ` : ''}{dateLabel(entry.created_at)}{payload.revision && ` · Revision ${payload.revision}`}</small>{Object.keys(payload.changes || {}).length > 0 && <ul className="policy-history-changes">{Object.entries(payload.changes).map(([field, change]) => <li key={field}><span>{parameterLabels[field] || field}</span><span>{field === 'admin_pin' ? 'Changed' : <>{parameterValue(field, change.from)} <span aria-label="to">→</span> <strong>{parameterValue(field, change.to)}</strong></>}</span></li>)}</ul>}{entry.error_message && <span className="error">{entry.error_message}</span>}{children}</div></div>;
}

function parameterValue(field, value) {
  if (value == null) return 'Not set';
  if (typeof value === 'boolean') return value ? 'Enabled' : 'Disabled';
  if (Array.isArray(value)) return value.length ? value.map((item) => typeof item === 'object' ? item.name : item).join(', ') : 'None';
  if (typeof value === 'object') return value.name || 'Not set';
  if (['default_volume', 'default_brightness'].includes(field)) return `${value}%`;
  if (field === 'sync_interval_minutes') return `${value} min`;
  return ({ auto: 'Automatic', portrait: 'Portrait', landscape: 'Landscape', web: 'Web', web_single: 'Single web page', web_open: 'Web with redirects', app: 'Single application', launcher: 'Launcher kiosk' })[value] || String(value);
}

function PolicyDefaultPercentage({ label, value, fallback, onChange }) {
  const enabled = value !== null && value !== undefined;
  return <div className="configuration-default-field"><label className="switch"><input type="checkbox" checked={enabled} onChange={(event) => onChange(event.target.checked ? fallback : null)} />{label} by default</label>{enabled && <label>{value}%<input aria-label={label} type="range" min="0" max="100" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>}</div>;
}

function policyStatusLabel(data, device) {
  const revision = data.policy?.revision || data.policy_status?.revision || '—';
  if (data.policy_status?.status === 'failed') return `Apply failed · revision ${revision}`;
  if (device.sync_state === 'synchronized') return `Synced · revision ${revision}`;
  if (device.sync_state === 'not_synchronized') return `Out of sync · revision ${revision}`;
  return `Pending sync · revision ${revision}`;
}

function formatCapacity(value) {
  if (value == null) return '—';
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatPercentValue(value) {
  return `${Number(value).toFixed(1)}%`;
}

function formatUptime(value) {
  if (value == null) return 'Unavailable';
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  return `${days}d ${hours}h`;
}

function deviceLocation(metrics) {
  if (metrics?.location_latitude == null || metrics?.location_longitude == null) return null;
  const latitude = Number(metrics.location_latitude);
  const longitude = Number(metrics.location_longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const accuracy = metrics.location_accuracy_meters == null ? null : Number(metrics.location_accuracy_meters);
  const timestamp = Number(metrics.location_timestamp || 0);
  return { latitude, longitude, accuracy: Number.isFinite(accuracy) ? accuracy : null, timestamp: Number.isFinite(timestamp) ? timestamp : 0 };
}

function locationEmptyMessage(metrics, versionCode) {
  if (Number(versionCode || 0) < 43) return 'Update the agent to version 0.4.3-dev (build 43) to enable enhanced location tracking.';
  if (metrics?.location_permission_granted === false) return 'Android has not granted location permission to MyMDM.';
  if (metrics?.location_background_permission_granted === false) return 'Android has not granted background location permission to MyMDM.';
  if (metrics?.location_enabled === false) return 'Android location services are disabled on the device.';
  if (metrics?.location_last_error) return metrics.location_last_error;
  if (Number(metrics?.location_last_request_timestamp || 0) > 0) return 'A location reading was requested. The background service will maintain a recent location with low power usage.';
  return 'The background service will start low-power location tracking on the next sync.';
}

function locationDiagnosticLabel(metrics) {
  if (!metrics) return 'Diagnostics pending the next sync.';
  const googleStatus = Number(metrics.location_google_play_services_status);
  const google = googleStatus === 0 ? 'Google ready' : (googleStatus >= 0 ? `Google code ${googleStatus}` : 'Google not checked');
  const settingsStatus = Number(metrics.location_settings_status);
  const settings = settingsStatus === 0 ? 'settings compatible' : (settingsStatus >= 0 ? `settings code ${settingsStatus}` : 'settings not checked');
  const background = metrics.location_background_permission_granted === true ? 'background allowed' : 'background unconfirmed';
  const foreground = metrics.location_foreground_session_started === true ? 'foreground session started' : 'foreground session unconfirmed';
  const continuous = metrics.location_continuous_tracking === true ? 'low-power tracking active' : 'continuous tracking unconfirmed';
  return `${google} · ${settings} · ${background} · ${foreground} · ${continuous} · providers: ${metrics.location_providers || 'none'}`;
}

function osmEmbedUrl(location) {
  const spread = 0.012;
  const bbox = [location.longitude - spread, location.latitude - spread, location.longitude + spread, location.latitude + spread].join(',');
  return `https://www.openstreetmap.org/export/embed.html?${new URLSearchParams({ bbox, layer: 'mapnik', marker: `${location.latitude},${location.longitude}` })}`;
}
