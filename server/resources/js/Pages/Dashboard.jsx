import { Link, usePage } from '@inertiajs/react';
import { Activity, CalendarCheck2, CalendarX2, CircleOff, Cpu, Database, HardDrive, Package, QrCode, RefreshCw, ShieldCheck, Smartphone, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import Layout from './Layout';
import { PlatformIcon, platformCatalog, enrollmentPlatformIds } from './Platform';
import SyncStatus, { ConnectivityStatus } from './SyncStatus';
import { api, dateLabel } from './api';

export default function Dashboard() {
  const isAdmin = usePage().props.auth_user?.is_admin;
  const [stats, setStats] = useState(null);
  const [devices, setDevices] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true); setError('');
    try { const [summary, fleet] = await Promise.all([api('/api/v1/dashboard'), api('/api/v1/devices')]); setStats(summary); setDevices(fleet); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const cards = [
    ['Managed devices', stats?.devices, <Smartphone />, ''],
    ['Online devices', stats?.online, <Wifi />, 'fleet-online'],
    ['Offline devices', stats?.offline, <WifiOff />, 'fleet-offline'],
    ['Synced devices', stats?.synced_today, <CalendarCheck2 />, 'sync-recent'],
    ['Out-of-sync devices', stats?.not_synced, <CalendarX2 />, 'sync-critical'],
  ];

  return <Layout title="Overview">
    <section className="dashboard-hero"><div><span className="eyebrow"><Activity size={15} />Fleet status</span><h2>Manage your devices from one place</h2><p>Monitor devices, prepare configurations and distribute MyMDM updates.</p></div><button className="secondary-button" disabled={loading} onClick={load}><RefreshCw size={16} />Refresh</button></section>
    {error && <p className="error alert-box">{error}</p>}
    <section className="fleet-overview-grid">
      <div className="panel fleet-total-card"><span className="eyebrow">Total fleet</span><div><span className="fleet-total-icon"><Smartphone size={34} /></span><strong>{stats?.devices ?? '—'}</strong></div><p>managed devices</p><div className="fleet-health"><span><Wifi size={15} />{stats?.online ?? '—'} online</span><span><WifiOff size={15} />{stats?.offline ?? '—'} offline</span><span><CalendarCheck2 size={15} />{stats?.synced_today ?? '—'} synced today</span></div></div>
      <div className="panel platform-distribution"><div className="section-heading"><div><span className="eyebrow">Distribution</span><h3>Fleet platforms</h3></div></div><div className="platform-gauge-grid">{enrollmentPlatformIds.map((id) => <PlatformGauge key={id} platform={id} values={stats?.platforms?.[id]} total={stats?.devices} />)}</div></div>
    </section>
    <section className="dashboard-stat-grid compact-stats">{cards.slice(1).map(([label, value, icon, state]) => <div className={`dashboard-stat ${state}`} key={label}><span className="device-metric-icon">{icon}</span><div><small>{label}</small><strong>{value ?? '—'}</strong></div></div>)}</section>
    <section className="dashboard-resource-grid">
      <ResourceUsageCard label="CPU usage" metric={stats?.resources?.cpu} icon={<Cpu />} color="#AD7418" />
      <ResourceUsageCard label="Memory usage" metric={stats?.resources?.memory} icon={<Database />} color="#FF8F00" />
      <ResourceUsageCard label="Storage usage" metric={stats?.resources?.storage} icon={<HardDrive />} color="#C62828" />
    </section>
    <section className="panel resource-breakdown"><div className="section-heading"><div><span className="eyebrow">Resources</span><h3>Average usage by platform</h3></div><small className="muted">Latest reported metrics</small></div><div className="resource-platform-grid">{enrollmentPlatformIds.map((id) => <ResourcePlatform key={id} platform={id} values={stats?.resources?.by_platform?.[id]} />)}</div></section>
    <section className="dashboard-grid">
      <div className="panel"><div className="section-heading"><div><span className="eyebrow">Recent activity</span><h3>Recent devices</h3></div><Link className="secondary-button" href="/devices">View fleet</Link></div><div className="fleet-list">{devices.slice(0, 6).map((device) => <Link href={`/devices/${device.id}`} key={device.id}><span className={`device-icon small platform-${device.platform}`}><PlatformIcon platform={device.platform} size={18} /></span><div><strong>{device.name}</strong><small>{platformCatalog[device.platform]?.label || 'Android'} · {device.agent_version ? `Agent ${device.agent_version}` : 'Version pending'}</small></div><div className="fleet-statuses"><ConnectivityStatus device={device} /><SyncStatus device={device} /></div><small>{dateLabel(device.last_seen_at)}</small></Link>)}{!loading && devices.length === 0 && <div className="empty-state compact"><CircleOff /><span>No devices enrolled.</span></div>}</div></div>
      <div className="panel quick-actions"><span className="eyebrow">Quick access</span><h3>Common actions</h3>{isAdmin && <Link href="/configurations"><span><ShieldCheck /></span><div><strong>Create a configuration</strong><small>Prepare an Android policy</small></div></Link>}{isAdmin && <Link href="/enrollments"><span><QrCode /></span><div><strong>Show a QR code</strong><small>Enroll an Android device</small></div></Link>}<Link href="/agent"><span><Package /></span><div><strong>Publish an agent</strong><small>Manage Android releases</small></div></Link><p className="server-version">MyMDM server {stats?.version || '—'}</p></div>
    </section>
  </Layout>;
}

function ResourceUsageCard({ label, metric, icon, color }) {
  const value = metric?.average_percent;
  const normalized = value === null || value === undefined ? 0 : Math.max(0, Math.min(100, Number(value)));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - normalized / 100);

  return <article className="panel resource-card"><div className="section-heading"><div><span className="eyebrow">{metric?.samples ?? 0} sample(s)</span><h3>{label}</h3></div><span className="resource-icon" style={{ '--resource-color': color }}>{icon}</span></div><div className="resource-card-body"><div className="resource-ring" style={{ '--resource-color': color }}><svg viewBox="0 0 108 108" role="img" aria-label={value === null || value === undefined ? `${label} unavailable` : `${label} ${value}%`}><circle className="resource-ring-track" cx="54" cy="54" r={radius} /><circle className="resource-ring-value" cx="54" cy="54" r={radius} strokeDasharray={circumference} strokeDashoffset={dashOffset} /></svg><strong>{value === null || value === undefined ? '—' : `${value}%`}</strong></div><div className="resource-range"><span>Minimum <b>{metric?.min_percent === null || metric?.min_percent === undefined ? '—' : `${metric.min_percent}%`}</b></span><span>Maximum <b>{metric?.max_percent === null || metric?.max_percent === undefined ? '—' : `${metric.max_percent}%`}</b></span></div></div></article>;
}

function ResourcePlatform({ platform, values }) {
  const details = platformCatalog[platform];
  if (platform === 'ios') return <article className="resource-platform resource-platform-unavailable"><div className="resource-platform-title"><span className="device-icon small platform-ios"><PlatformIcon platform="ios" size={16} /></span><strong>{details.label}</strong><small>Unavailable</small></div><p>Resource monitoring for iOS and iPadOS is not available yet.</p></article>;
  const metrics = [['CPU', values?.cpu_percent], ['RAM', values?.memory_percent], ['Storage', values?.storage_percent]];

  return <div className="resource-platform"><div className="resource-platform-title"><span className={`device-icon small platform-${platform}`}><PlatformIcon platform={platform} size={16} /></span><strong>{details.label}</strong><small>{values?.devices ?? 0} device(s)</small></div>{metrics.map(([label, value]) => <div className="resource-bar-row" key={label}><span>{label}</span><div className="resource-bar"><i style={{ width: value === null || value === undefined ? '0%' : `${Math.min(100, Math.max(0, value))}%`, background: details.color }} /></div><b>{value === null || value === undefined ? '—' : `${value}%`}</b></div>)}</div>;
}

function PlatformGauge({ platform, values, total }) {
  const details = platformCatalog[platform];
  const percentage = values?.percentage || 0;
  if (platform === 'ios') return <article className="platform-gauge unavailable-gauge"><span className="unavailable-icon"><PlatformIcon platform="ios" size={25} /></span><small>{details.label}</small><span className="unavailable-label">Unavailable</span></article>;
  return <article className="platform-gauge" style={{ '--gauge-color': details.color }}>
    <svg viewBox="0 0 116 68" role="img" aria-label={`${details.label}: ${percentage}% of the fleet`}><path className="gauge-track" pathLength="100" d="M 12 58 A 46 46 0 0 1 104 58" /><path className="gauge-value" pathLength="100" strokeDasharray={`${percentage} 100`} d="M 12 58 A 46 46 0 0 1 104 58" /></svg>
    <span className="gauge-icon"><PlatformIcon platform={platform} size={19} /></span><strong>{values?.count || 0}</strong><small>{details.label}</small><em>{percentage}% of {total || 0} devices</em>
  </article>;
}
