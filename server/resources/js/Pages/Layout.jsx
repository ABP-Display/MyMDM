import { Link, router, usePage } from '@inertiajs/react';
import { Boxes, Building2, Gauge, LogOut, Menu, Package, QrCode, Smartphone, Settings, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from './api';

export default function Layout({ children, title }) {
  const { url, props } = usePage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [organizations, setOrganizations] = useState([]);
  const [organizationId, setOrganizationId] = useState(() => typeof window === 'undefined' ? '' : window.localStorage.getItem('mymdm.organization_id') || '');
  const [organizationError, setOrganizationError] = useState('');
  const links = [
    ['/', 'Overview', Gauge], ['/devices', 'Devices', Smartphone], ['/enrollments', 'Enrollments', QrCode],
    ['/configurations', 'Configurations', Settings], ['/library', 'Library', Boxes], ['/agent', 'MDM agent', Package],
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

  async function logout() {
    await api('/api/v1/auth/logout', { method: 'POST', body: '{}' });
    router.visit('/');
  }

  return (
    <div className="shell">
      <button className={`sidebar-backdrop ${menuOpen ? 'visible' : ''}`} aria-label="Close menu" onClick={() => setMenuOpen(false)} />
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="sidebar-heading"><div className="brand"><img className="brand-logo" src="/mymdm-logo.svg" width="34" height="34" alt="" /><div>MyMDM<small>Device Management</small></div></div><button className="sidebar-close" aria-label="Close menu" onClick={() => setMenuOpen(false)}><X /></button></div>
        <div className="organization-switcher">
          <label><span><Building2 size={14} />Organization</span><select value={organizationId} onChange={selectOrganization}>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>
          {organizationError && <small className="organization-error">{organizationError}</small>}
        </div>
        <nav>{links.filter(([href]) => props.auth_user?.is_admin || !['/enrollments', '/configurations'].includes(href)).map(([href, label, Icon]) => <Link key={href} href={href} onClick={() => setMenuOpen(false)} className={`nav-link ${(href === '/' ? url === '/' : url.startsWith(href)) ? 'active' : ''}`}><Icon size={18} />{label}</Link>)}</nav>
        <Link href="/settings" onClick={() => setMenuOpen(false)} className={`nav-link sidebar-settings ${url.startsWith('/settings') ? 'active' : ''}`}><Settings size={18} />Settings</Link>
        <button className="icon-text danger" onClick={logout}><LogOut size={18} />Sign out</button>
      </aside>
      <main className="main">
        <header className="topbar">
          <button className="menu-toggle" aria-label="Open menu" onClick={() => setMenuOpen(true)}><Menu /></button>
          <h1>{title}</h1>
        </header>
        {children}
      </main>
    </div>
  );
}
