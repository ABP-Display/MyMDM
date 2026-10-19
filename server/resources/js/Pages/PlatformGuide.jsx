import { Link, usePage } from '@inertiajs/react';
import { ArrowLeft, CheckCircle2, Download, ExternalLink, ShieldCheck } from 'lucide-react';
import Layout from './Layout';
import { PlatformIcon, platformCatalog } from './Platform';

const guides = {
  android: {
    status: 'Disponible',
    intro: 'Provisionnement Android Enterprise par QR avec MyMDM comme Device Owner.',
    steps: ['Créez une configuration Android.', 'Générez ou affichez son QR permanent.', 'Réinitialisez l’appareil puis touchez six fois l’écran de bienvenue.', 'Scannez le QR et terminez les autorisations administrateur.'],
    source: 'https://developer.android.com/work/dpc/dedicated-devices',
  },

};

export default function PlatformGuide() {
  const platform = usePage().url.split('/').filter(Boolean).pop();
  const catalog = platformCatalog[platform] || platformCatalog.android;
  const guide = guides[platform] || guides.android;

  if (platform === 'ios') return <Layout title="iOS / iPadOS"><section className="panel empty-state"><PlatformIcon platform="ios" size={34} /><h2>iOS / iPadOS</h2><p role="status">Indisponible</p></section></Layout>;

  return <Layout title={`Guide ${catalog.label}`}>
    <Link className="back-link" href="/configurations"><ArrowLeft size={16} />Retour aux configurations</Link>
    <section className="platform-guide-hero panel" style={{ '--platform-color': catalog.color }}>
      <span className={`platform-guide-icon platform-${platform}`}><PlatformIcon platform={platform} size={32} /></span>
      <div><span className="eyebrow"><ShieldCheck size={15} />Procédure de déploiement</span><h2>{catalog.label}</h2><p>{guide.intro}</p></div>
      <span className={`status-pill ${guide.status === 'Disponible' ? 'online' : 'offline'}`}>{guide.status}</span>
    </section>
    <section className="platform-guide-grid">
      <div className="panel"><div className="section-heading"><div><span className="eyebrow">Étapes</span><h3>Préparer l’enrôlement</h3></div></div><ol className="guide-steps">{guide.steps.map((step, index) => <li key={step}><span>{index + 1}</span><div><strong>{step}</strong>{index === guide.steps.length - 1 && guide.status !== 'Disponible' && <small>Cette étape sera activée avec le futur agent {catalog.label}.</small>}</div></li>)}</ol></div>
      <div className="panel guide-resources"><span className="eyebrow">Ressources</span><h3>Documentation constructeur</h3><p>Consultez la documentation officielle avant de préparer certificats, comptes et appareils.</p><a className="icon-text" href={guide.source} target="_blank" rel="noreferrer"><ExternalLink size={16} />Ouvrir la documentation</a><Link className="secondary-button" href="/agent"><Download size={16} />Voir les agents MDM</Link><span><CheckCircle2 size={16} />La configuration MyMDM conserve la plateforme sélectionnée.</span></div>
    </section>
  </Layout>;
}

