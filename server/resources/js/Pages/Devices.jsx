import { Link } from '@inertiajs/react';
import { Battery, BatteryCharging, Folders, ListFilter, MonitorSmartphone, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Layout from './Layout';
import { PlatformBadge, PlatformIcon, platformCatalog, platformIds } from './Platform';
import SyncStatus, { ConnectivityStatus, isOnline } from './SyncStatus';
import { api, dateLabel } from './api';

const kioskLabels = { web: 'Web', web_single: 'Page web unique', web_open: 'Web avec redirections', app: 'Application unique', launcher: 'Bibliothèque' };

function BatteryValue({ device }) {
  if (device.battery_level === null) return <span className="muted">En attente</span>;
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

  return <Layout title="Appareils">
    <section className="panel device-command-center">
      <div className="section-heading">
        <div><span className="eyebrow">Parc sélectionné</span><h3>Rechercher les appareils</h3><p>Affinez la liste par groupe, plateforme ou état, puis ouvrez la fiche de l’appareil à gérer.</p></div>
        <button className="secondary-button" disabled={loading} onClick={load}><RefreshCw size={16} />{loading ? 'Actualisation…' : 'Actualiser'}</button>
      </div>
      <label className="search-field device-search"><Search size={18} /><input aria-label="Rechercher un appareil" placeholder="Nom, numéro de série, modèle, agent ou groupe…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div className="device-filter-grid">
        <label><span><Folders size={15} />Groupe</span><select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}><option value="all">Tous les groupes</option><option value="none">Sans groupe</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name} ({group.devices_count})</option>)}</select></label>
        <label><span><MonitorSmartphone size={15} />Plateforme</span><select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)}><option value="all">Toutes les plateformes</option>{platformIds.map((id) => <option key={id} value={id}>{platformCatalog[id].label}</option>)}</select></label>
        <label><span><ListFilter size={15} />État</span><select value={fleetFilter} onChange={(event) => setFleetFilter(event.target.value)}><option value="all">Tous les états</option><option value="online">Online</option><option value="offline">Offline</option><option value="synchronized">Synchronisés</option><option value="pending">En attente de synchronisation</option><option value="not_synchronized">Non synchronisés</option><option value="low_battery">Batterie faible (≤ 20 %)</option></select></label>
      </div>
    </section>
    {error && <p className="error alert-box" role="alert">{error}</p>}
    <div className="device-results-heading"><div><strong>{filtered.length}</strong><span>appareil{filtered.length > 1 ? 's' : ''} trouvé{filtered.length > 1 ? 's' : ''}</span></div><small>Le délai hors synchronisation dépend des paramètres de l’organisation.</small></div>
    <div className="device-card-grid">
      {filtered.map((device) => <Link className={`device-card management-sync-${device.sync_state}`} href={`/devices/${device.id}`} key={device.id}>
        <div className="device-card-head"><span className={`device-icon platform-${device.platform}`}><PlatformIcon platform={device.platform} size={25} /></span><div className="device-card-statuses"><ConnectivityStatus device={device} /><SyncStatus device={device} /></div></div>
        <div className="device-card-title"><strong>{device.name}</strong><span>{[device.manufacturer, device.model].filter(Boolean).join(' ') || 'Modèle inconnu'} · {device.os_version || 'Version système inconnue'}</span><div className="device-card-labels"><PlatformBadge platform={device.platform} />{device.group && <small className="device-group-badge"><Folders size={13} />{device.group.name}</small>}</div></div>
        <div className="device-card-metrics"><div><small>Batterie</small><BatteryValue device={device} /></div><div><small>Agent</small><b>{device.agent_version || 'En attente'}</b></div></div>
        <div className="device-card-foot"><span><ShieldCheck size={15} />{device.kiosk_enabled ? kioskLabels[device.kiosk_type] || 'Actif' : 'Kiosque inactif'}</span><small>{dateLabel(device.last_seen_at)}</small></div>
      </Link>)}
    </div>
    {!loading && filtered.length === 0 && <div className="panel empty-state"><MonitorSmartphone size={34} /><strong>Aucun appareil trouvé</strong><span>Modifiez la recherche ou les filtres.</span></div>}
  </Layout>;
}
