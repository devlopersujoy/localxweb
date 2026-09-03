const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const BaseService = require('./base');
const platform = require('../utils/platform');
const config = require('../config');
const logger = require('../utils/logger');
const { waitForPort, checkPort } = require('../utils/ports');
const { detectMySQL } = require('../installer/detector');

class MySQLService extends BaseService {
  constructor() {
    const cfg = config.get('mysql') || {};
    super('mysql', { port: cfg.port || 3306 });
    this.rootPassword = cfg.rootPassword || '';
    this.dataDir = cfg.dataDir || platform.mysqlDataDir;
  }

  detect() {
    return this.getInstallPath();
  }

  getInstallPath() {
    return detectMySQL();
  }

  getMysqlClientPath() {
    const serverPath = this.getInstallPath();
    if (!serverPath) return null;
    const binDir = path.dirname(serverPath);

    const clientCandidates = [
      path.join(binDir, platform.getExeName('mysql')),
      path.join(binDir, platform.getExeName('mariadb')),
      path.join(binDir, platform.getExeName('mysqladmin')),
      path.join(binDir, platform.getExeName('mariadb-admin'))
    ];

    for (const c of clientCandidates) {
      if (fs.existsSync(c)) return c;
    }

    return this._findInPath('mysql') || this._findInPath('mariadb');
  }

  getDumpClientPath() {
    const serverPath = this.getInstallPath();
    if (!serverPath) return null;
    const binDir = path.dirname(serverPath);

    const dumpCandidates = [
      path.join(binDir, platform.getExeName('mysqldump')),
      path.join(binDir, platform.getExeName('mariadb-dump'))
    ];

    for (const c of dumpCandidates) {
      if (fs.existsSync(c)) return c;
    }

    return this._findInPath('mysqldump') || this._findInPath('mariadb-dump');
  }

  getIniPath() {
    const dataDirNorm = this.dataDir.replace(/\\/g, '/');
    const logFileNorm = this.logFile.replace(/\\/g, '/');

    const iniContent = `[mysqld]
port = ${this.port}
bind-address = 127.0.0.1
datadir = "${dataDirNorm}"
log-error = "${logFileNorm}"
default-storage-engine = InnoDB
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
max_allowed_packet = 64M
innodb_buffer_pool_size = 128M
skip-name-resolve

[client]
port = ${this.port}
default-character-set = utf8mb4
`.trim();

    // Primary config file inside ~/.localxweb/config/my.ini (always user-writable!)
    const confDir = platform.configDir;
    const primaryIni = path.join(confDir, 'my.ini');
    try {
      if (!fs.existsSync(confDir)) fs.mkdirSync(confDir, { recursive: true });
      fs.writeFileSync(primaryIni, iniContent);
    } catch {}

    // Also write to services/mysql if managed
    const svcDir = path.join(platform.servicesDir, 'mysql');
    try {
      if (!fs.existsSync(svcDir)) fs.mkdirSync(svcDir, { recursive: true });
      fs.writeFileSync(path.join(svcDir, 'my.ini'), iniContent);
    } catch {}

    return primaryIni;
  }

  async install(onProgress) {
    const packageManager = require('../installer/packageManager');
    return packageManager.installService('mysql', this, onProgress);
  }

  async onPostInstall() {
    // Check if database needs initialization right after installation
    await this.initDataDir();
  }

  async initDataDir() {
    if (fs.existsSync(this.dataDir) && fs.readdirSync(this.dataDir).length > 0) {
      return true; // Already initialized
    }

    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
    } catch {
      return false;
    }

    const mysqldPath = this.getInstallPath();
    if (!mysqldPath) return false;
    const binDir = path.dirname(mysqldPath);

    logger.info('Initializing database storage directory...');

    // Try MariaDB installer tool first
    const installDbCandidates = [
      path.join(binDir, platform.getExeName('mariadb-install-db')),
      path.join(binDir, platform.getExeName('mysql_install_db'))
    ];

    let initialized = false;
    for (const tool of installDbCandidates) {
      if (fs.existsSync(tool)) {
        try {
          execSync(`"${tool}" --datadir="${this.dataDir}"`, {
            stdio: 'ignore',
            timeout: 60000
          });
          initialized = true;
          logger.success('Database initialized with ' + path.basename(tool));
          break;
        } catch (e) {
          logger.warn(`Initialization with ${path.basename(tool)} skipped: ${e.message}`);
        }
      }
    }

    // Fallback: mysqld --initialize-insecure
    if (!initialized) {
      try {
        execSync(`"${mysqldPath}" --initialize-insecure --datadir="${this.dataDir}"`, {
          stdio: 'ignore',
          timeout: 60000
        });
        initialized = true;
        logger.success('Database initialized with mysqld --initialize-insecure');
      } catch (e) {
        logger.warn(`mysqld initialize skipped: ${e.message}`);
      }
    }

    return initialized;
  }

  async start() {
    const currentStatus = await this.status();
    if (currentStatus === 'running') {
      logger.warn('MySQL/MariaDB is already running');
      return true;
    }

    // Check port conflict with auto-forwarding
    const portBusy = await checkPort(this.port);
    if (portBusy) {
      const AutoFixer = require('../utils/autoFixer');
      const isMySql = await AutoFixer.pingMySQL(this.port);
      if (isMySql) {
        logger.info(`Active database server detected on port ${this.port}. LocalXWeb will connect to it.`);
        return true;
      }

      // If port is occupied by another non-database app, auto-forward!
      const safePort = await AutoFixer.findAvailablePort(this.port + 1);
      logger.warn(`Port ${this.port} is occupied by another app. Auto-forwarding MySQL to available port ${safePort}...`);
      this.port = safePort;

      const curMysqlCfg = config.get('mysql') || {};
      curMysqlCfg.port = safePort;
      config.set('mysql', curMysqlCfg);
    }

    // On Linux/macOS, try starting system service first if present
    if (platform.isLinux) {
      try {
        execSync('service mysql start || service mariadb start', { stdio: 'ignore', timeout: 6000 });
        const ready = await waitForPort(this.port, 4000);
        if (ready) {
          logger.success(`MySQL/MariaDB started on port ${this.port}`);
          return true;
        }
      } catch {}
    }

    const mysqldPath = this.getInstallPath();
    if (!mysqldPath) {
      logger.warn('MySQL/MariaDB binary not found. Run "localxweb install mysql" to install it.');
      return false;
    }

    // Ensure data dir is ready
    try {
      await this.initDataDir();
    } catch {}

    const iniPath = this.getIniPath();
    const binDir = path.dirname(mysqldPath);

    try {
      const args = platform.isWindows ? [] : [`--defaults-file=${iniPath}`];
      this._spawnDetached(mysqldPath, args, {
        cwd: binDir
      });

      const ready = await waitForPort(this.port, 15000);
      if (ready) {
        logger.success(`MySQL/MariaDB started on port ${this.port}`);
        return true;
      } else {
        logger.warn('MySQL process spawned; waiting for port response...');
        return true;
      }
    } catch (e) {
      logger.warn(`Failed to start MySQL/MariaDB daemon: ${e.message}`);
      return false;
    }
  }

  getDownloadUrl() {
    if (platform.isWindows) {
      return 'https://archive.mariadb.org/mariadb-10.11.8/winx64-packages/mariadb-10.11.8-winx64.zip';
    }
    return null;
  }
}

module.exports = MySQLService;
