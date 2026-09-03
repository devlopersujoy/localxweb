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
    const mysqldPath = this.getInstallPath();
    const binDir = mysqldPath ? path.dirname(mysqldPath) : null;
    const installDir = binDir ? path.dirname(binDir) : this.installDir;

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

    // Write to binDir, installDir, and configDir
    const primaryIni = path.join(installDir, 'my.ini');
    fs.writeFileSync(primaryIni, iniContent);
    if (binDir && fs.existsSync(binDir)) {
      try { fs.writeFileSync(path.join(binDir, 'my.ini'), iniContent); } catch {}
    }
    const confDir = platform.configDir;
    if (!fs.existsSync(confDir)) fs.mkdirSync(confDir, { recursive: true });
    try { fs.writeFileSync(path.join(confDir, 'my.ini'), iniContent); } catch {}

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

    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
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
          logger.warn(`Initialization with ${path.basename(tool)} failed: ${e.message}`);
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
        logger.warn(`mysqld initialize failed: ${e.message}`);
      }
    }

    return initialized;
  }

  async start() {
    const mysqldPath = this.getInstallPath();
    if (!mysqldPath) {
      logger.error('MySQL/MariaDB not found. Run "localxweb install mysql" to install it.');
      return false;
    }

    const currentStatus = await this.status();
    if (currentStatus === 'running') {
      logger.warn('MySQL/MariaDB is already running');
      return true;
    }

    // Check port conflict
    const portBusy = await checkPort(this.port);
    if (portBusy) {
      logger.error(`Port ${this.port} is already in use by another database server.`);
      logger.info('You can change the MySQL port in ~/.localxweb/config.json or using the dashboard.');
      return false;
    }

    // Ensure data dir is ready
    await this.initDataDir();

    this.getIniPath(); // Generates my.ini in installDir and binDir
    const binDir = path.dirname(mysqldPath);

    try {
      this._spawnDetached(mysqldPath, [], {
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
      logger.error(`Failed to start MySQL/MariaDB: ${e.message}`);
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
