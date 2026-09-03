const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const BaseService = require('./base');
const platform = require('../utils/platform');
const config = require('../config');
const logger = require('../utils/logger');
const { waitForPort, checkPort } = require('../utils/ports');
const { detectApache, detectPHP } = require('../installer/detector');

class ApacheService extends BaseService {
  constructor() {
    const cfg = config.get('apache') || {};
    super('apache', { port: cfg.port || 80 });
    this.sslPort = cfg.sslPort || 443;
    this.docRoot = cfg.docRoot || platform.htdocsDir;
  }

  detect() {
    return this.getInstallPath();
  }

  getInstallPath() {
    return detectApache();
  }

  getServerRoot() {
    const httpdPath = this.getInstallPath();
    if (!httpdPath) return null;
    const binDir = path.dirname(httpdPath);
    return path.dirname(binDir);
  }

  getConfDir() {
    const srvRoot = this.getServerRoot();
    return srvRoot ? path.join(srvRoot, 'conf') : null;
  }

  async install(onProgress) {
    const packageManager = require('../installer/packageManager');
    return packageManager.installService('apache', this, onProgress);
  }

  async configure() {
    const serverRoot = this.getServerRoot();
    if (!serverRoot) return false;

    const confDir = this.getConfDir();
    if (!fs.existsSync(confDir)) fs.mkdirSync(confDir, { recursive: true });

    const confFile = path.join(confDir, 'httpd.conf');
    const srvRootNormalized = serverRoot.replace(/\\/g, '/');
    const docRootNormalized = this.docRoot.replace(/\\/g, '/');
    const logFileNormalized = this.logFile.replace(/\\/g, '/');

    // Ensure docRoot exists with index.php / index.html
    if (!fs.existsSync(this.docRoot)) {
      fs.mkdirSync(this.docRoot, { recursive: true });
    }
    const indexPhp = path.join(this.docRoot, 'index.php');
    const indexHtml = path.join(this.docRoot, 'index.html');
    if (!fs.existsSync(indexPhp) && !fs.existsSync(indexHtml)) {
      fs.writeFileSync(indexPhp, `<?php
echo "<!DOCTYPE html>
<html lang='en'>
<head>
  <meta charset='UTF-8'>
  <title>LocalXWeb Server</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #1e293b; padding: 2.5rem; border-radius: 1rem; border: 1px solid #334155; text-align: center; max-width: 500px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    h1 { color: #38bdf8; margin-top: 0; }
    p { color: #94a3b8; line-height: 1.6; }
    .badge { display: inline-block; background: #0284c7; color: white; padding: 0.25rem 0.75rem; border-radius: 9999px; font-weight: bold; font-size: 0.85rem; margin-bottom: 1rem; }
    a { color: #38bdf8; text-decoration: none; }
  </style>
</head>
<body>
  <div class='card'>
    <div class='badge'>LocalXWeb Server Active</div>
    <h1>It Works!</h1>
    <p>Apache and PHP are running smoothly.</p>
    <p>Document Root: <code>" . htmlspecialchars(__DIR__) . "</code></p>
    <p><a href='http://localhost:98'>Open LocalXWeb Dashboard</a> &middot; <a href='http://localhost:9999'>phpMyAdmin</a></p>
  </div>
</body>
</html>";
?>`);
    }

    // Detect PHP to inject PHP module
    const phpPath = detectPHP();
    let phpDirectives = '';
    if (phpPath) {
      const phpDir = path.dirname(phpPath).replace(/\\/g, '/');
      const phpDll = path.join(path.dirname(phpPath), 'php8apache2_4.dll');
      const phpTsDll = path.join(path.dirname(phpPath), 'php8ts.dll');
      const phpIniDir = path.dirname(platform.phpIniFile).replace(/\\/g, '/');

      if (fs.existsSync(phpDll) && fs.existsSync(phpTsDll)) {
        phpDirectives = `
# PHP Configuration (LocalXWeb)
LoadFile "${phpTsDll.replace(/\\/g, '/')}"
LoadModule php_module "${phpDll.replace(/\\/g, '/')}"
PHPIniDir "${phpIniDir}"
AddHandler application/x-httpd-php .php
`;
      }
    }

    if (fs.existsSync(confFile)) {
      let content = fs.readFileSync(confFile, 'utf8');

      // 1. Update Define SRVROOT or ServerRoot
      if (content.includes('Define SRVROOT')) {
        content = content.replace(/Define SRVROOT\s+".*?"/g, `Define SRVROOT "${srvRootNormalized}"`);
      } else {
        content = `Define SRVROOT "${srvRootNormalized}"\n` + content;
      }

      // 2. Update Listen port
      content = content.replace(/^Listen\s+\d+/gm, `Listen ${this.port}`);

      // 3. Update ServerName
      if (content.match(/^ServerName\s+/m)) {
        content = content.replace(/^ServerName\s+.*$/m, `ServerName localhost:${this.port}`);
      } else {
        content = content.replace(/Define SRVROOT.*/, `$&\nServerName localhost:${this.port}`);
      }

      // 4. Update DocumentRoot and Directory
      content = content.replace(/DocumentRoot\s+".*?"/g, `DocumentRoot "${docRootNormalized}"`);
      content = content.replace(/<Directory\s+".*?htdocs.*?"\s*>/gi, `<Directory "${docRootNormalized}">`);

      // 5. Update DirectoryIndex to include index.php
      if (content.includes('DirectoryIndex')) {
        content = content.replace(/DirectoryIndex\s+(.*)/g, (match, p1) => {
          if (!p1.includes('index.php')) {
            return `DirectoryIndex index.php ${p1}`;
          }
          return match;
        });
      }

      // 6. Append PHP config if not already added
      if (phpDirectives && !content.includes('LocalXWeb') && !content.includes('php_module')) {
        content += '\n' + phpDirectives + '\n';
      }

      fs.writeFileSync(confFile, content);
    } else {
      // Write complete clean config
      const minimalConf = `
ServerRoot "${srvRootNormalized}"
Listen ${this.port}
ServerName localhost:${this.port}
DocumentRoot "${docRootNormalized}"

LoadModule dir_module modules/mod_dir.so
LoadModule mime_module modules/mod_mime.so
LoadModule log_config_module modules/mod_log_config.so
LoadModule authz_core_module modules/mod_authz_core.so
LoadModule rewrite_module modules/mod_rewrite.so
${platform.isWindows ? 'LoadModule unixd_module modules/mod_unixd.so' : ''}

<Directory "${docRootNormalized}">
    Options Indexes FollowSymLinks
    AllowOverride All
    Require all granted
</Directory>

DirectoryIndex index.php index.html
TypesConfig conf/mime.types
ErrorLog "${logFileNormalized}"
LogLevel warn

${phpDirectives}
`.trim();

      fs.writeFileSync(confFile, minimalConf);
    }

    return true;
  }

  testConfig() {
    const httpdPath = this.getInstallPath();
    if (!httpdPath) return { ok: false, error: 'Apache binary not found' };
    const srvRoot = this.getServerRoot();

    try {
      const output = execSync(`"${httpdPath}" -d "${srvRoot}" -t`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return { ok: true, output };
    } catch (e) {
      const err = (e.stderr || e.stdout || e.message || '').toString();
      return { ok: false, error: err.trim() };
    }
  }

  async start() {
    const httpdPath = this.getInstallPath();
    if (!httpdPath) {
      logger.error('Apache not found. Run "localxweb install apache" to install it.');
      return false;
    }

    const currentStatus = await this.status();
    if (currentStatus === 'running') {
      logger.warn('Apache is already running');
      return true;
    }

    // Check if port is taken by another program (like IIS)
    const portBusy = await checkPort(this.port);
    if (portBusy) {
      logger.error(`Port ${this.port} is already in use by another application (e.g. IIS, Skype).`);
      logger.info(`You can change the Apache port in ~/.localxweb/config.json or using the dashboard.`);
      return false;
    }

    // Configure httpd.conf
    await this.configure();

    // Syntax test
    const testResult = this.testConfig();
    if (!testResult.ok) {
      logger.error(`Apache configuration test failed: ${testResult.error}`);
      // If php module failed (e.g. PHP 8.5 vs Apache VC mismatch), remove PHP directive and retry
      if (testResult.error.includes('php_module') || testResult.error.includes('php8apache2_4')) {
        logger.warn('PHP Apache module conflict detected. Disabling embedded mod_php in httpd.conf...');
        const confFile = path.join(this.getConfDir(), 'httpd.conf');
        let content = fs.readFileSync(confFile, 'utf8');
        content = content.replace(/# PHP Configuration[\s\S]*?AddHandler[^\n]*/g, '');
        fs.writeFileSync(confFile, content);
      }
    }

    try {
      const srvRoot = this.getServerRoot();
      this._spawnDetached(httpdPath, ['-d', srvRoot], {
        cwd: srvRoot
      });

      const ready = await waitForPort(this.port, 8000);
      if (ready) {
        logger.success(`Apache started on http://localhost:${this.port}`);
        return true;
      } else {
        logger.warn('Apache process spawned; waiting for port response...');
        return true;
      }
    } catch (e) {
      logger.error(`Failed to start Apache: ${e.message}`);
      return false;
    }
  }

  getDownloadUrl() {
    if (platform.isWindows) {
      return 'https://www.apachelounge.com/download/VS17/binaries/httpd-2.4.59-240404-win64-VS17.zip';
    }
    return null;
  }
}

module.exports = ApacheService;
