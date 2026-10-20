import { AppWindow, File, Image, Library, Palette } from 'lucide-react';

export function LibraryPicker({ assets = [], selected = [], onChange }) {
  const compatibleAssets = assets.filter((asset) => ['app', 'android_app', 'file'].includes(asset.type));
  function toggle(id) {
    onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);
  }

  if (!compatibleAssets.length) return <div className="library-empty-inline"><Library size={26} /><div><strong>No Android-compatible content</strong><span>Add an Android APK or file from the Library page.</span></div><a className="secondary-button" href="/library">Open library</a></div>;

  return <div className="asset-picker">{compatibleAssets.map((asset) => <label className={`asset-choice ${selected.includes(asset.id) ? 'selected' : ''}`} key={asset.id}>
    <input type="checkbox" checked={selected.includes(asset.id)} onChange={() => toggle(asset.id)} />
    <span className="asset-kind">{asset.type === 'file' ? <File /> : <AppWindow />}</span>
    <span><strong>{asset.name}</strong><small>{asset.type === 'file' ? asset.file_name : asset.package_name}{asset.version_name ? ` · ${asset.version_name}` : ''}</small></span>
  </label>)}</div>;
}

export default function KioskFields({ form, change, assets = [], compact = false }) {
  const type = form.kiosk_type || 'web';
  const group = ['web_single', 'app'].includes(type) ? 'single' : type === 'launcher' ? 'launcher' : 'web';
  const appMode = ['app', 'launcher'].includes(type);
  const backgroundImages = assets.filter((asset) => asset.type === 'file' && ['image/jpeg', 'image/png', 'image/webp'].includes(asset.mime_type));
  return <>
    <label>Kiosk type<select value={group} onChange={(e) => change('kiosk_type', e.target.value === 'single' ? 'web_single' : e.target.value === 'web' ? 'web_open' : 'launcher')}>
      <option value="single">1. Single web page / single application</option>
      <option value="web">2. Web with redirects</option>
      <option value="launcher">3. Launcher kiosk — application library</option>
    </select></label>
    {group === 'single' && <label>Single content item<select value={type} onChange={(e) => change('kiosk_type', e.target.value)}>
      <option value="web_single">Single web page</option><option value="app">Single Android application</option>
    </select></label>}
    {type === 'launcher' ? <>
      <div className="form-section-title"><Library size={18} /><div><h3>Home menu content</h3>{!compact && <p>APKs will be installed automatically; files will be downloaded and made available in the menu.</p>}</div></div>
      <LibraryPicker assets={assets} selected={form.library_item_ids || []} onChange={(ids) => change('library_item_ids', ids)} />
      {!compact && <p className="muted">Selected items are pinned in the policy and verified using their SHA-256 checksums.</p>}
      <label className="switch"><input type="checkbox" checked={form.launcher_auto_grant_permissions !== false} onChange={(event) => change('launcher_auto_grant_permissions', event.target.checked)} /><span><strong>Automatically grant application permissions</strong>{!compact && <small>During sync, MyMDM grants the standard Android permissions requested by installed APKs.</small>}</span></label>
      {!compact && <p className="muted">When disabled, Android normally prompts the user to allow or deny permissions in the application. Special system access remains restricted to the administrator.</p>}
      <div className="form-section-title"><Palette size={18} /><div><h3>Menu background</h3>{!compact && <p>The color remains visible behind transparent or scaled images.</p>}</div></div>
      <label>Background color<div className="color-field"><input type="color" value={form.launcher_background_color || '#7E7F7B'} onChange={(event) => change('launcher_background_color', event.target.value.toUpperCase())} /><code>{form.launcher_background_color || '#7E7F7B'}</code></div></label>
      <label>Background image<select value={form.launcher_background_image_id || ''} onChange={(event) => change('launcher_background_image_id', event.target.value)}><option value="">No image — color only</option>{backgroundImages.map((asset) => <option value={asset.id} key={asset.id}>{asset.name} · {asset.file_name}</option>)}</select></label>
      {!backgroundImages.length && <div className="library-empty-inline"><Image size={25} /><div><strong>No images in the library</strong><span>Add a PNG, JPEG or WebP file to make it available here.</span></div><a className="secondary-button" href="/library">Add an image</a></div>}
    </> : appMode ? <>
      <label>Android application ID
        <textarea required={form.kiosk_enabled} value={form.allowed_apps || ''} onChange={(e) => change('allowed_apps', e.target.value)} placeholder={'com.android.chrome\ncom.example.application'} />
      </label>
      {!compact && <><p className="muted">This application must already be installed on the device. Example ID: com.android.chrome. Requires Android 11 or later.</p>
      <p className="muted">The Home button returns to the MyMDM menu to switch applications or exit using the PIN. MyMDM does not control pages within third-party applications.</p></>}
    </> : <>
      <label>Kiosk URL<input type="url" required={form.kiosk_enabled} value={form.url} onChange={(e) => change('url', e.target.value)} placeholder="https://example.org or http://192.168.1.10" />{!compact && <small>HTTP addresses are supported for local network services.</small>}</label>
      {type === 'web_single' ? !compact && <p className="muted">The device stays on this URL: other pages and redirects are blocked, even on the same website. Use the final URL directly.</p> : <>
        <label>Allowed websites, one origin per line<textarea value={form.allowed_origins} onChange={(e) => change('allowed_origins', e.target.value)} placeholder="https://example.org" /></label>
        <p className="muted">{compact ? type === 'web' ? 'Empty list: initial website only.' : 'Empty list: no restrictions.' : <>{type === 'web' ? 'Existing web configuration: an empty list allows only the initial website. Select “Web with redirects” again to allow all websites.' : 'Empty list: all accessible HTTP(S) websites are allowed. With a list: only those websites and the initial website are allowed.'} Browsing stays within MyMDM.</>}</p>
      </>}
    </>}
  </>;
}
