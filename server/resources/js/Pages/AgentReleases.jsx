import { Archive, CheckCircle2, Download, FileUp, Package, RefreshCw, RotateCcw, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import PlatformWorkspace from './PlatformWorkspace';
import { PlatformIcon, platformCatalog } from './Platform';
import { api, dateLabel } from './api';

export default function AgentReleases() {
  return <PlatformWorkspace title="Agent MDM"><AndroidAgentReleases /></PlatformWorkspace>;
}

function AndroidAgentReleases() {
  const [platform, setPlatform] = useState('android');
  const [items, setItems] = useState([]);
  const [version, setVersion] = useState('');
  const [versionCode, setVersionCode] = useState(1);
  const [artifact, setArtifact] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [message, setMessage] = useState('');
  const [source, setSource] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const details = platformCatalog[platform];

  async function load(selectedPlatform = platform) {
    const query = `?platform=${selectedPlatform}`;
    const [releases, current] = await Promise.all([api(`/api/v1/agent/releases${query}`), api(`/api/v1/agent/source${query}`)]);
    setItems(releases); setSource(current);
    const highestCode = Math.max(current.available ? current.version_code : 0, ...releases.map((item) => item.version_code), 0);
    setVersionCode(highestCode + 1);
  }

  useEffect(() => { setError(''); setMessage(''); setArtifact(null); load(platform).catch((e) => setError(e.message)); }, [platform]);

  async function run(operation, success) {
    setBusy(true); setError(''); setMessage('');
    try { await operation(); await load(); setMessage(success); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function submit(event) {
    event.preventDefault();
    await run(async () => {
      const body = new FormData();
      body.append('artifact', artifact); body.append('platform', platform); body.append('version', version); body.append('version_code', String(versionCode));
      await api('/api/v1/agent/releases', { method: 'POST', body });
      setArtifact(null); setVersion(''); setFileKey((value) => value + 1);
    }, `Agent ${details.label} ${version} publié et activé.`);
  }

  const activate = (release) => run(() => api(`/api/v1/agent/releases/${release.id}/activate`, { method: 'POST', body: '{}' }), `La version ${release.version} est maintenant active pour ${details.label}.`);
  const remove = async (release) => {
    if (!window.confirm(`Supprimer définitivement l’agent ${details.label} ${release.version} (build ${release.version_code}) ?`)) return;
    await run(() => api(`/api/v1/agent/releases/${release.id}`, { method: 'DELETE' }), `La version ${release.version} a été supprimée.`);
  };
  const useDefault = () => run(() => api(`/api/v1/agent/use-default?platform=${platform}`, { method: 'POST', body: '{}' }), `La compilation ${details.label} est maintenant active.`);

  return <>
    <section className="agent-hero">
      <div><span className="eyebrow"><ShieldCheck size={15} />Distribution Android</span><h2>Gérer les agents MyMDM</h2><p>Centralisez les versions destinées à Android. Une version active reste une cible disponible : elle n’est installée que sur les appareils recevant une commande.</p></div>
      <button className="secondary-button" disabled={busy} onClick={() => run(() => Promise.resolve(), 'Liste actualisée.')}><RefreshCw size={16} />Actualiser</button>
    </section>
    {error && <p className="error alert-box" role="alert">{error}</p>}{message && <p className="success alert-box" role="status">{message}</p>}

    <section className="agent-top-grid">
      <div className="panel active-release-card">
        <div className="section-heading"><div><span className="eyebrow">Agent cible · {details.label}</span><h3>Version disponible</h3></div>{source?.available && <CheckCircle2 className="success-icon" />}</div>
        {source?.available ? <><div className={`release-version platform-${platform}`}><PlatformIcon platform={platform} size={28} /><div><strong>{source.version}</strong><span>Build {source.version_code}</span></div></div><dl><dt>Source</dt><dd>{source.source === 'upload' ? 'Import administrateur' : 'Compilation Android par défaut'}</dd><dt>Fichier</dt><dd>{source.artifact_name || 'Agent MyMDM'}</dd><dt>Taille</dt><dd>{formatBytes(source.artifact_size || source.apk_size)}</dd><dt>Empreinte</dt><dd className="mono">{source.artifact_sha256 || source.apk_sha256}</dd></dl><a className="secondary-button" href={source.download_url || '/downloads/mymdm-agent.apk'}><Download size={16} />Télécharger l’agent actif</a></> : <div className="empty-state compact"><PlatformIcon platform={platform} size={34} /><strong>Aucun agent {details.label}</strong><span>Importez une première version pour préparer cette plateforme.</span></div>}
        {platform === 'android' && source?.source === 'upload' && <button className="secondary-button" disabled={busy} onClick={useDefault}><RotateCcw size={16} />Revenir à la compilation {details.label}</button>}
      </div>

      <form className="panel form-grid upload-release-card" onSubmit={submit}>
        <div className="section-heading"><div><span className="eyebrow">Nouvelle release · {details.label}</span><h3>Importer un agent</h3></div><FileUp /></div>
        <label>Nom de version<input required value={version} onChange={(e) => setVersion(e.target.value)} placeholder="Exemple : 1.0.0" /></label>
        <label>Numéro de build<input required value={versionCode} onChange={(e) => setVersionCode(Number(e.target.value))} type="number" min="1" /><small>Ce numéro doit augmenter pour permettre les mises à jour.</small></label>
        <label className="file-drop"><Upload size={25} /><strong>{artifact ? artifact.name : `Sélectionner l’agent ${details.label}`}</strong><span>{artifact ? formatBytes(artifact.size) : `${details.formats} · 500 Mo maximum`}</span><input key={fileKey} accept={details.formats} onChange={(e) => setArtifact(e.target.files?.[0] || null)} type="file" required /></label>
        <p className="notice">Vérifiez la signature, l’identifiant du paquet et le numéro de build avant publication. La version active est proposée aux appareils Android.</p>
        <button className="icon-text" type="submit" disabled={!artifact || !version.trim() || busy}><Upload size={16} />Importer et activer</button>
      </form>
    </section>

    <section className="panel release-library">
      <div className="section-heading"><div><span className="eyebrow"><Archive size={14} />Historique · {details.label}</span><h3>Versions importées</h3></div><span className="muted">{items.length} release(s)</span></div>
      <div className="release-list">
        {items.map((item) => <article className={`release-row ${item.active ? 'active' : ''}`} key={item.id}>
          <span className={`release-package platform-${platform}`}><PlatformIcon platform={platform} size={21} /></span><div className="release-main"><strong>{item.version}</strong><span>Build {item.version_code} · {item.artifact_name || 'Agent'} · {formatBytes(item.artifact_size || item.apk_size)} · {dateLabel(item.created_at)}</span></div>
          <span className={`status-pill ${item.active ? 'online' : 'offline'}`}>{item.active ? 'Active' : item.downloadable ? 'Disponible' : 'Fichier absent'}</span>
          <span className="mono release-hash">{(item.artifact_sha256 || item.apk_sha256).slice(0, 16)}…</span>
          <div className="release-actions"><a className="secondary-button" href={`/api/v1/agent/releases/${item.id}/download`} title="Télécharger"><Download size={16} /></a>{!item.active && <button className="secondary-button" disabled={busy || !item.downloadable} onClick={() => activate(item)}>Activer</button>}{!item.active && <button className="danger-button" disabled={busy} onClick={() => remove(item)} title="Supprimer"><Trash2 size={16} /></button>}</div>
        </article>)}
        {items.length === 0 && <div className="empty-state compact"><Package size={30} /><span>Aucune version importée pour {details.label}.</span></div>}
      </div>
    </section>
  </>;
}

function formatBytes(value) {
  if (!value) return '—';
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} Ko`;
  return `${(value / 1024 / 1024).toFixed(1)} Mo`;
}
