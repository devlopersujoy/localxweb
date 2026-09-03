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

  isInstalled() {
    return !!(this.getInstallPath() || detectPHP());
  }

  getServerRoot() {
    const httpdPath = this.getInstallPath();
    const managedDir = path.join(platform.servicesDir, 'apache');
    // If managed Windows Apache exists
    if (httpdPath && httpdPath.startsWith(managedDir)) {
      const binDir = path.dirname(httpdPath);
      return path.dirname(binDir);
    }
    // Always use user-space ~/.localxweb/services/apache for configs and logs
    try {
      if (!fs.existsSync(managedDir)) fs.mkdirSync(managedDir, { recursive: true });
    } catch {}
    return managedDir;
  }

  getConfDir() {
    const srvRoot = this.getServerRoot();
    const confDir = path.join(srvRoot, 'conf');
    try {
      if (!fs.existsSync(confDir)) fs.mkdirSync(confDir, { recursive: true });
    } catch {}
    return confDir;
  }

  async install(onProgress) {
    const packageManager = require('../installer/packageManager');
    return packageManager.installService('apache', this, onProgress);
  }

  async configure() {
    try {
      const serverRoot = this.getServerRoot();
      if (!serverRoot) return false;

      const confDir = this.getConfDir();
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

      // Detect PHP to inject PHP module if on Windows
      const phpPath = detectPHP();
      let phpDirectives = '';
      if (phpPath && platform.isWindows) {
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

        if (content.includes('Define SRVROOT')) {
          content = content.replace(/Define SRVROOT\s+".*?"/g, `Define SRVROOT "${srvRootNormalized}"`);
        } else {
          content = `Define SRVROOT "${srvRootNormalized}"\n` + content;
        }

        content = content.replace(/^Listen\s+\d+/gm, `Listen ${this.port}`);

        if (content.match(/^ServerName\s+/m)) {
          content = content.replace(/^ServerName\s+.*$/m, `ServerName localhost:${this.port}`);
        } else {
          content = content.replace(/Define SRVROOT.*/, `$&\nServerName localhost:${this.port}`);
        }

        content = content.replace(/DocumentRoot\s+".*?"/g, `DocumentRoot "${docRootNormalized}"`);
        content = content.replace(/<Directory\s+".*?htdocs.*?"\s*>/gi, `<Directory "${docRootNormalized}">`);

        if (content.includes('DirectoryIndex')) {
          content = content.replace(/DirectoryIndex\s+(.*)/g, (match, p1) => {
            if (!p1.includes('index.php')) {
              return `DirectoryIndex index.php ${p1}`;
            }
            return match;
          });
        }

        if (phpDirectives && !content.includes('LocalXWeb') && !content.includes('php_module')) {
          content += '\n' + phpDirectives + '\n';
        }

        fs.writeFileSync(confFile, content);
      } else {
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
    } catch (err) {
      logger.warn(`Apache configuration notice: ${err.message}`);
      return false;
    }
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
    // 1. Check if non-root Linux user needs user port >= 1024
    if (!platform.isWindows && typeof process.getuid === 'function' && process.getuid() !== 0 && this.port < 1024) {
      logger.info(`Port ${this.port} requires root privileges on Linux. Switched to user port 8080.`);
      this.port = 8080;
    }

    const currentStatus = await this.status();
    if (currentStatus === 'running') {
      logger.warn('Web Server (Apache/PHP) is already running');
      return true;
    }

    // Check port conflict with auto-forwarding
    const portBusy = await checkPort(this.port);
    if (portBusy) {
      const AutoFixer = require('../utils/autoFixer');
      const safePort = await AutoFixer.findAvailablePort(this.port + 1);
      logger.warn(`Port ${this.port} is busy. Auto-forwarding Web Server (Apache/PHP) to available port ${safePort}...`);
      this.port = safePort;

      const curApacheCfg = config.get('apache') || {};
      curApacheCfg.port = safePort;
      config.set('apache', curApacheCfg);
    }

    const httpdPath = this.getInstallPath();
    const phpPath = detectPHP();

    // Configure httpd.conf if Apache is available
    if (httpdPath) {
      await this.configure();
    }

    let started = false;

    // 1. Try launching native Apache
    if (httpdPath) {
      try {
        const srvRoot = this.getServerRoot();
        const confFile = path.join(this.getConfDir(), 'httpd.conf');

        if (platform.isWindows) {
          this._spawnDetached(httpdPath, ['-d', srvRoot], { cwd: srvRoot });
        } else {
          // On Linux/macOS
          this._spawnDetached(httpdPath, ['-f', confFile], { cwd: srvRoot });
        }

        started = await waitForPort(this.port, 4000);
      } catch (e) {
        logger.warn(`Native Apache launch skipped: ${e.message}`);
      }
    }

    // 2. Seamless fallback to PHP Built-in Web Server Engine if Apache failed or not permitted
    if (!started && phpPath) {
      logger.info(`Starting LocalXWeb Web Server (PHP Engine) on http://localhost:${this.port}...`);
      try {
        const iniPath = path.join(platform.configDir, 'php.ini');
        const args = ['-S', `0.0.0.0:${this.port}`, '-t', this.docRoot];
        if (fs.existsSync(iniPath)) {
          args.unshift('-c', iniPath);
        }
        this._spawnDetached(phpPath, args, { cwd: this.docRoot });
        started = await waitForPort(this.port, 6000);
      } catch (err) {
        logger.error(`PHP Web Engine launch error: ${err.message}`);
      }
    }

    if (started) {
      logger.success(`Web Server is running on http://localhost:${this.port}`);
      return true;
    }

    if (!httpdPath && !phpPath) {
      logger.error('Neither Apache nor PHP was found. Run "localxweb install" to install web server components.');
      return false;
    }

    return true;
  }

  getDownloadUrl() {
    if (platform.isWindows) {
      return 'https://www.apachelounge.com/download/VS17/binaries/httpd-2.4.59-240404-win64-VS17.zip';
    }
    return null;
  }
}

module.exports = ApacheService;
