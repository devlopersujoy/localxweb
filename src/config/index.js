const fs = require('fs');
const path = require('path');
const platform = require('../utils/platform');

const DEFAULT_CONFIG = {
  dashboardPort: 98,
  phpmyadminPort: 9999,
  apache: {
    port: 80,
    sslPort: 443,
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
  installDir: platform.servicesDir
};

class Config {
  constructor() {
    this.configPath = platform.configFile;
    this._config = null;
  }

  _ensureDir() {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  load() {
    if (this._config) return this._config;
    this._ensureDir();

    if (fs.existsSync(this.configPath)) {
      const raw = fs.readFileSync(this.configPath, 'utf8');
      this._config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } else {
      this._config = { ...DEFAULT_CONFIG };
      this.save();
    }
    return this._config;
  }

  save() {
    this._ensureDir();
    fs.writeFileSync(this.configPath, JSON.stringify(this._config || DEFAULT_CONFIG, null, 2));
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
