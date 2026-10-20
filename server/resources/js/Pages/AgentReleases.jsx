import { usePage } from '@inertiajs/react';
import { Archive, CheckCircle2, Download, FileUp, Package, RefreshCw, RotateCcw, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import PlatformWorkspace from './PlatformWorkspace';
import { PlatformIcon, platformCatalog } from './Platform';
import { api, dateLabel } from './api';

export default function AgentReleases() {
  return <PlatformWorkspace title="MDM agent"><AndroidAgentReleases /></PlatformWorkspace>;
}

function AndroidAgentReleases() {
  const isAdmin = usePage().props.auth_user?.is_admin;
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
    }, `${details.label} agent ${version} published and activated.`);
  }

  const activate = (release) => run(() => api(`/api/v1/agent/releases/${release.id}/activate`, { method: 'POST', body: '{}' }), `Release ${release.version} is now active for ${details.label}.`);
  const remove = async (release) => {
    if (!window.confirm(`Permanently delete the ${details.label} agent ${release.version} (build ${release.version_code})?`)) return;
    await run(() => api(`/api/v1/agent/releases/${release.id}`, { method: 'DELETE' }), `Release ${release.version} was deleted.`);
  };
  const useDefault = () => run(() => api(`/api/v1/agent/use-default?platform=${platform}`, { method: 'POST', body: '{}' }), `The bundled ${details.label} build is now active.`);

  return <>
    <section className="agent-hero">
      <div><span className="eyebrow"><ShieldCheck size={15} />Android distribution</span><h2>Manage MyMDM agents</h2><p>Manage Android agent releases. An available release is installed only on devices that receive an update command.</p></div>
      <button className="secondary-button" disabled={busy} onClick={() => run(() => Promise.resolve(), 'List refreshed.')}><RefreshCw size={16} />Refresh</button>
    </section>
    {error && <p className="error alert-box" role="alert">{error}</p>}{message && <p className="success alert-box" role="status">{message}</p>}

    <section className={`agent-top-grid ${isAdmin ? '' : 'shared-resource-readonly'}`}>
      <div className="panel active-release-card">
        <div className="section-heading"><div><span className="eyebrow">Target agent · {details.label}</span><h3>Available release</h3></div>{source?.available && <CheckCircle2 className="success-icon" />}</div>
        {source?.available ? <><div className={`release-version platform-${platform}`}><PlatformIcon platform={platform} size={28} /><div><strong>{source.version}</strong><span>Build {source.version_code}</span></div></div><dl><dt>Source</dt><dd>{source.source === 'upload' ? 'Administrator upload' : 'Bundled Android build'}</dd><dt>File</dt><dd>{source.artifact_name || 'MyMDM agent'}</dd><dt>Size</dt><dd>{formatBytes(source.artifact_size || source.apk_size)}</dd><dt>Checksum</dt><dd className="mono">{source.artifact_sha256 || source.apk_sha256}</dd></dl><a className="secondary-button" href={source.download_url || '/downloads/mymdm-agent.apk'}><Download size={16} />Download the active agent</a></> : <div className="empty-state compact"><PlatformIcon platform={platform} size={34} /><strong>No agent for {details.label}</strong><span>Upload a first release to prepare this platform.</span></div>}
        {isAdmin && platform === 'android' && source?.source === 'upload' && <button className="secondary-button" disabled={busy} onClick={useDefault}><RotateCcw size={16} />Use the bundled build for {details.label}</button>}
      </div>

      {isAdmin && <form className="panel form-grid upload-release-card" onSubmit={submit}>
        <div className="section-heading"><div><span className="eyebrow">New release · {details.label}</span><h3>Upload an agent</h3></div><FileUp /></div>
        <label>Version name<input required value={version} onChange={(e) => setVersion(e.target.value)} placeholder="Example: 1.0.0" /></label>
        <label>Build number<input required value={versionCode} onChange={(e) => setVersionCode(Number(e.target.value))} type="number" min="1" /><small>Increase this number to enable updates.</small></label>
        <label className="file-drop"><Upload size={25} /><strong>{artifact ? artifact.name : `Select the agent for ${details.label}`}</strong><span>{artifact ? formatBytes(artifact.size) : `${details.formats} · 500 MB maximum`}</span><input key={fileKey} accept={details.formats} onChange={(e) => setArtifact(e.target.files?.[0] || null)} type="file" required /></label>
        <p className="notice">Check the signature, package ID and build number before publishing. The active release is offered to Android devices.</p>
        <button className="icon-text" type="submit" disabled={!artifact || !version.trim() || busy}><Upload size={16} />Upload and activate</button>
      </form>}
    </section>

    <section className="panel release-library">
      <div className="section-heading"><div><span className="eyebrow"><Archive size={14} />History · {details.label}</span><h3>Uploaded releases</h3></div><span className="muted">{items.length} release(s)</span></div>
      <div className="release-list">
        {items.map((item) => <article className={`release-row ${item.active ? 'active' : ''}`} key={item.id}>
          <span className={`release-package platform-${platform}`}><PlatformIcon platform={platform} size={21} /></span><div className="release-main"><strong>{item.version}</strong><span>Build {item.version_code} · {item.artifact_name || 'Agent'} · {formatBytes(item.artifact_size || item.apk_size)} · {dateLabel(item.created_at)}</span></div>
          <span className={`status-pill ${item.active ? 'online' : 'offline'}`}>{item.active ? 'Active' : item.downloadable ? 'Available' : 'File missing'}</span>
          <span className="mono release-hash">{(item.artifact_sha256 || item.apk_sha256).slice(0, 16)}…</span>
          <div className="release-actions"><a className="secondary-button" href={`/api/v1/agent/releases/${item.id}/download`} title="Download"><Download size={16} /></a>{isAdmin && !item.active && <button className="secondary-button" disabled={busy || !item.downloadable} onClick={() => activate(item)}>Activate</button>}{isAdmin && !item.active && <button className="danger-button" disabled={busy} onClick={() => remove(item)} title="Delete"><Trash2 size={16} /></button>}</div>
        </article>)}
        {items.length === 0 && <div className="empty-state compact"><Package size={30} /><span>No releases uploaded for {details.label}.</span></div>}
      </div>
    </section>
  </>;
}

function formatBytes(value) {
  if (!value) return '—';
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
