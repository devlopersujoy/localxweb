// ==========================================================================
// LocalXWeb Modern High-End Developer Web App Client
// Clean URL Routing (/Control-Center, /projects, /databases, /docs, etc.)
// ==========================================================================

let appState = {
  services: {},
  os: {},
  metrics: {},
  sites: [],
  databases: [],
  activePage: 'dashboard',
  theme: localStorage.getItem('lxw_theme') || 'dark',
  installing: null,
  rawLogs: ''
};

// Route mapping between pageId and clean URLs
const ROUTE_MAP = {
  dashboard: '/Control-Center',
  sites: '/projects',
  databases: '/databases',
  doctor: '/doctor',
  logs: '/logs',
  docs: '/docs',
  settings: '/settings',
  '404': '/404'
};

// Initialize app on load
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupNavigation();
  setupTemplateSelectors();
  setupKeyboardShortcuts();

  // Clean URL initial routing from browser path
  const initialPage = resolveRouteFromPath();
  navigateTo(initialPage, initialPage === '404');

  refreshAllData();

  // Periodic polling for service statuses & real-time CPU/RAM metrics
  setInterval(pollStatusAndMetrics, 2500);
});

// Browser Back / Forward History Navigation
window.addEventListener('popstate', (e) => {
  const target = (e.state && e.state.pageId) || resolveRouteFromPath();
  navigateTo(target, false);
});

function resolveRouteFromPath() {
  const p = window.location.pathname.toLowerCase().replace(/\/$/, '');
  if (!p || p === '' || p === '/control-center') return 'dashboard';
  if (p === '/projects' || p === '/sites') return 'sites';
  if (p === '/databases') return 'databases';
  if (p === '/doctor' || p === '/diagnostics') return 'doctor';
  if (p === '/logs') return 'logs';
  if (p === '/docs' || p === '/documentation') return 'docs';
  if (p === '/settings' || p === '/preferences') return 'settings';
  if (p === '/404') return '404';
  return '404';
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Avoid triggering when user is typing in form inputs
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
      return;
    }

    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
      return;
    }

    if (e.key === '1') navigateTo('dashboard');
    else if (e.key === '2') navigateTo('sites');
    else if (e.key === '3') navigateTo('databases');
    else if (e.key === '4') navigateTo('docs');
    else if (e.key === '5') navigateTo('doctor');
    else if (e.key === '6') navigateTo('logs');
    else if (e.key === '7') navigateTo('settings');
    else if (e.key === 't' || e.key === 'T') toggleTheme();
    else if (e.key === '?') openModal('modal-shortcuts');
  });
}

// ==========================================================================
// Theme & Navigation
// ==========================================================================
function initTheme() {
  document.documentElement.setAttribute('data-theme', appState.theme);
  updateThemeIcon();
}

function toggleTheme() {
  appState.theme = appState.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', appState.theme);
  localStorage.setItem('lxw_theme', appState.theme);
  updateThemeIcon();
}

function updateThemeIcon() {
  const icon = document.getElementById('theme-icon');
  if (appState.theme === 'light') {
    icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
  } else {
    icon.innerHTML = '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';
  }
}

function toggleSidebar(open) {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('mobile-backdrop');
  if (open) {
    sidebar.classList.add('mobile-open');
    backdrop.classList.add('active');
  } else {
    sidebar.classList.remove('mobile-open');
    backdrop.classList.remove('active');
  }
}

function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetPage = item.dataset.page;
      navigateTo(targetPage, true);
      toggleSidebar(false);
    });
  });
}

function navigateTo(pageId, push = true) {
  appState.activePage = pageId;

  // Update browser URL bar cleanly (e.g. /Control-Center, /projects, /docs, /404)
  const targetPath = ROUTE_MAP[pageId] || window.location.pathname || '/Control-Center';
  if (push && window.location.pathname !== targetPath) {
    window.history.pushState({ pageId }, '', targetPath);
  }

  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === pageId);
  });

  document.querySelectorAll('.page-view').forEach(el => {
    el.classList.toggle('active', el.id === `page-${pageId}`);
  });

  const titles = {
    dashboard: 'Control Center',
    sites: 'Projects & Sites',
    databases: 'Database Explorer & Credentials',
    doctor: 'System Doctor',
    logs: 'Console Logs',
    docs: 'Documentation & Guides',
    settings: 'Preferences',
    '404': '404 Page Not Found'
  };
  const title = titles[pageId] || 'Control Center';
  if (document.getElementById('topbar-view-title')) {
    document.getElementById('topbar-view-title').textContent = title;
  }

  if (pageId === '404') {
    const errorPathEl = document.getElementById('error-404-path');
    if (errorPathEl) errorPathEl.textContent = window.location.pathname || '/unknown';
  }

  if (pageId === 'sites') loadSites();
  if (pageId === 'databases') loadDatabases();
  if (pageId === 'doctor') runDoctor();
  if (pageId === 'logs') loadLogs();
}



// ==========================================================================
// Status & Metrics Polling
// ==========================================================================
async function refreshAllData() {
  await Promise.all([
    fetchStatus(),
    fetchMetrics(),
    fetchBadgeCounts()
  ]);
}

async function pollStatusAndMetrics() {
  await fetchStatus();
  await fetchMetrics();
}

async function fetchBadgeCounts() {
  try {
    const [sitesRes, dbsRes] = await Promise.all([
      fetch('/api/sites'),
      fetch('/api/databases')
    ]);
    const sites = await sitesRes.json();
    const dbs = await dbsRes.json();
    appState.sites = sites || [];
    appState.databases = dbs || [];

    if (document.getElementById('nav-badge-sites')) {
      document.getElementById('nav-badge-sites').textContent = appState.sites.length;
    }
    if (document.getElementById('nav-badge-dbs')) {
      document.getElementById('nav-badge-dbs').textContent = appState.databases.length;
    }
  } catch {}
}

async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    appState.services = data.services || {};
    appState.os = data.os || {};
    appState.installing = data.installing || null;

    renderBrandOS();
    renderInstallBanner();
    renderServicesGrid();
    renderOverviewSpecs();
    renderStackPulse();
  } catch (err) {
    console.error('Failed to fetch status:', err);
  }
}

async function fetchMetrics() {
  try {
    const res = await fetch('/api/metrics');
    const m = await res.json();
    appState.metrics = m;

    const cpuPct = m.cpuPercent || 0;
    const ramPct = m.ramPercent || 0;

    document.getElementById('metric-cpu').textContent = `${cpuPct}%`;
    document.getElementById('metric-ram').textContent = `${ramPct}%`;

    if (document.getElementById('metric-cpu-bar')) {
      document.getElementById('metric-cpu-bar').style.width = `${cpuPct}%`;
    }
    if (document.getElementById('metric-ram-bar')) {
      document.getElementById('metric-ram-bar').style.width = `${ramPct}%`;
    }

    if (document.getElementById('spec-cpu-cores')) {
      document.getElementById('spec-cpu-cores').textContent = `${m.cpuCores || 0} Cores (${m.cpuModel || 'CPU'})`;
    }
    if (document.getElementById('spec-uptime')) {
      const hours = Math.floor((m.uptimeSeconds || 0) / 3600);
      const mins = Math.floor(((m.uptimeSeconds || 0) % 3600) / 60);
      document.getElementById('spec-uptime').textContent = `${hours}h ${mins}m`;
    }
  } catch {}
}

function renderBrandOS() {
  const os = appState.os;
  const brandEl = document.getElementById('brand-os');
  if (os && os.type) {
    brandEl.textContent = `${os.type} (${os.arch})`;
  }
}

function renderStackPulse() {
  const dot = document.getElementById('stack-pulse-dot');
  const text = document.getElementById('stack-pulse-text');
  if (!dot) return;
  const runningCount = Object.values(appState.services).filter(s => s.status === 'running').length;
  if (runningCount >= 2) {
    dot.className = 'status-jewel-dot online';
    if (text) text.textContent = 'Stack Online';
  } else {
    dot.className = 'status-jewel-dot';
    dot.style.backgroundColor = 'var(--status-stopped)';
    dot.style.boxShadow = 'none';
    if (text) text.textContent = 'Stack Standby';
  }
}

function renderInstallBanner() {
  const banner = document.getElementById('install-banner');
  const installAllBtn = document.getElementById('btn-install-all');
  const missing = Object.entries(appState.services).filter(([_, s]) => !s.installed);

  if (installAllBtn) {
    installAllBtn.classList.toggle('hidden', missing.length === 0);
  }

  if (appState.installing) {
    banner.classList.remove('hidden');
    document.getElementById('install-status-text').textContent = `Installing ${appState.installing.service}...`;
    document.getElementById('install-percent-text').textContent = `${appState.installing.progress}%`;
    document.getElementById('install-progress-bar').style.width = `${appState.installing.progress}%`;
  } else {
    banner.classList.add('hidden');
  }
}

// ==========================================================================
// Service Cards Rendering (With Uninstall on ALL cards)
// ==========================================================================
function renderServicesGrid() {
  const container = document.getElementById('services-grid');
  if (!container) return;

  const services = [
    { key: 'apache', label: 'Apache HTTP Server', iconText: 'A', class: 'apache', defaultPort: 80 },
    { key: 'mysql', label: 'MySQL / MariaDB', iconText: 'M', class: 'mysql', defaultPort: 3306 },
    { key: 'php', label: 'PHP Engine', iconText: 'P', class: 'php', defaultPort: null },
    { key: 'phpmyadmin', label: 'phpMyAdmin Client', iconText: 'pMA', class: 'phpmyadmin', defaultPort: 9999 }
  ];

  let html = '';
  for (const item of services) {
    const s = appState.services[item.key] || { status: 'stopped', installed: false };
    const isRunning = s.status === 'running';
    const isInstalled = s.installed;

    let statusClass = 'stopped';
    let statusText = 'STOPPED';

    if (!isInstalled) {
      statusClass = 'missing';
      statusText = 'NOT INSTALLED';
    } else if (isRunning) {
      statusClass = 'running';
      statusText = 'RUNNING';
    } else if (item.key === 'php') {
      statusClass = 'running';
      statusText = 'ACTIVE';
    }

    const portDisplay = s.port ? `Port ${s.port}` : (item.key === 'php' ? 'CLI Engine' : '');

    html += `
      <div class="card service-card service-${item.key}">
        <div class="service-card-top">
          <div class="service-title-group">
            <div class="service-icon ${item.class}">${item.iconText}</div>
            <div>
              <div class="service-name">${item.label}</div>
              <div class="service-port font-mono">${portDisplay}</div>
            </div>
          </div>
          <span class="status-pill ${statusClass}">
            <span class="status-dot ${isRunning || (item.key === 'php' && isInstalled) ? 'online' : 'offline'}"></span>
            ${statusText}
          </span>
        </div>

        <div class="service-meta-text" title="${s.path || ''}">
          ${isInstalled ? (s.path || 'Configured & Ready') : 'Component package or portable zip not installed'}
        </div>

        <div class="service-card-actions">
          ${!isInstalled ? `
            <button class="btn btn-warning btn-sm" onclick="installService('${item.key}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              1-Click Install
            </button>
          ` : item.key === 'php' ? `
            <span class="badge-soft">PHP Engine Ready ✔</span>
            <button class="btn btn-secondary btn-sm" onclick="uninstallService('php')" title="Uninstall PHP Binaries">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              Uninstall
            </button>
          ` : isRunning ? `
            <button class="btn btn-danger btn-sm" onclick="stopService('${item.key}')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"></rect></svg>
              Stop
            </button>
            <button class="btn btn-secondary btn-sm" onclick="restartService('${item.key}')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
              Restart
            </button>
            <button class="btn btn-secondary btn-sm" onclick="uninstallService('${item.key}')" title="Uninstall Component">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              Uninstall
            </button>
            ${item.key === 'apache' ? '<a href="http://localhost:80" target="_blank" class="btn btn-secondary btn-sm"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>Open Web ↗</a>' : ''}
            ${item.key === 'phpmyadmin' ? '<a href="http://localhost:9999" target="_blank" class="btn btn-secondary btn-sm"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>Open GUI ↗</a>' : ''}
          ` : `
            <button class="btn btn-success btn-sm" onclick="startService('${item.key}')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              Start
            </button>
            <button class="btn btn-secondary btn-sm" onclick="uninstallService('${item.key}')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              Uninstall
            </button>
          `}
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

function renderOverviewSpecs() {
  const os = appState.os || {};
  if (document.getElementById('spec-host-os')) {
    document.getElementById('spec-host-os').textContent = `${os.type || 'OS'} (${os.release || ''})`;
  }
  if (document.getElementById('spec-pkg-mgr')) {
    document.getElementById('spec-pkg-mgr').textContent = os.pkgManager || 'Direct Portable';
  }

  const apachePort = appState.services.apache?.port || 80;
  const pmaPort = appState.services.phpmyadmin?.port || 9999;
  const apacheUrl = `http://localhost:${apachePort}`;
  const pmaUrl = `http://localhost:${pmaPort}`;

  const apacheLink = document.getElementById('info-apache-url');
  if (apacheLink) apacheLink.href = apacheUrl;

  const pmaLink = document.getElementById('info-pma-url');
  if (pmaLink) pmaLink.href = pmaUrl;

  const hdrWeb = document.getElementById('hdr-web-root-btn');
  if (hdrWeb) hdrWeb.href = apacheUrl;

  const hdrPma = document.getElementById('hdr-pma-btn');
  if (hdrPma) hdrPma.href = pmaUrl;

  const dockPma = document.getElementById('dock-pma-btn');
  if (dockPma) dockPma.href = pmaUrl;
  const dockPmaPort = document.getElementById('dock-pma-port');
  if (dockPmaPort) dockPmaPort.textContent = `${pmaPort} ↗`;

  const dockApache = document.getElementById('dock-apache-btn');
  if (dockApache) dockApache.href = apacheUrl;
  const dockApachePort = document.getElementById('dock-apache-port');
  if (dockApachePort) dockApachePort.textContent = `${apachePort} ↗`;
}

// ==========================================================================
// Service Orchestration Actions (100% Workable)
// ==========================================================================
async function startService(name) {
  showToast(`Starting ${name}...`);
  try {
    const res = await fetch(`/api/services/${name}/start`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(`${name} is now running ✔`);
    } else {
      showToast(`Could not start ${name}`, true);
    }
    fetchStatus();
  } catch {
    showToast(`Error starting ${name}`, true);
  }
}

async function stopService(name) {
  showToast(`Stopping ${name}...`);
  try {
    const res = await fetch(`/api/services/${name}/stop`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(`${name} stopped ✔`);
    } else {
      showToast(`Could not stop ${name}`, true);
    }
    fetchStatus();
  } catch {
    showToast(`Error stopping ${name}`, true);
  }
}

async function restartService(name) {
  showToast(`Restarting ${name}...`);
  try {
    const res = await fetch(`/api/services/${name}/restart`, { method: 'POST' });
    const data = await res.json();
    showToast(data.success ? `${name} restarted ✔` : `Restart failed`, !data.success);
    fetchStatus();
  } catch {
    showToast(`Error restarting ${name}`, true);
  }
}

async function startAll() {
  showToast('Starting full LocalXWeb stack...');
  try {
    const res = await fetch('/api/services/start-all', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('LocalXWeb stack is now online! ✔');
    } else {
      showToast('Some services could not start', true);
    }
    fetchStatus();
  } catch {
    showToast('Failed to start stack', true);
  }
}

async function stopAll() {
  showToast('Stopping full LocalXWeb stack...');
  try {
    const res = await fetch('/api/services/stop-all', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('All stack services stopped ✔');
    } else {
      showToast('Failed to stop stack', true);
    }
    fetchStatus();
  } catch {
    showToast('Failed to stop stack', true);
  }
}

async function restartAll() {
  showToast('Restarting full LocalXWeb stack...');
  try {
    const res = await fetch('/api/services/restart-all', { method: 'POST' });
    const data = await res.json();
    showToast('Stack restarted successfully ✔');
    fetchStatus();
  } catch {
    showToast('Restart failed', true);
  }
}

async function installService(name) {
  showToast(`Initiating auto-install for ${name}...`);
  try {
    const res = await fetch(`/api/services/${name}/install`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      showToast(`Installing ${name}...`);
      pollInstallation();
    } else {
      showToast(data.error || 'Install failed to start', true);
    }
  } catch (err) {
    showToast(`Install error: ${err.message}`, true);
  }
}

async function uninstallService(name) {
  const label = name === 'php' ? 'PHP Engine' : name;
  if (!confirm(`Are you sure you want to uninstall ${label}? You can reinstall it anytime directly from the dashboard or CLI.`)) return;

  showToast(`Uninstalling ${label}...`);
  try {
    const res = await fetch(`/api/services/${name}/uninstall`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purge: false })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`${label} uninstalled successfully ✔`);
      fetchStatus();
    } else {
      showToast(data.error || 'Uninstall failed', true);
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, true);
  }
}

async function installAllMissing() {
  showToast('Initiating auto-install for all missing components...');
  try {
    const res = await fetch('/api/services/install-all', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      showToast('Installing missing components...');
      pollInstallation();
    } else {
      showToast(data.error || 'Failed to start install', true);
    }
  } catch (err) {
    showToast(`Install error: ${err.message}`, true);
  }
}

function pollInstallation() {
  const interval = setInterval(async () => {
    try {
      const res = await fetch('/api/install/status');
      const data = await res.json();
      if (data.installing) {
        appState.installing = data;
        renderInstallBanner();
      } else {
        clearInterval(interval);
        appState.installing = null;
        renderInstallBanner();
        showToast('Installation completed successfully! ✔');
        fetchStatus();
      }
    } catch {
      clearInterval(interval);
    }
  }, 1000);
}

// ==========================================================================
// Database Explorer & Password Reveal
// ==========================================================================
async function loadDatabases() {
  const container = document.getElementById('database-list');
  container.innerHTML = '<p class="subtitle">Fetching databases from MySQL / MariaDB...</p>';

  try {
    const res = await fetch('/api/databases');
    const dbs = await res.json();
    appState.databases = dbs || [];

    if (document.getElementById('nav-badge-dbs')) {
      document.getElementById('nav-badge-dbs').textContent = appState.databases.length;
    }

    if (!dbs || dbs.length === 0) {
      container.innerHTML = '<p class="subtitle">No databases found. Make sure MySQL/MariaDB is running, then click "Create Database with Password".</p>';
      return;
    }

    let html = '';
    for (const db of dbs) {
      html += `
        <div class="card db-card">
          <div class="db-info-group">
            <div class="service-icon mysql">DB</div>
            <div>
              <div class="db-title">${db.name}</div>
              <div class="db-meta font-mono">${db.tables || 0} tables • ${db.sizeMB || 0} MB • utf8mb4</div>
            </div>
          </div>
          <div class="action-btn-group">
            <button class="btn btn-secondary btn-sm" onclick="showConnectionInfo('${db.name}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              Connection Info
            </button>
            <button class="btn btn-secondary btn-sm" onclick="viewDatabaseTables('${db.name}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>
              View Tables
            </button>
            <button class="btn btn-secondary btn-sm" onclick="exportDatabase('${db.name}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Export SQL
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteDatabase('${db.name}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              Delete
            </button>
          </div>
        </div>
      `;
    }
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<p class="status-pill missing">Error connecting to MySQL: ${err.message}. Make sure MySQL service is running.</p>`;
  }
}

function openCreateDbModal() {
  document.getElementById('db-modal-name').value = '';
  document.getElementById('db-modal-username').value = '';
  document.getElementById('db-modal-password').value = '';
  document.getElementById('db-modal-create-user').checked = true;
  toggleDedicatedUserFields();
  openModal('modal-create-db');
}

function toggleDedicatedUserFields() {
  const checked = document.getElementById('db-modal-create-user').checked;
  const section = document.getElementById('dedicated-user-fields');
  section.style.display = checked ? 'flex' : 'none';
}

function generateDbPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
  let pass = '';
  for (let i = 0; i < 16; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  document.getElementById('db-modal-password').value = pass;
  document.getElementById('db-modal-password').type = 'text';
  showToast('Generated strong password! ✔');
}

function togglePasswordVisibility(fieldId) {
  const input = document.getElementById(fieldId);
  input.type = input.type === 'password' ? 'text' : 'password';
}

async function submitCreateDatabase() {
  const name = document.getElementById('db-modal-name').value.trim();
  const collation = document.getElementById('db-modal-collation').value;
  const createUser = document.getElementById('db-modal-create-user').checked;
  const username = createUser ? (document.getElementById('db-modal-username').value.trim() || `${name}_user`) : null;
  const password = createUser ? document.getElementById('db-modal-password').value : null;

  if (!name) return showToast('Please enter a database name', true);

  showToast(`Creating database "${name}"...`);
  try {
    const res = await fetch('/api/databases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, collation, username, password })
    });
    const data = await res.json();
    if (res.ok) {
      closeModal('modal-create-db');
      showToast(`Database "${name}" created with credentials! ✔`);
      loadDatabases();
      showConnectionInfo(name);
    } else {
      showToast(data.error || 'Failed to create DB', true);
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, true);
  }
}

// Retrieve and reveal exact saved credentials anytime
async function showConnectionInfo(dbName) {
  showToast(`Fetching credentials for "${dbName}"...`);
  try {
    const res = await fetch(`/api/databases/${dbName}/credentials`);
    const creds = await res.json();

    document.getElementById('conn-info-title').textContent = `Credentials: ${creds.database}`;
    document.getElementById('conn-host').textContent = creds.host || '127.0.0.1';
    document.getElementById('conn-port').textContent = creds.port || 3306;
    document.getElementById('conn-db').textContent = creds.database;
    document.getElementById('conn-user').textContent = creds.user || 'root';

    // Set the EXACT stored password in the reveal input!
    const passInput = document.getElementById('conn-pass-raw');
    passInput.value = creds.password !== undefined ? creds.password : '';
    passInput.type = 'text';

    document.getElementById('snippet-env').textContent = creds.envSnippet;
    document.getElementById('snippet-pdo').textContent = creds.pdoSnippet;

    openModal('modal-conn-info');
  } catch (err) {
    showToast(`Error loading credentials: ${err.message}`, true);
  }
}

function copySnippet(snippetId) {
  const el = document.getElementById(snippetId);
  const text = el.value !== undefined ? el.value : el.textContent;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied to clipboard! ✔');
  }).catch(() => {
    showToast('Failed to copy', true);
  });
}

function openRootPasswordModal() {
  document.getElementById('modal-root-new-pass').value = '';
  openModal('modal-root-pass');
}

async function submitRootPassword() {
  const pass = document.getElementById('modal-root-new-pass').value;
  showToast('Updating root password across MySQL and phpMyAdmin...');
  try {
    const res = await fetch('/api/databases/root-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pass })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('MySQL root password updated & phpMyAdmin re-configured! ✔');
      closeModal('modal-root-pass');
    } else {
      showToast(data.error || 'Failed to update password', true);
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, true);
  }
}

async function deleteDatabase(name) {
  if (!confirm(`Are you sure you want to permanently delete database "${name}"? All tables and data will be lost.`)) return;

  try {
    const res = await fetch(`/api/databases/${name}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      showToast(`Database "${name}" deleted ✔`);
      loadDatabases();
    } else {
      showToast(data.error || 'Delete failed', true);
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, true);
  }
}

async function exportDatabase(name) {
  showToast(`Exporting SQL dump for "${name}"...`);
  try {
    const res = await fetch(`/api/databases/${name}/export`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      showToast(`Database exported to: ${data.file} ✔`);
    } else {
      showToast(data.error || 'Export failed', true);
    }
  } catch (err) {
    showToast(`Export error: ${err.message}`, true);
  }
}

async function viewDatabaseTables(dbName) {
  document.getElementById('table-modal-title').textContent = `Database: ${dbName}`;
  const content = document.getElementById('table-modal-content');
  content.innerHTML = '<p class="subtitle">Fetching tables...</p>';
  openModal('modal-table');

  try {
    const res = await fetch(`/api/databases/${dbName}/tables`);
    const tables = await res.json();

    if (!tables || tables.length === 0) {
      content.innerHTML = `<p class="subtitle">Database "${dbName}" currently has no tables.</p>`;
      return;
    }

    let html = `
      <div class="data-table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Table Name</th>
              <th>Row Count</th>
              <th>Storage Engine</th>
              <th>Collation</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
    `;

    for (const t of tables) {
      html += `
        <tr>
          <td><strong>${t.name}</strong></td>
          <td>${t.rows}</td>
          <td><span class="badge-soft">${t.engine}</span></td>
          <td>${t.collation}</td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="viewTableData('${dbName}', '${t.name}')">Preview Records</button>
          </td>
        </tr>
      `;
    }

    html += '</tbody></table></div>';
    content.innerHTML = html;
  } catch (err) {
    content.innerHTML = `<p class="status-pill missing">Failed to fetch tables: ${err.message}</p>`;
  }
}

async function viewTableData(dbName, tableName) {
  const content = document.getElementById('table-modal-content');
  content.innerHTML = `<p class="subtitle">Fetching sample records from <code>${tableName}</code>...</p>`;

  try {
    const res = await fetch(`/api/databases/${dbName}/tables/${tableName}/data?limit=30`);
    const data = await res.json();

    if (!data.columns || data.columns.length === 0) {
      content.innerHTML = `<p class="subtitle">No columns found in ${tableName}.</p>`;
      return;
    }

    let html = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
        <button class="btn btn-secondary btn-sm" onclick="viewDatabaseTables('${dbName}')">← Back to Tables</button>
        <span style="font-weight: 700; font-size: 0.88rem;">Table: ${tableName} (Sample Data)</span>
      </div>
      <div class="data-table-wrap">
        <table class="data-table">
          <thead>
            <tr>${data.columns.map(c => `<th>${c.name}</th>`).join('')}</tr>
          </thead>
          <tbody>
    `;

    if (!data.rows || data.rows.length === 0) {
      html += `<tr><td colspan="${data.columns.length}" style="text-align: center; color: var(--text-muted); padding: 24px;">No rows exist in this table yet.</td></tr>`;
    } else {
      for (const row of data.rows) {
        html += `<tr>${data.columns.map(c => `<td>${row[c.name] !== null ? String(row[c.name]) : '<em style="color: var(--text-muted)">NULL</em>'}</td>`).join('')}</tr>`;
      }
    }

    html += '</tbody></table></div>';
    content.innerHTML = html;
  } catch (err) {
    content.innerHTML = `<p class="status-pill missing">Error fetching records: ${err.message}</p>`;
  }
}

// ==========================================================================
// Sites Studio
// ==========================================================================
async function loadSites() {
  const container = document.getElementById('sites-grid');
  container.innerHTML = '<p class="subtitle">Loading web projects from DocumentRoot...</p>';

  try {
    const res = await fetch('/api/sites');
    const sites = await res.json();
    appState.sites = sites || [];

    if (document.getElementById('nav-badge-sites')) {
      document.getElementById('nav-badge-sites').textContent = appState.sites.length;
    }

    if (!sites || sites.length === 0) {
      container.innerHTML = '<p class="subtitle">No web projects found in DocumentRoot yet. Click "+ New Project" to scaffold one.</p>';
      return;
    }

    renderSitesList(sites);
  } catch (err) {
    container.innerHTML = `<p class="status-pill missing">Failed to load sites: ${err.message}</p>`;
  }
}

function renderSitesList(sites) {
  const container = document.getElementById('sites-grid');
  let html = '';
  for (const site of sites) {
    html += `
      <div class="card site-card">
        <div class="site-name-wrap">
          <h4>${site.name}</h4>
          <div class="site-path font-mono">${site.path}</div>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span class="badge-soft">${site.type} App</span>
          <a href="${site.url}" target="_blank" class="btn btn-primary btn-sm">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
            Open Web ↗
          </a>
        </div>
      </div>
    `;
  }
  container.innerHTML = html;
}

function filterSites() {
  const q = (document.getElementById('site-search').value || '').toLowerCase();
  const filtered = appState.sites.filter(s => s.name.toLowerCase().includes(q) || s.type.toLowerCase().includes(q));
  renderSitesList(filtered);
}

function openCreateProjectModal() {
  document.getElementById('modal-project-name').value = '';
  openModal('modal-project');
}

function setupTemplateSelectors() {
  const cards = document.querySelectorAll('.template-card');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      cards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      card.querySelector('input').checked = true;
    });
  });
}

async function submitCreateProject() {
  const name = document.getElementById('modal-project-name').value.trim();
  const template = document.querySelector('input[name="project-tpl"]:checked')?.value || 'php';

  if (!name) return showToast('Please enter a project name', true);

  showToast(`Scaffolding project "${name}"...`);
  try {
    const res = await fetch('/api/sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, template })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`Project "${name}" created! ✔`);
      closeModal('modal-project');
      loadSites();
    } else {
      showToast(data.error || 'Failed to create project', true);
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, true);
  }
}

// ==========================================================================
// System Doctor
// ==========================================================================
async function runDoctor() {
  const container = document.getElementById('doctor-content');
  container.innerHTML = '<p class="subtitle">Running comprehensive health check...</p>';

  try {
    const res = await fetch('/api/doctor');
    const doc = await res.json();

    const isHealthy = doc.overallStatus === 'healthy';

    let html = `
      <div style="display: flex; flex-direction: column; gap: 18px;">
        <div class="card" style="border-left: 4px solid ${isHealthy ? 'var(--status-online)' : 'var(--status-warning)'};">
          <h4>Health Status: <span class="font-bold" style="color: ${isHealthy ? 'var(--status-online)' : 'var(--status-warning)'}">${doc.overallStatus.toUpperCase()}</span></h4>
          <p class="subtitle">Operating System: ${doc.system.os} (${doc.system.arch}) • Package Manager: ${doc.system.packageManager || 'Portable'} • VC++ Runtime: ${doc.system.vcRedist ? 'Installed ✔' : 'Missing ✖'}</p>
        </div>

        <div class="overview-grid">
          <div class="card">
            <div class="card-title">Port Conflict Diagnostics</div>
            ${Object.entries(doc.ports).map(([name, p]) => `
              <div class="spec-row">
                <span>Port ${p.port} (${name})</span>
                <span style="color: var(--status-online); font-weight: 700;">
                  ${p.status === 'free' ? 'Available ✔' : 'In-Use / Active ✔'}
                </span>
              </div>
            `).join('')}
          </div>

          <div class="card">
            <div class="card-title">PHP 8.x Loaded Extensions</div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;">
              ${Object.entries(doc.phpExtensions).map(([ext, active]) => `
                <span class="badge-soft" style="background-color: ${active ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'}; color: ${active ? 'var(--status-online)' : 'var(--status-error)'}">
                  ${active ? '✔' : '✖'} ${ext}
                </span>
              `).join('')}
            </div>
          </div>
        </div>

        ${doc.recommendations.length > 0 ? `
          <div class="card" style="border-left: 4px solid var(--status-warning);">
            <div class="card-title">Doctor Recommendations</div>
            <ul style="padding-left: 20px; margin-top: 8px; font-size: 0.86rem; color: var(--text-secondary); line-height: 1.6;">
              ${doc.recommendations.map(r => `<li>${r}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    `;

    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<p class="status-pill missing">Failed to run System Doctor: ${err.message}</p>`;
  }
}

async function triggerAutoFixGui() {
  showToast('Running Universal Auto-Fixer & Self-Healing Pipeline...');
  try {
    const res = await fetch('/api/autofix', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Universal Auto-Fix Completed! ✔');
      runDoctor();
      fetchStatus();
    } else {
      showToast(data.error || 'Auto-fix notice', true);
    }
  } catch (err) {
    showToast(`Auto-fix error: ${err.message}`, true);
  }
}

// ==========================================================================
// Console Logs Studio
// ==========================================================================
async function loadLogs() {
  const service = document.getElementById('log-service').value;
  document.getElementById('terminal-title').textContent = `${service}.log`;
  const pre = document.getElementById('log-content');
  pre.textContent = `Fetching live logs for ${service}...`;

  try {
    const res = await fetch(`/api/logs/${service}`);
    const data = await res.json();
    appState.rawLogs = data.content || 'Log file is currently empty.';
    filterLogContent();
  } catch (err) {
    pre.textContent = `Could not fetch log: ${err.message}`;
  }
}

function filterLogContent() {
  const query = (document.getElementById('log-filter').value || '').toLowerCase();
  const pre = document.getElementById('log-content');

  if (!query) {
    pre.textContent = appState.rawLogs;
  } else {
    const lines = appState.rawLogs.split('\n');
    const filtered = lines.filter(l => l.toLowerCase().includes(query));
    pre.textContent = filtered.join('\n') || `No matching lines found for query: "${query}"`;
  }

  const autoscroll = document.getElementById('autoscroll-chk').checked;
  if (autoscroll) {
    const body = document.getElementById('terminal-body');
    body.scrollTop = body.scrollHeight;
  }
}

function downloadCurrentLog() {
  const service = document.getElementById('log-service').value;
  const content = appState.rawLogs || '';
  const blob = new Blob([content], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${service}-${Date.now()}.log`;
  a.click();
  showToast(`Downloaded ${service}.log ✔`);
}

async function clearLogsGui() {
  if (!confirm('Are you sure you want to clean and truncate all log files?')) return;
  try {
    const res = await fetch('/api/clean/logs', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      showToast(`Logs cleared successfully! (${data.formattedFreed} freed) ✔`);
      loadLogs();
    } else {
      showToast(data.error || 'Failed to clear logs', true);
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, true);
  }
}

async function clearCacheGui() {
  try {
    const res = await fetch('/api/clean/cache', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      showToast(`Cache purged! (${data.filesCleaned} files, ${data.formattedFreed} freed) ✔`);
    } else {
      showToast(data.error || 'Failed to clear cache', true);
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, true);
  }
}

async function clearAllGui() {
  if (!confirm('This will purge all temporary caches, session files, reset PID tracker, and empty all service logs. Proceed?')) return;
  try {
    const res = await fetch('/api/clean/all', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      showToast(`Deep cleanup complete! (${data.totalFilesCleaned} files, ${data.formattedFreed} freed) ✔`);
      loadLogs();
    } else {
      showToast(data.error || 'Failed to clean all', true);
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, true);
  }
}

// ==========================================================================
// Preferences & Port Configuration
// ==========================================================================
async function saveSettings() {
  const dbPort = parseInt(document.getElementById('setting-dashboard-port').value, 10);
  const apachePort = parseInt(document.getElementById('setting-apache-port').value, 10);
  const mysqlPort = parseInt(document.getElementById('setting-mysql-port').value, 10);
  const pmaPort = parseInt(document.getElementById('setting-pma-port').value, 10);
  const password = document.getElementById('setting-mysql-password').value;

  try {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dashboardPort: dbPort,
        apache: { port: apachePort },
        mysql: { port: mysqlPort, rootPassword: password },
        phpmyadmin: { port: pmaPort }
      })
    });
    showToast('Preferences saved successfully! ✔');
  } catch {
    showToast('Failed to save preferences', true);
  }
}

// ==========================================================================
// Modal & Toast Utilities
// ==========================================================================
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.borderColor = isError ? 'var(--status-error)' : 'var(--accent-primary)';
  toast.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 3200);
}
