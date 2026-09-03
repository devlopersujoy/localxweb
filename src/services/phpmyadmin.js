const path = require('path');
const fs = require('fs');
const BaseService = require('./base');
const PHPService = require('./php');
const platform = require('../utils/platform');
const config = require('../config');
const logger = require('../utils/logger');
const { waitForPort, checkPort } = require('../utils/ports');
const { detectPhpMyAdmin } = require('../installer/detector');

class PhpMyAdminService extends BaseService {
  constructor(mysqlService = null) {
    const cfg = config.get('phpmyadminPort') || 9999;
    super('phpmyadmin', { port: typeof cfg === 'number' ? cfg : 9999 });
    this.phpService = new PHPService();
    this.mysqlService = mysqlService;
  }

  detect() {
    return this.getInstallPath();
  }

  getInstallPath() {
    return detectPhpMyAdmin();
  }

  async install(onProgress) {
    const packageManager = require('../installer/packageManager');
    return packageManager.installService('phpmyadmin', this, onProgress);
  }

  async start() {
    const pmaPath = this.getInstallPath();
    if (!pmaPath) {
      logger.error('phpMyAdmin not found. Run "localxweb install phpmyadmin" to install it.');
      return false;
    }

    const phpPath = this.phpService.getInstallPath();
    if (!phpPath) {
      logger.error('PHP is required to run phpMyAdmin. Run "localxweb install php" first.');
      return false;
    }

    const currentStatus = await this.status();
    if (currentStatus === 'running') {
      logger.warn('phpMyAdmin is already running');
      return true;
    }

    // Check port conflict with auto-fix
    const portBusy = await checkPort(this.port);
    if (portBusy) {
      const AutoFixer = require('../utils/autoFixer');
      const safePort = await AutoFixer.findAvailablePort(this.port + 1);
      logger.info(`Port ${this.port} is in use. Auto-assigning phpMyAdmin to port ${safePort}...`);
      this.port = safePort;
    }

    this._writePhpMyAdminConfig(pmaPath);

    // Get php.ini with mysqli & mbstring enabled
    const iniPath = this.phpService.getPhpIniPath();

    try {
      this._spawnDetached(phpPath, [
        '-c', iniPath,
        '-S', `127.0.0.1:${this.port}`,
        '-t', pmaPath
      ], {
        cwd: pmaPath
      });

      const ready = await waitForPort(this.port, 8000);
      if (ready) {
        logger.success(`phpMyAdmin started on http://localhost:${this.port}`);
        return true;
      } else {
        logger.warn('phpMyAdmin process spawned; waiting for port response...');
        return true;
      }
    } catch (e) {
      logger.error(`Failed to start phpMyAdmin: ${e.message}`);
      return false;
    }
  }

  _writePhpMyAdminConfig(pmaPath) {
    try {
      const mysqlCfg = config.get('mysql') || {};
      const configFile = path.join(pmaPath, 'config.inc.php');

      // Always ensure valid config is present with blowfish secret and current MySQL port
      const secret = this._randomSecret();
      const mysqlPort = (this.mysqlService && this.mysqlService.port) || mysqlCfg.port || 3306;
      const mysqlPass = mysqlCfg.rootPassword || '';

      const tmpDir = path.join(platform.localxwebDir, 'tmp').replace(/\\/g, '/');

      const phpConfig = `<?php
declare(strict_types=1);

/**
 * LocalXWeb phpMyAdmin configuration
 */
$cfg['blowfish_secret'] = '${secret}';

$i = 0;
$i++;
$cfg['Servers'][$i]['auth_type'] = 'config';
$cfg['Servers'][$i]['host'] = '127.0.0.1';
$cfg['Servers'][$i]['port'] = '${mysqlPort}';
$cfg['Servers'][$i]['user'] = 'root';
$cfg['Servers'][$i]['password'] = '${mysqlPass}';
$cfg['Servers'][$i]['AllowNoPassword'] = true;
$cfg['Servers'][$i]['compress'] = false;
$cfg['Servers'][$i]['hide_db'] = '^(information_schema|performance_schema|mysql|sys)$';

$cfg['UploadDir'] = '${tmpDir}';
$cfg['SaveDir'] = '${tmpDir}';
$cfg['TempDir'] = '${tmpDir}';
$cfg['SendErrorReports'] = 'never';
$cfg['Console']['Mode'] = 'collapse';
`;

      fs.writeFileSync(configFile, phpConfig);
    } catch (e) {
      logger.warn(`phpMyAdmin config notice: ${e.message}`);
    }
  }

  _randomSecret() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+';
    let result = '';
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  getDownloadUrl() {
    return 'https://files.phpmyadmin.net/phpMyAdmin/5.2.1/phpMyAdmin-5.2.1-all-languages.zip';
  }
}

module.exports = PhpMyAdminService;
