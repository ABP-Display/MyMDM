import { Link, router, usePage } from '@inertiajs/react';
import { AppWindow, ArrowLeft, Battery, BatteryCharging, Building2, Clock3, Cpu, Database, Download, Fingerprint, Folders, Gauge, HardDrive, Library, LockKeyhole, MapPinned, MemoryStick, MonitorSmartphone, Pencil, RefreshCw, RotateCcw, Save, Settings2, ShieldCheck, SlidersHorizontal, Sun, Tablet, Trash2, Volume2, Wifi, WifiOff, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import Layout from './Layout';
import KioskFields, { LibraryPicker } from './KioskFields';
import { PlatformBadge, PlatformIcon, platformCatalog } from './Platform';
import { api, dateLabel } from './api';

const baseTabs = [['overview', 'Aperçu'], ['kiosk', 'Configuration kiosque'], ['management', 'Gestion']];
const commandLabels = { agent_update: 'Mise à jour de l’agent', shell: 'Terminal distant', set_volume: 'Volume', set_brightness: 'Luminosité', capture_screen: 'Capture du kiosque', request_location: 'Demande de position' };
const statusLabels = { pending: 'En attente', dispatched: 'Transmise', applied: 'Appliquée', failed: 'Échec', cancelled: 'Remplacée', recorded: 'Enregistré', expired: 'Expirée' };
const policyHistoryLabels = { DEVICE_CONFIGURATION_ASSIGNED: 'Application du profil', DEVICE_CONFIGURATION_UPDATED: 'Mise à jour du profil', DEVICE_CONFIGURATION_DETACHED: 'Mode personnel activé', DEVICE_POLICY_UPDATED: 'Paramètres personnalisés', KIOSK_ENABLED: 'Kiosque activé', KIOSK_DISABLED: 'Kiosque désactivé' };
const parameterLabels = { kiosk_enabled: 'Mode kiosque', kiosk_type: 'Type de kiosque', url: 'URL', allowed_origins: 'Sites autorisés', allowed_apps: 'Applications autorisées', orientation: 'Orientation', keep_screen_on: 'Écran allumé', sync_interval_minutes: 'Synchronisation', default_volume: 'Volume', default_brightness: 'Luminosité', launcher_background_color: 'Couleur du fond', launcher_background: 'Image du fond', launcher_auto_grant_permissions: 'Permissions automatiques', library_items: 'Applications et fichiers', admin_pin: 'Code de maintenance' };

function Metric({ icon, label, value, detail }) {
  return <div className="device-metric"><span className="device-metric-icon">{icon}</span><div><small>{label}</small><strong>{value}</strong>{detail && <span>{detail}</span>}</div></div>;
}

function Fact({ icon, label, value, mono = false }) {
  return <div className="device-fact"><span>{icon}</span><div><small>{label}</small><strong className={mono ? 'mono' : ''}>{value}</strong></div></div>;
}

// Jauge circulaire pour une paire "utilisé / total" (stockage, mémoire, ...).
// - used/total en octets (ou toute unité cohérente)
// - tone calculé automatiquement à partir du taux d'occupation
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
        <strong>{hasData ? `${formatValue(used)} utilisés / ${formatValue(total)}` : 'Non disponible'}</strong>
        {hasData && <span className="usage-ring-remaining">{formatValue(total - used)} restants</span>}
      </div>
    </div>
  );
}

export default function DeviceDetail() {
  const { url } = usePage();
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
    }, 'Configuration enregistrée.');
  }

  async function saveLibrary() {
    await run(async () => {
      const payload = { ...form, allowed_apps: form.allowed_apps.split('\n').map((item) => item.trim()).filter(Boolean), allowed_origins: form.allowed_origins.split('\n').map((item) => item.trim()).filter(Boolean) };
      applyPayload(await api(`/api/v1/devices/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }));
    }, 'Bibliothèque envoyée à l’appareil. Les installations démarreront à sa prochaine synchronisation.');
  }

  async function sendCommand(type, value, force = false) {
    await run(async () => {
      const body = value === undefined ? { type, force } : { type, value };
      applyPayload(await api(`/api/v1/devices/${id}/commands`, { method: 'POST', body: JSON.stringify(body) }));
    }, 'Commande ajoutée. Elle sera appliquée à la prochaine synchronisation.');
  }

  async function saveIdentity(event) {
    event.preventDefault();
    await run(async () => {
      applyPayload(await api(`/api/v1/devices/${id}/identity`, { method: 'PATCH', body: JSON.stringify({ ...identityForm, group_id: identityForm.group_id || null }) }));
      setIdentityEditing(false);
    }, 'Identité, organisation et groupe enregistrés.');
  }

  async function assignConfiguration(nextId) {
    setConfigurationId(nextId);
    const assigned = await run(async () => {
      applyPayload(await api(`/api/v1/devices/${id}/configuration`, { method: 'POST', body: JSON.stringify({ configuration_id: nextId }) }));
    }, 'Profil appliqué.');
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
    }, 'Réglages indépendants activés.');
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
    }, action === 'delete' ? '' : 'Réinitialisation en attente de synchronisation.');
  }

  if (!data || !form) return <Layout title="Appareil">{error ? <p className="error">{error}</p> : <div className="panel loading-state">Chargement de l’appareil…</div>}</Layout>;
  const device = data.device;
  const platform = platformCatalog[device.platform] || platformCatalog.android;
  const online = device.last_seen_at && (Date.now() - new Date(device.last_seen_at).getTime()) < 7 * 60 * 1000;
  const location = deviceLocation(device.metrics);
  const managedByConfiguration = Boolean(device.configuration_id);
  const tabs = data.policy.kiosk_type === 'launcher' ? [baseTabs[0], baseTabs[1], ['applications', 'Applications'], baseTabs[2]] : baseTabs;

  return <Layout title="Appareil">
    <Link className="back-link" href="/devices"><ArrowLeft size={16} />Tous les appareils</Link>
    <header className="device-detail-header">
      <span className={`device-hero-icon platform-${device.platform}`}><PlatformIcon platform={device.platform} size={34} /></span><div><h2>{device.name}</h2><p>{[device.manufacturer, device.model].filter(Boolean).join(' ') || 'Modèle inconnu'} · {platform.label} {device.os_version || '?'}</p><div className="device-header-meta"><PlatformBadge platform={device.platform} />{device.organization && <span><Building2 size={12} />{device.organization.name}</span>}{device.group && <span><Folders size={12} />{device.group.name}</span>}<span>Agent {device.agent_version || 'inconnu'}</span><span>Vu {dateLabel(device.last_seen_at)}</span></div></div>
      <span className={`status-pill ${online ? 'online' : 'offline'}`}>{online ? <Wifi size={14} /> : <WifiOff size={14} />}{online ? 'En ligne' : 'Hors ligne'}</span>
      <button className="secondary-button" onClick={() => setIdentityEditing((editing) => !editing)}><Pencil size={16} />Modifier</button>
      <button className="secondary-button" disabled={busy} onClick={() => run(load, 'Données actualisées.')}><RefreshCw size={16} />Actualiser</button>
    </header>
    <nav className="device-tabs" aria-label="Sections de l’appareil">{tabs.map(([value, label]) => <button key={value} className={tab === value ? 'active' : ''} onClick={() => { setTab(value); setMessage(''); setError(''); }}>{label}</button>)}</nav>
    {identityEditing && <form className="panel device-identity-editor" onSubmit={saveIdentity}><div><label>Nom de l’appareil<input required maxLength="255" value={identityForm.name} onChange={(event) => setIdentityForm({ ...identityForm, name: event.target.value })} /></label><label>Organisation<select required value={identityForm.organization_id} onChange={(event) => setIdentityForm({ ...identityForm, organization_id: event.target.value, group_id: '' })}>{data.organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label><label>Groupe<select value={identityForm.group_id} onChange={(event) => setIdentityForm({ ...identityForm, group_id: event.target.value })}><option value="">Sans groupe</option>{data.groups.filter((group) => group.organization_id === identityForm.organization_id).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label></div><button className="icon-text" type="submit" disabled={busy || !identityForm.name.trim() || !identityForm.organization_id}><Save size={16} />Enregistrer</button><button className="secondary-button" type="button" onClick={() => { setIdentityEditing(false); setIdentityForm({ name: device.name, organization_id: device.organization_id || '', group_id: device.group_id || '' }); }}><X size={16} />Annuler</button></form>}
    {error && <p className="error alert-box" role="alert">{error}</p>}{message && <p className="success alert-box" role="status">{message}</p>}

    {tab === 'overview' && <div className="device-overview">
      <section className="device-resource-dashboard"><div className="device-resource-dashboard-head"><div><span className="eyebrow">Tableau de bord appareil</span><h3>Ressources en temps réel</h3><p>Dernières métriques reçues lors de la synchronisation.</p></div><span className="resource-dashboard-status">{dateLabel(device.last_seen_at)}</span></div><div className="device-usage-grid">
        <UsageRing icon={<Cpu size={18} />} label="CPU utilisé" used={device.metrics?.cpu_percent} total={device.metrics?.cpu_percent == null ? null : 100} formatValue={formatPercentValue} />
        <UsageRing icon={<MemoryStick size={18} />} label="RAM utilisée" used={device.metrics?.memory_total_bytes != null && device.metrics?.memory_free_bytes != null ? device.metrics.memory_total_bytes - device.metrics.memory_free_bytes : null} total={device.metrics?.memory_total_bytes} />
        <UsageRing icon={<HardDrive size={18} />} label="Stockage utilisé" used={device.metrics?.storage_total_bytes != null && device.metrics?.storage_free_bytes != null ? device.metrics.storage_total_bytes - device.metrics.storage_free_bytes : null} total={device.metrics?.storage_total_bytes} />
      </div></section>
      <section className="device-metrics-grid">
        <Metric icon={device.battery_charging ? <BatteryCharging /> : <Battery />} label="Batterie" value={device.battery_level === null ? 'En attente' : `${device.battery_level}%`} detail={device.battery_charging ? 'En charge' : null} />
        <Metric icon={<Volume2 />} label="Volume multimédia" value={device.volume_level === null ? 'En attente' : `${device.volume_level}%`} />
        <Metric icon={<Sun />} label="Luminosité" value={device.brightness_level === null ? 'En attente' : `${device.brightness_level}%`} />
        <Metric icon={<ShieldCheck />} label="Agent MyMDM" value={device.agent_version || 'En attente'} detail={`Code ${device.agent_version_code || '—'}`} />
      </section>

      <section className="device-visual-grid">
        <article className="panel visual-card screen-preview"><div className="section-heading"><div><span className="eyebrow">Écran</span><h3>Aperçu du kiosque</h3><p>Actualisé automatiquement à chaque synchronisation.</p></div><span className="section-icon"><MonitorSmartphone /></span></div>{device.screen?.available ? <div className="visual-card-stage screen-preview-display has-image"><img src={`${device.screen.url}?v=${encodeURIComponent(device.screen.updated_at || '')}`} alt={`Dernier aperçu du kiosque de ${device.name}`} /></div> : <div className="visual-card-stage screen-preview-display"><MonitorSmartphone size={48} /><strong>Aucun aperçu reçu</strong><span>{online ? 'La prochaine synchronisation enverra une capture.' : 'Appareil hors ligne'}</span></div>}<footer className="visual-card-footer"><div className="visual-card-info"><strong>{device.screen?.available ? 'Dernier aperçu' : 'Capture indisponible'}</strong><span>{device.screen?.available ? dateLabel(device.screen.updated_at) : 'En attente de la prochaine synchronisation.'}</span></div></footer></article>
        <article className="panel visual-card device-location"><div className="section-heading"><div><span className="eyebrow">Position</span><h3>Dernière localisation</h3><p>Actualisée automatiquement à chaque synchronisation.</p></div><span className="section-icon"><MapPinned /></span></div>{location ? <div className="visual-card-stage device-location-map"><iframe title={`Position de ${device.name}`} src={osmEmbedUrl(location)} loading="lazy" referrerPolicy="no-referrer" /></div> : <div className="visual-card-stage location-empty"><MapPinned size={46} /><strong>Position non disponible</strong><span>{locationEmptyMessage(device.metrics, device.agent_version_code)}</span></div>}<footer className="visual-card-footer"><div className="visual-card-info">{location ? <><strong>{location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</strong><span>{location.accuracy == null ? 'Précision inconnue' : `Précision ±${Math.round(location.accuracy)} m`} · {location.timestamp ? dateLabel(new Date(location.timestamp).toISOString()) : 'date inconnue'} · {device.metrics?.location_provider || 'source inconnue'}</span></> : <><strong>Aucune mesure</strong><span>L’appareil réessaiera lors de sa prochaine synchronisation.</span><small>{locationDiagnosticLabel(device.metrics)}</small></>}</div></footer></article>
      </section>
      <section className="device-details-grid">
        <article className="panel device-information"><div className="section-heading"><div><span className="eyebrow">Inventaire</span><h3>Identité de l’appareil</h3><p>Références utilisées pour le suivi du parc.</p></div><span className="section-icon"><Fingerprint /></span></div><div className="device-facts-grid"><Fact icon={<Fingerprint />} label="Identifiant MyMDM" value={device.id} mono /><Fact icon={<PlatformIcon platform={device.platform} />} label="Numéro de série" value={device.serial_number || device.metrics?.serial || 'Non disponible'} mono /><Fact icon={<Clock3 />} label="Enrôlé le" value={dateLabel(device.enrolled_at)} /><Fact icon={<ShieldCheck />} label="Politique" value={policyStatusLabel(data, device)} /></div></article>
        <article className="panel extended-metrics"><div className="section-heading"><div><span className="eyebrow">Système</span><h3>Métriques techniques</h3><p>Dernières valeurs remontées par l’agent.</p></div><span className="section-icon"><Database /></span></div><div className="system-metrics-grid"><Fact icon={<Wifi />} label="Réseau Wi-Fi" value={`${device.metrics?.wifi_ssid || 'Non disponible'}${device.metrics?.wifi_link_mbps != null ? ` · ${device.metrics.wifi_link_mbps} Mb/s` : ''}`} /><Fact icon={<MonitorSmartphone />} label="Écran" value={device.metrics?.screen_width ? `${device.metrics.screen_width} × ${device.metrics.screen_height} · ${device.metrics.screen_density_dpi} dpi` : 'Non disponible'} /><Fact icon={<AppWindow />} label="Applications visibles" value={device.metrics?.installed_app_count ?? 'Non disponible'} /><Fact icon={<Clock3 />} label="Temps depuis démarrage" value={formatUptime(device.metrics?.uptime_seconds)} /></div><div className={`owner-state ${device.metrics?.device_owner ? 'active' : ''}`}><ShieldCheck size={18} /><span>Device Owner</span><strong>{device.metrics?.device_owner == null ? 'Non disponible' : device.metrics.device_owner ? 'Actif' : 'Inactif'}</strong></div></article>
      </section>
    </div>}

    {tab === 'kiosk' && <div className="device-kiosk-layout"><section className="panel device-configuration-assignment"><div className="section-heading profile-assignment-heading"><h3>Profil réutilisable</h3><button type="button" role="switch" aria-checked={profileEnabled} aria-label="Profil réutilisable" disabled={busy} className={`profile-toggle ${profileEnabled ? 'enabled' : ''}`} onClick={() => toggleProfile(!profileEnabled)}><span className="profile-toggle-label">{profileEnabled ? 'ON' : 'OFF'}</span><span className="profile-toggle-track"><span /></span></button></div>{profileEnabled && <label>Configuration<select value={configurationId} disabled={busy} onChange={(event) => { if (event.target.value) assignConfiguration(event.target.value); }}><option value="" disabled>Sélectionner une configuration</option>{data.configurations.map((configuration) => <option value={configuration.id} key={configuration.id}>{configuration.name}</option>)}</select></label>}</section><form className="panel form-grid device-kiosk-form device-kiosk-compact" onSubmit={save}>
      <div className="section-heading"><h3>Configuration kiosque</h3>{profileEnabled ? managedByConfiguration && <Link className="secondary-button" href={`/configurations?configuration_id=${device.configuration_id}`}><Settings2 size={16} />Modifier le profil</Link> : <button className="icon-text" type="submit" disabled={busy}><Save size={16} />Enregistrer</button>}</div>
      {profileEnabled && !managedByConfiguration ? <p className="muted">Sélectionnez une configuration ci-dessus.</p> : <>
      {profileEnabled && <span className="profile-readonly-label"><LockKeyhole size={14} />Lecture seule</span>}
      <fieldset className="device-managed-fields" disabled={busy || profileEnabled}>
        <label className="switch"><input type="checkbox" checked={form.kiosk_enabled} onChange={(e) => setForm({ ...form, kiosk_enabled: e.target.checked })} />Mode kiosque actif</label>
        <KioskFields compact form={form} change={(key, value) => setForm((previous) => ({ ...previous, [key]: value }))} assets={data.library_assets} />
        <label>Orientation<select value={form.orientation} onChange={(e) => setForm({ ...form, orientation: e.target.value })}><option value="auto">Automatique</option><option value="portrait">Portrait</option><option value="landscape">Paysage</option></select></label><label>Intervalle de synchronisation<select value={form.sync_interval_minutes} onChange={(e) => setForm({ ...form, sync_interval_minutes: Number(e.target.value) })}><option value={1}>Chaque minute</option><option value={5}>Toutes les 5 minutes</option><option value={15}>Toutes les 15 minutes</option><option value={30}>Toutes les 30 minutes</option><option value={60}>Toutes les heures</option><option value={180}>Toutes les 3 heures</option><option value={360}>Toutes les 6 heures</option><option value={720}>Toutes les 12 heures</option><option value={1440}>Toutes les 24 heures</option></select></label><label className="switch"><input type="checkbox" checked={form.keep_screen_on} onChange={(e) => setForm({ ...form, keep_screen_on: e.target.checked })} />Garder l’écran allumé</label><PolicyDefaultPercentage label="Volume multimédia" value={form.default_volume} fallback={50} onChange={(value) => setForm({ ...form, default_volume: value })} /><PolicyDefaultPercentage label="Luminosité de l’écran" value={form.default_brightness} fallback={70} onChange={(value) => setForm({ ...form, default_brightness: value })} /><label>Code de maintenance<input value={form.admin_pin} onChange={(e) => setForm({ ...form, admin_pin: e.target.value })} type="password" placeholder={data.policy.admin_pin_enabled ? 'Déjà configuré' : '6 à 12 chiffres'} /></label>
      </fieldset></>}
    </form></div>}

    {tab === 'applications' && data.policy.kiosk_type === 'launcher' && <section className="panel device-library-panel">
      <div className="section-heading"><div><span className="eyebrow"><Library size={14} />Kiosque libre</span><h3>Applications et fichiers de cet appareil</h3><p>{managedByConfiguration ? `Bibliothèque pilotée par le profil « ${device.configuration_name} ».` : 'Sélectionnez le contenu à installer et à afficher sur son menu d’accueil MyMDM.'}</p></div><button className="icon-text" disabled={busy || managedByConfiguration} onClick={saveLibrary}><Save size={16} />Appliquer à l’appareil</button></div>
      {managedByConfiguration && <p className="notice">Modifiez la bibliothèque depuis la configuration principale ou désactivez le profil réutilisable.</p>}
      <fieldset className="device-managed-fields" disabled={busy || managedByConfiguration}><LibraryPicker assets={data.library_assets} selected={form.library_item_ids || []} onChange={(ids) => setForm((previous) => ({ ...previous, library_item_ids: ids }))} /></fieldset>
      <div className="library-selection-summary"><AppWindow size={18} /><strong>{(form.library_item_ids || []).length}</strong><span>élément(s) sélectionné(s). L’appareil vérifie leur empreinte avant toute installation ou ouverture.</span></div>
    </section>}

    {tab === 'management' && <div className="management-layout"><section className="panel management-controls"><div className="section-heading"><h3>Contrôles à distance</h3><span className="section-icon"><SlidersHorizontal /></span></div>
      <div className="control-card"><div><span className="control-icon"><Download /></span><div><strong>Mise à jour de l’agent</strong><p>Installé : {device.agent_version || 'inconnu'} · code {device.agent_version_code || 'inconnu'}<br />Cible : {data.available_agent.available ? `${data.available_agent.version} · code ${data.available_agent.version_code}` : 'aucun agent actif'}</p></div></div><button className="icon-text" disabled={busy || !data.available_agent.available} onClick={() => sendCommand('agent_update', undefined, !data.update_available)}>{data.update_available ? 'Mettre à jour' : 'Réinstaller'}</button></div>
    </section><section className="panel management-panel"><div className="section-heading"><h3>Gestion de l’appareil</h3><span className="section-icon"><ShieldCheck /></span></div>
      {device.reset_status && <div className="notice">Réinitialisation : {{ pending: 'en attente', dispatched: 'transmise', failed: 'en échec' }[device.reset_status] || device.reset_status}{device.reset_error && ` — ${device.reset_error}`}</div>}
      <div className="management-action"><span className="control-icon"><RotateCcw /></span><div><strong>Réinitialiser en mode usine</strong><p>Efface les données et nécessite un nouvel enrôlement.</p></div><button className="danger-button" disabled={busy || device.revoked || ['pending', 'dispatched'].includes(device.reset_status)} onClick={() => { setAction('reset'); setConfirmation(''); }}>Réinitialiser</button></div>
      {device.reset_status === 'pending' && <button className="secondary-button" disabled={busy} onClick={() => run(async () => applyPayload(await api(`/api/v1/devices/${id}/factory-reset`, { method: 'DELETE' })), 'Réinitialisation annulée.')}>Annuler la réinitialisation en attente</button>}
      <div className="management-action"><span className="control-icon danger-icon"><Trash2 /></span><div><strong>Supprimer du panel</strong><p>Retire l’accès MDM, sans effacer l’appareil.</p></div><button className="danger-button" disabled={busy} onClick={() => { setAction('delete'); setConfirmation(''); }}>Supprimer</button></div>
      {action && <form className="confirmation-box" onSubmit={executeAction}><h3>{action === 'delete' ? 'Supprimer cet appareil ?' : 'Effacer cet appareil ?'}</h3><p>{action === 'delete' ? 'Une réinitialisation en attente sera annulée.' : 'Cette action est irréversible après réception par l’appareil.'}</p><label>Saisir {action === 'delete' ? 'SUPPRIMER' : 'REINITIALISER'}<input autoComplete="off" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></label><div><button className="danger-button" type="submit" disabled={busy || confirmation !== (action === 'delete' ? 'SUPPRIMER' : 'REINITIALISER')}>Confirmer</button><button className="secondary-button" type="button" disabled={busy} onClick={() => setAction(null)}>Annuler</button></div></form>}
    </section><section className="panel management-history"><div className="section-heading"><h3>Historique des actions</h3><span className="section-icon"><Clock3 /></span></div><div className="command-history">{(data.history || data.commands).map((entry) => <HistoryEntry entry={entry} key={entry.id} />)}{(data.history || data.commands).length === 0 && <p className="muted">Aucune action enregistrée.</p>}</div></section></div>}
  </Layout>;
}

export function HistoryEntry({ entry, children }) {
  const payload = entry.payload || {};
  return <div><span className={`command-status ${entry.status}`}>{statusLabels[entry.status] || entry.status}</span><div><strong>{policyHistoryLabels[entry.type] || commandLabels[entry.type] || entry.type}{payload.configuration_name && ` · ${payload.configuration_name}`}</strong><small>{payload.value !== undefined ? `${payload.value}% · ` : ''}{dateLabel(entry.created_at)}{payload.revision && ` · Révision ${payload.revision}`}</small>{Object.keys(payload.changes || {}).length > 0 && <ul className="policy-history-changes">{Object.entries(payload.changes).map(([field, change]) => <li key={field}><span>{parameterLabels[field] || field}</span><span>{field === 'admin_pin' ? 'Modifié' : <>{parameterValue(field, change.from)} <span aria-label="vers">→</span> <strong>{parameterValue(field, change.to)}</strong></>}</span></li>)}</ul>}{entry.error_message && <span className="error">{entry.error_message}</span>}{children}</div></div>;
}

function parameterValue(field, value) {
  if (value == null) return 'Non défini';
  if (typeof value === 'boolean') return value ? 'Activé' : 'Désactivé';
  if (Array.isArray(value)) return value.length ? value.map((item) => typeof item === 'object' ? item.name : item).join(', ') : 'Aucun';
  if (typeof value === 'object') return value.name || 'Non défini';
  if (['default_volume', 'default_brightness'].includes(field)) return `${value}%`;
  if (field === 'sync_interval_minutes') return `${value} min`;
  return ({ auto: 'Automatique', portrait: 'Portrait', landscape: 'Paysage', web: 'Web', web_single: 'Page web unique', web_open: 'Web avec redirections', app: 'Application unique', launcher: 'Kiosque libre' })[value] || String(value);
}

function PolicyDefaultPercentage({ label, value, fallback, onChange }) {
  const enabled = value !== null && value !== undefined;
  return <div className="configuration-default-field"><label className="switch"><input type="checkbox" checked={enabled} onChange={(event) => onChange(event.target.checked ? fallback : null)} />{label} par défaut</label>{enabled && <label>{value}%<input aria-label={label} type="range" min="0" max="100" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>}</div>;
}

function policyStatusLabel(data, device) {
  const revision = data.policy?.revision || data.policy_status?.revision || '—';
  if (data.policy_status?.status === 'failed') return `Échec d’application · révision ${revision}`;
  if (device.sync_state === 'synchronized') return `Synchronisée · révision ${revision}`;
  if (device.sync_state === 'not_synchronized') return `Non synchronisée · révision ${revision}`;
  return `En attente de synchronisation · révision ${revision}`;
}

function formatCapacity(value) {
  if (value == null) return '—';
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} Go`;
}

function formatPercentValue(value) {
  return `${Number(value).toFixed(1)}%`;
}

function formatUptime(value) {
  if (value == null) return 'Non disponible';
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  return `${days} j ${hours} h`;
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
  if (Number(versionCode || 0) < 43) return 'Mettez l’agent à jour vers la version 0.4.3-dev (code 43) pour activer la localisation renforcée.';
  if (metrics?.location_permission_granted === false) return 'Android n’a pas accordé l’autorisation de localisation à MyMDM.';
  if (metrics?.location_background_permission_granted === false) return 'Android n’a pas accordé la localisation en arrière-plan à MyMDM.';
  if (metrics?.location_enabled === false) return 'Le service de localisation Android est désactivé sur l’appareil.';
  if (metrics?.location_last_error) return metrics.location_last_error;
  if (Number(metrics?.location_last_request_timestamp || 0) > 0) return 'Une mesure a été demandée. Le service de fond conservera une position récente à basse consommation.';
  return 'Le service de fond démarrera la localisation à basse consommation lors de la prochaine synchronisation.';
}

function locationDiagnosticLabel(metrics) {
  if (!metrics) return 'Diagnostic en attente de synchronisation.';
  const googleStatus = Number(metrics.location_google_play_services_status);
  const google = googleStatus === 0 ? 'Google prêt' : (googleStatus >= 0 ? `Google code ${googleStatus}` : 'Google non vérifié');
  const settingsStatus = Number(metrics.location_settings_status);
  const settings = settingsStatus === 0 ? 'réglages compatibles' : (settingsStatus >= 0 ? `réglages code ${settingsStatus}` : 'réglages non vérifiés');
  const background = metrics.location_background_permission_granted === true ? 'arrière-plan autorisé' : 'arrière-plan non confirmé';
  const foreground = metrics.location_foreground_session_started === true ? 'session active démarrée' : 'session active non confirmée';
  const continuous = metrics.location_continuous_tracking === true ? 'suivi basse consommation actif' : 'suivi continu non confirmé';
  return `${google} · ${settings} · ${background} · ${foreground} · ${continuous} · fournisseurs : ${metrics.location_providers || 'aucun'}`;
}

function osmEmbedUrl(location) {
  const spread = 0.012;
  const bbox = [location.longitude - spread, location.latitude - spread, location.longitude + spread, location.latitude + spread].join(',');
  return `https://www.openstreetmap.org/export/embed.html?${new URLSearchParams({ bbox, layer: 'mapnik', marker: `${location.latitude},${location.longitude}` })}`;
}
