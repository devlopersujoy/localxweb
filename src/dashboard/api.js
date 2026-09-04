const express = require('express');
const router = express.Router();
const path = require('path');
const { createServices, sitesManager, packageManager, runDiagnostics, config } = require('../index');
const platform = require('../utils/platform');

const { apache, mysql, php, phpmyadmin, dbManager } = createServices();
const services = { apache, mysql, php, phpmyadmin };

// Active installation tracking
let currentInstall = null;

// Get all service statuses
router.get('/status', async (req, res) => {
  const statuses = {};
  for (const [name, svc] of Object.entries(services)) {
    const status = await svc.status();
    const installed = svc.isInstalled ? svc.isInstalled() : (status !== 'not installed');
    statuses[name] = {
      status,
      installed,
      port: svc.port || null,
      version: svc.getVersion ? svc.getVersion() : null,
      path: svc.getInstallPath ? svc.getInstallPath() : null
    };
  }
  res.json({
    services: statuses,
    os: platform.getOSInfo(),
    installing: currentInstall
  });
});

// Start a service
router.post('/services/:name/start', async (req, res) => {
  const svc = services[req.params.name];
  if (!svc) return res.status(404).json({ error: 'Service not found' });
  const ok = await svc.start();
  const status = await svc.status();
  res.json({ success: ok, status });
});

// Stop a service
router.post('/services/:name/stop', async (req, res) => {
  const svc = services[req.params.name];
  if (!svc) return res.status(404).json({ error: 'Service not found' });
  const ok = await svc.stop();
  const status = await svc.status();
  res.json({ success: ok, status });
});

// Restart a service
router.post('/services/:name/restart', async (req, res) => {
  const svc = services[req.params.name];
  if (!svc) return res.status(404).json({ error: 'Service not found' });
  const ok = await svc.restart();
  const status = await svc.status();
  res.json({ success: ok, status });
});

// Start all stack services (Apache, MySQL, phpMyAdmin)
router.post('/services/start-all', async (req, res) => {
  const results = {};
  const order = ['mysql', 'apache', 'phpmyadmin'];
  for (const name of order) {
    try {
      const svc = services[name];
      if (svc && svc.isInstalled()) {
        const ok = await svc.start();
        results[name] = ok ? 'running' : 'failed';
      } else {
        results[name] = 'missing';
      }
    } catch (e) {
      results[name] = 'error';
    }
  }
  res.json({ success: true, statuses: results });
});

// Stop all stack services
router.post('/services/stop-all', async (req, res) => {
  const results = {};
  const order = ['phpmyadmin', 'apache', 'mysql'];
  for (const name of order) {
    try {
      const svc = services[name];
      if (svc) {
        const ok = await svc.stop();
        results[name] = ok ? 'stopped' : 'failed';
      }
    } catch (e) {
      results[name] = 'error';
    }
  }
  res.json({ success: true, statuses: results });
});

// Restart all stack services
router.post('/services/restart-all', async (req, res) => {
  for (const name of ['phpmyadmin', 'apache', 'mysql']) {
    try { if (services[name]) await services[name].stop(); } catch {}
  }
  await new Promise(r => setTimeout(r, 1200));
  const results = {};
  for (const name of ['mysql', 'apache', 'phpmyadmin']) {
    try {
      const svc = services[name];
      if (svc && svc.isInstalled()) {
        const ok = await svc.start();
        results[name] = ok ? 'running' : 'failed';
      }
    } catch (e) {
      results[name] = 'error';
    }
  }
  res.json({ success: true, statuses: results });
});

// Install a service
router.post('/services/:name/install', async (req, res) => {
  const name = req.params.name.toLowerCase();
  const svc = services[name];
  if (!svc) return res.status(404).json({ error: 'Service not found' });

  if (currentInstall) {
    return res.status(409).json({ error: `Installation already in progress: ${currentInstall.service}` });
  }

  currentInstall = { service: name, progress: 0, status: 'downloading' };

  try {
    await svc.install((percent) => {
      if (currentInstall) currentInstall.progress = percent;
    });
    currentInstall = null;
    res.json({ success: true, message: `${name} installed successfully` });
  } catch (err) {
    currentInstall = null;
    res.status(500).json({ error: err.message });
  }
});

// Install all missing services
router.post('/services/install-all', async (req, res) => {
  if (currentInstall) {
    return res.status(409).json({ error: `Installation in progress: ${currentInstall.service}` });
  }

  const order = ['php', 'apache', 'mysql', 'phpmyadmin'];
  const missing = order.filter(s => !services[s].isInstalled());

  if (missing.length === 0) {
    return res.json({ success: true, message: 'All services are already installed!' });
  }

  // Run in background and report accepted
  (async () => {
    for (const s of missing) {
      currentInstall = { service: s, progress: 0, status: 'installing' };
      try {
        await services[s].install((p) => {
          if (currentInstall) currentInstall.progress = p;
        });
      } catch (e) {
        console.error(`Failed auto-install of ${s}:`, e);
      }
    }
    currentInstall = null;
  })();

  res.json({ success: true, message: `Started installation of: ${missing.join(', ')}` });
});

// System Doctor Diagnostics
router.get('/doctor', async (req, res) => {
  try {
    const diag = await runDiagnostics();
    res.json(diag);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Universal Auto-Fix & Self-Healing Endpoint
router.post('/autofix', async (req, res) => {
  try {
    const AutoFixer = require('../utils/autoFixer');
    const result = await AutoFixer.autoFixPipeline(config);
    res.json({ success: true, message: 'Auto-Fix pipeline completed successfully', result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Sites / Projects
router.get('/sites', (req, res) => {
  try {
    const list = sitesManager.listSites();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/sites', (req, res) => {
  const { name, template } = req.body;
  if (!name) return res.status(400).json({ error: 'Site name is required' });
  try {
    const site = sitesManager.createSite(name, template || 'php');
    res.json({ success: true, site });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/sites/:name', (req, res) => {
  try {
    sitesManager.deleteSite(req.params.name);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// List databases
router.get('/databases', async (req, res) => {
  const databases = await dbManager.listDatabases();
  const details = [];
  for (const name of databases) {
    const info = await dbManager.getDatabaseInfo(name);
    details.push(info);
  }
  res.json(details);
});

// Create database with optional dedicated user and password
router.post('/databases', async (req, res) => {
  const { name, username, password, collation } = req.body;
  if (!name) return res.status(400).json({ error: 'Database name is required' });

  try {
    const result = await dbManager.createDatabase(name, { username, password, collation });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update MySQL root password
router.post('/databases/root-password', async (req, res) => {
  const { password } = req.body;
  try {
    await dbManager.setRootPassword(password);
    res.json({ success: true, message: 'Root password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get database credentials (reveals password, user, snippets)
router.get('/databases/:name/credentials', (req, res) => {
  try {
    const creds = dbManager.getCredentials(req.params.name);
    res.json(creds);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Uninstall a service (Apache, MySQL, PHP, phpMyAdmin)
router.post('/services/:name/uninstall', async (req, res) => {
  const name = req.params.name.toLowerCase();
  const svc = services[name];
  if (!svc) return res.status(404).json({ error: 'Service not found' });

  try {
    if (typeof svc.stop === 'function') {
      try { await svc.stop(); } catch {}
    }

    if (name === 'php') {
      const phpDir = path.join(platform.localxwebDir, 'services', 'php');
      if (fs.existsSync(phpDir)) {
        fs.rmSync(phpDir, { recursive: true, force: true });
      }
    } else {
      if (svc.installDir && fs.existsSync(svc.installDir)) {
        fs.rmSync(svc.installDir, { recursive: true, force: true });
      }
    }

    if (name === 'mysql' && req.body && req.body.purge) {
      if (fs.existsSync(platform.mysqlDataDir)) {
        fs.rmSync(platform.mysqlDataDir, { recursive: true, force: true });
      }
    }

    res.json({ success: true, message: `${name} uninstalled successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete database
router.delete('/databases/:name', async (req, res) => {
  const ok = await dbManager.deleteDatabase(req.params.name);
  res.json({ success: ok });
});

// Live System Metrics (CPU, RAM, Uptime)
router.get('/metrics', (req, res) => {
  try {
    res.json(platform.getSystemMetrics());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// List tables in database
router.get('/databases/:name/tables', async (req, res) => {
  const tables = await dbManager.listTables(req.params.name);
  res.json(tables);
});

// Get table columns and sample data
router.get('/databases/:name/tables/:table/data', async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 50;
  const data = await dbManager.getTableData(req.params.name, req.params.table, limit);
  res.json(data);
});

// Export database
router.post('/databases/:name/export', async (req, res) => {
  const exportDir = path.join(platform.localxwebDir, 'backups');
  if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });
  const fileName = `${req.params.name}_backup_${Date.now()}.sql`;
  const destFile = path.join(exportDir, fileName);

  const ok = await dbManager.exportSql(req.params.name, destFile);
  res.json({ success: ok, path: destFile, fileName });
});

// Import / Push SQL into database
router.post('/databases/:name/import', async (req, res) => {
  try {
    const { sourceFile, sqlContent } = req.body || {};
    const dbName = req.params.name;
    if (!sourceFile && !sqlContent) {
      return res.status(400).json({ success: false, error: 'Either sourceFile or sqlContent is required' });
    }
    const ok = await dbManager.importSql(dbName, sourceFile || sqlContent);
    const tables = await dbManager.listTables(dbName);
    res.json({ success: !!ok, database: dbName, tables });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Execute SQL Query on database (edit/update/delete/select)
router.post('/databases/:name/query', async (req, res) => {
  try {
    const { query } = req.body || {};
    if (!query) return res.status(400).json({ success: false, error: 'Query is required' });
    const result = await dbManager.executeQuery(query, req.params.name);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get service logs
router.get('/logs/:service', (req, res) => {
  const svc = services[req.params.service];
  if (!svc) return res.status(404).json({ error: 'Service not found' });
  const lines = parseInt(req.query.lines) || 100;
  const log = svc.getLog(lines);
  res.json({ log });
});

// Get config
router.get('/config', (req, res) => {
  res.json(config.get());
});

// Update config (supports both PUT and POST)
function handleConfigUpdate(req, res) {
  try {
    const updates = req.body || {};

    // Normalize phpmyadmin port if passed as phpmyadmin.port
    if (updates.phpmyadmin && updates.phpmyadmin.port) {
      updates.phpmyadminPort = updates.phpmyadmin.port;
    }

    const current = config.load();
    for (const [key, value] of Object.entries(updates)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value) && typeof current[key] === 'object' && current[key] !== null) {
        current[key] = { ...current[key], ...value };
      } else {
        current[key] = value;
      }
    }
    config.save();

    // Sync in-memory service instances
    if (updates.apache && updates.apache.port && services.apache) {
      services.apache.port = updates.apache.port;
    }
    if (updates.mysql && updates.mysql.port && services.mysql) {
      services.mysql.port = updates.mysql.port;
    }
    if (updates.phpmyadminPort && services.phpmyadmin) {
      services.phpmyadmin.port = updates.phpmyadminPort;
    }

    res.json({ success: true, message: 'Preferences saved successfully', config: config.get() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

router.put('/config', handleConfigUpdate);
router.post('/config', handleConfigUpdate);

// System Cleaner API (Cache, Logs, All)
const cleaner = require('../utils/cleaner');

router.post('/clean/:target', (req, res) => {
  const target = (req.params.target || 'all').toLowerCase();
  try {
    let result;
    if (target === 'cache') result = cleaner.cleanCache();
    else if (target === 'logs') result = cleaner.cleanLogs();
    else if (target === 'pids') result = cleaner.cleanPids();
    else result = cleaner.cleanAll();

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// MCP API Endpoints for Dashboard Integration
router.get('/mcp/info', (req, res) => {
  const { LocalXWebMcpServer, getLocalXWebMcpConfig, getClientConfigPaths } = require('../mcp');
  const server = new LocalXWebMcpServer({ services, dbManager, sitesManager });
  const isAuth = !!config.get('mcpAuthEnabled');
  const apiKey = config.getMcpApiKey();
  const mcpPort = config.get('mcpPort') || 9900;

  res.json({
    version: '1.2.0',
    protocolVersion: '2024-11-05',
    port: mcpPort,
    authRequired: isAuth,
    apiKey: apiKey,
    mcpConfig: getLocalXWebMcpConfig('sse', mcpPort),
    clientPaths: getClientConfigPaths(),
    toolsCount: server.tools.length,
    resourcesCount: server.resources.length,
    promptsCount: server.prompts.length,
    tools: server.tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    resources: server.resources.map(r => ({ uri: r.uri, name: r.name, description: r.description, mimeType: r.mimeType })),
    prompts: server.prompts.map(p => ({ name: p.name, description: p.description, arguments: p.arguments }))
  });
});

// Get MCP API Key Status
router.get('/mcp/api-key', (req, res) => {
  const isAuthEnabled = !!config.get('mcpAuthEnabled');
  const key = config.get('mcpApiKey') || config.getMcpApiKey();
  res.json({
    enabled: isAuthEnabled,
    apiKey: key,
    maskedKey: key.length > 8 ? key.slice(0, 7) + '...' + key.slice(-4) : '••••••••'
  });
});

// Toggle MCP API Key Requirement
router.post('/mcp/api-key/toggle', (req, res) => {
  const enabled = !!req.body.enabled;
  config.set('mcpAuthEnabled', enabled);
  const key = config.get('mcpApiKey') || config.getMcpApiKey();
  res.json({
    success: true,
    enabled,
    apiKey: key,
    message: enabled ? 'MCP API Key authentication enabled' : 'MCP API Key authentication disabled'
  });
});

// Regenerate MCP API Key
router.post('/mcp/api-key/regenerate', (req, res) => {
  const crypto = require('crypto');
  const newKey = 'lxw_' + crypto.randomBytes(16).toString('hex');
  config.set('mcpApiKey', newKey);
  res.json({
    success: true,
    apiKey: newKey,
    enabled: !!config.get('mcpAuthEnabled'),
    message: 'New MCP API Key generated successfully'
  });
});

router.post('/mcp/install', (req, res) => {
  const { installMcpConfig } = require('../mcp');
  const client = req.body.client || 'all';
  const mode = req.body.mode || 'sse';
  const port = parseInt(req.body.port, 10) || 9900;
  const results = installMcpConfig(client, mode, port);
  res.json({ success: true, results });
});

module.exports = router;
