const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const platform = require('../utils/platform');
const logger = require('../utils/logger');
const { downloadAndExtract, normalizeDirectory } = require('./downloader');

const PACKAGE_SOURCES = {
  win32: {
    apache: {
      urls: [
        'https://www.apachelounge.com/download/VS17/binaries/httpd-2.4.59-240404-win64-VS17.zip',
        'https://www.apachelounge.com/download/VS18/binaries/httpd-2.4.68-260827-Win64-VS18.zip'
      ],
      wingetId: 'ApacheLounge.Apache'
    },
    mysql: {
      urls: [
        'https://archive.mariadb.org/mariadb-10.11.8/winx64-packages/mariadb-10.11.8-winx64.zip',
        'https://mirrors.gigenet.com/mariadb/mariadb-10.11.8/winx64-packages/mariadb-10.11.8-winx64.zip',
        'https://downloads.mariadb.com/MariaDB/mariadb-10.11.8/winx64-packages/mariadb-10.11.8-winx64.zip'
      ],
      wingetId: 'MariaDB.Server'
    },
    php: {
      urls: [
        'https://windows.php.net/downloads/releases/php-8.3.16-Win32-vs16-x64.zip',
        'https://windows.php.net/downloads/releases/archives/php-8.3.4-Win32-vs16-x64.zip'
      ],
      wingetId: 'PHP.PHP.8.3'
    },
    phpmyadmin: {
      urls: [
        'https://files.phpmyadmin.net/phpMyAdmin/5.2.1/phpMyAdmin-5.2.1-all-languages.zip',
        'https://github.com/phpmyadmin/phpmyadmin/releases/download/RELEASE_5_2_1/phpMyAdmin-5.2.1-all-languages.zip'
      ]
    }
  },
  linux: {
    apt: {
      apache: 'apache2',
      mysql: 'mariadb-server mariadb-client',
      php: 'php php-cli php-fpm php-mysql php-mbstring php-curl php-xml php-gd php-zip',
      phpmyadmin: 'phpmyadmin'
    },
    dnf: {
      apache: 'httpd',
      mysql: 'mariadb-server mariadb',
      php: 'php php-cli php-fpm php-mysqlnd php-mbstring php-gd php-xml php-zip',
      phpmyadmin: 'phpMyAdmin'
    },
    pacman: {
      apache: 'apache',
      mysql: 'mariadb',
      php: 'php php-fpm php-gd php-sqlite',
      phpmyadmin: 'phpmyadmin'
    },
    zypper: {
      apache: 'apache2',
      mysql: 'mariadb mariadb-client',
      php: 'php8 php8-mysql php8-mbstring php8-curl php8-gd php8-zip',
      phpmyadmin: 'phpMyAdmin'
    },
    apk: {
      apache: 'apache2',
      mysql: 'mariadb mariadb-client',
      php: 'php83 php83-apache2 php83-mysqli php83-mbstring php83-curl php83-openssl',
      phpmyadmin: 'phpmyadmin'
    }
  },
  darwin: {
    brew: {
      apache: 'httpd',
      mysql: 'mariadb',
      php: 'php',
      phpmyadmin: 'phpmyadmin'
    }
  }
};

class PackageManager {
  constructor() {
    this.os = platform.isWindows ? 'win32' : platform.isMac ? 'darwin' : 'linux';
    this.pkgManager = platform.getPackageManager();
  }

  async installService(name, svc, onProgress) {
    const serviceName = name.toLowerCase();

    // 1. Check if already installed
    if (svc && svc.isInstalled && svc.isInstalled()) {
      logger.success(`${serviceName} is already installed.`);
      return true;
    }

    const osInfo = platform.getOSInfo();
    logger.info(`Starting installation of ${serviceName} for ${osInfo.type} (${osInfo.arch})...`);

    // 2. Linux native package manager installation
    if (platform.isLinux) {
      return this._installLinux(serviceName, svc, onProgress);
    }

    // 3. macOS brew or portable installation
    if (platform.isMac) {
      return this._installMac(serviceName, svc, onProgress);
    }

    // 4. Windows installation
    if (platform.isWindows) {
      return this._installWindows(serviceName, svc, onProgress);
    }

    // Portable fallback
    if (svc && svc.getDownloadUrl) {
      const url = svc.getDownloadUrl();
      if (url) {
        await downloadAndExtract(url, svc.installDir, serviceName, onProgress);
        return true;
      }
    }

    throw new Error(`Auto-install is not supported for ${serviceName} on ${osInfo.type}`);
  }

  async _installWindows(name, svc, onProgress) {
    // Check and auto-install Visual C++ Redistributable if missing
    if (!platform.isVCRedistInstalled() && (name === 'apache' || name === 'php')) {
      logger.warn('Microsoft Visual C++ Redistributable (x64) is missing.');
      logger.info('Auto-downloading VC++ Redistributable installer...');
      const vcUrl = 'https://aka.ms/vs/17/release/vc_redist.x64.exe';
      const tmpVc = path.join(platform.localxwebDir, 'tmp', 'vc_redist.x64.exe');
      try {
        const { download } = require('./downloader');
        await download(vcUrl, tmpVc, (p) => {
          process.stdout.write(`\r  Downloading VC_redist: ${p}%`);
        });
        console.log('');
        logger.info('Installing Visual C++ Redistributable silently...');
        execSync(`"${tmpVc}" /install /quiet /norestart`, { stdio: 'ignore' });
        logger.success('Visual C++ Redistributable installed successfully.');
      } catch (err) {
        logger.warn(`Could not auto-install VC++ runtime: ${err.message}. If Apache fails, install manually from: ${vcUrl}`);
      }
    }

    const config = PACKAGE_SOURCES.win32[name];
    if (!config) {
      throw new Error(`No Windows package source configured for ${name}`);
    }

    const targetDir = svc.installDir;
    let installed = false;
    let lastError = null;

    // Try portable zip archives first
    if (config.urls && config.urls.length > 0) {
      for (const url of config.urls) {
        try {
          logger.info(`Attempting download for ${name}...`);
          await downloadAndExtract(url, targetDir, name, onProgress);
          installed = true;
          break;
        } catch (err) {
          logger.warn(`Mirror failed (${err.message}). Trying fallback mirror...`);
          lastError = err;
        }
      }
    }

    // Fallback to winget
    if (!installed && config.wingetId && platform.hasBinary('winget')) {
      try {
        logger.info(`Falling back to winget for ${name} (${config.wingetId})...`);
        execSync(`winget install --id ${config.wingetId} -e --silent --accept-source-agreements --accept-package-agreements`, {
          stdio: 'inherit'
        });
        installed = true;
      } catch (e) {
        logger.warn(`Winget install failed: ${e.message}`);
      }
    }

    if (!installed) {
      throw new Error(`Could not install ${name}: ${lastError ? lastError.message : 'All sources failed'}`);
    }

    // Post-install hook
    if (svc && svc.onPostInstall) {
      await svc.onPostInstall();
    }

    return true;
  }

  async _installLinux(name, svc, onProgress) {
    const pkgManager = platform.getPackageManager();

    // Special case for phpMyAdmin on Linux: official zip works without root permissions!
    if (name === 'phpmyadmin') {
      const pmaUrls = PACKAGE_SOURCES.win32.phpmyadmin.urls;
      for (const url of pmaUrls) {
        try {
          await downloadAndExtract(url, svc.installDir, name, onProgress);
          return true;
        } catch {}
      }
    }

    if (pkgManager) {
      const pkg = PACKAGE_SOURCES.linux[pkgManager]?.[name];
      if (pkg) {
        let cmd = '';
        const sudo = process.getuid && process.getuid() === 0 ? '' : 'sudo ';
        if (pkgManager === 'apt') {
          cmd = `${sudo}apt-get update && ${sudo}apt-get install -y ${pkg}`;
        } else if (pkgManager === 'dnf') {
          cmd = `${sudo}dnf install -y ${pkg}`;
        } else if (pkgManager === 'pacman') {
          cmd = `${sudo}pacman -S --noconfirm ${pkg}`;
        } else if (pkgManager === 'zypper') {
          cmd = `${sudo}zypper install -y ${pkg}`;
        } else if (pkgManager === 'apk') {
          cmd = `${sudo}apk add --no-cache ${pkg}`;
        }

        if (cmd) {
          logger.info(`Installing via ${pkgManager}: ${cmd}`);
          execSync(cmd, { stdio: 'inherit' });
          logger.success(`${name} installed successfully via ${pkgManager}`);
          return true;
        }
      }
    }

    // If no package manager or failed, try portable download fallback
    if (svc && svc.getDownloadUrl) {
      const url = svc.getDownloadUrl();
      if (url) {
        await downloadAndExtract(url, svc.installDir, name, onProgress);
        return true;
      }
    }

    throw new Error(`Package manager not found on this Linux system. Please install ${name} manually.`);
  }

  async _installMac(name, svc, onProgress) {
    // phpMyAdmin on macOS: zip extracts cleanly to user directory
    if (name === 'phpmyadmin') {
      const pmaUrls = PACKAGE_SOURCES.win32.phpmyadmin.urls;
      for (const url of pmaUrls) {
        try {
          await downloadAndExtract(url, svc.installDir, name, onProgress);
          return true;
        } catch {}
      }
    }

    const brewBin = platform.isAppleSilicon ? '/opt/homebrew/bin/brew' : '/usr/local/bin/brew';
    const hasBrew = platform.hasBinary('brew') || fs.existsSync(brewBin);

    if (hasBrew) {
      const brewCmd = platform.hasBinary('brew') ? 'brew' : brewBin;
      const pkg = PACKAGE_SOURCES.darwin.brew?.[name];
      if (pkg) {
        logger.info(`Installing ${name} via Homebrew (${pkg})...`);
        execSync(`${brewCmd} install ${pkg}`, { stdio: 'inherit' });
        logger.success(`${name} installed successfully via Homebrew`);
        return true;
      }
    } else {
      logger.warn('Homebrew was not found on this Mac.');
      logger.info('Homebrew is recommended for installing Apache, MariaDB, and PHP on macOS.');
      logger.info('Install Homebrew by running: /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"');
    }

    if (svc && svc.getDownloadUrl) {
      const url = svc.getDownloadUrl();
      if (url) {
        await downloadAndExtract(url, svc.installDir, name, onProgress);
        return true;
      }
    }

    throw new Error(`Could not install ${name} on macOS. Please install Homebrew or install ${name} manually.`);
  }

  async installPhpExtensions(missingExts = ['mysqli', 'mbstring', 'curl', 'xml', 'zip', 'gd']) {
    if (platform.isLinux) {
      const pkgManager = platform.getPackageManager();
      const sudo = (process.getuid && process.getuid() === 0) ? '' : 'sudo ';
      try {
        if (pkgManager === 'apt') {
          logger.info(`Auto-installing missing PHP extensions (${missingExts.join(', ')})...`);
          execSync(`${sudo}apt-get update -y && ${sudo}apt-get install -y php-mysql php-mbstring php-curl php-xml php-zip php-gd php-intl php-fileinfo`, {
            stdio: 'ignore',
            timeout: 90000
          });
          logger.success('PHP extensions installed successfully via apt.');
          return true;
        } else if (pkgManager === 'apk') {
          execSync(`${sudo}apk add --no-cache php-mysqli php-pdo_mysql php-mbstring php-curl php-openssl php-xml php-zip php-gd`, {
            stdio: 'ignore',
            timeout: 60000
          });
          return true;
        } else if (pkgManager === 'dnf') {
          execSync(`${sudo}dnf install -y php-mysqlnd php-mbstring php-gd php-xml php-zip`, {
            stdio: 'ignore',
            timeout: 60000
          });
          return true;
        }
      } catch (e) {
        logger.warn(`Notice: Could not automatically install PHP packages via ${pkgManager}: ${e.message}`);
      }
    } else if (platform.isMac) {
      try {
        const brewBin = platform.isAppleSilicon ? '/opt/homebrew/bin/brew' : '/usr/local/bin/brew';
        const brewCmd = platform.hasBinary('brew') ? 'brew' : brewBin;
        execSync(`${brewCmd} install php`, { stdio: 'ignore', timeout: 90000 });
        return true;
      } catch {}
    }
    return false;
  }
}

module.exports = new PackageManager();
