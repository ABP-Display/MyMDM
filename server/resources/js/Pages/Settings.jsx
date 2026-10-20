import { usePage } from '@inertiajs/react';
import UserManagement from './UserManagement';
import { Building2, Clock3, FolderPlus, Folders, Pencil, Plus, Save, Settings as SettingsIcon, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Layout from './Layout';
import { api } from './api';

export default function Settings() {
  const { auth_user: currentUser } = usePage().props;
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
    }, 'Organization created.');
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
    }, 'Organization updated.');
  }

  async function deleteOrganization(organization) {
    if (!window.confirm(`Permanently delete the organization “${organization.name}” and its groups?`)) return;
    await run(async () => {
      await api(`/api/v1/organizations/${organization.id}`, { method: 'DELETE' });
      if (organization.id === selectedOrganizationId) {
        const fallback = organizations.find((item) => item.id !== organization.id);
        if (fallback) window.localStorage.setItem('mymdm.organization_id', fallback.id);
        window.location.reload();
      }
    }, 'Organization deleted.');
  }

  async function createGroup(event) {
    event.preventDefault();
    await run(async () => {
      await api('/api/v1/device-groups', { method: 'POST', body: JSON.stringify({ name: groupName }) });
      setGroupName('');
    }, 'Group created.');
  }

  async function updateGroup(event) {
    event.preventDefault();
    await run(async () => {
      await api(`/api/v1/device-groups/${editingGroup.id}`, { method: 'PATCH', body: JSON.stringify({ name: editingGroup.name }) });
      setEditingGroup(null);
    }, 'Group renamed.');
  }

  async function deleteGroup(group) {
    if (!window.confirm(`Delete the group “${group.name}”? Devices will remain in the organization.`)) return;
    await run(() => api(`/api/v1/device-groups/${group.id}`, { method: 'DELETE' }), 'Group deleted.');
  }

  return <Layout title="Settings">
    <section className="page-intro"><div><span className="eyebrow"><SettingsIcon size={15} />Administration</span><h2>Organizations, users and groups</h2><p>Organize your fleet and choose when a device should be marked as out of sync.</p></div></section>
    {error && <p className="error alert-box" role="alert">{error}</p>}
    {message && <p className="success alert-box" role="status">{message}</p>}
    <div className="settings-grid">
      <section className="panel settings-organizations">
        <div className="section-heading"><div><span className="eyebrow">Organizations</span><h3>Organization management</h3><p>The organization selected in the menu determines the displayed fleet.</p></div><span className="section-icon"><Building2 /></span></div>
        {currentUser?.is_admin && <form className="settings-create-form" onSubmit={createOrganization}>
          <label>Name<input required maxLength="120" placeholder="e.g. London office" value={organizationForm.name} onChange={(event) => setOrganizationForm({ ...organizationForm, name: event.target.value })} /></label>
          <label>Description<input maxLength="500" placeholder="Optional description" value={organizationForm.description} onChange={(event) => setOrganizationForm({ ...organizationForm, description: event.target.value })} /></label>
          <button className="icon-text" type="submit" disabled={busy || !organizationForm.name.trim()}><Plus size={16} />Create</button>
        </form>}
        <div className="organization-settings-list">
          {organizations.map((organization) => <article className={`organization-settings-card ${organization.id === selectedOrganizationId ? 'selected' : ''}`} key={organization.id}>
              <span className="organization-settings-icon"><Building2 /></span>
              <div><strong>{organization.name}</strong><span>{organization.description || 'No description'}</span><small>{organization.devices_count} device(s) · out of sync after {organization.non_sync_threshold_hours} h</small></div>
              {organization.id === selectedOrganizationId && <span className="selected-organization-badge">Selected</span>}
              <button className="quiet-icon-button" disabled={!currentUser?.is_admin && !organization.permissions?.includes('update')} aria-label={`Edit ${organization.name}`} onClick={() => setEditingOrganization({ ...organization })}><Pencil /></button>
              <button className="quiet-icon-button danger-text" disabled={busy || organization.is_default || (!currentUser?.is_admin && !organization.permissions?.includes('delete'))} aria-label={`Delete ${organization.name}`} title={organization.is_default ? 'The default organization cannot be deleted' : 'Delete'} onClick={() => deleteOrganization(organization)}><Trash2 /></button>
            </article>)}
        </div>
      </section>
      <section className="panel settings-groups">
        <div className="section-heading"><div><span className="eyebrow">Groups</span><h3>{selectedOrganization ? `Groups in ${selectedOrganization.name}` : 'Organization groups'}</h3><p>Switch organizations in the sidebar to manage their groups.</p></div><span className="section-icon"><Folders /></span></div>
        <form className="group-create-form" onSubmit={createGroup}><label>New group name<input required maxLength="100" placeholder="e.g. Reception, Training, Workshop" value={groupName} onChange={(event) => setGroupName(event.target.value)} /></label><button className="icon-text" type="submit" disabled={busy || !groupName.trim() || (!currentUser?.is_admin && !selectedOrganization?.permissions?.includes('create'))}><FolderPlus size={16} />Create</button></form>
        <div className="group-list settings-group-list">
          {groups.map((group) => <div className="group-row" key={group.id}><span className="group-mark"><Folders /></span><div><strong>{group.name}</strong><small>{group.devices_count} device(s)</small></div><button className="quiet-icon-button" disabled={!currentUser?.is_admin && !selectedOrganization?.permissions?.includes('update')} aria-label={`Rename ${group.name}`} onClick={() => setEditingGroup({ id: group.id, name: group.name })}><Pencil /></button><button className="quiet-icon-button danger-text" disabled={busy || (!currentUser?.is_admin && !selectedOrganization?.permissions?.includes('delete'))} aria-label={`Delete ${group.name}`} onClick={() => deleteGroup(group)}><Trash2 /></button></div>)}
          {groups.length === 0 && <div className="empty-state compact"><Folders size={30} /><span>No groups in this organization.</span></div>}
        </div>
      </section>
    </div>
    {currentUser?.is_admin && <UserManagement organizations={organizations} currentUserId={currentUser.id} />}
    {editingOrganization && <div className="settings-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingOrganization(null); }}><form className="panel settings-modal" role="dialog" aria-modal="true" aria-labelledby="organization-modal-title" onSubmit={updateOrganization}>
      <div className="section-heading"><div><span className="eyebrow">Organization</span><h3 id="organization-modal-title">Edit {editingOrganization.name}</h3><p>These settings apply to all devices in this organization.</p></div><button className="quiet-icon-button" type="button" aria-label="Close" onClick={() => setEditingOrganization(null)}><X /></button></div>
      <div className="settings-modal-fields"><label>Name<input required autoFocus maxLength="120" value={editingOrganization.name} onChange={(event) => setEditingOrganization({ ...editingOrganization, name: event.target.value })} /></label><label>Description<textarea rows="4" maxLength="500" value={editingOrganization.description || ''} onChange={(event) => setEditingOrganization({ ...editingOrganization, description: event.target.value })} /></label><label>Out-of-sync threshold<div className="threshold-field"><Clock3 size={16} /><input required type="number" min="1" max="720" value={editingOrganization.non_sync_threshold_hours} onChange={(event) => setEditingOrganization({ ...editingOrganization, non_sync_threshold_hours: Number(event.target.value) })} /><span>hours</span></div><small>Before this threshold, a pending policy remains orange.</small></label></div>
      <div className="settings-modal-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => setEditingOrganization(null)}>Cancel</button><button className="icon-text" type="submit" disabled={busy}><Save size={16} />Save</button></div>
    </form></div>}
    {editingGroup && <div className="settings-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingGroup(null); }}><form className="panel settings-modal compact" role="dialog" aria-modal="true" aria-labelledby="group-modal-title" onSubmit={updateGroup}>
      <div className="section-heading"><div><span className="eyebrow">Group</span><h3 id="group-modal-title">Rename group</h3></div><button className="quiet-icon-button" type="button" aria-label="Close" onClick={() => setEditingGroup(null)}><X /></button></div>
      <label>New name<input required autoFocus maxLength="100" value={editingGroup.name} onChange={(event) => setEditingGroup({ ...editingGroup, name: event.target.value })} /></label>
      <div className="settings-modal-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => setEditingGroup(null)}>Cancel</button><button className="icon-text" type="submit" disabled={busy}><Save size={16} />Save</button></div>
    </form></div>}
  </Layout>;
}
