import { Link, usePage } from '@inertiajs/react';
import { ArrowLeft, CheckCircle2, Download, ExternalLink, ShieldCheck } from 'lucide-react';
import Layout from './Layout';
import { PlatformIcon, platformCatalog } from './Platform';

const guides = {
  android: {
    status: 'Available',
    intro: 'Android Enterprise QR provisioning with MyMDM as Device Owner.',
    steps: ['Create an Android configuration.', 'Generate or display its permanent QR code.', 'Factory reset the device, then tap the welcome screen six times.', 'Scan the QR code and complete the administrator permissions.'],
    source: 'https://developer.android.com/work/dpc/dedicated-devices',
  },

};

export default function PlatformGuide() {
  const platform = usePage().url.split('/').filter(Boolean).pop();
  const catalog = platformCatalog[platform] || platformCatalog.android;
  const guide = guides[platform] || guides.android;

  if (platform === 'ios') return <Layout title="iOS / iPadOS"><section className="panel empty-state"><PlatformIcon platform="ios" size={34} /><h2>iOS / iPadOS</h2><p role="status">Unavailable</p></section></Layout>;

  return <Layout title={`${catalog.label} guide`}>
    <Link className="back-link" href="/configurations"><ArrowLeft size={16} />Back to configurations</Link>
    <section className="platform-guide-hero panel" style={{ '--platform-color': catalog.color }}>
      <span className={`platform-guide-icon platform-${platform}`}><PlatformIcon platform={platform} size={32} /></span>
      <div><span className="eyebrow"><ShieldCheck size={15} />Deployment instructions</span><h2>{catalog.label}</h2><p>{guide.intro}</p></div>
      <span className={`status-pill ${guide.status === 'Available' ? 'online' : 'offline'}`}>{guide.status}</span>
    </section>
    <section className="platform-guide-grid">
      <div className="panel"><div className="section-heading"><div><span className="eyebrow">Steps</span><h3>Prepare enrollment</h3></div></div><ol className="guide-steps">{guide.steps.map((step, index) => <li key={step}><span>{index + 1}</span><div><strong>{step}</strong>{index === guide.steps.length - 1 && guide.status !== 'Available' && <small>This step will be enabled when the agent is available for {catalog.label}.</small>}</div></li>)}</ol></div>
      <div className="panel guide-resources"><span className="eyebrow">Resources</span><h3>Manufacturer documentation</h3><p>Consult the official documentation before preparing certificates, accounts and devices.</p><a className="icon-text" href={guide.source} target="_blank" rel="noreferrer"><ExternalLink size={16} />Open documentation</a><Link className="secondary-button" href="/agent"><Download size={16} />View MDM agents</Link><span><CheckCircle2 size={16} />The MyMDM configuration preserves the selected platform.</span></div>
    </section>
  </Layout>;
}

