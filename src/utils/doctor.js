const fs = require('fs');
const path = require('path');
const platform = require('./platform');
const { checkPort } = require('./ports');
const { detectAll } = require('../installer/detector');
const PHPService = require('../services/php');
const config = require('../config');

async function runDiagnostics() {
  const osInfo = platform.getOSInfo();
  const detected = detectAll();
  const phpService = new PHPService();

  const results = {
    system: {
      os: osInfo.type,
      release: osInfo.release,
      arch: osInfo.arch,
      node: process.version,
      packageManager: osInfo.pkgManager || 'none',
      vcRedist: platform.isWindows ? platform.isVCRedistInstalled() : true
    },
    ports: {},
    services: {},
    phpExtensions: {},
    recommendations: []
  };

  // Port checks
  const targetPorts = {
    apache: config.get('apache')?.port || 80,
    mysql: config.get('mysql')?.port || 3306,
    dashboard: config.get('dashboardPort') || 98,
    phpmyadmin: config.get('phpmyadminPort') || 9999
  };

  for (const [svc, port] of Object.entries(targetPorts)) {
    const inUse = await checkPort(port);
    results.ports[svc] = {
      port,
      inUse,
      status: inUse ? 'busy' : 'available'
    };
  }

  // Services check
  results.services.apache = {
    installed: !!detected.apache,
    path: detected.apache || null
  };

  results.services.mysql = {
    installed: !!detected.mysql,
    path: detected.mysql || null
  };

  results.services.php = {
    installed: !!detected.php,
    path: detected.php || null,
    version: phpService.getVersion()
  };

  results.services.phpmyadmin = {
    installed: !!detected.phpmyadmin,
    path: detected.phpmyadmin || null
  };

  // Check PHP extensions
  const requiredExts = ['curl', 'mbstring', 'mysqli', 'pdo_mysql', 'openssl', 'fileinfo', 'gd', 'zip'];
  const loadedExts = phpService.getLoadedExtensions().map(e => e.toLowerCase());

  for (const ext of requiredExts) {
    results.phpExtensions[ext] = loadedExts.includes(ext.toLowerCase());
  }

  // Generate recommendations
  if (platform.isWindows && !results.system.vcRedist) {
    results.recommendations.push({
      type: 'warning',
      message: 'Visual C++ Redistributable (x64) is missing. Install from https://aka.ms/vs/17/release/vc_redist.x64.exe'
    });
  }

  if (!results.services.apache.installed) {
    results.recommendations.push({
      type: 'info',
      message: 'Apache is not installed. Run "localxweb install apache" or use the dashboard.'
    });
  }

  if (!results.services.mysql.installed) {
    results.recommendations.push({
      type: 'info',
      message: 'MySQL/MariaDB is not installed. Run "localxweb install mysql" or use the dashboard.'
    });
  }

  if (!results.services.php.installed) {
    results.recommendations.push({
      type: 'warning',
      message: 'PHP is not installed. Run "localxweb install php" or install PHP 8.x.'
    });
  } else {
    const missingExts = requiredExts.filter(e => !results.phpExtensions[e]);
    if (missingExts.length > 0) {
      results.recommendations.push({
        type: 'warning',
        message: `Missing PHP extensions: ${missingExts.join(', ')}. LocalXWeb auto-configures them in ${platform.phpIniFile}`
      });
    }
  }

  if (!results.services.phpmyadmin.installed) {
    results.recommendations.push({
      type: 'info',
      message: 'phpMyAdmin is not installed. Run "localxweb install phpmyadmin".'
    });
  }

  const allInstalled = Object.values(results.services).every(s => s.installed);
  results.overallStatus = allInstalled ? 'healthy' : 'setup-needed';

  return results;
}

module.exports = { runDiagnostics };
