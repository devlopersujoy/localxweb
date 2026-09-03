const fs = require('fs');
const path = require('path');
const platform = require('../utils/platform');
const config = require('../config');

class SitesManager {
  constructor() {
    this.htdocsDir = platform.htdocsDir;
  }

  _ensureDir() {
    if (!fs.existsSync(this.htdocsDir)) {
      fs.mkdirSync(this.htdocsDir, { recursive: true });
    }
  }

  listSites() {
    this._ensureDir();
    const entries = fs.readdirSync(this.htdocsDir, { withFileTypes: true });
    const sites = [];
    const apachePort = config.get('apache')?.port || 80;
    const portSuffix = apachePort === 80 ? '' : `:${apachePort}`;

    // Also include root if has index
    if (fs.existsSync(path.join(this.htdocsDir, 'index.php')) || fs.existsSync(path.join(this.htdocsDir, 'index.html'))) {
      sites.push({
        name: '(root)',
        path: this.htdocsDir,
        type: fs.existsSync(path.join(this.htdocsDir, 'index.php')) ? 'PHP' : 'HTML',
        url: `http://localhost${portSuffix}/`,
        isRoot: true
      });
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const sitePath = path.join(this.htdocsDir, entry.name);
        let type = 'Static HTML';
        if (fs.existsSync(path.join(sitePath, 'wp-config.php')) || fs.existsSync(path.join(sitePath, 'wp-load.php'))) {
          type = 'WordPress';
        } else if (fs.existsSync(path.join(sitePath, 'artisan'))) {
          type = 'Laravel';
        } else if (fs.existsSync(path.join(sitePath, 'index.php'))) {
          type = 'PHP';
        }

        const stat = fs.statSync(sitePath);
        sites.push({
          name: entry.name,
          path: sitePath,
          type,
          url: `http://localhost${portSuffix}/${entry.name}/`,
          lastModified: stat.mtime,
          isRoot: false
        });
      }
    }

    return sites;
  }

  createSite(name, template = 'php') {
    this._ensureDir();
    const cleanName = name.trim().replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
    const targetDir = path.join(this.htdocsDir, cleanName);

    if (fs.existsSync(targetDir)) {
      throw new Error(`Site or directory "${cleanName}" already exists`);
    }

    fs.mkdirSync(targetDir, { recursive: true });

    if (template === 'php') {
      const indexContent = `<?php
/**
 * Site: ${cleanName}
 * Created with LocalXWeb
 */
$dbHost = '127.0.0.1';
$dbUser = 'root';
$dbPass = '';
$dbName = '${cleanName.replace(/-/g, '_')}';

$dbConnected = false;
$dbError = null;

try {
  $pdo = new PDO("mysql:host=$dbHost;charset=utf8mb4", $dbUser, $dbPass);
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $dbConnected = true;
} catch (Exception $e) {
  $dbError = $e->getMessage();
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${cleanName} &middot; LocalXWeb</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0;
      padding: 1rem;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 1rem;
      padding: 2.5rem;
      max-width: 550px;
      width: 100%;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
    }
    h1 { margin-top: 0; color: #38bdf8; font-size: 1.8rem; }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.8rem;
      font-weight: 600;
      margin-bottom: 1rem;
    }
    .badge-success { background: #059669; color: white; }
    .badge-warning { background: #d97706; color: white; }
    .status-item {
      display: flex;
      justify-content: space-between;
      padding: 0.6rem 0;
      border-bottom: 1px solid #334155;
      font-size: 0.95rem;
    }
    .status-item span:first-child { color: #94a3b8; }
    .actions { margin-top: 1.5rem; display: flex; gap: 0.75rem; }
    .btn {
      display: inline-block;
      background: #3b82f6;
      color: white;
      text-decoration: none;
      padding: 0.6rem 1.2rem;
      border-radius: 0.5rem;
      font-weight: 500;
      font-size: 0.9rem;
    }
    .btn-secondary { background: #334155; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge badge-success">Local Project Ready</span>
    <h1>${cleanName}</h1>
    <div class="status-item">
      <span>PHP Version</span>
      <strong><?= phpversion() ?></strong>
    </div>
    <div class="status-item">
      <span>Database Connection</span>
      <strong><?= $dbConnected ? '<span style="color:#34d399">Connected (127.0.0.1:3306)</span>' : '<span style="color:#f87171">Not Connected</span>' ?></strong>
    </div>
    <div class="status-item">
      <span>Project Directory</span>
      <code><?= htmlspecialchars(__DIR__) ?></code>
    </div>
    <div class="actions">
      <a href="http://localhost:98" class="btn">LocalXWeb Dashboard</a>
      <a href="http://localhost:9999" class="btn btn-secondary">phpMyAdmin</a>
    </div>
  </div>
</body>
</html>
`;
      fs.writeFileSync(path.join(targetDir, 'index.php'), indexContent);
    } else {
      const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${cleanName}</title>
  <style>
    body { font-family: sans-serif; background: #0f172a; color: white; text-align: center; padding-top: 100px; }
  </style>
</head>
<body>
  <h1>${cleanName}</h1>
  <p>Static site created with LocalXWeb.</p>
</body>
</html>`;
      fs.writeFileSync(path.join(targetDir, 'index.html'), htmlContent);
    }

    return {
      name: cleanName,
      path: targetDir,
      type: template.toUpperCase(),
      url: `http://localhost:${config.get('apache')?.port || 80}/${cleanName}/`
    };
  }

  deleteSite(name) {
    this._ensureDir();
    const targetDir = path.join(this.htdocsDir, name);
    if (!fs.existsSync(targetDir)) {
      throw new Error(`Site "${name}" does not exist`);
    }
    fs.rmSync(targetDir, { recursive: true, force: true });
    return true;
  }
}

module.exports = new SitesManager();
