'use strict';

const paths = {
  overview: '<path d="M3 13a9 9 0 1 1 18 0v6H3z"/><path d="m12 13 4-4M7 17h10"/>',
  devices: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 5h4m-3 14h2"/>',
  enrollments: '<path d="M3 3h6v6H3zm12 0h6v6h-6zM3 15h6v6H3zm12 0h2v2h-2zm4 0h2v6h-6v-2"/>',
  configurations: '<path d="m9 3 1-1h4l1 3 3 1 3 1v4l-2 2-1 3-1 3h-4l-2-2-3-1-3-1v-4l2-2 1-3z"/><circle cx="12" cy="11" r="3"/>',
  library: '<path d="m12 2 9 5-9 5-9-5zm-9 5v10l9 5 9-5V7M12 12v10M7 5l10 5"/>',
  agent: '<path d="m12 2 9 5v10l-9 5-9-5V7zm-9 5 9 5 9-5M12 12v10M7 5l10 5"/>',
  settings: '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM9 3h6l1 3 3 1 2 3v4l-3 2-1 3-3 2h-4l-2-3-3-1-2-3v-4l3-2z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  refresh: '<path d="M20 7a9 9 0 1 0 1 8M20 3v5h-5"/>',
  wifi: '<path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0m-10 4a5 5 0 0 1 6 0"/><circle cx="12" cy="20" r="1"/>',
  offline: '<path d="m3 3 18 18M2 8a16 16 0 0 1 3-2m4-2a16 16 0 0 1 13 4M5 12a11 11 0 0 1 5-2m4 0a11 11 0 0 1 5 2m-10 4a5 5 0 0 1 6 0"/><circle cx="12" cy="20" r="1"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  cpu: '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 1v4m6-4v4M9 19v4m6-4v4M1 9h4m-4 6h4m14-6h4m-4 6h4M9 9h6v6H9z"/>',
  memory: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
  storage: '<path d="m5 3-3 12v5h20v-5L19 3zM2 15h20m-5 3h1"/>',
  apple: '<path d="M12 7c-3-3-8-1-8 5 0 5 3 10 6 9l2-1 2 1c3 1 5-3 6-6-4-2-4-5-1-7-2-3-5-2-7-1zM12 6c0-3 2-5 4-5 0 3-1 5-4 5z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  shield: '<path d="m12 2 8 3v7c0 5-8 10-8 10S4 17 4 12V5z"/><path d="m8 11 3 3 5-6"/>',
  users: '<circle cx="9" cy="7" r="4"/><path d="M2 21v-3c0-6 14-6 14 0v3m0-18c6 0 6 8 1 8m2 3c3 1 3 4 3 7"/>',
  building: '<path d="M4 22V3h12v19M2 22h20m-6-12h5v12M7 7h2m3 0h1m-6 4h2m3 0h1m-6 4h2m3 0h1M8 22v-4h4v4"/>',
  file: '<path d="M5 2h9l5 5v15H5zM14 2v6h5M8 12h8m-8 4h8"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M3 15v6h18v-6"/>',
  download: '<path d="M12 3v13m-5-5 5 5 5-5M3 17v4h18v-4"/>',
  edit: '<path d="m15 3 6 6-12 12H3v-6zM12 6l6 6"/>',
  battery: '<rect x="2" y="6" width="17" height="12" rx="2"/><path d="M22 10v4M5 9h9v6H5z"/>',
  lock: '<rect x="4" y="10" width="16" height="12" rx="3"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v3"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.devices}</svg>`;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const organizationNames = { default: 'Default', north: 'Northwind Retail', campus: 'Westbridge Campus' };
const navigation = [['overview', 'Overview'], ['devices', 'Devices'], ['enrollments', 'Enrollments'], ['configurations', 'Configurations'], ['library', 'Library'], ['agent', 'MDM agent'], ['settings', 'Settings']];
const sampleDevices = [
  ['d1', 'Reception tablet', 'Samsung', 'Galaxy Tab A9+', '14', 'default', 'Reception', true, true, 92, 18, 34, 28, 'Welcome desk', 'launcher'],
  ['d2', 'Meeting room · Atlas', 'Lenovo', 'Tab M11', '14', 'default', 'Meeting rooms', true, true, 78, 24, 41, 36, 'Meeting rooms', 'web'],
  ['d3', 'Visitor check-in', 'Samsung', 'Galaxy Tab Active4 Pro', '13', 'default', 'Reception', true, false, 66, 32, 48, 43, 'Welcome desk', 'launcher'],
  ['d4', 'Warehouse scanner 01', 'Zebra', 'TC52', '11', 'default', 'Warehouse', true, true, 84, 14, 29, 24, 'Warehouse operations', 'app'],
  ['d5', 'Warehouse scanner 02', 'Zebra', 'TC52', '11', 'default', 'Warehouse', false, false, 31, 12, 31, 26, 'Warehouse operations', 'app'],
  ['d6', 'Training tablet 01', 'Lenovo', 'Tab M10', '13', 'default', 'Training', true, true, 95, 21, 37, 32, 'Training tablets', 'launcher'],
  ['d7', 'Training tablet 02', 'Lenovo', 'Tab M10', '13', 'default', 'Training', true, true, 88, 16, 33, 30, 'Training tablets', 'launcher'],
  ['d8', 'Lobby display', 'Samsung', 'Galaxy Tab S9 FE', '14', 'default', 'Reception', false, true, 22, 15, 35, 21, 'Welcome desk', 'web'],
  ['n1', 'Store 01 · Checkout', 'Samsung', 'Galaxy Tab A9+', '14', 'north', 'Checkout', true, true, 100, 22, 45, 38, 'Retail checkout', 'app'],
  ['n2', 'Store 01 · Catalog', 'Lenovo', 'Tab M11', '14', 'north', 'Sales floor', true, true, 81, 28, 39, 32, 'Product catalog', 'web'],
  ['n3', 'Store 02 · Checkout', 'Samsung', 'Galaxy Tab A9+', '14', 'north', 'Checkout', false, false, 47, 17, 38, 27, 'Retail checkout', 'app'],
  ['c1', 'Library kiosk', 'Samsung', 'Galaxy Tab S9 FE', '14', 'campus', 'Library', true, true, 90, 19, 43, 39, 'Campus information', 'web'],
  ['c2', 'Lecture hall 01', 'Lenovo', 'Tab M11', '14', 'campus', 'Classrooms', true, true, 87, 27, 48, 35, 'Classroom tablets', 'launcher'],
  ['c3', 'Lecture hall 02', 'Lenovo', 'Tab M11', '14', 'campus', 'Classrooms', true, false, 63, 25, 44, 33, 'Classroom tablets', 'launcher'],
];
const initialDevices = () => sampleDevices.map(([id, name, manufacturer, model, android, organization, group, online, synced, battery, cpu, memory, storage, profile, kiosk]) => ({ id, name, manufacturer, model, android, organization, group, online, synced, battery, cpu, memory, storage, profile, kiosk }));
const initialProfiles = () => [
  { id: 'p1', name: 'Welcome desk', kiosk: 'launcher', orientation: 'portrait', sync: '5', wifi: 'MyMDM Guest', linked: 3 },
  { id: 'p2', name: 'Meeting rooms', kiosk: 'web', orientation: 'landscape', sync: '5', wifi: 'MyMDM Office', linked: 1 },
  { id: 'p3', name: 'Warehouse operations', kiosk: 'app', orientation: 'portrait', sync: '15', wifi: 'MyMDM Operations', linked: 2 },
  { id: 'p4', name: 'Training tablets', kiosk: 'launcher', orientation: 'auto', sync: '5', wifi: 'MyMDM Office', linked: 2 },
];
const state = {
  devices: initialDevices(), profiles: initialProfiles(), organization: 'default', platform: 'android', selectedProfile: 'p1', search: '', connectivity: 'all', group: 'all', qrVersion: 1,
  releases: [
    { version: '0.4.4-dev', build: 44, size: '9.9 MB', status: 'Active' },
    { version: '0.4.3-dev', build: 43, size: '9.7 MB', status: 'Archived' },
  ],
  assets: [
    { id: 'a1', name: 'Company Portal', package: 'com.example.portal', version: '2.4.0', size: '18.6 MB', type: 'Application' },
    { id: 'a2', name: 'Visitor Check-in', package: 'com.example.checkin', version: '1.8.2', size: '12.3 MB', type: 'Application' },
    { id: 'a3', name: 'Employee handbook', package: 'employee-handbook.pdf', version: '2026 edition', size: '2.8 MB', type: 'Document' },
    { id: 'a4', name: 'Warehouse Scanner', package: 'com.example.scanner', version: '3.1.0', size: '24.1 MB', type: 'Application' },
  ],
  users: [
    { id: 'u1', name: 'Alex Morgan', email: 'alex@example.test', admin: true, active: true, access: {} },
    { id: 'u2', name: 'Jordan Lee', email: 'jordan@example.test', admin: false, active: true, access: { default: ['view', 'update', 'commands'], north: ['view'] } },
    { id: 'u3', name: 'Taylor Reed', email: 'taylor@example.test', admin: false, active: false, access: { campus: ['view'] } },
  ],
};
const page = document.getElementById('page');
const modal = document.getElementById('modal');
let toastTimer;
const fleet = () => state.devices.filter((device) => device.organization === state.organization);
const average = (metric) => { const devices = fleet(); return devices.length ? Math.round(devices.reduce((sum, device) => sum + device[metric], 0) / devices.length) : 0; };
const kioskName = (type) => ({ launcher: 'Launcher kiosk', web: 'Web kiosk', app: 'Single application' })[type] || 'No kiosk';
const status = (device) => `<span class="pill ${device.online ? 'online' : 'offline'}">${icon(device.online ? 'wifi' : 'offline')}${device.online ? 'Online' : 'Offline'}</span>`;
const heading = (eyebrow, title, extra = '') => `<div class="heading"><div>${eyebrow ? `<span class="eyebrow">${eyebrow}</span>` : ''}<h3>${title}</h3></div>${extra}</div>`;
const hero = (eyebrow, title, description, button = '') => `<section class="hero"><div><span class="eyebrow">${eyebrow}</span><h2>${title}</h2><p>${description}</p></div>${button}</section>`;
const button = (label, action, symbol = 'plus', cls = 'primary', extra = '') => `<button type="button" class="${cls}" data-action="${action}" ${extra}>${icon(symbol)}${label}</button>`;
const platformTabs = () => `<div class="platform-tabs" role="tablist" aria-label="Operating system"><button role="tab" id="tab-android" aria-controls="platform-content" aria-selected="${state.platform === 'android'}" data-action="platform" data-platform="android">${icon('devices')}Android</button><button role="tab" id="tab-ios" aria-controls="platform-content" aria-selected="${state.platform === 'ios'}" data-action="platform" data-platform="ios">${icon('apple')}iOS / iPadOS <span class="pill">Unavailable</span></button></div>`;
const unavailable = () => `<section class="unavailable unavailable-page"><span class="square-icon">${icon('apple')}</span><span class="eyebrow">iOS / iPadOS</span><h2>Unavailable</h2><p>iOS device management is not yet available in MyMDM.</p></section>`;
function platformPage(content) { return `${platformTabs()}<div id="platform-content" role="tabpanel" aria-labelledby="tab-${state.platform}">${state.platform === 'ios' ? unavailable() : content}</div>`; }
function resourceCard(title, metric, symbol, color) {
  const value = average(metric), values = fleet().map((device) => device[metric]);
  return `<article class="panel">${heading(`${values.length} samples`, title, `<span class="square-icon" style="color:${color}">${icon(symbol)}</span>`)}<div class="resource-body"><div class="ring" style="--value:${value};--ring-color:${color}" role="img" aria-label="${title}: ${value}%"><strong>${value}%</strong></div><div class="range"><span>Minimum<b>${values.length ? Math.min(...values) : 0}%</b></span><span>Maximum<b>${values.length ? Math.max(...values) : 0}%</b></span></div></div></article>`;
}
function deviceRow(device) { return `<a class="device-row" href="#devices/${device.id}"><span class="square-icon">${icon('devices')}</span><div class="device-name"><strong>${esc(device.name)}</strong><small>${esc(device.model)} · Android ${device.android}</small></div>${status(device)}<small>${device.online ? '2 min ago' : '3 hours ago'}</small></a>`; }
function overview() {
  const devices = fleet(), online = devices.filter((device) => device.online).length, synced = devices.filter((device) => device.synced).length;
  return `${hero(`${icon('overview')}Fleet status`, 'Manage your devices from one place', 'Monitor devices, prepare configurations and distribute MyMDM updates.', button('Refresh', 'refresh', 'refresh', 'secondary'))}
    <section class="overview-top"><article class="panel fleet-total"><span class="eyebrow">Total fleet</span><div class="total-value"><span class="square-icon">${icon('devices')}</span><strong>${devices.length}</strong></div><p>managed devices</p><div class="health"><span>${online} online</span><span>${devices.length - online} offline</span><span>${synced} synced today</span></div></article><article class="panel">${heading('Distribution', 'Fleet platforms')}<div class="platform-gauges"><div class="gauge"><div class="gauge-arc">${icon('devices')}</div><strong>${devices.length}</strong><b>Android</b><small>100% of ${devices.length} devices</small></div><div class="unavailable">${icon('apple')}<strong>iOS / iPadOS</strong><span class="pill">Unavailable</span></div></div></article></section>
    <section class="stats-grid">${[['Online devices', online, 'wifi'], ['Offline devices', devices.length - online, 'offline'], ['Synced devices', synced, 'check'], ['Out-of-sync devices', devices.length - synced, 'clock']].map(([label, value, symbol]) => `<article class="panel stat"><span class="square-icon">${icon(symbol)}</span><div><small>${label}</small><strong>${value}</strong></div></article>`).join('')}</section>
    <section class="resource-cards">${resourceCard('CPU usage', 'cpu', 'cpu', '#ad7418')}${resourceCard('Memory usage', 'memory', 'memory', '#b58349')}${resourceCard('Storage usage', 'storage', 'storage', '#986a5a')}</section>
    <section class="panel">${heading('Resources', 'Average usage by platform', '<small>Latest reported metrics</small>')}<div class="resource-platform-grid"><article class="platform-resource"><div class="heading"><div>${icon('devices')}<strong>Android</strong></div><small>${devices.length} devices</small></div>${[['CPU', 'cpu'], ['RAM', 'memory'], ['Storage', 'storage']].map(([label, metric]) => `<div class="bar-row"><span>${label}</span><div class="bar"><i style="--value:${average(metric)}%"></i></div><b>${average(metric)}%</b></div>`).join('')}</article><article class="platform-resource unavailable">${icon('apple')}<strong>iOS / iPadOS</strong><span class="pill">Unavailable</span><p>Resource monitoring for iOS and iPadOS is not available yet.</p></article></div></section>
    <section class="dashboard-bottom"><article class="panel">${heading('Recent activity', 'Recent devices', '<a class="secondary" href="#devices">View fleet</a>')}<div class="activity-list">${devices.slice(0, 4).map(deviceRow).join('') || '<p class="empty">No devices enrolled.</p>'}</div></article><article class="panel">${heading('Quick access', 'Common actions')}<div class="quick-links">${[['configurations', 'shield', 'Create a configuration', 'Prepare an Android policy'], ['enrollments', 'enrollments', 'Show a QR code', 'Enroll an Android device'], ['agent', 'agent', 'Publish an agent', 'Manage Android releases']].map(([route, symbol, title, subtitle]) => `<a class="quick-link" href="#${route}"><span class="square-icon">${icon(symbol)}</span><div><strong>${title}</strong><small>${subtitle}</small></div></a>`).join('')}</div></article></section>`;
}
function devicesPage() {
  const groups = [...new Set(fleet().map((device) => device.group))];
  return `<section class="panel mb">${heading('Selected fleet', 'Search devices', button('Refresh', 'refresh', 'refresh', 'secondary'))}<p class="section-description mb">Filter your fleet, then open a device to explore its details.</p><div class="toolbar"><label class="search">Search<input id="device-search" type="search" placeholder="Name, manufacturer or model…" value="${esc(state.search)}"></label><label>Status<select id="device-status"><option value="all">All devices</option><option value="online" ${state.connectivity === 'online' ? 'selected' : ''}>Online</option><option value="offline" ${state.connectivity === 'offline' ? 'selected' : ''}>Offline</option><option value="pending" ${state.connectivity === 'pending' ? 'selected' : ''}>Out of sync</option></select></label><label>Group<select id="device-group"><option value="all">All groups</option>${groups.map((group) => `<option ${state.group === group ? 'selected' : ''}>${esc(group)}</option>`).join('')}</select></label></div><small id="device-count"></small></section><div class="device-grid" id="device-grid"></div>`;
}
function renderDeviceCards() {
  const devices = fleet().filter((device) => `${device.name} ${device.manufacturer} ${device.model}`.toLowerCase().includes(state.search.toLowerCase()) && (state.group === 'all' || device.group === state.group) && (state.connectivity === 'all' || (state.connectivity === 'pending' ? !device.synced : device.online === (state.connectivity === 'online'))));
  document.getElementById('device-count').textContent = `${devices.length} device${devices.length === 1 ? '' : 's'} in ${organizationNames[state.organization]}`;
  document.getElementById('device-grid').innerHTML = devices.map((device) => `<a class="panel device-card" href="#devices/${device.id}"><div class="heading"><span class="square-icon">${icon('devices')}</span>${status(device)}</div><div><h3>${esc(device.name)}</h3><small>${esc(device.manufacturer)} ${esc(device.model)}</small></div><div class="facts"><span>Operating system<b>Android ${device.android}</b></span><span>Group<b>${esc(device.group)}</b></span><span>Kiosk mode<b>${kioskName(device.kiosk)}</b></span><span>Battery<b>${device.battery}%</b></span></div><div class="card-footer"><span class="pill ${device.synced ? 'synced' : 'pending'}">${device.synced ? 'Synchronized' : 'Pending sync'}</span><span>Agent 0.4.4 ${icon('arrow')}</span></div></a>`).join('') || '<div class="panel empty">No devices match these filters.</div>';
}
function deviceDetail(id) {
  const device = fleet().find((item) => item.id === id);
  if (!device) return `<div class="panel empty"><h2>Device not found</h2><p>This device is not part of the selected organization.</p><a class="secondary" href="#devices">Back to devices</a></div>`;
  return `<a class="back-link" href="#devices">${icon('back')}All devices</a><header class="device-hero"><span class="square-icon">${icon('devices')}</span><div><h2>${esc(device.name)}</h2><p>${esc(device.manufacturer)} ${esc(device.model)} · Android ${device.android} · ${esc(device.group)}</p></div>${status(device)}${button('Refresh', 'refresh', 'refresh', 'secondary')}</header><section class="device-detail-stats">${[['CPU usage', 'cpu', '#ad7418'], ['Memory usage', 'memory', '#b58349'], ['Storage usage', 'storage', '#986a5a']].map(([title, metric, color]) => `<article class="panel">${heading('Device metrics', title)}<div class="resource-body"><div class="ring" style="--value:${device[metric]};--ring-color:${color}"><strong>${device[metric]}%</strong></div></div></article>`).join('')}</section><section class="detail-grid"><article class="panel">${heading('Display', 'Kiosk screenshot', '<span class="pill">Illustration</span>')}<div class="phone-preview"><div class="phone"><img src="./mymdm-logo.svg" alt=""><strong>Welcome</strong><small>${esc(organizationNames[device.organization])}</small><div class="phone-apps"><span>${icon('library')}</span><span>${icon('file')}</span><span>${icon('shield')}</span><span>${icon('settings')}</span></div></div></div><small>Illustrative kiosk preview · no live screenshot</small></article><article class="panel">${heading('Inventory', 'Device identity')}<dl class="definition"><dt>Organization</dt><dd>${esc(organizationNames[device.organization])}</dd><dt>Serial number</dt><dd class="mono">DEMO-${esc(device.id.toUpperCase())}-00842</dd><dt>Battery</dt><dd>${device.battery}%</dd><dt>Agent version</dt><dd>0.4.4-dev · build 44</dd><dt>Configuration</dt><dd>${esc(device.profile)}</dd><dt>Device Owner</dt><dd><span class="pill online">Active</span></dd><dt>Policy status</dt><dd>${device.synced ? 'Applied · revision 12' : 'Pending · revision 12'}</dd></dl><div class="detail-actions">${button('Edit device', 'edit-device', 'edit', 'secondary', `data-id="${device.id}"`)}${button('Simulate synchronization', 'sync-device', 'refresh', 'secondary', `data-id="${device.id}"`)}${button('Simulate agent update', 'update-agent', 'download', 'secondary', `data-id="${device.id}"`)}</div></article></section>`;
}
function demoQr() {
  let cells = '';
  const finder = (x, y) => `<rect x="${x}" y="${y}" width="7" height="7" fill="#594735"/><rect x="${x + 1}" y="${y + 1}" width="5" height="5" fill="white"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3" fill="#594735"/>`;
  for (let y = 0; y < 25; y++) for (let x = 0; x < 25; x++) {
    if ((x < 8 && y < 8) || (x > 16 && y < 8) || (x < 8 && y > 16)) continue;
    if (((x * 13 + y * 7 + x * y + state.qrVersion * 3) % 11) < 5) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
  }
  return `<svg class="demo-qr" viewBox="-1 -1 27 27" role="img" aria-label="Illustrative demo QR pattern, cannot enroll a real device" shape-rendering="crispEdges" fill="#594735">${cells}${finder(0, 0)}${finder(18, 0)}${finder(0, 18)}</svg>`;
}
function enrollmentsPage() {
  return platformPage(`${hero(`${icon('enrollments')}Android enrollment`, 'From a new device to a managed fleet', 'Prepare a configuration and enroll Android devices with a QR code. Explore the workflow below.')}
    <div class="two-columns mb"><section class="panel">${heading('Get started', 'Prepare enrollment')}<div class="form-stack"><label>Configuration<select id="enrollment-profile">${state.profiles.map((profile) => `<option>${esc(profile.name)}</option>`).join('')}</select></label><div class="enrollment-steps">${[['Prepare your device', 'Start with a factory-reset Android device.'], ['Open QR enrollment', 'On the welcome screen, tap six times to launch the QR scanner.'], ['Scan and connect', 'The device downloads the MyMDM agent and applies its configuration.']].map(([title, description], index) => `<div class="step"><span class="step-number">${index + 1}</span><div><strong>${title}</strong><p>${description}</p></div></div>`).join('')}</div>${button('Simulate a new enrollment', 'enroll', 'plus')}<small>This adds a fictional tablet to the selected organization.</small></div></section><section class="panel">${heading('Enrollment preview', 'Configuration QR code', '<span class="pill">Illustration only</span>')}<div class="qr-stage">${demoQr()}<strong id="qr-profile">${esc(state.profiles[0]?.name || 'Demo configuration')}</strong><div class="enrollment-info"><span class="pill online">Permanent QR</span><span class="pill">Android Device Owner</span></div><p>This is a decorative demo pattern. It cannot enroll a real device or contact a server.</p>${button('Regenerate preview', 'regenerate-qr', 'refresh', 'secondary')}</div></section></div><section class="panel">${heading('History', 'Recent enrollments')}<div class="table-wrap"><table><thead><tr><th>Device</th><th>Configuration</th><th>Status</th><th>Enrolled</th></tr></thead><tbody>${fleet().slice(0, 4).map((device, index) => `<tr><td>${esc(device.name)}</td><td>${esc(device.profile)}</td><td><span class="pill synced">Completed</span></td><td>${index + 1} day${index ? 's' : ''} ago</td></tr>`).join('')}</tbody></table></div></section>`);
}
function configurationsPage() {
  const profile = state.profiles.find((item) => item.id === state.selectedProfile) || state.profiles[0];
  const options = (items, selected) => items.map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
  return platformPage(`${hero(`${icon('configurations')}Reusable profiles`, 'Prepare a device, manage your fleet', 'Choose the enrollment agent, then customize the profile. Linked devices will follow its updates.', button('New configuration', 'new-profile', 'plus'))}<div class="config-layout"><aside class="panel config-list">${heading('Android', 'Your configurations')} ${state.profiles.map((item) => `<button class="config-choice ${item.id === profile.id ? 'selected' : ''}" data-action="select-profile" data-id="${item.id}"><strong>${esc(item.name)}</strong><small>${item.linked} linked devices · ${kioskName(item.kiosk)}</small><small>Permanent QR code</small></button>`).join('')}</aside><form class="panel composer" id="profile-form">${heading('Edit profile', esc(profile.name), '<span class="pill">Android</span>')}<div class="composer-fields"><section class="inset"><h4>Enrollment</h4><p>The essential information needed to prepare enrollment.</p><label>Configuration name<input name="name" required maxlength="100" value="${esc(profile.name)}"></label><label>Enrollment agent<select name="agent"><option>Active agent · 0.4.4-dev · build 44</option><option>Bundled Android build</option></select></label><p>The agent and Wi-Fi settings are saved with the enrollment QR code.</p></section><span class="eyebrow">Profile options</span><details open><summary>Kiosk mode and content</summary><div class="details-body"><label>Kiosk mode<select name="kiosk">${options([['launcher', 'Launcher kiosk'], ['web', 'Web kiosk'], ['app', 'Single application']], profile.kiosk)}</select></label><label>Start page<input type="url" name="url" value="${esc(profile.url || 'https://example.com')}" aria-describedby="demo-url-note"></label><small id="demo-url-note">Example URL only. No requests are sent.</small></div></details><details><summary>Display and sound</summary><div class="details-body"><label>Orientation<select name="orientation">${options([['portrait', 'Portrait'], ['landscape', 'Landscape'], ['auto', 'Automatic']], profile.orientation)}</select></label><label class="check"><input type="checkbox" name="keepOn" ${profile.keepOn !== false ? 'checked' : ''}>Keep the screen on</label><label>Media volume<input name="volume" type="range" min="0" max="100" value="${profile.volume ?? 50}"></label></div></details><details><summary>Enrollment Wi-Fi</summary><div class="details-body"><label>Network name<input name="wifi" maxlength="32" value="${esc(profile.wifi)}"></label><p>Only sample network names are shown. The demo does not store network credentials.</p></div></details><details><summary>Synchronization</summary><div class="details-body"><label>Sync interval<select name="sync">${options([['1', 'Every minute'], ['5', 'Every 5 minutes'], ['15', 'Every 15 minutes'], ['60', 'Every hour']], profile.sync)}</select></label></div></details><div class="actions save-bar"><small>Changes affect demo data only</small><button type="submit" class="primary">${icon('check')}Save profile</button></div></div></form></div>`);
}
function libraryPage() {
  return platformPage(`${hero(`${icon('library')}Managed content`, 'Applications and files', 'Prepare applications and files for your Android devices.', button('Add demo item', 'new-asset', 'upload'))}<div class="library-grid">${state.assets.map((asset) => `<article class="panel asset-card"><span class="square-icon">${icon(asset.type === 'Document' ? 'file' : 'agent')}</span><div><h3>${esc(asset.name)}</h3><p>${esc(asset.package)}</p><div class="asset-meta"><span class="pill">${esc(asset.type)}</span><small>${esc(asset.version)} · ${esc(asset.size)}</small></div></div>${button('', 'asset-info', 'info', 'icon-button', `data-id="${esc(asset.id)}" aria-label="Details for ${esc(asset.name)}"`)}</article>`).join('')}</div>`);
}
function agentPage() {
  return platformPage(`${hero(`${icon('shield')}Android distribution`, 'Manage MyMDM agents', 'Manage Android agent releases. Devices receive updates when you send an update command.', button('Refresh', 'refresh', 'refresh', 'secondary'))}<div class="two-columns"><section class="panel">${heading('Target agent · Android', 'Available release', '<span class="pill online">Active</span>')}<div class="release-version"><span class="square-icon">${icon('agent')}</span><div><strong>0.4.4-dev</strong><small>Build 44</small></div></div><dl class="definition"><dt>Source</dt><dd>Bundled Android build</dd><dt>File</dt><dd>mymdm-agent.apk</dd><dt>Size</dt><dd>9.9 MB</dd><dt>Package ID</dt><dd class="mono">org.mymdm.agent</dd><dt>Checksum</dt><dd class="mono">6c620d04…574 (sample)</dd></dl>${button('Preview download', 'demo-download', 'download', 'secondary')}<p class="section-description" style="margin-top:14px">No application packages are included in this static demo.</p></section><section class="panel">${heading('New release · Android', 'Upload an agent')}<div class="form-stack"><label>Version name<input id="release-version" value="0.4.5" maxlength="40"></label><label>Build number<input id="release-build" type="number" min="45" value="45"></label><div class="inset"><span class="square-icon">${icon('upload')}</span><h4>Try the release workflow</h4><p>No file is uploaded. MyMDM checks signatures, package IDs and build numbers in the real console.</p></div>${button('Simulate a release upload', 'upload-release', 'upload')}</div></section></div><section class="panel release-history">${heading('History · Android', 'Uploaded releases')}<div class="table-wrap"><table><thead><tr><th>Version</th><th>Build</th><th>Size</th><th>Status</th></tr></thead><tbody id="release-list">${state.releases.map((release) => `<tr><td>${esc(release.version)}</td><td>${esc(release.build)}</td><td>${esc(release.size)}</td><td><span class="pill ${release.status === 'Active' ? 'online' : 'pending'}">${esc(release.status)}</span></td></tr>`).join('')}</tbody></table></div></section>`);
}
function settingsPage() {
  return `${hero(`${icon('settings')}Administration`, 'Organizations, users and groups', 'Organize your fleet and control who can view, edit or manage each organization.')}<section class="panel settings-section">${heading('Organizations', 'Organization management')}<p class="section-description">Switch organizations in the sidebar to explore a different sample fleet.</p>${Object.entries(organizationNames).map(([id, name]) => `<article class="organization-row"><span class="square-icon">${icon('building')}</span><div><strong>${esc(name)}</strong><small>${state.devices.filter((device) => device.organization === id).length} devices · out of sync after 24 h</small></div>${state.organization === id ? '<span class="pill synced">Selected</span>' : button('Select', 'select-organization', 'arrow', 'secondary', `data-id="${id}"`)}</article>`).join('')}</section><section class="panel settings-section">${heading('Users and access', 'User management', button('New user', 'new-user', 'plus'))}<p class="section-description">Assign organization permissions to demo users. All names and email addresses are fictional.</p>${state.users.map((user) => `<article class="user-row"><span class="square-icon">${icon('users')}</span><div><strong>${esc(user.name)}</strong><small>${esc(user.email)}</small><small>${user.admin ? 'Administrator · all organizations' : Object.keys(user.access).map((id) => esc(organizationNames[id])).join(', ') || 'No organization access'}</small></div><span class="pill ${user.active ? 'synced' : 'disabled'}">${user.active ? 'Active' : 'Disabled'}</span>${button('', 'edit-user', 'edit', 'icon-button', `data-id="${user.id}" aria-label="Edit ${esc(user.name)}"`)}</article>`).join('')}</section><section class="panel">${heading('Groups', `Groups in ${esc(organizationNames[state.organization])}`)}<div class="tag-list">${[...new Set(fleet().map((device) => device.group))].map((group) => `<span class="pill">${esc(group)}</span>`).join('')}</div></section>`;
}
const renderers = { overview, devices: devicesPage, enrollments: enrollmentsPage, configurations: configurationsPage, library: libraryPage, agent: agentPage, settings: settingsPage };
function currentRoute() { return location.hash.slice(1).split('/')[0] || 'overview'; }
function render() {
  const [requestedRoute, id] = location.hash.slice(1).split('/'), route = renderers[requestedRoute] ? requestedRoute : 'overview';
  document.getElementById('page-title').textContent = id && route === 'devices' ? 'Device' : navigation.find(([key]) => key === route)[1];
  document.title = `MyMDM · ${document.getElementById('page-title').textContent} · Demo`;
  document.getElementById('organization').value = state.organization;
  document.getElementById('navigation').innerHTML = navigation.map(([key, label]) => `<a href="#${key}" class="nav-link ${key === route ? 'active' : ''}" ${key === route ? 'aria-current="page"' : ''}>${icon(key)}${label}</a>`).join('');
  page.innerHTML = route === 'devices' && id ? deviceDetail(id) : renderers[route]();
  if (route === 'devices' && !id) renderDeviceCards();
  closeMenu();
}
function toast(message) { const element = document.getElementById('toast'); clearTimeout(toastTimer); element.textContent = message; element.classList.add('toast-visible'); toastTimer = setTimeout(() => element.classList.remove('toast-visible'), 3500); }
function closeMenu() { document.getElementById('sidebar').classList.remove('open'); document.querySelector('.backdrop').hidden = true; document.getElementById('menu-toggle').setAttribute('aria-expanded', 'false'); }
function openModal(title, content) {
  document.getElementById('modal-content').innerHTML = `<div class="heading"><div><span class="eyebrow">Demo workspace</span><h2 id="modal-title">${esc(title)}</h2></div>${button('', 'close-modal', 'close', 'icon-button', 'aria-label="Close dialog"')}</div>${content}`;
  modal.showModal();
}
function userEditor(id) {
  const user = state.users.find((item) => item.id === id) || { name: '', email: '', admin: false, active: true, access: {} };
  openModal(id ? 'Edit user' : 'Create a demo user', `<form id="user-form" class="form-stack" data-id="${id || ''}"><p>Use fictional details only. No account is created and no data leaves this page.</p><div class="form-pair"><label>Name<input name="name" required maxlength="100" value="${esc(user.name)}" placeholder="e.g. Sam Parker"></label><label>Email<input name="email" required type="email" maxlength="150" value="${esc(user.email)}" placeholder="sam@example.test"></label></div><label class="check"><input type="checkbox" name="active" ${user.active ? 'checked' : ''}>Active account</label><label class="check"><input type="checkbox" name="admin" ${user.admin ? 'checked' : ''}>Administrator · full access</label><div id="demo-permissions" class="permissions" ${user.admin ? 'hidden' : ''}><h4>Organization permissions</h4>${Object.entries(organizationNames).map(([organizationId, name]) => `<fieldset class="permission-box"><legend>${esc(name)}</legend><div>${[['view', 'View'], ['create', 'Create groups'], ['update', 'Edit'], ['delete', 'Delete / reset devices'], ['commands', 'Send device commands']].map(([permission, label]) => `<label class="check"><input type="checkbox" name="${organizationId}:${permission}" ${user.access[organizationId]?.includes(permission) ? 'checked' : ''}>${label}</label>`).join('')}</div></fieldset>`).join('')}</div><div class="actions"><button type="button" class="secondary" data-action="close-modal">Cancel</button><button class="primary" type="submit">${icon('check')}Save demo user</button></div></form>`);
}

document.getElementById('menu-toggle').innerHTML = icon('menu');
document.getElementById('notice-icon').innerHTML = icon('info');
document.querySelector('.skip-link').addEventListener('click', (event) => { event.preventDefault(); document.getElementById('content').focus(); document.getElementById('content').scrollIntoView(); });
document.getElementById('menu-toggle').addEventListener('click', () => { const open = document.getElementById('sidebar').classList.toggle('open'); document.querySelector('.backdrop').hidden = !open; document.getElementById('menu-toggle').setAttribute('aria-expanded', String(open)); });
document.querySelector('.backdrop').addEventListener('click', closeMenu);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });
document.getElementById('organization').addEventListener('change', (event) => { state.organization = event.target.value; state.group = 'all'; state.search = ''; state.connectivity = 'all'; if (location.hash.includes('devices/')) location.hash = 'devices'; else render(); toast(`Switched to ${organizationNames[state.organization]}`); });
window.addEventListener('hashchange', () => { state.platform = 'android'; render(); window.scrollTo(0, 0); document.getElementById('content').focus({ preventScroll: true }); });
document.querySelector('.reset-demo').addEventListener('click', () => { location.reload(); });
document.addEventListener('input', (event) => { if (event.target.id === 'device-search') { state.search = event.target.value; renderDeviceCards(); } });
document.addEventListener('change', (event) => {
  if (event.target.id === 'device-status') { state.connectivity = event.target.value; renderDeviceCards(); }
  if (event.target.id === 'device-group') { state.group = event.target.value; renderDeviceCards(); }
  if (event.target.id === 'enrollment-profile') document.getElementById('qr-profile').textContent = event.target.value;
  if (event.target.name === 'admin' && event.target.closest('#user-form')) document.getElementById('demo-permissions').hidden = event.target.checked;
  if (event.target.closest('#demo-permissions') && event.target.checked && !event.target.name.endsWith(':view')) { const organizationId = event.target.name.split(':')[0]; document.querySelector(`[name="${organizationId}:view"]`).checked = true; }
  if (event.target.closest('#demo-permissions') && !event.target.checked && event.target.name.endsWith(':view')) { const organizationId = event.target.name.split(':')[0]; document.querySelectorAll(`[name^="${organizationId}:"]`).forEach((input) => { input.checked = false; }); }
});
document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const { action, id } = target.dataset;
  if (action === 'close-modal') modal.close();
  else if (action === 'refresh') toast('Sample data refreshed. No server connection is required.');
  else if (action === 'platform') { state.platform = target.dataset.platform; render(); document.getElementById(`tab-${state.platform}`).focus(); }
  else if (action === 'select-profile') { state.selectedProfile = id; render(); }
  else if (action === 'new-profile') openModal('New configuration', `<form id="new-profile-form" class="form-stack"><label>Configuration name<input name="name" required maxlength="100" placeholder="e.g. Demo reception"></label><p>Create a sample profile, then explore its settings.</p><div class="actions"><button type="button" class="secondary" data-action="close-modal">Cancel</button><button class="primary" type="submit">Create profile</button></div></form>`);
  else if (action === 'new-user' || action === 'edit-user') userEditor(id);
  else if (action === 'new-asset') openModal('Add a demo library item', `<form id="asset-form" class="form-stack"><p>No file upload is needed. This adds a sample entry to the library.</p><label>Display name<input name="name" required maxlength="100" placeholder="e.g. Demo application"></label><label>Type<select name="type"><option>Application</option><option>Document</option></select></label><div class="actions"><button type="button" class="secondary" data-action="close-modal">Cancel</button><button class="primary" type="submit">Add demo item</button></div></form>`);
  else if (action === 'asset-info') { const asset = state.assets.find((item) => item.id === id); openModal(asset.name, `<dl class="definition"><dt>Type</dt><dd>${esc(asset.type)}</dd><dt>Identifier</dt><dd>${esc(asset.package)}</dd><dt>Version</dt><dd>${esc(asset.version)}</dd><dt>Size</dt><dd>${esc(asset.size)}</dd></dl><p>This is a fictional library entry. No file is hosted or downloaded.</p><div class="actions">${button('Close', 'close-modal', 'check', 'secondary')}</div>`); }
  else if (action === 'select-organization') { state.organization = id; state.group = 'all'; document.getElementById('organization').value = id; render(); toast(`Switched to ${organizationNames[id]}`); }
  else if (action === 'regenerate-qr') { state.qrVersion++; const profile = document.getElementById('enrollment-profile').value; render(); document.getElementById('enrollment-profile').value = profile; document.getElementById('qr-profile').textContent = profile; toast('Illustrative QR preview regenerated.'); }
  else if (action === 'enroll') { const profile = document.getElementById('enrollment-profile').value; const device = { ...state.devices[0], id: `demo-${Date.now()}`, name: `Demo tablet ${fleet().length + 1}`, organization: state.organization, group: 'New devices', profile, synced: true, online: true, battery: 100 }; state.devices.unshift(device); location.hash = `devices/${device.id}`; toast('Fictional Android device enrolled.'); }
  else if (action === 'edit-device') { const device = fleet().find((item) => item.id === id); openModal('Edit device', `<form id="device-form" class="form-stack" data-id="${id}"><label>Device name<input name="name" required maxlength="100" value="${esc(device.name)}"></label><label>Group<input name="group" required maxlength="60" value="${esc(device.group)}"></label><div class="actions"><button type="button" class="secondary" data-action="close-modal">Cancel</button><button class="primary" type="submit">Save changes</button></div></form>`); }
  else if (action === 'sync-device') { const device = fleet().find((item) => item.id === id); device.synced = true; device.online = true; render(); toast('Synchronization simulated. Policy revision 12 applied.'); }
  else if (action === 'update-agent') toast('Agent update command simulated. No real command was sent.');
  else if (action === 'demo-download') toast('Demo only: no APK file is hosted or downloaded.');
  else if (action === 'upload-release') { const version = document.getElementById('release-version'), build = document.getElementById('release-build'); if (!version.value.trim() || !build.reportValidity()) return; state.releases.unshift({ version: version.value.trim(), build: Number(build.value), size: 'Demo artifact', status: 'Simulated upload' }); render(); toast('Release upload simulated. The active agent remains unchanged.'); }
});
document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!['profile-form', 'new-profile-form', 'asset-form', 'user-form', 'device-form'].includes(form.id)) return;
  event.preventDefault();
  const data = new FormData(form);
  if (!String(data.get('name') || '').trim()) { toast('Enter a name before saving.'); form.elements.name.focus(); return; }
  if (form.id === 'profile-form') {
    const profile = state.profiles.find((item) => item.id === state.selectedProfile) || state.profiles[0];
    const previousName = profile.name;
    Object.assign(profile, { name: data.get('name').trim(), kiosk: data.get('kiosk'), orientation: data.get('orientation'), wifi: data.get('wifi'), sync: data.get('sync'), url: data.get('url'), keepOn: data.has('keepOn'), volume: Number(data.get('volume')) });
    state.devices.filter((device) => device.profile === previousName).forEach((device) => { device.profile = profile.name; device.kiosk = profile.kiosk; });
    toast('Demo configuration saved.');
  } else if (form.id === 'new-profile-form') {
    const profile = { id: `p-${Date.now()}`, name: data.get('name').trim(), kiosk: 'launcher', orientation: 'auto', wifi: 'Demo network', sync: '5', linked: 0 };
    state.profiles.push(profile); state.selectedProfile = profile.id; modal.close(); toast('Demo profile created.');
  } else if (form.id === 'asset-form') {
    state.assets.push({ id: `a-${Date.now()}`, name: data.get('name').trim(), type: data.get('type'), package: data.get('type') === 'Document' ? 'demo-document.pdf' : 'com.example.demo', version: '1.0.0', size: '4.2 MB' }); modal.close(); toast('Demo library item added.');
  } else if (form.id === 'user-form') {
    const access = {};
    for (const organizationId of Object.keys(organizationNames)) { const permissions = ['view', 'create', 'update', 'delete', 'commands'].filter((permission) => data.has(`${organizationId}:${permission}`)); if (permissions.length) access[organizationId] = permissions; }
    const user = { id: form.dataset.id || `u-${Date.now()}`, name: data.get('name').trim(), email: data.get('email').trim(), admin: data.has('admin'), active: data.has('active'), access: data.has('admin') ? {} : access };
    const index = state.users.findIndex((item) => item.id === user.id); if (index < 0) state.users.push(user); else state.users[index] = user;
    modal.close(); toast('Demo user saved. No real account was created.');
  } else if (form.id === 'device-form') {
    Object.assign(state.devices.find((item) => item.id === form.dataset.id), { name: data.get('name').trim(), group: data.get('group').trim() }); modal.close(); toast('Demo device updated.');
  }
  render();
});
// Tab keyboard navigation stays within the two operating-system tabs.
document.addEventListener('keydown', (event) => {
  if (!event.target.matches('[role="tab"]') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault(); state.platform = event.key === 'Home' ? 'android' : event.key === 'End' ? 'ios' : state.platform === 'android' ? 'ios' : 'android'; render(); document.getElementById(`tab-${state.platform}`).focus();
});
render();
