import { useState } from 'react';
import Layout from './Layout';
import { PlatformIcon, enrollmentPlatformIds, platformCatalog } from './Platform';

export function PlatformUnavailable() {
  return <section className="panel platform-unavailable" role="status">
    <span className="unavailable-icon"><PlatformIcon platform="ios" size={32} /></span>
    <span className="eyebrow">iOS / iPadOS</span>
    <h2>Unavailable</h2>
    <p>iOS device management is not yet available in MyMDM.</p>
  </section>;
}

export default function PlatformWorkspace({ title, children }) {
  const [platform, setPlatform] = useState('android');

  return <Layout title={title}>
    <div className="platform-tabs" role="tablist" aria-label={`Platform · ${title}`}>
      {enrollmentPlatformIds.map((id) => <button id={`workspace-tab-${id}`} aria-controls={`workspace-panel-${id}`} type="button" role="tab" aria-selected={platform === id} className={platform === id ? 'active' : ''} key={id} onClick={() => setPlatform(id)}><PlatformIcon platform={id} />{platformCatalog[id].label}{id === 'ios' && <small>Unavailable</small>}</button>)}
    </div>
    <div id="workspace-panel-android" role="tabpanel" aria-labelledby="workspace-tab-android" hidden={platform !== 'android'}>{children}</div>
    <div id="workspace-panel-ios" role="tabpanel" aria-labelledby="workspace-tab-ios" hidden={platform !== 'ios'}><PlatformUnavailable /></div>
  </Layout>;
}
