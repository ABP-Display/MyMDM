import { Link, router, usePage } from '@inertiajs/react';
import { Boxes, Building2, Gauge, LogOut, Menu, Package, Plus, QrCode, Smartphone, Settings, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from './api';

export default function Layout({ children, title }) {
  const { url } = usePage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [organizations, setOrganizations] = useState([]);
  const [organizationId, setOrganizationId] = useState(() => typeof window === 'undefined' ? '' : window.localStorage.getItem('mymdm.organization_id') || '');
  const [creatingOrganization, setCreatingOrganization] = useState(false);
  const [organizationName, setOrganizationName] = useState('');
  const [organizationError, setOrganizationError] = useState('');
  const links = [
    ['/', 'Vue d’ensemble', Gauge], ['/devices', 'Appareils', Smartphone], ['/enrollments', 'Enrôlements', QrCode],
    ['/configurations', 'Configurations', Settings], ['/library', 'Bibliothèque', Boxes], ['/agent', 'Agent MDM', Package],
  ];

  useEffect(() => {
    api('/api/v1/organizations').then((items) => {
      setOrganizations(items);
      const selectionExists = items.some((item) => item.id === organizationId);
      if (!selectionExists && items[0]) {
        window.localStorage.setItem('mymdm.organization_id', items[0].id);
        window.location.reload();
      }
    }).catch((error) => setOrganizationError(error.message));
  }, []);

  useEffect(() => { setMenuOpen(false); }, [url]);

  function selectOrganization(event) {
    const nextId = event.target.value;
    window.localStorage.setItem('mymdm.organization_id', nextId);
    setOrganizationId(nextId);
    window.location.reload();
  }

  async function createOrganization(event) {
    event.preventDefault(); setOrganizationError('');
    try {
      const organization = await api('/api/v1/organizations', { method: 'POST', body: JSON.stringify({ name: organizationName }) });
      window.localStorage.setItem('mymdm.organization_id', organization.id);
      window.location.reload();
    } catch (error) { setOrganizationError(error.message); }
  }
  async function logout() {
    await api('/api/v1/auth/logout', { method: 'POST', body: '{}' });
    router.visit('/');
  }

  return (
    <div className="shell">
      <button className={`sidebar-backdrop ${menuOpen ? 'visible' : ''}`} aria-label="Fermer le menu" onClick={() => setMenuOpen(false)} />
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="sidebar-heading"><div className="brand"><img className="brand-logo" src="/mymdm-logo.svg" width="34" height="34" alt="" /><div>MyMDM<small>{organizations.find((organization) => organization.id === organizationId)?.name || 'Gestion des appareils'}</small></div></div><button className="sidebar-close" aria-label="Fermer le menu" onClick={() => setMenuOpen(false)}><X /></button></div>
        <div className="organization-switcher">
          <label><span><Building2 size={14} />Organisation</span><select value={organizationId} onChange={selectOrganization}>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>
          <button className="organization-add" onClick={() => setCreatingOrganization((open) => !open)}><Plus size={14} />Nouvelle organisation</button>
          {creatingOrganization && <form onSubmit={createOrganization}><input autoFocus required maxLength="120" placeholder="Nom de l’organisation" value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} /><button type="submit">Créer</button></form>}
          {organizationError && <small className="organization-error">{organizationError}</small>}
        </div>
        <nav>{links.map(([href, label, Icon]) => <Link key={href} href={href} onClick={() => setMenuOpen(false)} className={`nav-link ${(href === '/' ? url === '/' : url.startsWith(href)) ? 'active' : ''}`}><Icon size={18} />{label}</Link>)}</nav>
        <Link href="/settings" onClick={() => setMenuOpen(false)} className={`nav-link sidebar-settings ${url.startsWith('/settings') ? 'active' : ''}`}><Settings size={18} />Paramètres</Link>
        <button className="icon-text danger" onClick={logout}><LogOut size={18} />Sortir</button>
      </aside>
      <main className="main">
        <header className="topbar">
          <button className="menu-toggle" aria-label="Ouvrir le menu" onClick={() => setMenuOpen(true)}><Menu /></button>
          <h1>{title}</h1>
        </header>
        {children}
      </main>
    </div>
  );
}
