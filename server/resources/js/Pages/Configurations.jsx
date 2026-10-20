import { Link } from '@inertiajs/react';
import { CheckCircle2, ChevronDown, Clock3, ExternalLink, FilePlus2, MonitorSmartphone, Package, QrCode, RefreshCw, Save, Search, Settings2, ShieldCheck, Trash2, Wifi } from 'lucide-react';
import { useEffect, useState } from 'react';
import PlatformWorkspace from './PlatformWorkspace';
import KioskFields from './KioskFields';
import { PlatformBadge, PlatformIcon, platformCatalog } from './Platform';
import { api, dateLabel } from './api';

const emptyForm = (platform = 'android') => ({ name: '', platform, enrollment_agent_source: 'active', enrollment_agent_release_id: null, management_mode: 'fully_managed', notes: '', kiosk_enabled: true, kiosk_type: 'web_single', allowed_apps: '', library_item_ids: [], launcher_background_color: '#7E7F7B', launcher_background_image_id: '', launcher_auto_grant_permissions: true, url: '', allowed_origins: '', orientation: 'auto', keep_screen_on: true, sync_interval_minutes: 5, default_volume: null, default_brightness: null, admin_pin: '', wifi_ssid: '', wifi_security_type: 'WPA', wifi_password: '', wifi_hidden: false });
const kioskLabels = { web: 'Web', web_single: 'Single web page', web_open: 'Web with redirects', app: 'Single application', launcher: 'Launcher kiosk' };

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
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    if (item) setPlatform(item.platform);
    fill(item, item?.platform || platform); setMessage(''); setError('');
  }
  function switchPlatform(next) {
    if (next === platform || (dirty && !window.confirm('Discard unsaved changes?'))) return;
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
      setMessage(selected ? `Profile saved. ${updated.managed_devices_count} linked device(s) will receive the settings on their next sync. The QR code is unchanged.` : 'Configuration created. Its permanent QR code is ready.');
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function regenerate() {
    if (!window.confirm('Regenerate the QR code using the saved Wi-Fi settings and selected agent? The previous QR code will be invalidated.')) return;
    setBusy(true); setError(''); setMessage('');
    try { fill(await api(`/api/v1/configurations/${selected.id}/qr/regenerate`, { method: 'POST', body: '{}' })); setMessage('New QR code generated with the selected agent.'); await load(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm(`Delete “${selected.name}”? Its devices will keep their policies and be detached from the profile.`)) return;
    setBusy(true); setError(''); setMessage('');
    try { await api(`/api/v1/configurations/${selected.id}`, { method: 'DELETE' }); setItems((previous) => previous.filter((item) => item.id !== selected.id)); fill(null, platform); setMessage('Configuration deleted.'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  const visibleItems = items.filter((item) => item.platform === platform && item.name.toLowerCase().includes(query.trim().toLowerCase()));
  const agentChoice = form.enrollment_agent_source === 'release' ? form.enrollment_agent_release_id || '' : form.enrollment_agent_source;
  const chosenRelease = agents.find((agent) => agent.id === form.enrollment_agent_release_id);
  const screenDescription = [form.orientation === 'auto' ? 'Automatic rotation' : form.orientation === 'portrait' ? 'Portrait' : 'Landscape', `Volume ${form.default_volume == null ? 'unmanaged' : form.default_volume + '%'}`, `Brightness ${form.default_brightness == null ? 'unmanaged' : form.default_brightness + '%'}`].join(' · ');

  return <>
    <section className="configuration-hero"><div><span className="eyebrow"><Settings2 size={15} />Reusable profiles</span><h2>Prepare a device, manage your fleet</h2><p>Choose the enrollment agent, then customize the profile. Linked devices will follow its updates.</p></div><button className="icon-text" disabled={busy} onClick={() => select(null)}><FilePlus2 size={17} />New configuration</button></section>
    <section className="configuration-layout configuration-workspace">
      <aside className="panel configuration-library"><div className="section-heading"><div><span className="eyebrow">{platformCatalog[platform].label}</span><h3>Your configurations</h3></div><span className="configuration-count">{visibleItems.length}</span></div><label className="search-field"><Search size={16} /><input aria-label="Search configurations" placeholder="Search profiles…" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        {loading && <p role="status">Loading…</p>}{!loading && !visibleItems.length && <p className="muted">No configurations found.</p>}
        <div className="configuration-list">{visibleItems.map((item) => <button className={`configuration-card ${selected?.id === item.id ? 'selected' : ''}`} disabled={busy} key={item.id} onClick={() => select(item)}><span className={`configuration-icon platform-${platform}`}><PlatformIcon platform={platform} size={19} /></span><span><strong>{item.name}</strong><small>{item.managed_devices_count} linked device(s) · {item.policy.kiosk_enabled ? kioskLabels[item.policy.kiosk_type] : 'No kiosk'}</small></span><small className={item.has_pending_changes ? 'pending-text' : 'muted'}>{item.has_pending_changes ? 'QR regeneration required' : 'Permanent QR code'}</small></button>)}</div>
        <div className="configuration-library-help"><ShieldCheck size={18} /><p>Profile changes apply to all linked devices on their next sync.</p></div>
      </aside>
      <div className="configuration-main">
        <form className="panel configuration-editor configuration-composer" onSubmit={save} onInvalidCapture={(event) => { const section = event.target.closest('details'); if (section) section.open = true; }} key={selected?.id || `new-${platform}`}>
          <div className="configuration-editor-heading"><div><span className="eyebrow">{selected ? 'Edit profile' : 'New profile'}</span><h3>{selected?.name || 'Enrollment configuration'}</h3></div><PlatformBadge platform={platform} /></div>
          <fieldset disabled={busy} className="configuration-fields form-grid">
            <section className="configuration-required"><div className="configuration-section-heading"><span><QrCode size={20} /></span><div><h3>Enrollment</h3><p>The essential information needed to prepare enrollment.</p></div><small>Required</small></div>
              <label>Configuration name<input required maxLength={255} value={form.name} onChange={(e) => change('name', e.target.value)} placeholder="e.g. Reception devices" /></label>
              {<label>Enrollment agent<select required value={agentChoice} disabled={agentLoading} onChange={(e) => chooseAgent(e.target.value)}><option value="active">Active agent {agentSource?.available ? `· ${agentSource.version} · build ${agentSource.version_code}` : '· no agent available'}</option>{platform === 'android' && <option value="android">Bundled Android build</option>}{agents.map((agent) => <option value={agent.id} disabled={!agent.downloadable} key={agent.id}>{agent.version} · build {agent.version_code} · {agent.artifact_name}{agent.downloadable ? '' : ' · file unavailable'}</option>)}</select></label>}
              <div className="configuration-agent-note"><Package size={19} /><div><strong>{agentLoading ? 'Loading agents…' : form.enrollment_agent_source === 'release' ? `Selected release: ${chosenRelease?.version || 'unavailable'}` : form.enrollment_agent_source === 'android' ? 'APK from the Android build' : 'Active release when the QR code is generated'}</strong><p>{'The APK is saved with the QR code. Changing this selection requires regenerating the QR code and does not update already enrolled devices.'}</p></div><Link href="/agent">Manage agents <ExternalLink size={14} /></Link></div>
              {agentError && <p className="error" role="alert">{agentError}</p>}
              <a className="configuration-guide-link" href={`/guides/${platform}`} target="_blank" rel="noreferrer">{platformCatalog[platform].label} enrollment instructions<ExternalLink size={14} /></a>
            </section>
            <div className="configuration-options-heading"><Settings2 size={17} /><strong>Profile options</strong><span>Expand the settings you need</span></div>
            {platform === 'android' && <>
              <OptionSection icon={<MonitorSmartphone />} title="Kiosk mode and content" description={form.kiosk_enabled ? `${kioskLabels[form.kiosk_type]} · target and maintenance PIN required` : 'Kiosk disabled'}><label className="switch"><input type="checkbox" checked={form.kiosk_enabled} onChange={(e) => change('kiosk_enabled', e.target.checked)} />Enable kiosk mode</label>{form.kiosk_enabled && <><KioskFields form={form} change={change} assets={assets} /><label>Maintenance PIN<input type="password" inputMode="numeric" pattern="[0-9]{6,12}" autoComplete="new-password" required={!selected?.policy.admin_pin_enabled} value={form.admin_pin} onChange={(e) => change('admin_pin', e.target.value)} placeholder={selected?.policy.admin_pin_enabled ? 'Leave blank to keep the PIN' : '6 to 12 digits'} /></label></>}</OptionSection>
              <OptionSection icon={<Settings2 />} title="Display and sound" description={screenDescription}><label>Orientation<select value={form.orientation} onChange={(e) => change('orientation', e.target.value)}><option value="auto">Automatic</option><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label><label className="switch"><input type="checkbox" checked={form.keep_screen_on} onChange={(e) => change('keep_screen_on', e.target.checked)} />Keep the screen on</label><DefaultPercentage label="Media volume" value={form.default_volume} fallback={50} onChange={(value) => change('default_volume', value)} /><DefaultPercentage label="Screen brightness" value={form.default_brightness} fallback={70} onChange={(value) => change('default_brightness', value)} /><p className="muted">Default values are applied when a new profile revision is received.</p></OptionSection>
              <OptionSection icon={<Wifi />} title="Enrollment Wi-Fi" description={form.wifi_ssid || 'Optional · connect manually during enrollment'}><WifiFields form={form} change={change} selected={selected} /></OptionSection>
            </>}
            <OptionSection icon={<Clock3 />} title="Synchronization" description={`Every ${form.sync_interval_minutes} minute(s)`}><SyncInterval form={form} change={change} /></OptionSection>
            <div className="configuration-save-bar"><span>{dirty ? 'Unsaved changes' : selected ? 'Profile saved' : 'Ready to customize'}</span><button className="icon-text" type="submit" disabled={agentLoading}><Save size={16} />{busy ? 'Saving…' : selected ? 'Save profile' : platform === 'android' ? 'Create and generate QR code' : 'Create profile'}</button></div>
          </fieldset>
          {error && <p className="error alert-box" role="alert">{error}</p>}{message && <p className="success alert-box" role="status">{message}</p>}
        </form>
        {selected && <section className="panel configuration-enrollment-result"><div className="configuration-section-heading"><span>{platform === 'android' ? <QrCode size={22} /> : <PlatformIcon platform={platform} />}</span><div><h3>{'Permanent enrollment QR code'}</h3><p>{`${dateLabel(selected.qr_created_at)} · ${selected.use_count} enrollment(s) · ${selected.managed_devices_count} linked device(s)`}</p></div>{platform === 'android' && !selected.has_pending_changes && <CheckCircle2 className="success-icon" />}</div>{selected.has_pending_changes && <p className="notice">The selected agent or Wi-Fi settings differ from the current QR code. Save and regenerate it for future enrollments.</p>}<div className="configuration-result-actions">{platform === 'android' && <><Link className="icon-text" href={`/enrollments?configuration_id=${selected.id}`}><QrCode size={16} />Show QR code</Link><button className="secondary-button" disabled={busy || dirty} onClick={regenerate}><RefreshCw size={16} />Regenerate QR code</button></>}<button className="secondary-button danger-text" disabled={busy} onClick={remove}><Trash2 size={16} />Delete profile</button></div></section>}
      </div>
    </section>
  </>;
}

function OptionSection({ icon, title, description, children }) {
  return <details className="configuration-option"><summary><span className="configuration-option-icon">{icon}</span><span><strong>{title}</strong><small>{description}</small></span><ChevronDown size={18} /></summary><div className="configuration-option-body">{children}</div></details>;
}
function WifiFields({ form, change, selected }) {
  return <><label>Network name<input maxLength={32} value={form.wifi_ssid} onChange={(e) => change('wifi_ssid', e.target.value)} /></label>{form.wifi_ssid && <><label>Security<select value={form.wifi_security_type} onChange={(e) => change('wifi_security_type', e.target.value)}><option value="WPA">WPA / WPA2 Personal</option><option value="NONE">Open network</option></select></label>{form.wifi_security_type === 'WPA' && <label>Wi-Fi password<input type="password" autoComplete="new-password" minLength={8} maxLength={63} required={!selected?.wifi_password_enabled} value={form.wifi_password} onChange={(e) => change('wifi_password', e.target.value)} placeholder={selected?.wifi_password_enabled ? 'Leave blank to keep the password' : ''} /></label>}<label className="switch"><input type="checkbox" checked={form.wifi_hidden} onChange={(e) => change('wifi_hidden', e.target.checked)} />Hidden network</label></>}</>;
}
function SyncInterval({ form, change }) {
  return <label>Sync interval<select value={form.sync_interval_minutes} onChange={(e) => change('sync_interval_minutes', Number(e.target.value))}>{[1, 5, 15, 30, 60, 180, 360, 720, 1440].map((minutes) => <option value={minutes} key={minutes}>{minutes < 60 ? `Every ${minutes} minute(s)` : `Every ${minutes / 60} hour(s)`}</option>)}</select><small>The agent will use this interval on its next sync.</small></label>;
}
function DefaultPercentage({ label, value, fallback, onChange }) {
  const enabled = value != null;
  return <div className="configuration-default-field"><label className="switch"><input type="checkbox" checked={enabled} onChange={(event) => onChange(event.target.checked ? fallback : null)} />Set {label.toLowerCase()}</label>{enabled && <label>{label} · {value}%<input type="range" min="0" max="100" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>}</div>;
}
