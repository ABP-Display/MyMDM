import { Building2, Clock3, FolderPlus, Folders, Pencil, Plus, Save, Settings as SettingsIcon, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Layout from './Layout';
import { api } from './api';

export default function Settings() {
  const [organizations, setOrganizations] = useState([]);
  const [groups, setGroups] = useState([]);
  const [organizationForm, setOrganizationForm] = useState({ name: '', description: '' });
  const [editingOrganization, setEditingOrganization] = useState(null);
  const [groupName, setGroupName] = useState('');
  const [editingGroup, setEditingGroup] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const selectedOrganizationId = typeof window === 'undefined' ? '' : window.localStorage.getItem('mymdm.organization_id') || '';
  const selectedOrganization = useMemo(() => organizations.find((item) => item.id === selectedOrganizationId), [organizations, selectedOrganizationId]);

  async function load() {
    setError('');
    try {
      const [organizationItems, groupItems] = await Promise.all([api('/api/v1/organizations'), api('/api/v1/device-groups')]);
      setOrganizations(organizationItems); setGroups(groupItems);
    } catch (e) { setError(e.message); }
  }

  useEffect(() => { load(); }, []);

  async function run(operation, successMessage) {
    setBusy(true); setError(''); setMessage('');
    try { await operation(); setMessage(successMessage); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function createOrganization(event) {
    event.preventDefault();
    await run(async () => {
      const created = await api('/api/v1/organizations', { method: 'POST', body: JSON.stringify(organizationForm) });
      setOrganizationForm({ name: '', description: '' });
      window.localStorage.setItem('mymdm.organization_id', created.id);
      window.location.reload();
    }, 'Organisation créée.');
  }

  async function updateOrganization(event) {
    event.preventDefault();
    await run(async () => {
      await api(`/api/v1/organizations/${editingOrganization.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editingOrganization.name,
          description: editingOrganization.description || null,
          non_sync_threshold_hours: Number(editingOrganization.non_sync_threshold_hours),
        }),
      });
      setEditingOrganization(null);
    }, 'Organisation mise à jour.');
  }

  async function deleteOrganization(organization) {
    if (!window.confirm(`Supprimer définitivement l’organisation « ${organization.name} » et ses groupes ?`)) return;
    await run(async () => {
      await api(`/api/v1/organizations/${organization.id}`, { method: 'DELETE' });
      if (organization.id === selectedOrganizationId) {
        const fallback = organizations.find((item) => item.id !== organization.id);
        if (fallback) window.localStorage.setItem('mymdm.organization_id', fallback.id);
        window.location.reload();
      }
    }, 'Organisation supprimée.');
  }

  async function createGroup(event) {
    event.preventDefault();
    await run(async () => {
      await api('/api/v1/device-groups', { method: 'POST', body: JSON.stringify({ name: groupName }) });
      setGroupName('');
    }, 'Groupe créé.');
  }

  async function updateGroup(event) {
    event.preventDefault();
    await run(async () => {
      await api(`/api/v1/device-groups/${editingGroup.id}`, { method: 'PATCH', body: JSON.stringify({ name: editingGroup.name }) });
      setEditingGroup(null);
    }, 'Groupe renommé.');
  }

  async function deleteGroup(group) {
    if (!window.confirm(`Supprimer le groupe « ${group.name} » ? Les appareils resteront dans l’organisation.`)) return;
    await run(() => api(`/api/v1/device-groups/${group.id}`, { method: 'DELETE' }), 'Groupe supprimé.');
  }

  return <Layout title="Paramètres">
    <section className="page-intro"><div><span className="eyebrow"><SettingsIcon size={15} />Administration</span><h2>Organisations et groupes</h2><p>Structurez le parc et choisissez quand un appareil doit être signalé comme non synchronisé.</p></div></section>
    {error && <p className="error alert-box" role="alert">{error}</p>}
    {message && <p className="success alert-box" role="status">{message}</p>}
    <div className="settings-grid">
      <section className="panel settings-organizations">
        <div className="section-heading"><div><span className="eyebrow">Organisations</span><h3>Gestion des organisations</h3><p>L’organisation sélectionnée dans le menu détermine le parc affiché.</p></div><span className="section-icon"><Building2 /></span></div>
        <form className="settings-create-form" onSubmit={createOrganization}>
          <label>Nom<input required maxLength="120" placeholder="Ex. Agence Paris" value={organizationForm.name} onChange={(event) => setOrganizationForm({ ...organizationForm, name: event.target.value })} /></label>
          <label>Description<input maxLength="500" placeholder="Description facultative" value={organizationForm.description} onChange={(event) => setOrganizationForm({ ...organizationForm, description: event.target.value })} /></label>
          <button className="icon-text" type="submit" disabled={busy || !organizationForm.name.trim()}><Plus size={16} />Créer</button>
        </form>
        <div className="organization-settings-list">
          {organizations.map((organization) => <article className={`organization-settings-card ${organization.id === selectedOrganizationId ? 'selected' : ''}`} key={organization.id}>
              <span className="organization-settings-icon"><Building2 /></span>
              <div><strong>{organization.name}</strong><span>{organization.description || 'Aucune description'}</span><small>{organization.devices_count} appareil(s) · non synchronisé après {organization.non_sync_threshold_hours} h</small></div>
              {organization.id === selectedOrganizationId && <span className="selected-organization-badge">Sélectionnée</span>}
              <button className="quiet-icon-button" aria-label={`Modifier ${organization.name}`} onClick={() => setEditingOrganization({ ...organization })}><Pencil /></button>
              <button className="quiet-icon-button danger-text" disabled={busy || organization.is_default} aria-label={`Supprimer ${organization.name}`} title={organization.is_default ? 'L’organisation principale ne peut pas être supprimée' : 'Supprimer'} onClick={() => deleteOrganization(organization)}><Trash2 /></button>
            </article>)}
        </div>
      </section>
      <section className="panel settings-groups">
        <div className="section-heading"><div><span className="eyebrow">Groupes</span><h3>{selectedOrganization ? `Groupes de ${selectedOrganization.name}` : 'Groupes de l’organisation'}</h3><p>Changez d’organisation depuis le menu latéral pour gérer ses groupes.</p></div><span className="section-icon"><Folders /></span></div>
        <form className="group-create-form" onSubmit={createGroup}><label>Nom du nouveau groupe<input required maxLength="100" placeholder="Ex. Accueil, Formation, Atelier" value={groupName} onChange={(event) => setGroupName(event.target.value)} /></label><button className="icon-text" type="submit" disabled={busy || !groupName.trim()}><FolderPlus size={16} />Créer</button></form>
        <div className="group-list settings-group-list">
          {groups.map((group) => <div className="group-row" key={group.id}><span className="group-mark"><Folders /></span><div><strong>{group.name}</strong><small>{group.devices_count} appareil(s)</small></div><button className="quiet-icon-button" aria-label={`Renommer ${group.name}`} onClick={() => setEditingGroup({ id: group.id, name: group.name })}><Pencil /></button><button className="quiet-icon-button danger-text" disabled={busy} aria-label={`Supprimer ${group.name}`} onClick={() => deleteGroup(group)}><Trash2 /></button></div>)}
          {groups.length === 0 && <div className="empty-state compact"><Folders size={30} /><span>Aucun groupe dans cette organisation.</span></div>}
        </div>
      </section>
    </div>
    {editingOrganization && <div className="settings-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingOrganization(null); }}><form className="panel settings-modal" role="dialog" aria-modal="true" aria-labelledby="organization-modal-title" onSubmit={updateOrganization}>
      <div className="section-heading"><div><span className="eyebrow">Organisation</span><h3 id="organization-modal-title">Modifier {editingOrganization.name}</h3><p>Les réglages s’appliquent à tous les appareils de cette organisation.</p></div><button className="quiet-icon-button" type="button" aria-label="Fermer" onClick={() => setEditingOrganization(null)}><X /></button></div>
      <div className="settings-modal-fields"><label>Nom<input required autoFocus maxLength="120" value={editingOrganization.name} onChange={(event) => setEditingOrganization({ ...editingOrganization, name: event.target.value })} /></label><label>Description<textarea rows="4" maxLength="500" value={editingOrganization.description || ''} onChange={(event) => setEditingOrganization({ ...editingOrganization, description: event.target.value })} /></label><label>Délai avant « Non synchronisé »<div className="threshold-field"><Clock3 size={16} /><input required type="number" min="1" max="720" value={editingOrganization.non_sync_threshold_hours} onChange={(event) => setEditingOrganization({ ...editingOrganization, non_sync_threshold_hours: Number(event.target.value) })} /><span>heures</span></div><small>Avant ce délai, une politique à appliquer reste orange.</small></label></div>
      <div className="settings-modal-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => setEditingOrganization(null)}>Annuler</button><button className="icon-text" type="submit" disabled={busy}><Save size={16} />Enregistrer</button></div>
    </form></div>}
    {editingGroup && <div className="settings-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingGroup(null); }}><form className="panel settings-modal compact" role="dialog" aria-modal="true" aria-labelledby="group-modal-title" onSubmit={updateGroup}>
      <div className="section-heading"><div><span className="eyebrow">Groupe</span><h3 id="group-modal-title">Renommer le groupe</h3></div><button className="quiet-icon-button" type="button" aria-label="Fermer" onClick={() => setEditingGroup(null)}><X /></button></div>
      <label>Nouveau nom<input required autoFocus maxLength="100" value={editingGroup.name} onChange={(event) => setEditingGroup({ ...editingGroup, name: event.target.value })} /></label>
      <div className="settings-modal-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => setEditingGroup(null)}>Annuler</button><button className="icon-text" type="submit" disabled={busy}><Save size={16} />Enregistrer</button></div>
    </form></div>}
  </Layout>;
}
