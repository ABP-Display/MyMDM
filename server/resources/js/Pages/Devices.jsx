import { Link } from '@inertiajs/react';
import { Battery, BatteryCharging, Folders, ListFilter, MonitorSmartphone, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Layout from './Layout';
import { PlatformBadge, PlatformIcon, platformCatalog, platformIds } from './Platform';
import SyncStatus, { ConnectivityStatus, isOnline } from './SyncStatus';
import { api, dateLabel } from './api';

const kioskLabels = { web: 'Web', web_single: 'Single web page', web_open: 'Web with redirects', app: 'Single application', launcher: 'Library' };

function BatteryValue({ device }) {
  if (device.battery_level === null) return <span className="muted">Pending</span>;
  return <span className={`device-battery ${device.battery_level <= 20 ? 'low' : ''}`}>{device.battery_charging ? <BatteryCharging size={17} /> : <Battery size={17} />}{device.battery_level}%</span>;
}

export default function Devices() {
  const [devices, setDevices] = useState([]);
  const [groups, setGroups] = useState([]);
  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [fleetFilter, setFleetFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true); setError('');
    try {
      const [fleet, deviceGroups] = await Promise.all([api('/api/v1/devices'), api('/api/v1/device-groups')]);
      setDevices(fleet); setGroups(deviceGroups);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    return devices.filter((device) => {
      const matchesGroup = groupFilter === 'all' || (groupFilter === 'none' ? !device.group : device.group?.id === groupFilter);
      const matchesPlatform = platformFilter === 'all' || device.platform === platformFilter;
      const matchesQuery = !value || [device.name, device.serial_number, device.manufacturer, device.model, device.agent_version, device.group?.name].some((item) => String(item || '').toLowerCase().includes(value));
      const matchesFleet = {
        all: true,
        online: isOnline(device),
        offline: device.status !== 'Revoked' && !isOnline(device),
        synchronized: device.sync_state === 'synchronized',
        pending: device.sync_state === 'pending',
        not_synchronized: device.sync_state === 'not_synchronized',
        low_battery: device.status !== 'Revoked' && device.battery_level !== null && device.battery_level <= 20,
      }[fleetFilter] ?? true;
      return matchesGroup && matchesPlatform && matchesQuery && matchesFleet;
    });
  }, [devices, query, groupFilter, platformFilter, fleetFilter]);

  return <Layout title="Devices">
    <section className="panel device-command-center">
      <div className="section-heading">
        <div><span className="eyebrow">Selected fleet</span><h3>Search devices</h3><p>Filter by group, platform or status, then open a device to manage it.</p></div>
        <button className="secondary-button" disabled={loading} onClick={load}><RefreshCw size={16} />{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>
      <label className="search-field device-search"><Search size={18} /><input aria-label="Search devices" placeholder="Name, serial number, model, agent or group…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div className="device-filter-grid">
        <label><span><Folders size={15} />Group</span><select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}><option value="all">All groups</option><option value="none">No group</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name} ({group.devices_count})</option>)}</select></label>
        <label><span><MonitorSmartphone size={15} />Platform</span><select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)}><option value="all">All platforms</option>{platformIds.map((id) => <option key={id} value={id}>{platformCatalog[id].label}</option>)}</select></label>
        <label><span><ListFilter size={15} />Status</span><select value={fleetFilter} onChange={(event) => setFleetFilter(event.target.value)}><option value="all">All statuses</option><option value="online">Online</option><option value="offline">Offline</option><option value="synchronized">Synced</option><option value="pending">Pending sync</option><option value="not_synchronized">Out of sync</option><option value="low_battery">Low battery (≤ 20%)</option></select></label>
      </div>
    </section>
    {error && <p className="error alert-box" role="alert">{error}</p>}
    <div className="device-results-heading"><div><strong>{filtered.length}</strong><span>device{filtered.length !== 1 ? 's' : ''} found</span></div><small>The out-of-sync threshold is defined in the organization settings.</small></div>
    <div className="device-card-grid">
      {filtered.map((device) => <Link className={`device-card management-sync-${device.sync_state}`} href={`/devices/${device.id}`} key={device.id}>
        <div className="device-card-head"><span className={`device-icon platform-${device.platform}`}><PlatformIcon platform={device.platform} size={25} /></span><div className="device-card-statuses"><ConnectivityStatus device={device} /><SyncStatus device={device} /></div></div>
        <div className="device-card-title"><strong>{device.name}</strong><span>{[device.manufacturer, device.model].filter(Boolean).join(' ') || 'Unknown model'} · {device.os_version || 'Unknown OS version'}</span><div className="device-card-labels"><PlatformBadge platform={device.platform} />{device.group && <small className="device-group-badge"><Folders size={13} />{device.group.name}</small>}</div></div>
        <div className="device-card-metrics"><div><small>Battery</small><BatteryValue device={device} /></div><div><small>Agent</small><b>{device.agent_version || 'Pending'}</b></div></div>
        <div className="device-card-foot"><span><ShieldCheck size={15} />{device.kiosk_enabled ? kioskLabels[device.kiosk_type] || 'Active' : 'Kiosk inactive'}</span><small>{dateLabel(device.last_seen_at)}</small></div>
      </Link>)}
    </div>
    {!loading && filtered.length === 0 && <div className="panel empty-state"><MonitorSmartphone size={34} /><strong>No devices found</strong><span>Change your search or filters.</span></div>}
  </Layout>;
}
