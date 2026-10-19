import { router, usePage } from '@inertiajs/react';
import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { api } from './api';

export default function Login() {
  const { organization_name: organizationName } = usePage().props;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      await api('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      router.visit('/');
    } catch (err) {
      setError('Identifiants invalides');
    }
  }

  return (
    <main className="login-page">
      <form className="login-panel" onSubmit={submit}>
        <div className="login-brand"><img className="login-logo" src="/mymdm-logo.svg" width="46" height="46" alt="" /><div><h1>MyMDM</h1><span>{organizationName || 'Console d’administration'}</span></div></div>
        <p className="login-intro"><ShieldCheck size={18} />Gérez vos appareils et configurations kiosque en toute simplicité.</p>
        <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoFocus /></label>
        <label>Mot de passe<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" /></label>
        {error && <p className="error">{error}</p>}
        <button type="submit">Connexion</button>
      </form>
    </main>
  );
}
