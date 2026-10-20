import { Ban, CheckCircle2, Clock3, TriangleAlert, Wifi, WifiOff } from 'lucide-react';

const ONLINE_WINDOW_MS = 7 * 60 * 1000;

export function isOnline(device, now = Date.now()) {
  if (device.status === 'Revoked') return false;
  const timestamp = device.last_seen_at ? new Date(device.last_seen_at).getTime() : Number.NaN;
  return Number.isFinite(timestamp) && Math.max(0, now - timestamp) < ONLINE_WINDOW_MS;
}

export function ConnectivityStatus({ device }) {
  if (device.status === 'Revoked') {
    return <span className="status-pill revoked"><Ban size={14} />Revoked</span>;
  }

  return isOnline(device)
    ? <span className="status-pill online"><Wifi size={14} />Online</span>
    : <span className="status-pill offline"><WifiOff size={14} />Offline</span>;
}

export default function SyncStatus({ device }) {
  const state = device.sync_state || 'pending';
  const content = {
    synchronized: [<CheckCircle2 key="icon" size={14} />, 'Synced'],
    pending: [<Clock3 key="icon" size={14} />, 'Pending sync'],
    not_synchronized: [<TriangleAlert key="icon" size={14} />, 'Out of sync'],
  }[state];

  return <span className={`status-pill management-sync-${state}`} title={state === 'not_synchronized' ? `No activity for more than ${device.non_sync_threshold_hours || 24} hours` : undefined}>{content}</span>;
}
