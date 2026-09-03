const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const platform = require('./platform');
const logger = require('./logger');
const { checkPort } = require('./ports');

class AutoFixer {
  /**
   * Find an available port starting from preferredPort
   */
  static async findAvailablePort(preferredPort, maxTries = 30) {
    let port = preferredPort;
    const isNonRoot = !platform.isWindows && typeof process.getuid === 'function' && process.getuid() !== 0;
    
    // Elevate low ports on non-root Linux/macOS
    if (isNonRoot && port < 1024) {
      if (port === 80 || port === 443) port = 8080;
      else if (port === 98) port = 9898;
      else port = 10000 + port;
    }

    for (let i = 0; i < maxTries; i++) {
      const target = port + i;
      const inUse = await checkPort(target);
      if (!inUse) {
        return target;
      }
    }
    return port;
  }

  /**
   * Clean stale PIDs from ~/.localxweb/pids.json
   */
  static cleanupStalePids() {
    try {
      if (!fs.existsSync(platform.pidsFile)) return;
      const raw = fs.readFileSync(platform.pidsFile, 'utf8');
      const pids = JSON.parse(raw);
      let changed = false;

      for (const [name, pid] of Object.entries(pids)) {
        if (!pid || typeof pid !== 'number') {
          delete pids[name];
          changed = true;
          continue;
        }

        let isAlive = false;
        try {
          process.kill(pid, 0);
          isAlive = true;
        } catch {
          isAlive = false;
        }

        if (!isAlive) {
          delete pids[name];
          changed = true;
        }
      }

      if (changed) {
        fs.writeFileSync(platform.pidsFile, JSON.stringify(pids, null, 2));
      }
    } catch {}
  }

  /**
   * Unlock database storage directory from stale locks
   */
  static unlockDatabaseStorage(dataDir) {
    if (!dataDir || !fs.existsSync(dataDir)) return;
    const lockPatterns = ['.pid', '.lock', 'mysql.sock.lock'];

    try {
      const files = fs.readdirSync(dataDir);
      for (const f of files) {
        if (lockPatterns.some(p => f.endsWith(p))) {
          try {
            fs.unlinkSync(path.join(dataDir, f));
          } catch {}
        }
      }
    } catch {}
  }

  /**
   * Ensure user directories and htdocs exist
   */
  static ensureCoreDirectories() {
    const dirs = [
      platform.localxwebDir,
      platform.servicesDir,
      platform.logsDir,
      platform.configDir,
      platform.htdocsDir,
      path.join(platform.servicesDir, 'apache', 'conf'),
      path.join(platform.servicesDir, 'apache', 'logs'),
      path.join(platform.servicesDir, 'mysql')
    ];

    dirs.forEach(dir => {
      try {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      } catch {}
    });

    // Ensure index.php in htdocs
    try {
      const indexPhp = path.join(platform.htdocsDir, 'index.php');
      const indexHtml = path.join(platform.htdocsDir, 'index.html');
      if (!fs.existsSync(indexPhp) && !fs.existsSync(indexHtml)) {
        const phpTemplate = '<?php\n' +
          'echo "<!DOCTYPE html>\\n' +
          '<html lang=\'en\'>\\n' +
          '<head>\\n' +
          '  <meta charset=\'UTF-8\'>\\n' +
          '  <title>LocalXWeb Server</title>\\n' +
          '  <style>\\n' +
          '    body { font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }\\n' +
          '    .card { background: #1e293b; padding: 2.5rem; border-radius: 1rem; border: 1px solid #334155; text-align: center; max-width: 500px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }\\n' +
          '    h1 { color: #38bdf8; margin-top: 0; }\\n' +
          '    p { color: #94a3b8; line-height: 1.6; }\\n' +
          '    .badge { display: inline-block; background: #0284c7; color: white; padding: 0.25rem 0.75rem; border-radius: 9999px; font-weight: bold; font-size: 0.85rem; margin-bottom: 1rem; }\\n' +
          '    a { color: #38bdf8; text-decoration: none; }\\n' +
          '  </style>\\n' +
          '</head>\\n' +
          '<body>\\n' +
          '  <div class=\'card\'>\\n' +
          '    <div class=\'badge\'>LocalXWeb Server Active</div>\\n' +
          '    <h1>It Works!</h1>\\n' +
          '    <p>LocalXWeb Server Stack is running smoothly.</p>\\n' +
          '    <p>Document Root: <code>" . htmlspecialchars(__DIR__) . "</code></p>\\n' +
          '    <p><a href=\'http://localhost:98\'>Control Center</a> &middot; <a href=\'http://localhost:9999\'>phpMyAdmin</a></p>\\n' +
          '  </div>\\n' +
          '</body>\\n' +
          '</html>";\\n' +
          '?>';
        fs.writeFileSync(indexPhp, phpTemplate);
      }
    } catch {}
  }

  /**
   * Ping MySQL server to verify if port has an active MySQL/MariaDB daemon
   */
  static async pingMySQL(port) {
    return new Promise((resolve) => {
      const net = require('net');
      const socket = new net.Socket();
      socket.setTimeout(1200);

      socket.once('data', (data) => {
        const text = data.toString('latin1').toLowerCase();
        socket.destroy();
        if (text.includes('mysql') || text.includes('mariadb') || (data.length > 4 && data[4] === 0x0a)) {
          resolve(true);
        } else {
          resolve(false);
        }
      });

      socket.once('connect', () => {
        // Connected, wait briefly for handshake packet
      });

      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.once('error', () => {
        socket.destroy();
        resolve(false);
      });

      socket.connect(port, '127.0.0.1');
    });
  }

  /**
   * Run full auto-fix pipeline before stack startup
   */
  static async autoFixPipeline(config) {
    this.ensureCoreDirectories();
    this.cleanupStalePids();
    this.unlockDatabaseStorage(platform.mysqlDataDir);

    // Resolve safe ports
    const curDashPort = config.get('dashboardPort') || 98;
    const safeDashPort = await this.findAvailablePort(curDashPort);
    if (safeDashPort !== curDashPort) {
      logger.info(`Port ${curDashPort} busy or restricted. Auto-assigned dashboard to port ${safeDashPort}.`);
      config.set('dashboardPort', safeDashPort);
    }

    const curApacheCfg = config.get('apache') || {};
    const curWebPort = curApacheCfg.port || 80;
    const safeWebPort = await this.findAvailablePort(curWebPort);
    if (safeWebPort !== curWebPort) {
      logger.info(`Port ${curWebPort} busy or restricted. Auto-assigned web server to port ${safeWebPort}.`);
      curApacheCfg.port = safeWebPort;
      config.set('apache', curApacheCfg);
    }

    // Resolve MySQL safe port with auto-forwarding
    const curMysqlCfg = config.get('mysql') || {};
    let curMysqlPort = parseInt(curMysqlCfg.port, 10);
    if (!curMysqlPort || curMysqlPort < 1024) curMysqlPort = 3306;

    const mysqlBusy = await checkPort(curMysqlPort);
    let safeMysqlPort = curMysqlPort;
    if (mysqlBusy) {
      const isMySql = await this.pingMySQL(curMysqlPort);
      if (isMySql) {
        logger.info(`Active database server detected on port ${curMysqlPort}.`);
      } else {
        safeMysqlPort = await this.findAvailablePort(curMysqlPort + 1);
        logger.warn(`Port ${curMysqlPort} is occupied by another app. Auto-forwarding MySQL to port ${safeMysqlPort}.`);
        curMysqlCfg.port = safeMysqlPort;
        config.set('mysql', curMysqlCfg);
      }
    } else if (curMysqlCfg.port !== safeMysqlPort) {
      curMysqlCfg.port = safeMysqlPort;
      config.set('mysql', curMysqlCfg);
    }

    const curPmaPort = config.get('phpmyadminPort') || 9999;
    const safePmaPort = await this.findAvailablePort(curPmaPort);
    if (safePmaPort !== curPmaPort) {
      logger.info(`Port ${curPmaPort} busy. Auto-assigned phpMyAdmin to port ${safePmaPort}.`);
      config.set('phpmyadminPort', safePmaPort);
    }

    return {
      dashboardPort: safeDashPort,
      webPort: safeWebPort,
      mysqlPort: safeMysqlPort,
      pmaPort: safePmaPort
    };
  }
}

module.exports = AutoFixer;
