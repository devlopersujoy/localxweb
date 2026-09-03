const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const platform = require('../utils/platform');

function detectService(name) {
  const detectors = {
    apache: detectApache,
    mysql: detectMySQL,
    php: detectPHP,
    phpmyadmin: detectPhpMyAdmin,
  };

  const detector = detectors[name];
  return detector ? detector() : null;
}

function detectApache() {
  const managedPaths = [
    path.join(platform.servicesDir, 'apache', 'bin', platform.getExeName('httpd')),
    path.join(platform.servicesDir, 'apache', 'Apache24', 'bin', platform.getExeName('httpd')),
    path.join(platform.servicesDir, 'apache', platform.getExeName('httpd'))
  ];
  for (const p of managedPaths) {
    if (fs.existsSync(p)) return p;
  }

  const termuxBin = path.join(process.env.PREFIX || '/data/data/com.termux/files/usr', 'bin');

  const commonPaths = [
    'C:\\xampp\\apache\\bin\\httpd.exe',
    'C:\\laragon\\bin\\apache\\httpd-2.4.54-win64-VS16\\bin\\httpd.exe',
    'C:\\Apache24\\bin\\httpd.exe',
    'C:\\Program Files\\Apache Group\\Apache2\\bin\\httpd.exe',
    path.join(termuxBin, 'httpd'),
    path.join(termuxBin, 'apachectl'),
    '/usr/sbin/httpd',
    '/usr/sbin/apache2',
    '/usr/bin/apache2',
    '/opt/homebrew/bin/httpd',
    '/usr/local/bin/httpd'
  ];

  return findBinary(['httpd', 'apache2', 'apachectl'], commonPaths);
}

function detectMySQL() {
  const managedPaths = [
    path.join(platform.servicesDir, 'mysql', 'bin', platform.getExeName('mysqld')),
    path.join(platform.servicesDir, 'mysql', 'bin', platform.getExeName('mariadbd')),
    path.join(platform.servicesDir, 'mysql', platform.getExeName('mysqld'))
  ];
  for (const p of managedPaths) {
    if (fs.existsSync(p)) return p;
  }

  const termuxBin = path.join(process.env.PREFIX || '/data/data/com.termux/files/usr', 'bin');

  const commonPaths = [
    'C:\\xampp\\mysql\\bin\\mysqld.exe',
    'C:\\Program Files\\MariaDB 10.11\\bin\\mysqld.exe',
    'C:\\Program Files\\MariaDB 10.6\\bin\\mysqld.exe',
    'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqld.exe',
    'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqld.exe',
    'C:\\laragon\\bin\\mysql\\mysql-8.0.30-winx64\\bin\\mysqld.exe',
    path.join(termuxBin, 'mariadbd'),
    path.join(termuxBin, 'mysqld'),
    '/usr/sbin/mysqld',
    '/usr/sbin/mariadbd',
    '/usr/local/mysql/bin/mysqld',
    '/opt/homebrew/bin/mariadbd',
    '/opt/homebrew/bin/mysqld'
  ];

  return findBinary(['mysqld', 'mariadbd'], commonPaths);
}

function detectPHP() {
  const managedPaths = [
    path.join(platform.servicesDir, 'php', platform.getExeName('php')),
    path.join(platform.servicesDir, 'php', 'bin', platform.getExeName('php'))
  ];
  for (const p of managedPaths) {
    if (fs.existsSync(p)) return p;
  }

  const termuxBin = path.join(process.env.PREFIX || '/data/data/com.termux/files/usr', 'bin');

  const commonPaths = [
    'C:\\xampp\\php\\php.exe',
    'C:\\php\\php.exe',
    'C:\\Program Files\\php-8.5.9\\php.exe',
    path.join(termuxBin, 'php'),
    '/usr/bin/php',
    '/usr/local/bin/php',
    '/opt/homebrew/bin/php'
  ];

  return findBinary(['php'], commonPaths);
}

function detectPhpMyAdmin() {
  const baseDir = path.join(platform.servicesDir, 'phpmyadmin');
  if (fs.existsSync(baseDir)) {
    // 1. Direct index.php
    if (fs.existsSync(path.join(baseDir, 'index.php'))) return baseDir;

    // 2. Look in immediate subdirectories (e.g. phpMyAdmin-5.2.1-all-languages)
    try {
      const entries = fs.readdirSync(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subIdx = path.join(baseDir, entry.name, 'index.php');
          if (fs.existsSync(subIdx)) return path.join(baseDir, entry.name);
        }
      }
    } catch {}
  }

  const termuxShare = path.join(process.env.PREFIX || '/data/data/com.termux/files/usr', 'share', 'phpmyadmin');

  const commonPaths = [
    'C:\\xampp\\phpMyAdmin',
    'C:\\laragon\\etc\\apps\\phpMyAdmin',
    termuxShare,
    '/usr/share/phpmyadmin',
    '/etc/phpmyadmin',
    '/var/www/html/phpmyadmin',
    '/var/www/phpmyadmin',
    '/opt/homebrew/share/phpmyadmin',
    '/usr/local/share/phpmyadmin'
  ];

  for (const p of commonPaths) {
    if (fs.existsSync(path.join(p, 'index.php'))) return p;
  }

  return null;
}

function findBinary(names, commonPaths) {
  const binNames = Array.isArray(names) ? names : [names];

  // 1. Check PATH
  for (const name of binNames) {
    try {
      const whereCmd = platform.isWindows ? 'where' : 'which';
      const result = execSync(`${whereCmd} ${name}`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();
      if (result) {
        const first = result.split('\n')[0].trim().replace(/\r/g, '');
        if (fs.existsSync(first)) return first;
      }
    } catch {}
  }

  // 2. Check common paths
  for (const p of commonPaths) {
    if (fs.existsSync(p)) return p;
  }

  return null;
}

function detectAll() {
  return {
    apache: detectApache(),
    mysql: detectMySQL(),
    php: detectPHP(),
    phpmyadmin: detectPhpMyAdmin(),
  };
}

module.exports = { detectService, detectAll, detectApache, detectMySQL, detectPHP, detectPhpMyAdmin };
