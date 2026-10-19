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

  return <Layout title="Enrôlements">
    <section className="page-intro"><div><span className="eyebrow"><QrCode size={15} />Provisionnement Android</span><h2>Enrôler un appareil</h2><p>Sélectionnez sa plateforme pour afficher la méthode et la configuration correspondantes.</p></div></section>
    <div className="platform-tabs" role="tablist" aria-label="Plateforme d’enrôlement">{enrollmentPlatformIds.map((id) => <button role="tab" aria-selected={platform === id} className={platform === id ? 'active' : ''} key={id} onClick={() => switchPlatform(id)}><PlatformIcon platform={id} />{platformCatalog[id].label}</button>)}</div>
    {error && <p className="error alert-box" role="alert">{error}</p>}

    {platform === 'android' ? <AndroidEnrollment loading={loading} items={items} configurations={visibleConfigurations} configuration={configuration} selectedId={selectedId} setSelectedId={setSelectedId} qr={qr} qrLoading={qrLoading} /> : <section className="panel empty-state"><PlatformIcon platform="ios" size={34} /><h2>iOS / iPadOS</h2><p role="status">Indisponible</p></section>}
  </Layout>;
}

function AndroidEnrollment({ loading, items, configurations, configuration, selectedId, setSelectedId, qr, qrLoading }) {
  return <>
    <section className="enrollment-layout">
      <div className="panel form-grid enrollment-settings">
        <div className="section-heading"><div><span className="eyebrow">Étape 1 · Android</span><h3>Choisir la configuration</h3></div><Settings /></div>
        {loading ? <p role="status">Chargement…</p> : configurations.length ? <>
          <label>Configuration<select value={selectedId} onChange={(e) => { setSelectedId(e.target.value); }}>{configurations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <div className="enrollment-benefits"><span><CheckCircle2 />QR permanent</span><span><Users />Réutilisable</span><span><Tablet />Configuration automatique</span></div>
          <p className="muted">Le QR reste identique tant que vous ne demandez pas explicitement sa régénération.</p>
          {configuration?.has_pending_changes && <p className="notice">Cette configuration a des modifications en attente. Le QR utilise encore les paramètres de sa dernière génération.</p>}
        </> : <p className="muted">Créez une configuration Android pour obtenir votre premier QR code.</p>}
        <Link className="icon-text" href="/configurations">Gérer les configurations</Link>
      </div>
      <div className="panel qr-panel enrollment-qr">
        {qrLoading ? <p role="status">Chargement du QR…</p> : qr ? <>
          <span className="eyebrow">Étape 2 · Scanner le QR</span><h2>{qr.configuration_name}</h2>
          <QRCodeSVG value={qr.qr_text} size={420} level="M" marginSize={4} title={`Enrôlement : ${qr.configuration_name}`} />
          <div className="qr-meta"><span><Clock3 />Sans expiration</span><span><Users />{qr.use_count} inscription(s)</span><span>Généré le {dateLabel(qr.created_at)}</span></div>
          <details className="qr-details"><summary>Afficher le contenu du QR</summary><textarea aria-label="Contenu du QR code" className="qr-payload" readOnly value={qr.qr_text} /></details>
        </> : <p className="muted">Sélectionnez une configuration Android pour afficher son QR.</p>}
      </div>
    </section>
    <div className="section-heading history-heading"><div><span className="eyebrow"><History size={14} />Suivi Android</span><h2>Historique des QR</h2></div></div>
    <div className="table modern-table">
      <div className="row head"><span>Configuration</span><span>Statut</span><span>Expiration</span><span>Inscriptions</span></div>
      {items.map((item) => <div className="row" key={item.id}>
        <span>{item.configuration_name || 'Ancien enrôlement'}{item.configuration_deleted && <small>Configuration supprimée</small>}<small>{dateLabel(item.created_at)}</small></span>
        <span><span className={`status-pill ${item.status === 'active' ? 'online' : 'offline'}`}>{item.status === 'revoked' ? (item.configuration_deleted ? 'Invalidé' : 'Remplacé') : item.status === 'used' ? 'Utilisé' : item.expires_at && new Date(item.expires_at) < new Date() ? 'Expiré' : 'Actif'}</span></span>
        <span>{item.expires_at ? dateLabel(item.expires_at) : 'Jamais'}</span>
        <span>{item.use_count || (item.device_id ? 1 : 0)}</span>
      </div>)}
      {!loading && items.length === 0 && <p className="panel muted">Aucun enrôlement pour le moment.</p>}
    </div>
  </>;
}

