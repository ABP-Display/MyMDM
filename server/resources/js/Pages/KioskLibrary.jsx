import { ExternalLink, File, Library, PackagePlus, Trash2, UploadCloud } from 'lucide-react';
import { useEffect, useState } from 'react';
import PlatformWorkspace from './PlatformWorkspace';
import { PlatformIcon, platformCatalog } from './Platform';
import { api, dateLabel } from './api';

const applicationType = (platform) => `${platform}_app`;
const emptyForm = (platform) => ({ platform, type: applicationType(platform), name: '', package_name: '', version_name: '', version_code: '', source_url: '', file: null });

export default function KioskLibrary() {
  return <PlatformWorkspace title="Bibliothèque"><AndroidKioskLibrary /></PlatformWorkspace>;
}

function AndroidKioskLibrary() {
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
      setMessage(`Élément ajouté à la bibliothèque ${details.label}.`);
    } catch (exception) { setError(exception.message); } finally { setBusy(false); }
  }

  async function remove(asset) {
    if (!window.confirm(`Supprimer « ${asset.name} » de la bibliothèque ? Les politiques déjà générées conserveront leur copie.`)) return;
    setBusy(true); setError(''); setMessage('');
    try { await api(`/api/v1/kiosk-assets/${asset.id}`, { method: 'DELETE' }); await load(); setMessage('Élément retiré de la bibliothèque.'); }
    catch (exception) { setError(exception.message); } finally { setBusy(false); }
  }

  const application = form.type !== 'file';
  const typeDetails = assetTypeDetails(form.type);

  return <>
    <section className="page-intro"><div><span className="eyebrow"><Library size={15} />Contenu géré</span><h2>Applications et fichiers</h2><p>Préparez les applications et fichiers de vos appareils Android.</p></div><span className="library-count">{assets.length} élément{assets.length > 1 ? 's' : ''}</span></section>
    {error && <p className="error alert-box" role="alert">{error}</p>}{message && <p className="success alert-box" role="status">{message}</p>}
    <div className="library-layout">
      <form className="panel form-grid library-upload" onSubmit={submit}>
        <div className="section-heading"><div><span className="eyebrow"><PackagePlus size={14} />Nouvel élément · {details.label}</span><h3>Importer dans MyMDM</h3></div><PlatformIcon platform={platform} /></div>
        <label>Type<select value={form.type} onChange={(event) => { change('type', event.target.value); change('file', null); setFileKey((value) => value + 1); }}><option value={applicationType(platform)}>Application {details.label}</option><option value="file">Fichier pour {details.label}</option></select></label>
        <label>Nom affiché<input required maxLength="255" value={form.name} onChange={(event) => change('name', event.target.value)} placeholder={application ? 'Application métier' : 'Guide utilisateur'} /></label>
        {application && <><label>{typeDetails.identifierLabel}<input required value={form.package_name} onChange={(event) => change('package_name', event.target.value)} placeholder={typeDetails.identifierPlaceholder} /></label><div className="field-pair"><label>Version<input value={form.version_name} onChange={(event) => change('version_name', event.target.value)} placeholder="1.2.3" /></label>{form.type === 'android_app' && <label>Code version<input type="number" min="0" value={form.version_code} onChange={(event) => change('version_code', event.target.value)} placeholder="123" /></label>}</div></>}
        <label>Lien d’origine (facultatif)<input type="url" value={form.source_url} onChange={(event) => change('source_url', event.target.value)} placeholder="https://…" />{platform === 'android' && <small>MyMDM reconnaît automatiquement APKMirror et APKPure depuis leur adresse.</small>}</label>
        <label className="file-drop"><UploadCloud size={30} /><strong>{form.file?.name || typeDetails.dropLabel}</strong><span>{typeDetails.formats} · 500 Mo maximum</span><input key={fileKey} required type="file" accept={typeDetails.accept} onChange={(event) => change('file', event.target.files?.[0] || null)} /></label>
        <button className="icon-text" type="submit" disabled={busy}><PackagePlus size={17} />{busy ? 'Import en cours…' : 'Ajouter à la bibliothèque'}</button>
      </form>
      <section className="panel library-catalog"><div className="section-heading"><div><span className="eyebrow">Catalogue · {details.label}</span><h3>Contenu disponible</h3></div></div>
        {!assets.length && <div className="empty-state compact"><PlatformIcon platform={platform} size={32} /><strong>Aucun contenu {details.label}</strong><span>Importez une première application ou un fichier.</span></div>}
        <div className="asset-list">{assets.map((asset) => <article className="asset-row" key={asset.id}><span className={`asset-kind ${asset.type === 'file' ? '' : `platform-${asset.platform}`}`}>{asset.type === 'file' ? <File /> : <PlatformIcon platform={asset.platform} />}</span><div className="asset-main"><strong>{asset.name}</strong><span>{assetTypeLabel(asset.type)} · {asset.type === 'file' ? asset.file_name : asset.package_name}{asset.version_name ? ` · ${asset.version_name}` : ''}</span><small>{formatSize(asset.size_bytes)} · ajouté le {dateLabel(asset.created_at)}</small></div><span className="source-pill">{sourceLabel(asset.source)}</span><code title={asset.sha256}>{asset.sha256.slice(0, 12)}…</code><div className="release-actions">{asset.source_url && <a className="quiet-icon-button" href={asset.source_url} target="_blank" rel="noreferrer" title="Ouvrir la source"><ExternalLink /></a>}<button className="quiet-icon-button danger-text" disabled={busy} onClick={() => remove(asset)} title="Supprimer"><Trash2 /></button></div></article>)}</div>
      </section>
    </div>
  </>;
}

function formatSize(bytes) { if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`; return `${(bytes / 1024 / 1024).toFixed(1)} Mo`; }
function sourceLabel(source) { return { upload: 'Interne', apkmirror: 'APKMirror', apkpure: 'APKPure', other: 'Externe' }[source] || source; }
function assetTypeLabel(type) { return { app: 'Application Android', android_app: 'Application Android', file: 'Fichier' }[type] || type; }
function assetTypeDetails(type) {
  return {
    android_app: { identifierLabel: 'Identifiant du paquet Android', identifierPlaceholder: 'com.exemple.application', dropLabel: 'Déposer un fichier .apk', formats: 'APK simple uniquement', accept: '.apk,application/vnd.android.package-archive' },
    file: { identifierLabel: '', identifierPlaceholder: '', dropLabel: 'Déposer un fichier', formats: 'Tout type de fichier', accept: undefined },
  }[type];
}
