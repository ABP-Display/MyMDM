import { Apple, Smartphone } from 'lucide-react';

export const platformCatalog = {
  android: { label: 'Android', short: 'Android', Icon: Smartphone, color: '#3f8f75', formats: '.apk', management: 'Appareil dédié / Device Owner' },
  ios: { label: 'iOS / iPadOS', short: 'iOS', Icon: Apple, color: '#65727b', formats: '.ipa', management: 'Appareil supervisé' },
};

export const platformIds = ['android'];
export const enrollmentPlatformIds = ['android', 'ios'];

export function PlatformIcon({ platform = 'android', size = 20 }) {
  const { Icon } = platformCatalog[platform] || platformCatalog.android;
  return <Icon size={size} />;
}

export function PlatformBadge({ platform = 'android' }) {
  const item = platformCatalog[platform] || platformCatalog.android;
  const Icon = item.Icon;
  return <span className={`platform-badge platform-${platform}`}><Icon size={14} />{item.short}</span>;
}
