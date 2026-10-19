import { AppWindow, File, Image, Library, Palette } from 'lucide-react';

export function LibraryPicker({ assets = [], selected = [], onChange }) {
  const compatibleAssets = assets.filter((asset) => ['app', 'android_app', 'file'].includes(asset.type));
  function toggle(id) {
    onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);
  }

  if (!compatibleAssets.length) return <div className="library-empty-inline"><Library size={26} /><div><strong>Aucun contenu compatible Android</strong><span>Ajoutez un APK Android ou un fichier depuis la page Bibliothèque.</span></div><a className="secondary-button" href="/library">Ouvrir la bibliothèque</a></div>;

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
    <label>Type de kiosque<select value={group} onChange={(e) => change('kiosk_type', e.target.value === 'single' ? 'web_single' : e.target.value === 'web' ? 'web_open' : 'launcher')}>
      <option value="single">1. Page web unique / application unique</option>
      <option value="web">2. Web avec redirections</option>
      <option value="launcher">3. Kiosque libre — bibliothèque d’applications</option>
    </select></label>
    {group === 'single' && <label>Contenu unique<select value={type} onChange={(e) => change('kiosk_type', e.target.value)}>
      <option value="web_single">Page web unique</option><option value="app">Application Android unique</option>
    </select></label>}
    {type === 'launcher' ? <>
      <div className="form-section-title"><Library size={18} /><div><h3>Contenu du menu d’accueil</h3>{!compact && <p>Les APK seront installés automatiquement ; les fichiers seront téléchargés et proposés dans le menu.</p>}</div></div>
      <LibraryPicker assets={assets} selected={form.library_item_ids || []} onChange={(ids) => change('library_item_ids', ids)} />
      {!compact && <p className="muted">Les éléments sélectionnés sont figés dans la politique et contrôlés par leur empreinte SHA‑256.</p>}
      <label className="switch"><input type="checkbox" checked={form.launcher_auto_grant_permissions !== false} onChange={(event) => change('launcher_auto_grant_permissions', event.target.checked)} /><span><strong>Autoriser automatiquement les permissions des applications</strong>{!compact && <small>MyMDM accorde lors de la synchronisation les permissions Android standard demandées par les APK installés.</small>}</span></label>
      {!compact && <p className="muted">Si cette option est désactivée, Android affiche normalement la demande dans l’application pour permettre à l’utilisateur d’accepter ou de refuser. Les accès système spéciaux restent réservés à l’administrateur.</p>}
      <div className="form-section-title"><Palette size={18} /><div><h3>Fond du menu</h3>{!compact && <p>La couleur reste visible derrière les images transparentes ou adaptées à l’écran.</p>}</div></div>
      <label>Couleur d’arrière-plan<div className="color-field"><input type="color" value={form.launcher_background_color || '#7E7F7B'} onChange={(event) => change('launcher_background_color', event.target.value.toUpperCase())} /><code>{form.launcher_background_color || '#7E7F7B'}</code></div></label>
      <label>Image d’arrière-plan<select value={form.launcher_background_image_id || ''} onChange={(event) => change('launcher_background_image_id', event.target.value)}><option value="">Aucune image — couleur uniquement</option>{backgroundImages.map((asset) => <option value={asset.id} key={asset.id}>{asset.name} · {asset.file_name}</option>)}</select></label>
      {!backgroundImages.length && <div className="library-empty-inline"><Image size={25} /><div><strong>Aucune image dans la bibliothèque</strong><span>Ajoutez un fichier PNG, JPEG ou WebP pour pouvoir le sélectionner.</span></div><a className="secondary-button" href="/library">Ajouter une image</a></div>}
    </> : appMode ? <>
      <label>Identifiant de l’application Android
        <textarea required={form.kiosk_enabled} value={form.allowed_apps || ''} onChange={(e) => change('allowed_apps', e.target.value)} placeholder={'com.android.chrome\ncom.exemple.application'} />
      </label>
      {!compact && <><p className="muted">Cette application doit déjà être installée sur l’appareil. Exemple d’identifiant : com.android.chrome. Android 11 minimum.</p>
      <p className="muted">Le bouton Accueil ramène au menu MyMDM pour changer d’application ou quitter avec le code. MyMDM ne contrôle pas les pages internes d’une application tierce.</p></>}
    </> : <>
      <label>URL du kiosque<input type="url" required={form.kiosk_enabled} value={form.url} onChange={(e) => change('url', e.target.value)} placeholder="https://exemple.fr ou http://192.168.1.10" />{!compact && <small>Les adresses HTTP sont acceptées pour les services du réseau local.</small>}</label>
      {type === 'web_single' ? !compact && <p className="muted">L’appareil reste sur cette URL : les autres pages et les redirections sont bloquées, même sur le même site. Utilisez directement l’URL finale.</p> : <>
        <label>Sites autorisés, une origine par ligne<textarea value={form.allowed_origins} onChange={(e) => change('allowed_origins', e.target.value)} placeholder="https://exemple.fr" /></label>
        <p className="muted">{compact ? type === 'web' ? 'Liste vide : site initial uniquement.' : 'Liste vide : aucune restriction.' : <>{type === 'web' ? 'Configuration web existante : une liste vide conserve uniquement le site initial. Resélectionnez « Web avec redirections » pour autoriser tous les sites.' : 'Liste vide : tous les sites HTTP(S) accessibles sont autorisés. Liste renseignée : seuls ces sites et le site initial sont autorisés.'} La navigation reste dans MyMDM.</>}</p>
      </>}
    </>}
  </>;
}
