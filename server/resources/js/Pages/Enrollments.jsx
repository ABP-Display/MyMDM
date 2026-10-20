import { Link } from '@inertiajs/react';
import { CheckCircle2, Clock3, History, QrCode, Settings, Tablet, Users } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import Layout from './Layout';
import { PlatformIcon, platformCatalog, enrollmentPlatformIds } from './Platform';
import { api, dateLabel } from './api';

export default function Enrollments() {
  const [platform, setPlatform] = useState('android');
  const [items, setItems] = useState([]);
  const [configurations, setConfigurations] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [qr, setQr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qrLoading, setQrLoading] = useState(false);
  const [error, setError] = useState('');
  const visibleConfigurations = configurations.filter((item) => (item.platform || 'android') === platform);
  const configuration = configurations.find((item) => item.id === selectedId);
  useEffect(() => {
    Promise.all([api('/api/v1/configurations'), api('/api/v1/enrollments')])
      .then(([configs, enrollments]) => {
        setConfigurations(configs); setItems(enrollments);
        const requested = new URLSearchParams(window.location.search).get('configuration_id');
        const requestedConfiguration = configs.find((item) => item.id === requested);
        const requestedPlatform = new URLSearchParams(window.location.search).get('platform');
        const initialPlatform = requestedConfiguration?.platform || (enrollmentPlatformIds.includes(requestedPlatform) ? requestedPlatform : 'android');
        const initialConfigurations = configs.filter((item) => (item.platform || 'android') === initialPlatform);
        setPlatform(initialPlatform); setSelectedId(requestedConfiguration?.id || initialConfigurations[0]?.id || '');
      }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setQr(null);
    if (platform !== 'android' || !selectedId) return;
    setQrLoading(true); setError('');
    api(`/api/v1/configurations/${selectedId}/qr`)
      .then((payload) => { if (!cancelled) setQr(payload); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setQrLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId, platform]);

  function switchPlatform(nextPlatform) {
    setPlatform(nextPlatform); setQr(null); setError('');
    setSelectedId(configurations.find((item) => (item.platform || 'android') === nextPlatform)?.id || '');
  }

  return <Layout title="Enrollments">
    <section className="page-intro"><div><span className="eyebrow"><QrCode size={15} />Android provisioning</span><h2>Enroll a device</h2><p>Select a platform to view its enrollment method and configuration.</p></div></section>
    <div className="platform-tabs" role="tablist" aria-label="Enrollment platform">{enrollmentPlatformIds.map((id) => <button role="tab" aria-selected={platform === id} className={platform === id ? 'active' : ''} key={id} onClick={() => switchPlatform(id)}><PlatformIcon platform={id} />{platformCatalog[id].label}</button>)}</div>
    {error && <p className="error alert-box" role="alert">{error}</p>}

    {platform === 'android' ? <AndroidEnrollment loading={loading} items={items} configurations={visibleConfigurations} configuration={configuration} selectedId={selectedId} setSelectedId={setSelectedId} qr={qr} qrLoading={qrLoading} /> : <section className="panel empty-state"><PlatformIcon platform="ios" size={34} /><h2>iOS / iPadOS</h2><p role="status">Unavailable</p></section>}
  </Layout>;
}

function AndroidEnrollment({ loading, items, configurations, configuration, selectedId, setSelectedId, qr, qrLoading }) {
  return <>
    <section className="enrollment-layout">
      <div className="panel form-grid enrollment-settings">
        <div className="section-heading"><div><span className="eyebrow">Step 1 · Android</span><h3>Choose a configuration</h3></div><Settings /></div>
        {loading ? <p role="status">Loading…</p> : configurations.length ? <>
          <label>Configuration<select value={selectedId} onChange={(e) => { setSelectedId(e.target.value); }}>{configurations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <div className="enrollment-benefits"><span><CheckCircle2 />Permanent QR code</span><span><Users />Reusable</span><span><Tablet />Automatic configuration</span></div>
          <p className="muted">The QR code stays the same until you explicitly regenerate it.</p>
          {configuration?.has_pending_changes && <p className="notice">This configuration has pending changes. The QR code still uses the settings from its last generation.</p>}
        </> : <p className="muted">Create an Android configuration to get your first QR code.</p>}
        <Link className="icon-text" href="/configurations">Manage configurations</Link>
      </div>
      <div className="panel qr-panel enrollment-qr">
        {qrLoading ? <p role="status">Loading QR code…</p> : qr ? <>
          <span className="eyebrow">Step 2 · Scan the QR code</span><h2>{qr.configuration_name}</h2>
          <QRCodeSVG value={qr.qr_text} size={420} level="M" marginSize={4} title={`Enrollment : ${qr.configuration_name}`} />
          <div className="qr-meta"><span><Clock3 />No expiry</span><span><Users />{qr.use_count} enrollment(s)</span><span>Generated on {dateLabel(qr.created_at)}</span></div>
          <details className="qr-details"><summary>Show QR code contents</summary><textarea aria-label="QR code contents" className="qr-payload" readOnly value={qr.qr_text} /></details>
        </> : <p className="muted">Select an Android configuration to display its QR code.</p>}
      </div>
    </section>
    <div className="section-heading history-heading"><div><span className="eyebrow"><History size={14} />Android tracking</span><h2>QR code history</h2></div></div>
    <div className="table modern-table">
      <div className="row head"><span>Configuration</span><span>Status</span><span>Expiration</span><span>Enrollments</span></div>
      {items.map((item) => <div className="row" key={item.id}>
        <span>{item.configuration_name || 'Legacy enrollment'}{item.configuration_deleted && <small>Configuration deleted</small>}<small>{dateLabel(item.created_at)}</small></span>
        <span><span className={`status-pill ${item.status === 'active' ? 'online' : 'offline'}`}>{item.status === 'revoked' ? (item.configuration_deleted ? 'Invalidated' : 'Replaced') : item.status === 'used' ? 'Used' : item.expires_at && new Date(item.expires_at) < new Date() ? 'Expired' : 'Active'}</span></span>
        <span>{item.expires_at ? dateLabel(item.expires_at) : 'Never'}</span>
        <span>{item.use_count || (item.device_id ? 1 : 0)}</span>
      </div>)}
      {!loading && items.length === 0 && <p className="panel muted">No enrollments yet.</p>}
    </div>
  </>;
}

