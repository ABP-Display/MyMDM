import { usePage } from '@inertiajs/react';
import { ExternalLink, File, Library, PackagePlus, Trash2, UploadCloud } from 'lucide-react';
import { useEffect, useState } from 'react';
import PlatformWorkspace from './PlatformWorkspace';
import { PlatformIcon, platformCatalog } from './Platform';
import { api, dateLabel } from './api';

const applicationType = (platform) => `${platform}_app`;
const emptyForm = (platform) => ({ platform, type: applicationType(platform), name: '', package_name: '', version_name: '', version_code: '', source_url: '', file: null });

export default function KioskLibrary() {
  return <PlatformWorkspace title="Library"><AndroidKioskLibrary /></PlatformWorkspace>;
}

function AndroidKioskLibrary() {
  const isAdmin = usePage().props.auth_user?.is_admin;
  const [platform, setPlatform] = useState('android');
  const [assets, setAssets] = useState([]);
  const [form, setForm] = useState(() => emptyForm('android'));
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const details = platformCatalog[platform];
  const load = (selectedPlatform = platform) => api(`/api/v1/kiosk-assets?platform=${selectedPlatform}`).then(setAssets);
  useEffect(() => { setAssets([]); setForm(emptyForm(platform)); setFileKey((value) => value + 1); setError(''); setMessage(''); load(platform).catch((exception) => setError(exception.message)); }, [platform]);
  const change = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const body = new FormData();
      Object.entries(form).forEach(([key, value]) => { if (value !== '' && value !== null) body.append(key, value); });
      await api('/api/v1/kiosk-assets', { method: 'POST', body });
      setForm(emptyForm(platform)); setFileKey((value) => value + 1); await load();
      setMessage(`Item added to the ${details.label} library.`);
    } catch (exception) { setError(exception.message); } finally { setBusy(false); }
  }

  async function remove(asset) {
    if (!window.confirm(`Remove “${asset.name}” from the library? Previously generated policies will keep their copies.`)) return;
    setBusy(true); setError(''); setMessage('');
    try { await api(`/api/v1/kiosk-assets/${asset.id}`, { method: 'DELETE' }); await load(); setMessage('Item removed from the library.'); }
    catch (exception) { setError(exception.message); } finally { setBusy(false); }
  }

  const application = form.type !== 'file';
  const typeDetails = assetTypeDetails(form.type);

  return <>
    <section className="page-intro"><div><span className="eyebrow"><Library size={15} />Managed content</span><h2>Applications and files</h2><p>Prepare applications and files for your Android devices.</p></div><span className="library-count">{assets.length} item{assets.length !== 1 ? 's' : ''}</span></section>
    {error && <p className="error alert-box" role="alert">{error}</p>}{message && <p className="success alert-box" role="status">{message}</p>}
    <div className={`library-layout ${isAdmin ? '' : 'shared-resource-readonly'}`}>
      {isAdmin && <form className="panel form-grid library-upload" onSubmit={submit}>
        <div className="section-heading"><div><span className="eyebrow"><PackagePlus size={14} />New item · {details.label}</span><h3>Upload to MyMDM</h3></div><PlatformIcon platform={platform} /></div>
        <label>Type<select value={form.type} onChange={(event) => { change('type', event.target.value); change('file', null); setFileKey((value) => value + 1); }}><option value={applicationType(platform)}>{details.label} application</option><option value="file">File for {details.label}</option></select></label>
        <label>Display name<input required maxLength="255" value={form.name} onChange={(event) => change('name', event.target.value)} placeholder={application ? 'Business application' : 'User guide'} /></label>
        {application && <><label>{typeDetails.identifierLabel}<input required value={form.package_name} onChange={(event) => change('package_name', event.target.value)} placeholder={typeDetails.identifierPlaceholder} /></label><div className="field-pair"><label>Version<input value={form.version_name} onChange={(event) => change('version_name', event.target.value)} placeholder="1.2.3" /></label>{form.type === 'android_app' && <label>Version code<input type="number" min="0" value={form.version_code} onChange={(event) => change('version_code', event.target.value)} placeholder="123" /></label>}</div></>}
        <label>Source URL (optional)<input type="url" value={form.source_url} onChange={(event) => change('source_url', event.target.value)} placeholder="https://…" />{platform === 'android' && <small>MyMDM automatically recognizes APKMirror and APKPure from their URLs.</small>}</label>
        <label className="file-drop"><UploadCloud size={30} /><strong>{form.file?.name || typeDetails.dropLabel}</strong><span>{typeDetails.formats} · 500 MB maximum</span><input key={fileKey} required type="file" accept={typeDetails.accept} onChange={(event) => change('file', event.target.files?.[0] || null)} /></label>
        <button className="icon-text" type="submit" disabled={busy}><PackagePlus size={17} />{busy ? 'Uploading…' : 'Add to library'}</button>
      </form>}
      <section className="panel library-catalog"><div className="section-heading"><div><span className="eyebrow">Catalog · {details.label}</span><h3>Available content</h3></div></div>
        {!assets.length && <div className="empty-state compact"><PlatformIcon platform={platform} size={32} /><strong>No content for {details.label}</strong><span>Upload your first application or file.</span></div>}
        <div className="asset-list">{assets.map((asset) => <article className="asset-row" key={asset.id}><span className={`asset-kind ${asset.type === 'file' ? '' : `platform-${asset.platform}`}`}>{asset.type === 'file' ? <File /> : <PlatformIcon platform={asset.platform} />}</span><div className="asset-main"><strong>{asset.name}</strong><span>{assetTypeLabel(asset.type)} · {asset.type === 'file' ? asset.file_name : asset.package_name}{asset.version_name ? ` · ${asset.version_name}` : ''}</span><small>{formatSize(asset.size_bytes)} · added on {dateLabel(asset.created_at)}</small></div><span className="source-pill">{sourceLabel(asset.source)}</span><code title={asset.sha256}>{asset.sha256.slice(0, 12)}…</code><div className="release-actions">{asset.source_url && <a className="quiet-icon-button" href={asset.source_url} target="_blank" rel="noreferrer" title="Open source website"><ExternalLink /></a>}<button className="quiet-icon-button danger-text" disabled={busy || !isAdmin} onClick={() => remove(asset)} title="Delete"><Trash2 /></button></div></article>)}</div>
      </section>
    </div>
  </>;
}

function formatSize(bytes) { if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`; return `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function sourceLabel(source) { return { upload: 'Internal', apkmirror: 'APKMirror', apkpure: 'APKPure', other: 'External' }[source] || source; }
function assetTypeLabel(type) { return { app: 'Android application', android_app: 'Android application', file: 'File' }[type] || type; }
function assetTypeDetails(type) {
  return {
    android_app: { identifierLabel: 'Android package ID', identifierPlaceholder: 'com.example.application', dropLabel: 'Choose an .apk file', formats: 'Single APK files only', accept: '.apk,application/vnd.android.package-archive' },
    file: { identifierLabel: '', identifierPlaceholder: '', dropLabel: 'Choose a file', formats: 'Any file type', accept: undefined },
  }[type];
}
