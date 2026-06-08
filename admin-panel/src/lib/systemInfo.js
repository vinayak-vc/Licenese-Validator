// Normalizes a client's systemInfo across both shapes:
//  - legacy flat:  { os, cpu, gpu }
//  - new nested:   { application, device, hardware, display, runtime }
// Exposes the handful of fields the UI surfaces directly, plus the raw grouped
// data for the detail modal.

const GROUP_KEYS = ['application', 'device', 'hardware', 'display', 'runtime'];

export function isNested(si) {
  return !!si && GROUP_KEYS.some((k) => si[k] && typeof si[k] === 'object');
}

// Pull the commonly-surfaced fields regardless of shape.
export function readSystemInfo(si) {
  const s = si || {};
  if (isNested(s)) {
    const app = s.application || {};
    const device = s.device || {};
    const hardware = s.hardware || {};
    const runtime = s.runtime || {};
    return {
      os: app.platform || app.os || '',
      cpu: hardware.cpu || '',
      gpu: hardware.gpu || '',
      deviceName: device.deviceName || '',
      country: runtime.country || '',
    };
  }
  return {
    os: s.os || '',
    cpu: s.cpu || '',
    gpu: s.gpu || '',
    deviceName: '',
    country: '',
  };
}

// Field label maps for the detail modal. Order here drives render order.
const FIELD_LABELS = {
  application: {
    productName: 'Product Name',
    unityVersion: 'Unity Version',
    appVersion: 'App Version',
    platform: 'Platform',
    installMode: 'Install Mode',
    sandboxType: 'Sandbox Type',
    buildGUID: 'Build GUID',
  },
  device: {
    deviceName: 'Device Name',
    deviceModel: 'Device Model',
    deviceType: 'Device Type',
    deviceUniqueIdentifier: 'Unique Identifier',
  },
  hardware: {
    cpu: 'CPU',
    cores: 'Cores',
    frequency: 'Frequency (MHz)',
    systemRam: 'System RAM (MB)',
    gpu: 'GPU',
    graphicsMemory: 'Graphics Memory (MB)',
    graphicsApi: 'Graphics API',
  },
  display: {
    resolution: 'Resolution',
    windowSize: 'Window Size',
    fullscreenMode: 'Fullscreen Mode',
    dpi: 'DPI',
  },
  runtime: {
    targetFps: 'Target FPS',
    vSyncCount: 'VSync Count',
    qualityLevel: 'Quality Level',
    country: 'Country',
    generatedOn: 'Generated On',
  },
};

const GROUP_TITLES = {
  application: 'Application',
  device: 'Device',
  hardware: 'Hardware',
  display: 'Display',
  runtime: 'Runtime',
};

// Returns [{ key, title, fields: [{label, value}] }] for whatever data exists.
// Legacy flat records collapse into a single "Hardware" group.
export function groupSystemInfo(si) {
  const s = si || {};
  if (!isNested(s)) {
    const fields = [];
    if (s.os) fields.push({ label: 'OS', value: s.os });
    if (s.cpu) fields.push({ label: 'CPU', value: s.cpu });
    if (s.gpu) fields.push({ label: 'GPU', value: s.gpu });
    return fields.length ? [{ key: 'hardware', title: 'System', fields }] : [];
  }

  const groups = [];
  for (const key of GROUP_KEYS) {
    const src = s[key];
    if (!src || typeof src !== 'object') continue;
    const labels = FIELD_LABELS[key];
    const fields = [];
    for (const [field, label] of Object.entries(labels)) {
      const value = src[field];
      if (value === undefined || value === null || value === '') continue;
      fields.push({ label, value: String(value) });
    }
    if (fields.length) {
      groups.push({ key, title: GROUP_TITLES[key], fields });
    }
  }
  return groups;
}

// Minimal country-name -> ISO2 map for common locales returned by ipwho.is
// (which sends the full English name). Unmapped names return null -> caller
// falls back to a globe icon. " (Local)" suffix from the client is stripped.
const COUNTRY_ISO = {
  'united states': 'US', 'united states of america': 'US', usa: 'US',
  'united kingdom': 'GB', uk: 'GB', england: 'GB',
  india: 'IN', canada: 'CA', australia: 'AU', germany: 'DE', france: 'FR',
  spain: 'ES', italy: 'IT', netherlands: 'NL', belgium: 'BE', switzerland: 'CH',
  austria: 'AT', sweden: 'SE', norway: 'NO', denmark: 'DK', finland: 'FI',
  ireland: 'IE', portugal: 'PT', poland: 'PL', russia: 'RU', ukraine: 'UA',
  china: 'CN', japan: 'JP', 'south korea': 'KR', 'korea': 'KR', taiwan: 'TW',
  'hong kong': 'HK', singapore: 'SG', malaysia: 'MY', indonesia: 'ID',
  thailand: 'TH', vietnam: 'VN', philippines: 'PH', 'new zealand': 'NZ',
  brazil: 'BR', mexico: 'MX', argentina: 'AR', chile: 'CL', colombia: 'CO',
  'south africa': 'ZA', nigeria: 'NG', egypt: 'EG', 'saudi arabia': 'SA',
  'united arab emirates': 'AE', uae: 'AE', israel: 'IL', turkey: 'TR',
  pakistan: 'PK', bangladesh: 'BD', 'sri lanka': 'LK', nepal: 'NP',
  greece: 'GR', 'czech republic': 'CZ', czechia: 'CZ', romania: 'RO',
  hungary: 'HU', bulgaria: 'BG', croatia: 'HR', serbia: 'RS', slovakia: 'SK',
};

// Convert an ISO2 code to its emoji flag via regional indicator symbols.
function isoToEmoji(iso) {
  return iso
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

// Returns { flag, label } or null when the country is unknown/empty.
export function countryToFlag(country) {
  if (!country || typeof country !== 'string') return null;
  const label = country.trim();
  const cleaned = label.replace(/\s*\(local\)\s*$/i, '').trim().toLowerCase();
  const iso = COUNTRY_ISO[cleaned];
  if (!iso) return { flag: null, label };
  return { flag: isoToEmoji(iso), label };
}
