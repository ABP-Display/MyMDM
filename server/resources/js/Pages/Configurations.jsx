import { Link } from '@inertiajs/react';
import { CheckCircle2, ChevronDown, Clock3, ExternalLink, FilePlus2, MonitorSmartphone, Package, QrCode, RefreshCw, Save, Search, Settings2, ShieldCheck, Trash2, Wifi } from 'lucide-react';
import { useEffect, useState } from 'react';
import PlatformWorkspace from './PlatformWorkspace';
import KioskFields from './KioskFields';
import { PlatformBadge, PlatformIcon, platformCatalog } from './Platform';
import { api, dateLabel } from './api';

const emptyForm = (platform = 'android') => ({ name: '', platform, enrollment_agent_source: 'active', enrollment_agent_release_id: null, management_mode: 'fully_managed', notes: '', kiosk_enabled: true, kiosk_type: 'web_single', allowed_apps: '', library_item_ids: [], launcher_background_color: '#7E7F7B', launcher_background_image_id: '', launcher_auto_grant_permissions: true, url: '', allowed_origins: '', orientation: 'auto', keep_screen_on: true, sync_interval_minutes: 5, default_volume: null, default_brightness: null, admin_pin: '', wifi_ssid: '', wifi_security_type: 'WPA', wifi_password: '', wifi_hidden: false });
const kioskLabels = { web: 'Web', web_single: 'Page web unique', web_open: 'Web avec redirections', app: 'Application unique', launcher: 'Kiosque libre' };

export default function Configurations() {
  return <PlatformWorkspace title="Configurations"><AndroidConfigurations /></PlatformWorkspace>;
}

function AndroidConfigurations() {
  const [items, setItems] = useState([]);
  const [assets, setAssets] = useState([]);
  const [agents, setAgents] = useState([]);
  const [agentSource, setAgentSource] = useState(null);
  const [agentError, setAgentError] = useState('');
  const [agentLoading, setAgentLoading] = useState(true);
  const [platform, setPlatform] = useState('android');
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(() => emptyForm());
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false);

  async function load() {
    const [configurations, library] = await Promise.all([api('/api/v1/configurations'), api('/api/v1/kiosk-assets?platform=android')]);
    setItems(configurations); setAssets(library); return configurations;
  }
  useEffect(() => {
    load().then((configurations) => {
      const requested = configurations.find((item) => item.id === new URLSearchParams(window.location.search).get('configuration_id'));
      if (requested) { setPlatform(requested.platform); fill(requested, requested.platform); }
    }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    let cancelled = false;
    setAgentLoading(true); setAgentError(''); setAgents([]); setAgentSource(null);
    Promise.all([api(`/api/v1/agent/releases?platform=${platform}`), api(`/api/v1/agent/source?platform=${platform}`)])
      .then(([releases, source]) => { if (!cancelled) { setAgents(releases); setAgentSource(source); } })
      .catch((e) => { if (!cancelled) setAgentError(e.message); })
      .finally(() => { if (!cancelled) setAgentLoading(false); });
    return () => { cancelled = true; };
  }, [platform]);

  function fill(item, selectedPlatform = platform) {
    setSelected(item);
    setForm(item ? { ...emptyForm(item.platform), ...item.policy, platform: item.platform, name: item.name, enrollment_agent_source: item.enrollment_agent_source || 'active', enrollment_agent_release_id: item.enrollment_agent_release_id || null, allowed_apps: (item.policy.allowed_apps || []).join('\n'), library_item_ids: (item.policy.library_items || []).map((asset) => asset.id), launcher_background_image_id: item.policy.launcher_background?.id || '', allowed_origins: (item.policy.allowed_origins || []).join('\n'), wifi_ssid: item.wifi_ssid, wifi_security_type: item.wifi_security_type, wifi_hidden: item.wifi_hidden } : emptyForm(selectedPlatform));
    setDirty(false);
  }
  function select(item) {
    if (dirty && !window.confirm('Abandonner les modifications non enregistrées ?')) return;
    if (item) setPlatform(item.platform);
    fill(item, item?.platform || platform); setMessage(''); setError('');
  }
  function switchPlatform(next) {
    if (next === platform || (dirty && !window.confirm('Abandonner les modifications non enregistrées ?'))) return;
    setPlatform(next); fill(null, next); setMessage(''); setError('');
  }
  function change(key, value) { setForm((previous) => ({ ...previous, [key]: value })); setDirty(true); }
  function chooseAgent(value) {
    setForm((previous) => ({ ...previous, enrollment_agent_source: ['active', 'android'].includes(value) ? value : 'release', enrollment_agent_release_id: ['active', 'android'].includes(value) ? null : value })); setDirty(true);
  }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const payload = { ...form, allowed_apps: form.allowed_apps.split('\n').map((value) => value.trim()).filter(Boolean), allowed_origins: form.allowed_origins.split('\n').map((value) => value.trim()).filter(Boolean) };
      const updated = await api(selected ? `/api/v1/configurations/${selected.id}` : '/api/v1/configurations', { method: selected ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      setPlatform(updated.platform); fill(updated, updated.platform);
      setMessage(selected ? `Profil enregistré. ${updated.managed_devices_count} appareil(s) lié(s) récupéreront les réglages à leur prochaine synchronisation. Le QR reste inchangé.` : 'Configuration créée. Son QR permanent est prêt.');
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function regenerate() {
    if (!window.confirm('Régénérer le QR avec le Wi-Fi enregistré et l’agent choisi ? L’ancien QR sera invalidé.')) return;
    setBusy(true); setError(''); setMessage('');
    try { fill(await api(`/api/v1/configurations/${selected.id}/qr/regenerate`, { method: 'POST', body: '{}' })); setMessage('Nouveau QR généré avec l’agent choisi.'); await load(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm(`Supprimer « ${selected.name} » ? Ses appareils conserveront leur politique et seront détachés du profil.`)) return;
    setBusy(true); setError(''); setMessage('');
    try { await api(`/api/v1/configurations/${selected.id}`, { method: 'DELETE' }); setItems((previous) => previous.filter((item) => item.id !== selected.id)); fill(null, platform); setMessage('Configuration supprimée.'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  const visibleItems = items.filter((item) => item.platform === platform && item.name.toLowerCase().includes(query.trim().toLowerCase()));
  const agentChoice = form.enrollment_agent_source === 'release' ? form.enrollment_agent_release_id || '' : form.enrollment_agent_source;
  const chosenRelease = agents.find((agent) => agent.id === form.enrollment_agent_release_id);
  const screenDescription = [form.orientation === 'auto' ? 'Rotation automatique' : form.orientation === 'portrait' ? 'Portrait' : 'Paysage', `Volume ${form.default_volume == null ? 'libre' : form.default_volume + '%'}`, `Luminosité ${form.default_brightness == null ? 'libre' : form.default_brightness + '%'}`].join(' · ');

  return <>
    <section className="configuration-hero"><div><span className="eyebrow"><Settings2 size={15} />Profils réutilisables</span><h2>Préparer un appareil, piloter un parc</h2><p>Choisissez l’agent d’enrôlement, puis personnalisez les options du profil. Les appareils liés suivront ses évolutions.</p></div><button className="icon-text" disabled={busy} onClick={() => select(null)}><FilePlus2 size={17} />Nouvelle configuration</button></section>
    <section className="configuration-layout configuration-workspace">
      <aside className="panel configuration-library"><div className="section-heading"><div><span className="eyebrow">{platformCatalog[platform].label}</span><h3>Vos configurations</h3></div><span className="configuration-count">{visibleItems.length}</span></div><label className="search-field"><Search size={16} /><input aria-label="Rechercher une configuration" placeholder="Rechercher un profil…" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        {loading && <p role="status">Chargement…</p>}{!loading && !visibleItems.length && <p className="muted">Aucune configuration trouvée.</p>}
        <div className="configuration-list">{visibleItems.map((item) => <button className={`configuration-card ${selected?.id === item.id ? 'selected' : ''}`} disabled={busy} key={item.id} onClick={() => select(item)}><span className={`configuration-icon platform-${platform}`}><PlatformIcon platform={platform} size={19} /></span><span><strong>{item.name}</strong><small>{item.managed_devices_count} appareil(s) lié(s) · {item.policy.kiosk_enabled ? kioskLabels[item.policy.kiosk_type] : 'Sans kiosque'}</small></span><small className={item.has_pending_changes ? 'pending-text' : 'muted'}>{item.has_pending_changes ? 'QR à régénérer' : 'QR permanent'}</small></button>)}</div>
        <div className="configuration-library-help"><ShieldCheck size={18} /><p>Une modification du profil s’applique à tous ses appareils liés, à leur prochaine synchronisation.</p></div>
      </aside>
      <div className="configuration-main">
        <form className="panel configuration-editor configuration-composer" onSubmit={save} onInvalidCapture={(event) => { const section = event.target.closest('details'); if (section) section.open = true; }} key={selected?.id || `new-${platform}`}>
          <div className="configuration-editor-heading"><div><span className="eyebrow">{selected ? 'Modifier le profil' : 'Nouveau profil'}</span><h3>{selected?.name || 'Configuration d’enrôlement'}</h3></div><PlatformBadge platform={platform} /></div>
          <fieldset disabled={busy} className="configuration-fields form-grid">
            <section className="configuration-required"><div className="configuration-section-heading"><span><QrCode size={20} /></span><div><h3>Enrôlement</h3><p>Les informations essentielles pour préparer l’inscription.</p></div><small>Essentiel</small></div>
              <label>Nom de la configuration<input required maxLength={255} value={form.name} onChange={(e) => change('name', e.target.value)} placeholder="Ex. Appareils d’accueil" /></label>
              {<label>Agent à utiliser pour l’enrôlement<select required value={agentChoice} disabled={agentLoading} onChange={(e) => chooseAgent(e.target.value)}><option value="active">Agent actif {agentSource?.available ? `· ${agentSource.version} · build ${agentSource.version_code}` : '· aucun agent disponible'}</option>{platform === 'android' && <option value="android">Compilation Android par défaut</option>}{agents.map((agent) => <option value={agent.id} disabled={!agent.downloadable} key={agent.id}>{agent.version} · build {agent.version_code} · {agent.artifact_name}{agent.downloadable ? '' : ' · fichier indisponible'}</option>)}</select></label>}
              <div className="configuration-agent-note"><Package size={19} /><div><strong>{agentLoading ? 'Chargement des agents…' : form.enrollment_agent_source === 'release' ? `Version choisie : ${chosenRelease?.version || 'indisponible'}` : form.enrollment_agent_source === 'android' ? 'APK issu de la compilation Android' : 'Version active au moment de générer le QR'}</strong><p>{'L’APK est conservé avec le QR. Modifier ce choix nécessite une régénération explicite et ne met pas à jour les appareils déjà enrôlés.'}</p></div><Link href="/agent">Gérer les agents <ExternalLink size={14} /></Link></div>
              {agentError && <p className="error" role="alert">{agentError}</p>}
              <a className="configuration-guide-link" href={`/guides/${platform}`} target="_blank" rel="noreferrer">Procédure d’enrôlement {platformCatalog[platform].label}<ExternalLink size={14} /></a>
            </section>
            <div className="configuration-options-heading"><Settings2 size={17} /><strong>Options du profil</strong><span>Dépliez uniquement les réglages utiles</span></div>
            {platform === 'android' && <>
              <OptionSection icon={<MonitorSmartphone />} title="Mode kiosque et contenu" description={form.kiosk_enabled ? `${kioskLabels[form.kiosk_type]} · cible et code de maintenance requis` : 'Kiosque désactivé'}><label className="switch"><input type="checkbox" checked={form.kiosk_enabled} onChange={(e) => change('kiosk_enabled', e.target.checked)} />Activer le mode kiosque</label>{form.kiosk_enabled && <><KioskFields form={form} change={change} assets={assets} /><label>Code de maintenance<input type="password" inputMode="numeric" pattern="[0-9]{6,12}" autoComplete="new-password" required={!selected?.policy.admin_pin_enabled} value={form.admin_pin} onChange={(e) => change('admin_pin', e.target.value)} placeholder={selected?.policy.admin_pin_enabled ? 'Laisser vide pour conserver le code' : '6 à 12 chiffres'} /></label></>}</OptionSection>
              <OptionSection icon={<Settings2 />} title="Écran et son" description={screenDescription}><label>Orientation<select value={form.orientation} onChange={(e) => change('orientation', e.target.value)}><option value="auto">Automatique</option><option value="portrait">Portrait</option><option value="landscape">Paysage</option></select></label><label className="switch"><input type="checkbox" checked={form.keep_screen_on} onChange={(e) => change('keep_screen_on', e.target.checked)} />Garder l’écran allumé</label><DefaultPercentage label="Volume multimédia" value={form.default_volume} fallback={50} onChange={(value) => change('default_volume', value)} /><DefaultPercentage label="Luminosité de l’écran" value={form.default_brightness} fallback={70} onChange={(value) => change('default_brightness', value)} /><p className="muted">Les valeurs par défaut sont appliquées à réception d’une nouvelle révision du profil.</p></OptionSection>
              <OptionSection icon={<Wifi />} title="Wi-Fi d’enrôlement" description={form.wifi_ssid || 'Facultatif · connexion manuelle pendant l’inscription'}><WifiFields form={form} change={change} selected={selected} /></OptionSection>
            </>}
            <OptionSection icon={<Clock3 />} title="Synchronisation" description={`Toutes les ${form.sync_interval_minutes} minute(s)`}><SyncInterval form={form} change={change} /></OptionSection>
            <div className="configuration-save-bar"><span>{dirty ? 'Modifications non enregistrées' : selected ? 'Profil enregistré' : 'Prêt à personnaliser'}</span><button className="icon-text" type="submit" disabled={agentLoading}><Save size={16} />{busy ? 'Enregistrement…' : selected ? 'Enregistrer le profil' : platform === 'android' ? 'Créer et générer le QR' : 'Créer le profil'}</button></div>
          </fieldset>
          {error && <p className="error alert-box" role="alert">{error}</p>}{message && <p className="success alert-box" role="status">{message}</p>}
        </form>
        {selected && <section className="panel configuration-enrollment-result"><div className="configuration-section-heading"><span>{platform === 'android' ? <QrCode size={22} /> : <PlatformIcon platform={platform} />}</span><div><h3>{'QR permanent d’enrôlement'}</h3><p>{`${dateLabel(selected.qr_created_at)} · ${selected.use_count} inscription(s) · ${selected.managed_devices_count} appareil(s) lié(s)`}</p></div>{platform === 'android' && !selected.has_pending_changes && <CheckCircle2 className="success-icon" />}</div>{selected.has_pending_changes && <p className="notice">L’agent ou le Wi-Fi choisi diffère du QR actuel. Enregistrez puis régénérez le QR pour les prochaines inscriptions.</p>}<div className="configuration-result-actions">{platform === 'android' && <><Link className="icon-text" href={`/enrollments?configuration_id=${selected.id}`}><QrCode size={16} />Afficher le QR</Link><button className="secondary-button" disabled={busy || dirty} onClick={regenerate}><RefreshCw size={16} />Régénérer le QR</button></>}<button className="secondary-button danger-text" disabled={busy} onClick={remove}><Trash2 size={16} />Supprimer le profil</button></div></section>}
      </div>
    </section>
  </>;
}

function OptionSection({ icon, title, description, children }) {
  return <details className="configuration-option"><summary><span className="configuration-option-icon">{icon}</span><span><strong>{title}</strong><small>{description}</small></span><ChevronDown size={18} /></summary><div className="configuration-option-body">{children}</div></details>;
}
function WifiFields({ form, change, selected }) {
  return <><label>Nom du réseau<input maxLength={32} value={form.wifi_ssid} onChange={(e) => change('wifi_ssid', e.target.value)} /></label>{form.wifi_ssid && <><label>Sécurité<select value={form.wifi_security_type} onChange={(e) => change('wifi_security_type', e.target.value)}><option value="WPA">WPA / WPA2 personnel</option><option value="NONE">Réseau ouvert</option></select></label>{form.wifi_security_type === 'WPA' && <label>Mot de passe Wi-Fi<input type="password" autoComplete="new-password" minLength={8} maxLength={63} required={!selected?.wifi_password_enabled} value={form.wifi_password} onChange={(e) => change('wifi_password', e.target.value)} placeholder={selected?.wifi_password_enabled ? 'Laisser vide pour conserver le mot de passe' : ''} /></label>}<label className="switch"><input type="checkbox" checked={form.wifi_hidden} onChange={(e) => change('wifi_hidden', e.target.checked)} />Réseau masqué</label></>}</>;
}
function SyncInterval({ form, change }) {
  return <label>Intervalle de synchronisation<select value={form.sync_interval_minutes} onChange={(e) => change('sync_interval_minutes', Number(e.target.value))}>{[1, 5, 15, 30, 60, 180, 360, 720, 1440].map((minutes) => <option value={minutes} key={minutes}>{minutes < 60 ? `Toutes les ${minutes} minute(s)` : `Toutes les ${minutes / 60} heure(s)`}</option>)}</select><small>L’agent adoptera cette fréquence à sa prochaine synchronisation.</small></label>;
}
function DefaultPercentage({ label, value, fallback, onChange }) {
  const enabled = value != null;
  return <div className="configuration-default-field"><label className="switch"><input type="checkbox" checked={enabled} onChange={(event) => onChange(event.target.checked ? fallback : null)} />Définir {label.toLowerCase()}</label>{enabled && <label>{label} · {value}%<input type="range" min="0" max="100" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>}</div>;
}
