import './style.css';
import './app.css';
import logoUrl from './assets/images/favicon.png';

import {
  GetStatus,
  StartLink,
  LinkStatus,
  Unlink,
  StartService,
  StopService,
  TailLogs,
  GetNetwork,
  GetConfig,
  CancelLink,
} from '../wailsjs/go/main/App';

document.querySelector('#app').innerHTML = `
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <img src="${logoUrl}" alt="NetworkCloud" class="brand-logo" />
        <div class="brand-text">
          <div class="brand-title">NetworkCloud</div>
          <div class="brand-subtitle">Agent</div>
        </div>
      </div>
      <div class="nav-label">Navigation</div>
      <nav class="nav">
        <button class="nav-item active" data-target="dashboard">
          <span class="nav-icon">
            ${iconSvg('dashboard')}
          </span>
          Dashboard
        </button>
        <button class="nav-item" data-target="network">
          <span class="nav-icon">
            ${iconSvg('network')}
          </span>
          Network
        </button>
        <button class="nav-item" data-target="link">
          <span class="nav-icon">
            ${iconSvg('cloud')}
          </span>
          Cloud Sync
        </button>
        <button class="nav-item" data-target="status">
          <span class="nav-icon">
            ${iconSvg('activity')}
          </span>
          Status
        </button>
        <button class="nav-item" data-target="service">
          <span class="nav-icon">
            ${iconSvg('power')}
          </span>
          Service Control
        </button>
        <button class="nav-item" data-target="logs">
          <span class="nav-icon">
            ${iconSvg('file')}
          </span>
          Logs
        </button>
      </nav>
      <div class="sidebar-footer">v1.0.0</div>
    </aside>

    <main class="main">
      <section class="section active" data-section="dashboard">
        <div class="section-header">
          <div>
            <h2>Dashboard</h2>
            <p class="section-subtitle">Monitor your network adapters and cloud sync status.</p>
          </div>
          <div id="dashboardAgentPill" class="status-pill">Agent Status</div>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon">
              ${iconSvg('network')}
            </div>
            <div class="stat-label">Network Adapters</div>
            <div id="dashboardAdapterCount" class="stat-value">-</div>
            <div id="dashboardConnectedCount" class="stat-sub">-</div>
            <button class="stat-link" data-target="network">View details →</button>
          </div>
          <div class="stat-card">
            <div class="stat-icon">
              ${iconSvg('cloud')}
            </div>
            <div class="stat-label">Cloud Status</div>
            <div id="dashboardCloudStatus" class="stat-value">-</div>
            <div class="stat-sub">Last synced just now</div>
            <button class="stat-link" data-target="link">View Details →</button>
          </div>
          <div class="stat-card">
            <div class="stat-icon">
              ${iconSvg('activity')}
            </div>
            <div class="stat-label">Agent Status</div>
            <div id="dashboardAgentStatus" class="stat-value">-</div>
            <div class="stat-sub">Uptime: -</div>
            <button class="stat-link" data-target="status">View Details →</button>
          </div>
          <div class="stat-card">
            <div class="stat-icon">
              ${iconSvg('wifi')}
            </div>
            <div class="stat-label">Primary Adapter</div>
            <div id="dashboardPrimaryName" class="stat-value">-</div>
            <div id="dashboardPrimaryIp" class="stat-sub">-</div>
            <button class="stat-link" data-target="network">View Details →</button>
          </div>
        </div>

        <div class="dashboard-grid">
          <div class="card primary-card">
            <div class="card-header">
              <div>
                <div class="card-title">Primary Adapter</div>
                <div class="card-subtitle">Live adapter status for this device</div>
              </div>
              <div id="dashboardPrimaryState" class="status-chip">-</div>
            </div>
            <div class="card-body">
              <div class="primary-layout">
                <div class="primary-details">
                  <div class="primary-heading">
                    <div id="dashboardPrimaryIcon" class="adapter-icon"></div>
                    <div>
                      <div id="dashboardPrimaryLabel" class="primary-name">-</div>
                      <div id="dashboardPrimaryType" class="adapter-type">-</div>
                    </div>
                  </div>
                  <div class="primary-metrics">
                    <div class="metric">
                      <div class="meta-label">IP Address</div>
                      <div id="dashboardPrimaryIpDetail" class="meta-value">-</div>
                    </div>
                    <div class="metric">
                      <div class="meta-label">Gateway</div>
                      <div id="dashboardPrimaryGateway" class="meta-value">-</div>
                    </div>
                    <div class="metric">
                      <div class="meta-label">DNS</div>
                      <div id="dashboardPrimaryDns" class="meta-value">-</div>
                    </div>
                  <div class="metric">
                    <div class="meta-label">Subnet Mask</div>
                    <div id="dashboardPrimarySubnet" class="meta-value">-</div>
                  </div>
                    <div class="metric">
                      <div class="meta-label">MAC Address</div>
                      <div id="dashboardPrimaryMac" class="meta-value">-</div>
                    </div>
                    <div class="metric">
                      <div class="meta-label">Type</div>
                      <div id="dashboardPrimaryTypeLabel" class="meta-value adapter-type-value">-</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="card quick-actions">
            <div class="card-title">Quick Actions</div>
            <button id="dashboardRefreshNetwork" class="action-button">
              <span class="action-icon">
                ${iconSvg('refresh')}
              </span>
              Refresh Network
            </button>
            <button id="dashboardSyncCloud" class="action-button">
              <span class="action-icon">
                ${iconSvg('cloud')}
              </span>
              Sync to Cloud
            </button>
            <button id="dashboardViewLogs" class="action-button ghost">
              <span class="action-icon">
                ${iconSvg('activity')}
              </span>
              View Activity
            </button>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title">All Network Adapters</div>
            <button class="ghost stat-link" data-target="network">View All →</button>
          </div>
          <div id="dashboardAdapterPreview" class="adapter-preview"></div>
        </div>
      </section>

      <section class="section" data-section="network">
        <div class="section-header">
          <div>
            <h2>Network Overview</h2>
            <p class="section-subtitle">Live adapter status for this device.</p>
          </div>
          <button id="refreshNetwork">Refresh Network</button>
        </div>
        <div id="networkPrimary" class="primary-summary"></div>
        <div class="adapter-toolbar">
          <div class="filter-pills">
            <button class="filter-pill active" data-filter="all">All</button>
            <button class="filter-pill" data-filter="connected">Connected</button>
            <button class="filter-pill" data-filter="disconnected">Disconnected</button>
          </div>
        </div>
        <div id="networkList" class="adapter-grid"></div>
      </section>

      <section class="section" data-section="link">
        <div class="section-header">
          <div>
            <h2>Cloud Sync</h2>
            <p class="section-subtitle">Connect this agent to your cloud dashboard.</p>
          </div>
        </div>
        <div id="cloudSyncCard" class="cloud-sync-card">
          <div class="cloud-sync-header">
            <div>
              <div class="cloud-sync-title" id="cloudSyncTitle">Enable Cloud Sync</div>
              <div class="cloud-sync-subtitle" id="cloudSyncSubtitle">
                Connect this agent to keep your devices in sync.
              </div>
            </div>
            <div id="linkStatus" class="sync-badge warning">Not Synced</div>
          </div>
          <div id="cloudSyncDetails" class="cloud-sync-details">
            <div class="sync-detail">
              <div class="sync-label">Device ID</div>
              <div id="cloudSyncDeviceId" class="sync-value">-</div>
            </div>
            <div class="sync-detail">
              <div class="sync-label">Last Connected</div>
              <div id="cloudSyncLastConnected" class="sync-value">-</div>
            </div>
            <div class="sync-detail">
              <div class="sync-label">Sync Interval</div>
              <div id="cloudSyncInterval" class="sync-value">-</div>
            </div>
          </div>
          <div id="cloudSyncStats" class="cloud-sync-stats">
            <div class="sync-stat">
              <div class="sync-label">Synced Adapters</div>
              <div id="cloudSyncAdapterCount" class="sync-value">-</div>
            </div>
          </div>
          <div id="linkInfo" class="muted">Not linked</div>
          <div class="cloud-sync-actions">
            <button id="startLink" class="primary">Enable Sync</button>
            <button id="checkLink" class="ghost">Check Connection</button>
            <button id="cancelLink" class="ghost">Stop Linking</button>
            <button id="unlink" class="destructive">Disable Sync</button>
          </div>
        </div>
        <div class="cloud-sync-extras">
          <div class="card">
            <div class="card-header">
              <div>
                <div class="card-title">Sync Settings</div>
                <div class="card-subtitle">Auto-sync configuration details.</div>
              </div>
            </div>
            <div class="card-body">
              <div class="sync-setting-row">
                <span class="sync-setting-label">Sync Interval</span>
                <span id="syncSettingsInterval" class="sync-setting-value">-</span>
              </div>
              <div class="sync-setting-row">
                <span class="sync-setting-label">Data Synced</span>
                <span class="sync-setting-value">Network Adapters, Status, Logs</span>
              </div>
              <div class="sync-setting-row">
                <span class="sync-setting-label">Auto Sync</span>
                <span class="sync-setting-value status-pill linked">Enabled</span>
              </div>
            </div>
          </div>
          <div class="card">
            <div class="card-header">
              <div>
                <div class="card-title">Connection Benefits</div>
                <div class="card-subtitle">Why cloud sync stays enabled.</div>
              </div>
            </div>
            <div class="card-body">
              <ul class="benefits-list">
                <li>Centralized monitoring across devices</li>
                <li>Real-time sync of network changes</li>
                <li>Historical logs and adapter backup</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section class="section" data-section="status">
        <div class="section-header">
          <div>
            <h2>Agent Status</h2>
            <p class="section-subtitle">Runtime state and link state.</p>
          </div>
          <button id="refresh">Refresh</button>
        </div>
        <div id="status" class="muted">Status: loading...</div>
        <div class="status-grid">
          <div class="status-card">
            <div class="status-label">Sync Status</div>
            <div id="syncStatusValue" class="status-value">-</div>
          </div>
        </div>
      </section>

      <section class="section" data-section="service">
        <div class="section-header">
          <div>
            <h2>Service Control</h2>
            <p class="section-subtitle">Start or stop the background agent.</p>
          </div>
        </div>
        <div class="actions">
          <button id="startService">Start</button>
          <button id="stopService">Stop</button>
        </div>
      </section>

      <section class="section" data-section="logs">
        <div class="section-header">
          <div>
            <h2>Activity Logs</h2>
            <p class="section-subtitle">Recent agent activity and events.</p>
          </div>
          <button id="refreshLogs">Refresh Logs</button>
        </div>
        <pre id="logs"></pre>
      </section>
    </main>
    <div id="adapterModal" class="adapter-modal"></div>
    <div id="linkModal" class="link-modal">
      <div class="modal-overlay" data-link-close="true"></div>
      <div class="link-modal-card">
        <div class="link-modal-header">
          <div>
            <div class="link-modal-title">Link This Agent</div>
            <div class="link-modal-subtitle">Follow the steps to connect to your cloud dashboard.</div>
          </div>
          <button class="modal-close" data-link-close="true">×</button>
        </div>
        <div class="link-modal-steps">
          <div class="link-step">1. Open the verification page.</div>
          <div class="link-step">2. Enter the code shown below.</div>
          <div class="link-step">3. Approve the device to finish linking.</div>
        </div>
        <div class="link-modal-code">
          <div class="link-code-label">Linking Code</div>
          <div id="linkModalCode" class="link-code-value">-</div>
        </div>
        <div class="link-modal-meta">
          <div class="link-meta">
            <div class="link-meta-label">Verification URL</div>
            <div id="linkModalUrl" class="link-meta-value">-</div>
          </div>
          <div class="link-meta">
            <div class="link-meta-label">Expires In</div>
            <div id="linkModalExpires" class="link-meta-value">-</div>
          </div>
        </div>
        <div class="link-modal-actions">
          <button id="linkModalOpen" class="primary">Open Verification Page</button>
          <button id="linkModalCopy" class="ghost">Copy Code</button>
          <button id="linkModalStop" class="destructive">Stop Linking</button>
        </div>
      </div>
    </div>
  </div>
`;

const statusEl = document.getElementById('status');
const linkInfoEl = document.getElementById('linkInfo');
const logsEl = document.getElementById('logs');
const networkPrimaryEl = document.getElementById('networkPrimary');
const networkListEl = document.getElementById('networkList');
const sectionEls = document.querySelectorAll('.section');
const navButtons = document.querySelectorAll('.nav-item');
const linkStatusEl = document.getElementById('linkStatus');
const cloudSyncCardEl = document.getElementById('cloudSyncCard');
const cloudSyncTitleEl = document.getElementById('cloudSyncTitle');
const cloudSyncSubtitleEl = document.getElementById('cloudSyncSubtitle');
const cloudSyncDetailsEl = document.getElementById('cloudSyncDetails');
const cloudSyncStatsEl = document.getElementById('cloudSyncStats');
const cloudSyncDeviceIdEl = document.getElementById('cloudSyncDeviceId');
const cloudSyncLastConnectedEl = document.getElementById('cloudSyncLastConnected');
const cloudSyncIntervalEl = document.getElementById('cloudSyncInterval');
const cloudSyncAdapterCountEl = document.getElementById('cloudSyncAdapterCount');
const syncStatusValueEl = document.getElementById('syncStatusValue');
const syncSettingsIntervalEl = document.getElementById('syncSettingsInterval');
const linkModalEl = document.getElementById('linkModal');
const linkModalCodeEl = document.getElementById('linkModalCode');
const linkModalUrlEl = document.getElementById('linkModalUrl');
const linkModalExpiresEl = document.getElementById('linkModalExpires');
const linkModalOpenEl = document.getElementById('linkModalOpen');
const linkModalCopyEl = document.getElementById('linkModalCopy');
const linkModalStopEl = document.getElementById('linkModalStop');
const dashboardAdapterCountEl = document.getElementById('dashboardAdapterCount');
const dashboardConnectedCountEl = document.getElementById('dashboardConnectedCount');
const dashboardCloudStatusEl = document.getElementById('dashboardCloudStatus');
const dashboardAgentStatusEl = document.getElementById('dashboardAgentStatus');
const dashboardPrimaryNameEl = document.getElementById('dashboardPrimaryName');
const dashboardPrimaryIpEl = document.getElementById('dashboardPrimaryIp');
const dashboardPrimaryLabelEl = document.getElementById('dashboardPrimaryLabel');
const dashboardPrimaryTypeEl = document.getElementById('dashboardPrimaryType');
const dashboardPrimaryIpDetailEl = document.getElementById('dashboardPrimaryIpDetail');
const dashboardPrimaryGatewayEl = document.getElementById('dashboardPrimaryGateway');
const dashboardPrimaryDnsEl = document.getElementById('dashboardPrimaryDns');
const dashboardPrimarySubnetEl = document.getElementById('dashboardPrimarySubnet');
const dashboardPrimaryMacEl = document.getElementById('dashboardPrimaryMac');
const dashboardPrimaryTypeLabelEl = document.getElementById('dashboardPrimaryTypeLabel');
const dashboardPrimaryStateEl = document.getElementById('dashboardPrimaryState');
const dashboardAgentPillEl = document.getElementById('dashboardAgentPill');
const dashboardAdapterPreviewEl = document.getElementById('dashboardAdapterPreview');
const networkFilterButtons = document.querySelectorAll('.filter-pill');
let activeNetworkFilter = 'all';
let lastNetworkResponse = null;
let lastStatusResponse = null;
let lastConfigResponse = null;
let activeAdapterKey = null;
let linkExpiryTimer = null;
let linkExpiryDeadline = null;
let linkExpiryBaseText = '';
let linkIsActive = false;
let linkVerificationUrl = '';
let linkUserCode = '';


if (dashboardAdapterPreviewEl) {
  dashboardAdapterPreviewEl.addEventListener('wheel', (event) => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
      return;
    }
    dashboardAdapterPreviewEl.scrollLeft += event.deltaY;
    event.preventDefault();
  }, { passive: false });
}

function capitalize(value) {
  if (!value) {
    return '-';
  }
  const lower = String(value).toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function formatDnsLines(dnsServers) {
  const servers = (dnsServers || []).map((server) => String(server).trim()).filter(Boolean);
  if (servers.length === 0) {
    return '-';
  }
  return servers.map((server, index) => `${index + 1}. ${server}`).join('\n');
}

function formatInterval(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) {
    return '-';
  }
  return `${value} second${value === 1 ? '' : 's'}`;
}

function formatTimestamp(value) {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleString();
}

function updateLinkCountdown() {
  if (!linkInfoEl || !linkExpiryDeadline) {
    return;
  }
  const remainingMs = linkExpiryDeadline - Date.now();
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  linkInfoEl.innerText = `${linkExpiryBaseText}\nExpires: ${remainingSeconds}s`;
  if (linkModalExpiresEl) {
    linkModalExpiresEl.innerText = `${remainingSeconds}s`;
  }
  if (remainingSeconds <= 0) {
    clearLinkCountdown();
    startLink();
  }
}

function clearLinkCountdown() {
  if (linkExpiryTimer) {
    clearInterval(linkExpiryTimer);
  }
  linkExpiryTimer = null;
  linkExpiryDeadline = null;
  linkExpiryBaseText = '';
  linkIsActive = false;
  linkVerificationUrl = '';
  linkUserCode = '';
  closeLinkModal();
  updateCloudSyncUI();
}

function openLinkModal() {
  if (linkModalEl) {
    linkModalEl.classList.add('open');
  }
}

function closeLinkModal() {
  if (linkModalEl) {
    linkModalEl.classList.remove('open');
  }
}

function updateLinkModalContent() {
  if (linkModalCodeEl) {
    linkModalCodeEl.innerText = linkUserCode || '-';
  }
  if (linkModalUrlEl) {
    linkModalUrlEl.innerText = linkVerificationUrl || '-';
  }
  if (linkModalExpiresEl) {
    linkModalExpiresEl.innerText = linkExpiryDeadline
      ? `${Math.max(0, Math.ceil((linkExpiryDeadline - Date.now()) / 1000))}s`
      : '-';
  }
}

function getSyncedAdapterCount() {
  const adapters = lastNetworkResponse?.adapters || [];
  return adapters.filter((adapter) => adapter.connected).length;
}

async function refreshConfig() {
  try {
    lastConfigResponse = await GetConfig();
  } catch {
    lastConfigResponse = null;
  }
  updateCloudSyncUI();
}

function updateCloudSyncUI() {
  const linked = Boolean(lastStatusResponse?.linked);
  const statusLabel = linked ? 'Synced' : 'Not Synced';
  if (linkStatusEl) {
    linkStatusEl.innerText = statusLabel;
    linkStatusEl.classList.toggle('success', linked);
    linkStatusEl.classList.toggle('warning', !linked);
  }
  if (cloudSyncCardEl) {
    cloudSyncCardEl.classList.toggle('synced', linked);
    cloudSyncCardEl.classList.toggle('not-synced', !linked);
  }
  if (cloudSyncTitleEl) {
    cloudSyncTitleEl.innerText = linked ? 'Cloud Sync Active' : 'Enable Cloud Sync';
  }
  if (cloudSyncSubtitleEl) {
    cloudSyncSubtitleEl.innerText = linked
      ? 'Your device is syncing with the cloud server.'
      : 'Connect this agent to keep your devices in sync.';
  }
  if (cloudSyncDetailsEl) {
    cloudSyncDetailsEl.style.display = linked ? 'grid' : 'none';
  }
  if (cloudSyncStatsEl) {
    cloudSyncStatsEl.style.display = linked ? 'flex' : 'none';
  }
  if (cloudSyncDeviceIdEl) {
    cloudSyncDeviceIdEl.innerText = lastStatusResponse?.agentUuid || '-';
  }
  if (cloudSyncLastConnectedEl) {
    cloudSyncLastConnectedEl.innerText = formatTimestamp(lastStatusResponse?.obtainedAt);
  }
  if (cloudSyncIntervalEl) {
    cloudSyncIntervalEl.innerText = linked
      ? formatInterval(lastConfigResponse?.syncIntervalSeconds)
      : '-';
  }
  if (syncSettingsIntervalEl) {
    syncSettingsIntervalEl.innerText = linked
      ? formatInterval(lastConfigResponse?.syncIntervalSeconds)
      : '-';
  }
  if (cloudSyncAdapterCountEl) {
    cloudSyncAdapterCountEl.innerText = linked ? `${getSyncedAdapterCount()}` : '-';
  }
  const enableButton = document.getElementById('startLink');
  const checkButton = document.getElementById('checkLink');
  const disableButton = document.getElementById('unlink');
  const cancelButton = document.getElementById('cancelLink');
  if (enableButton) {
    enableButton.style.display = linked || linkIsActive ? 'none' : 'inline-flex';
  }
  if (checkButton) {
    checkButton.style.display = linked ? 'inline-flex' : 'none';
  }
  if (disableButton) {
    disableButton.style.display = linked ? 'inline-flex' : 'none';
  }
  if (cancelButton) {
    cancelButton.style.display = 'none';
  }
  if (dashboardCloudStatusEl) {
    dashboardCloudStatusEl.innerText = statusLabel;
    dashboardCloudStatusEl.classList.toggle('status-good', linked);
    dashboardCloudStatusEl.classList.toggle('status-warning', !linked);
  }
  if (syncStatusValueEl) {
    syncStatusValueEl.innerText = linked ? 'Active' : 'Inactive';
    syncStatusValueEl.classList.toggle('status-good', linked);
    syncStatusValueEl.classList.toggle('status-warning', !linked);
  }
  if (linked) {
    closeLinkModal();
  }
}

function iconSvg(name) {
  switch (name) {
    case 'dashboard':
      return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="7" height="9" rx="1"></rect>
          <rect x="14" y="3" width="7" height="5" rx="1"></rect>
          <rect x="14" y="12" width="7" height="9" rx="1"></rect>
          <rect x="3" y="16" width="7" height="5" rx="1"></rect>
        </svg>
      `;
    case 'network':
      return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="6" cy="6" r="2"></circle>
          <circle cx="18" cy="6" r="2"></circle>
          <circle cx="12" cy="18" r="2"></circle>
          <path d="M6 8v4a2 2 0 0 0 2 2h4"></path>
          <path d="M18 8v4a2 2 0 0 1-2 2h-4"></path>
        </svg>
      `;
    case 'cloud':
      return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 16.5a4.5 4.5 0 0 0-4-4.5 6 6 0 0 0-11.5 2A4 4 0 0 0 6 20h11a3 3 0 0 0 3-3.5z"></path>
        </svg>
      `;
    case 'activity':
      return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 12h-4l-3 9-4-18-3 9H2"></path>
        </svg>
      `;
    case 'power':
      return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2v10"></path>
          <path d="M18.4 6.6a8 8 0 1 1-12.8 0"></path>
        </svg>
      `;
    case 'file':
      return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <path d="M14 2v6h6"></path>
          <path d="M16 13H8"></path>
          <path d="M16 17H8"></path>
        </svg>
      `;
    case 'wifi':
      return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12.5a7 7 0 0 1 14 0"></path>
          <path d="M8.5 12.5a3.5 3.5 0 0 1 7 0"></path>
          <path d="M12 20h.01"></path>
        </svg>
      `;
    case 'cable':
      return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 6h10v7H7z"></path>
          <path d="M12 13v5"></path>
          <path d="M8 11h1"></path>
          <path d="M11 11h1"></path>
          <path d="M15 11h1"></path>
        </svg>
      `;
    case 'shield':
      return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3l7 4v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7z"></path>
          <path d="M9 12l2 2 4-4"></path>
        </svg>
      `;
    case 'bluetooth':
      return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 8l12 8-6 4V4l6 4-12 8"></path>
        </svg>
      `;
    case 'layers':
      return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2l9 5-9 5-9-5 9-5"></path>
          <path d="M3 12l9 5 9-5"></path>
          <path d="M3 17l9 5 9-5"></path>
        </svg>
      `;
    case 'help':
      return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"></circle>
          <path d="M12 8h.01"></path>
          <path d="M12 12v4"></path>
        </svg>
      `;
    case 'refresh':
      return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12a9 9 0 1 1-2.64-6.36"></path>
          <path d="M21 3v6h-6"></path>
        </svg>
      `;
    default:
      return iconSvg('help');
  }
}

function adapterTypeIcon(type) {
  const normalized = String(type || '').toLowerCase();
  if (normalized.includes('wireless') || normalized.includes('wi-fi') || normalized.includes('wifi')) {
    return iconSvg('wifi');
  }
  if (normalized.includes('ethernet')) {
    return iconSvg('cable');
  }
  if (normalized.includes('vpn')) {
    return iconSvg('shield');
  }
  if (normalized.includes('bluetooth')) {
    return iconSvg('bluetooth');
  }
  if (normalized.includes('virtual')) {
    return iconSvg('layers');
  }
  return iconSvg('help');
}

function matchesNetworkFilter(adapter) {
  if (activeNetworkFilter === 'connected') {
    return adapter.connected;
  }
  if (activeNetworkFilter === 'disconnected') {
    return !adapter.connected;
  }
  return true;
}

function adapterKey(adapter) {
  return `${adapter.name}::${adapter.macAddress || adapter.type || ''}`;
}

function setActiveSection(target) {
  sectionEls.forEach((section) => {
    section.classList.toggle('active', section.dataset.section === target);
  });
  navButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.target === target);
  });
}

async function refreshStatus() {
  try {
    const status = await GetStatus();
    lastStatusResponse = status;
    statusEl.innerText = `Status: ${capitalize(status.state)} (Linked: ${status.linked ? 'Yes' : 'No'})`;
    if (status.linked) {
      clearLinkCountdown();
      linkInfoEl.innerText = `Agent UUID: ${status.agentUuid}\nObtained: ${status.obtainedAt}`;
    } else {
      linkInfoEl.innerText = 'Not linked';
    }
    updateDashboardStatus(status);
    updateCloudSyncUI();
    refreshConfig();
  } catch (err) {
    statusEl.innerText = `Status error: ${err}`;
  }
}

async function startLink() {
  try {
    const resp = await StartLink();
    clearLinkCountdown();
    linkExpiryDeadline = Date.now() + resp.expiresIn * 1000;
    linkExpiryBaseText = `Visit: ${resp.verificationUri}\nCode: ${resp.userCode}`;
    linkIsActive = true;
    updateCloudSyncUI();
    linkVerificationUrl = resp.verificationUri;
    linkUserCode = resp.userCode;
    updateLinkModalContent();
    openLinkModal();
    updateLinkCountdown();
    linkExpiryTimer = setInterval(updateLinkCountdown, 1000);
  } catch (err) {
    clearLinkCountdown();
    linkInfoEl.innerText = `Link error: ${err}`;
  }
}

async function checkLink() {
  try {
    const resp = await LinkStatus();
    linkInfoEl.innerText = `Link status: ${resp.status}`;
    await refreshStatus();
    if (resp.status !== 'pending') {
      clearLinkCountdown();
    }
  } catch (err) {
    linkInfoEl.innerText = `Link status error: ${err}`;
  }
}

async function cancelLink() {
  try {
    const resp = await CancelLink();
    clearLinkCountdown();
    linkInfoEl.innerText = `Link cancelled: ${resp.status}`;
    await refreshStatus();
  } catch (err) {
    linkInfoEl.innerText = `Cancel link error: ${err}`;
  }
}

async function unlink() {
  try {
    const resp = await Unlink();
    clearLinkCountdown();
    linkInfoEl.innerText = `Unlink: ${resp.status}`;
    await refreshStatus();
  } catch (err) {
    linkInfoEl.innerText = `Unlink error: ${err}`;
  }
}

async function refreshLogs() {
  try {
    const resp = await TailLogs();
    logsEl.innerText = (resp.lines || []).join('\n');
  } catch (err) {
    logsEl.innerText = `Log error: ${err}`;
  }
}

async function refreshNetwork() {
  try {
    const resp = await GetNetwork();
    lastNetworkResponse = resp;
    renderNetwork(resp);
    updateDashboardNetwork(resp);
    updateCloudSyncUI();
  } catch (err) {
    networkPrimaryEl.innerText = `Network error: ${err}`;
    networkListEl.innerHTML = '';
  }
}

function updateDashboardStatus(status) {
  if (!status) {
    return;
  }
  const stateLabel = capitalize(status.state);
  if (dashboardAgentStatusEl) {
    dashboardAgentStatusEl.innerText = stateLabel;
  }
  if (dashboardAgentPillEl) {
    dashboardAgentPillEl.innerText = status.state ? `Agent ${stateLabel}` : 'Agent Status';
  }
}

function updateDashboardNetwork(resp) {
  if (!resp) {
    return;
  }
  const adapters = resp.adapters || [];
  const connected = adapters.filter((adapter) => adapter.connected).length;
  if (dashboardAdapterCountEl) {
    dashboardAdapterCountEl.innerText = `${adapters.length}`;
  }
  if (dashboardConnectedCountEl) {
    dashboardConnectedCountEl.innerText = `${connected} connected`;
  }
  if (resp.primary) {
    const primary = resp.primary;
    const dns = formatDnsLines(primary.dnsServers);
    if (dashboardPrimaryNameEl) {
      dashboardPrimaryNameEl.innerText = primary.name || '-';
    }
    if (dashboardPrimaryIpEl) {
      dashboardPrimaryIpEl.innerText = primary.ipv4Address || '-';
    }
    if (dashboardPrimaryLabelEl) {
      dashboardPrimaryLabelEl.innerText = primary.name || '-';
    }
    if (dashboardPrimaryTypeEl) {
      dashboardPrimaryTypeEl.innerText = primary.description || primary.name || '-';
    }
    const primaryIconEl = document.getElementById('dashboardPrimaryIcon');
    if (primaryIconEl) {
      primaryIconEl.innerHTML = adapterTypeIcon(primary.type);
    }
    if (dashboardPrimaryIpDetailEl) {
      dashboardPrimaryIpDetailEl.innerText = primary.ipv4Address || '-';
    }
    if (dashboardPrimaryGatewayEl) {
      dashboardPrimaryGatewayEl.innerText = primary.defaultGateway || '-';
    }
    if (dashboardPrimaryDnsEl) {
      dashboardPrimaryDnsEl.innerText = dns;
    }
    if (dashboardPrimarySubnetEl) {
      dashboardPrimarySubnetEl.innerText = primary.subnetMask || '-';
    }
    if (dashboardPrimaryMacEl) {
      dashboardPrimaryMacEl.innerText = primary.macAddress || '-';
    }
    if (dashboardPrimaryTypeLabelEl) {
      dashboardPrimaryTypeLabelEl.innerText = primary.type || '-';
    }
    if (dashboardPrimaryStateEl) {
      dashboardPrimaryStateEl.innerText = primary.connected ? 'Connected' : 'Disconnected';
      dashboardPrimaryStateEl.classList.toggle('linked', primary.connected);
    }
  }
  if (dashboardAdapterPreviewEl) {
    const previewAdapters = adapters
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
    dashboardAdapterPreviewEl.innerHTML = previewAdapters.map((adapter) => `
      <div class="preview-card">
        <div class="preview-title">${adapter.name}</div>
        <div class="preview-subtitle adapter-type">${adapter.type}</div>
        <div class="preview-row">
          <span>${adapter.ipv4Address || 'No IP'}</span>
          <span class="preview-pill ${adapter.connected ? 'online' : 'offline'}">
            ${adapter.connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>
    `).join('');
  }
}

function updateAdapterCardSizing(adapters) {
  if (!networkListEl) {
    return;
  }
  if (!Array.isArray(adapters) || adapters.length === 0) {
    networkListEl.style.removeProperty('--adapter-card-width');
    networkListEl.style.removeProperty('--adapter-card-height');
    return;
  }
  const containerWidth = networkListEl.clientWidth;
  if (!containerWidth) {
    return;
  }

  const measureHost = document.createElement('div');
  measureHost.className = 'adapter-grid';
  measureHost.style.position = 'absolute';
  measureHost.style.visibility = 'hidden';
  measureHost.style.pointerEvents = 'none';
  measureHost.style.height = 'auto';
  measureHost.style.width = `${containerWidth}px`;
  measureHost.style.left = '-99999px';
  measureHost.style.top = '0';
  measureHost.innerHTML = adapters
    .slice()
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))
    .map((adapter) => renderAdapterCard(adapter, adapterKey(adapter)))
    .join('');

  document.body.appendChild(measureHost);
  const cards = measureHost.querySelectorAll('.adapter-card');
  let maxWidth = 0;
  let maxHeight = 0;
  cards.forEach((card) => {
    const rect = card.getBoundingClientRect();
    maxWidth = Math.max(maxWidth, rect.width);
    maxHeight = Math.max(maxHeight, rect.height);
  });
  document.body.removeChild(measureHost);

  if (maxWidth > 0) {
    const clampedWidth = Math.min(Math.ceil(maxWidth), containerWidth);
    networkListEl.style.setProperty('--adapter-card-width', `${clampedWidth}px`);
  }
  if (maxHeight > 0) {
    networkListEl.style.setProperty('--adapter-card-height', `${Math.ceil(maxHeight)}px`);
  }
}

function renderNetwork(resp) {
  if (!resp) {
    return;
  }
  if (resp.primary) {
    const primaryDns = (resp.primary.dnsServers || [])[0] || '-';
    networkPrimaryEl.innerHTML = `
      <div class="primary-summary-card">
        <div class="primary-summary-left">
          <div class="adapter-icon">
            ${adapterTypeIcon(resp.primary.type)}
          </div>
          <div class="primary-label">Primary Adapter</div>
          <div class="primary-value">${resp.primary.name}</div>
        </div>
        <div class="primary-summary-metrics">
          <div>
            <div class="meta-label">IP Address</div>
            <div class="meta-value">${resp.primary.ipv4Address || '-'}</div>
          </div>
          <div>
            <div class="meta-label">Gateway</div>
            <div class="meta-value">${resp.primary.defaultGateway || '-'}</div>
          </div>
          <div>
            <div class="meta-label">DNS</div>
            <div class="meta-value">${primaryDns}</div>
          </div>
        </div>
      </div>
    `;
  } else {
    networkPrimaryEl.innerHTML = `
      <div class="primary-summary-card">
        <div class="primary-summary-left">
          <div class="adapter-icon">
            ${adapterTypeIcon('')}
          </div>
          <div class="primary-label">Primary Adapter</div>
          <div class="primary-value">Unknown</div>
        </div>
      </div>
    `;
  }

  const allAdapters = resp.adapters || [];
  const connectedCount = allAdapters.filter((adapter) => adapter.connected).length;
  const disconnectedCount = allAdapters.length - connectedCount;
  const filterCounts = {
    all: allAdapters.length,
    connected: connectedCount,
    disconnected: disconnectedCount,
  };

  networkFilterButtons.forEach((button) => {
    const filterKey = button.dataset.filter;
    if (!filterKey || !filterCounts.hasOwnProperty(filterKey)) {
      return;
    }
    const count = filterCounts[filterKey];
    const label = filterKey.charAt(0).toUpperCase() + filterKey.slice(1);
    button.innerText = `${label} (${count})`;
    button.classList.toggle('active', filterKey === activeNetworkFilter);
  });

  const filteredAdapters = allAdapters
    .filter(matchesNetworkFilter)
    .slice()
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
  networkListEl.innerHTML = filteredAdapters
    .map((adapter) => renderAdapterCard(adapter, adapterKey(adapter)))
    .join('');
  updateAdapterCardSizing(allAdapters);

  networkListEl.querySelectorAll('.adapter-card').forEach((card) => {
    card.addEventListener('click', () => {
      const key = card.dataset.key;
      activeAdapterKey = key;
      renderNetwork(lastNetworkResponse);
    });
  });

  renderAdapterModal(resp);
}

function renderAdapterCard(adapter, key) {
  const ipAddress = adapter.ipv4Address || '-';
  const gateway = adapter.defaultGateway || '-';
  return `
    <div class="adapter-card" data-key="${key}">
      <div class="adapter-top">
        <div class="adapter-title">
          <div class="adapter-icon-sm">
            ${adapterTypeIcon(adapter.type)}
          </div>
          <div>
            <div class="adapter-name">${adapter.name}</div>
            <div class="adapter-type">${adapter.type}</div>
          </div>
        </div>
        <div class="adapter-state ${adapter.connected ? 'online' : 'offline'}">
          ${adapter.connected ? 'Connected' : 'Disconnected'}
        </div>
      </div>
      <div class="adapter-summary">
        <div class="adapter-key">
          <div class="key-label">IP Address</div>
          <div class="key-value">${ipAddress}</div>
        </div>
        <div class="adapter-key">
          <div class="key-label">Gateway</div>
          <div class="key-value">${gateway}</div>
        </div>
      </div>
    </div>
  `;
}

function renderAdapterModal(resp) {
  const modalEl = document.getElementById('adapterModal');
  if (!modalEl) {
    return;
  }
  if (!activeAdapterKey || !resp) {
    modalEl.classList.remove('open');
    modalEl.innerHTML = '';
    return;
  }
  const adapter = (resp.adapters || []).find((item) => adapterKey(item) === activeAdapterKey);
  if (!adapter) {
    modalEl.classList.remove('open');
    modalEl.innerHTML = '';
    return;
  }
  const dnsServers = (adapter.dnsServers || []).filter(Boolean);
  modalEl.classList.add('open');
  modalEl.innerHTML = `
    <div class="modal-overlay" data-close="true"></div>
    <div class="modal-card">
      <div class="modal-header">
        <div class="modal-title">
          <div class="adapter-icon">
            ${adapterTypeIcon(adapter.type)}
          </div>
          <div>
            <div class="modal-name">${adapter.name}</div>
            <div class="modal-subtitle">${adapter.description || adapter.name}</div>
          </div>
        </div>
        <button class="modal-close" data-close="true">×</button>
      </div>
      <div class="modal-tags">
        <span class="chip ${adapter.connected ? 'online' : 'offline'}">${adapter.connected ? 'Connected' : 'Disconnected'}</span>
        <span class="chip muted">${capitalize(adapter.type)}</span>
      </div>
      <div class="modal-section">
        <div class="section-title">Network Details</div>
        <div class="detail-row">
          <div class="detail-label">IP Address</div>
          <div class="detail-value">
            <span>${adapter.ipv4Address || '-'}</span>
            <button class="copy-button" data-copy="${adapter.ipv4Address || ''}">Copy</button>
          </div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Subnet Mask</div>
          <div class="detail-value">
            <span>${adapter.subnetMask || '-'}</span>
            <button class="copy-button" data-copy="${adapter.subnetMask || ''}">Copy</button>
          </div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Gateway</div>
          <div class="detail-value">
            <span>${adapter.defaultGateway || '-'}</span>
            <button class="copy-button" data-copy="${adapter.defaultGateway || ''}">Copy</button>
          </div>
        </div>
        <div class="detail-row">
          <div class="detail-label">MAC Address</div>
          <div class="detail-value">
            <span>${adapter.macAddress || '-'}</span>
            <button class="copy-button" data-copy="${adapter.macAddress || ''}">Copy</button>
          </div>
        </div>
      </div>
      <div class="modal-section">
        <div class="section-title">Configuration</div>
        <div class="detail-row">
          <div class="detail-label">DHCP</div>
          <div class="detail-value"><span>${capitalize(adapter.dhcpEnabled)}</span></div>
        </div>
      </div>
      <div class="modal-section">
        <div class="section-title">DNS Servers</div>
        ${dnsServers.length === 0 ? '<div class="detail-empty">No DNS servers listed.</div>' : dnsServers.map((server) => `
          <div class="detail-row dns-row">
            <div class="detail-label">${server}</div>
            <div class="detail-value">
              <button class="copy-button" data-copy="${server}">Copy</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  modalEl.querySelectorAll('[data-close="true"]').forEach((button) => {
    button.addEventListener('click', () => {
      activeAdapterKey = null;
      renderAdapterModal(lastNetworkResponse);
    });
  });

  modalEl.querySelectorAll('.copy-button').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      const value = button.dataset.copy || '';
      if (!value) {
        return;
      }
      try {
        await navigator.clipboard.writeText(value);
        button.innerText = 'Copied';
        setTimeout(() => {
          button.innerText = 'Copy';
        }, 1200);
      } catch {
        button.innerText = 'Failed';
        setTimeout(() => {
          button.innerText = 'Copy';
        }, 1200);
      }
    });
  });

}

document.getElementById('refresh').addEventListener('click', refreshStatus);
document.getElementById('startLink').addEventListener('click', startLink);
document.getElementById('checkLink').addEventListener('click', checkLink);
document.getElementById('unlink').addEventListener('click', unlink);
document.getElementById('cancelLink').addEventListener('click', cancelLink);
if (linkModalOpenEl) {
  linkModalOpenEl.addEventListener('click', () => {
    if (linkVerificationUrl) {
      window.open(linkVerificationUrl, '_blank', 'noopener');
    }
  });
}
if (linkModalCopyEl) {
  linkModalCopyEl.addEventListener('click', async () => {
    if (!linkUserCode) {
      return;
    }
    try {
      await navigator.clipboard.writeText(linkUserCode);
      linkModalCopyEl.innerText = 'Copied';
      setTimeout(() => {
        linkModalCopyEl.innerText = 'Copy Code';
      }, 1200);
    } catch {
      linkModalCopyEl.innerText = 'Failed';
      setTimeout(() => {
        linkModalCopyEl.innerText = 'Copy Code';
      }, 1200);
    }
  });
}
if (linkModalStopEl) {
  linkModalStopEl.addEventListener('click', cancelLink);
}
if (linkModalEl) {
  linkModalEl.querySelectorAll('[data-link-close="true"]').forEach((button) => {
    button.addEventListener('click', () => {
      if (linkIsActive && !lastStatusResponse?.linked) {
        cancelLink();
        return;
      }
      closeLinkModal();
    });
  });
}
document.getElementById('startService').addEventListener('click', async () => {
  await StartService();
});
document.getElementById('stopService').addEventListener('click', async () => {
  await StopService();
});
document.getElementById('refreshLogs').addEventListener('click', refreshLogs);
document.getElementById('refreshNetwork').addEventListener('click', refreshNetwork);
document.getElementById('dashboardRefreshNetwork').addEventListener('click', refreshNetwork);
document.getElementById('dashboardSyncCloud').addEventListener('click', checkLink);
document.getElementById('dashboardViewLogs').addEventListener('click', () => {
  setActiveSection('logs');
  refreshLogs();
});
navButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setActiveSection(button.dataset.target);
  });
});
document.querySelectorAll('.stat-link').forEach((button) => {
  button.addEventListener('click', () => {
    setActiveSection(button.dataset.target);
  });
});
networkFilterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    activeNetworkFilter = button.dataset.filter || 'all';
    renderNetwork(lastNetworkResponse);
  });
});

window.addEventListener('resize', () => {
  if (lastNetworkResponse && lastNetworkResponse.adapters) {
    updateAdapterCardSizing(lastNetworkResponse.adapters);
  }
});

refreshStatus();
refreshNetwork();
setActiveSection('dashboard');
