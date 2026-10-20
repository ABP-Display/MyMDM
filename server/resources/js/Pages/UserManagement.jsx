import { Pencil, Plus, Save, ShieldCheck, Trash2, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from './api';

const permissionLabels = { view: 'View', create: 'Create groups', update: 'Edit', delete: 'Delete / reset devices', commands: 'Send device commands' };
const emptyUser = () => ({ name: '', email: '', password: '', is_admin: false, is_active: true, organizations: [] });

export default function UserManagement({ organizations, currentUserId }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() { setUsers(await api('/api/v1/users')); }
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);
  function change(key, value) { setForm((previous) => ({ ...previous, [key]: value })); }
  function access(organizationId, permission, enabled) {
    const memberships = form.organizations.filter((item) => item.id !== organizationId);
    const existing = form.organizations.find((item) => item.id === organizationId)?.permissions || [];
    const permissions = enabled ? [...new Set(['view', ...existing, permission])] : permission === 'view' ? [] : existing.filter((item) => item !== permission);
    change('organizations', permissions.length ? [...memberships, { id: organizationId, permissions }] : memberships);
  }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const body = { ...form, organizations: form.is_admin ? [] : form.organizations };
      if (!body.password) delete body.password;
      await api(form.id ? `/api/v1/users/${form.id}` : '/api/v1/users', { method: form.id ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      setForm(null); await load(); setMessage('User saved.');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function remove(user) {
    if (!window.confirm(`Permanently delete the user “${user.name}”? Their access will be removed.`)) return;
    setBusy(true); setError(''); setMessage('');
    try { await api(`/api/v1/users/${user.id}`, { method: 'DELETE' }); await load(); setMessage('User deleted.'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return <section className="panel settings-users">
    <div className="section-heading"><div><span className="eyebrow"><Users size={15} />Users and access</span><h3>User management</h3><p>Administrators manage users and shared resources. Members only access their assigned organizations.</p></div><button className="secondary-button icon-text" disabled={busy} onClick={() => { setError(''); setForm(emptyUser()); }}><Plus size={16} />New user</button></div>
    {error && <p className="error alert-box" role="alert">{error}</p>}{message && <p className="success alert-box" role="status">{message}</p>}
    <div className="user-list">{users.map((user) => <article className="user-card" key={user.id}><span className="organization-settings-icon"><ShieldCheck /></span><div className="user-identity"><strong>{user.name}{user.id === currentUserId && ' (you)'}</strong><span>{user.email}</span><small>{user.is_admin ? 'Administrator · all organizations' : user.organizations.map((item) => item.name).join(', ') || 'No organization access'}</small></div><span className={`user-status ${user.is_active ? '' : 'disabled'}`}>{user.is_active ? 'Active' : 'Disabled'}</span><div className="user-actions"><button className="quiet-icon-button" disabled={busy} aria-label={`Edit user ${user.name}`} onClick={() => { setError(''); setForm({ ...user, password: '' }); }}><Pencil /></button><button className="quiet-icon-button danger-text" disabled={busy || user.id === currentUserId} aria-label={`Delete user ${user.name}`} onClick={() => remove(user)}><Trash2 /></button></div></article>)}</div>
    {form && <div className="settings-modal-backdrop"><form className="panel settings-modal user-modal" role="dialog" aria-modal="true" aria-labelledby="user-modal-title" onSubmit={save}>
      <div className="section-heading"><div><span className="eyebrow">User account</span><h3 id="user-modal-title">{form.id ? 'Edit user' : 'Create user'}</h3></div><button type="button" className="quiet-icon-button" disabled={busy} aria-label="Close user editor" onClick={() => setForm(null)}><X /></button></div>
      {error && <p className="error alert-box" role="alert">{error}</p>}
      <fieldset className="user-fields" disabled={busy}><div className="user-fields-grid"><label>Name<input required autoFocus maxLength={120} value={form.name} onChange={(e) => change('name', e.target.value)} /></label><label>Email<input required type="email" autoComplete="off" maxLength={255} value={form.email} onChange={(e) => change('email', e.target.value)} /></label></div>
      <label>{form.id ? 'New password (optional)' : 'Password'}<input required={!form.id} type="password" minLength={12} maxLength={128} autoComplete="new-password" value={form.password} onChange={(e) => change('password', e.target.value)} /><small>At least 12 characters.{form.id && ' Leave blank to keep the current password.'}</small></label>
      <label className="switch"><input type="checkbox" disabled={form.id === currentUserId} checked={form.is_active} onChange={(e) => change('is_active', e.target.checked)} />Active account</label>
      <label className="switch"><input type="checkbox" disabled={form.id === currentUserId} checked={form.is_admin} onChange={(e) => change('is_admin', e.target.checked)} />Administrator — full access to all organizations and shared resources</label>
      {!form.is_admin && <div className="organization-access"><h4>Organization permissions</h4><p className="muted">Enable View to grant access. Removing View revokes all rights for that organization. Configurations, enrollments, library uploads and agent releases are managed by administrators.</p>{organizations.map((organization) => {
        const permissions = form.organizations.find((item) => item.id === organization.id)?.permissions || [];
        return <fieldset className="organization-permissions" key={organization.id}><legend>{organization.name}</legend><div>{Object.entries(permissionLabels).map(([permission, label]) => <label className="switch" key={permission}><input type="checkbox" checked={permissions.includes(permission)} disabled={permission !== 'view' && !permissions.includes('view')} onChange={(e) => access(organization.id, permission, e.target.checked)} />{label}</label>)}</div></fieldset>;
      })}</div>}
      </fieldset><div className="settings-modal-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => setForm(null)}>Cancel</button><button className="icon-text" disabled={busy} type="submit"><Save size={16} />{busy ? 'Saving…' : 'Save user'}</button></div>
    </form></div>}
  </section>;
}
