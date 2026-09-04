const fs = require('fs');
const path = require('path');
const platform = require('../utils/platform');

const isNonRootPosix = !platform.isWindows && typeof process.getuid === 'function' && process.getuid() !== 0;

const DEFAULT_CONFIG = {
  dashboardPort: isNonRootPosix ? 9898 : 98,
  phpmyadminPort: 9999,
  apache: {
    port: isNonRootPosix ? 8080 : 80,
    sslPort: isNonRootPosix ? 8443 : 443,
    docRoot: platform.htdocsDir
  },
  mysql: {
    port: 3306,
    rootPassword: '',
    dataDir: platform.mysqlDataDir
  },
  php: {
    version: '8.3'
  },
  autoStart: ['apache', 'mysql'],
  installDir: platform.servicesDir,
  mcpPort: 9900,
  mcpAuthEnabled: false,
  mcpApiKey: ''
};

class Config {
  constructor() {
    this.configPath = platform.configFile;
    this._config = null;
  }

  getMcpApiKey() {
    this.load();
    if (!this._config.mcpApiKey) {
      const crypto = require('crypto');
      this._config.mcpApiKey = 'lxw_' + crypto.randomBytes(16).toString('hex');
      this.save();
    }
    return this._config.mcpApiKey;
  }

  _ensureDir() {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    }
  }

  load() {
    if (this._config) return this._config;
    this._ensureDir();

    if (fs.existsSync(this.configPath)) {
      try {
        const raw = fs.readFileSync(this.configPath, 'utf8');
        this._config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
      } catch {
        this._config = { ...DEFAULT_CONFIG };
      }
    } else {
      this._config = { ...DEFAULT_CONFIG };
      try { this.save(); } catch {}
    }

    // Auto-adjust ports below 1024 for non-root users on Linux/macOS
    if (isNonRootPosix && this._config) {
      if (this._config.dashboardPort < 1024) this._config.dashboardPort = 9898;
      if (this._config.apache && this._config.apache.port < 1024) this._config.apache.port = 8080;
      if (this._config.apache && this._config.apache.sslPort < 1024) this._config.apache.sslPort = 8443;
    }

    return this._config;
  }

  save() {
    this._ensureDir();
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this._config || DEFAULT_CONFIG, null, 2));
    } catch {}
  }

  get(key) {
    const config = this.load();
    return key ? config[key] : config;
  }

  set(key, value) {
    this.load();
    this._config[key] = value;
    this.save();
  }
}

module.exports = new Config();
