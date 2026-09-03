const os = require('os');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// CPU measurement helper
let lastCpuMeasure = null;

const platform = {
  isWindows: process.platform === 'win32',
  isMac: process.platform === 'darwin',
  isLinux: process.platform === 'linux',
  arch: process.arch,
  isAppleSilicon: process.platform === 'darwin' && process.arch === 'arm64',
  isWSL: process.platform === 'linux' && (() => {
    try {
      const v = fs.readFileSync('/proc/version', 'utf8').toLowerCase();
      return v.includes('microsoft') || v.includes('wsl');
    } catch {
      return false;
    }
  })(),

  get homedir() {
    return os.homedir();
  },

  get localxwebDir() {
    return process.env.LOCALXWEB_ROOT || path.join(os.homedir(), '.localxweb');
  },

  get servicesDir() {
    return path.join(this.localxwebDir, 'services');
  },

  get logsDir() {
    return path.join(this.localxwebDir, 'logs');
  },

  get configDir() {
    return path.join(this.localxwebDir, 'config');
  },

  get configFile() {
    return path.join(this.localxwebDir, 'config.json');
  },

  get phpIniFile() {
    return path.join(this.configDir, 'php.ini');
  },

  get pidsFile() {
    return path.join(this.localxwebDir, 'pids.json');
  },

  get htdocsDir() {
    return path.join(this.localxwebDir, 'htdocs');
  },

  get mysqlDataDir() {
    return path.join(this.localxwebDir, 'mysql-data');
  },

  pathSeparator: process.platform === 'win32' ? ';' : ':',

  getExeName(name) {
    return process.platform === 'win32' ? `${name}.exe` : name;
  },

  hasBinary(name) {
    try {
      const cmd = process.platform === 'win32' ? `where ${name}` : `which ${name}`;
      execSync(cmd, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  },

  getBrewPrefix() {
    if (!this.isMac) return null;
    if (this.isAppleSilicon && fs.existsSync('/opt/homebrew')) return '/opt/homebrew';
    if (fs.existsSync('/usr/local/Homebrew') || fs.existsSync('/usr/local/bin/brew')) return '/usr/local';
    return '/opt/homebrew';
  },

  getPackageManager() {
    if (this.isWindows) {
      if (this.hasBinary('winget')) return 'winget';
      if (this.hasBinary('choco')) return 'choco';
      return null;
    }
    if (this.isMac) {
      if (this.hasBinary('brew')) return 'brew';
      return null;
    }
    if (this.isLinux) {
      if (this.hasBinary('apt-get')) return 'apt';
      if (this.hasBinary('dnf')) return 'dnf';
      if (this.hasBinary('pacman')) return 'pacman';
      if (this.hasBinary('zypper')) return 'zypper';
      if (this.hasBinary('apk')) return 'apk';
      if (this.hasBinary('yum')) return 'yum';
      return null;
    }
    return null;
  },

  getLinuxDistro() {
    if (!this.isLinux) return null;
    try {
      if (fs.existsSync('/etc/os-release')) {
        const content = fs.readFileSync('/etc/os-release', 'utf8');
        const idMatch = content.match(/^ID=([^\n]+)/m);
        const nameMatch = content.match(/^PRETTY_NAME="?([^"\n]+)"?/m);
        return {
          id: idMatch ? idMatch[1].replace(/"/g, '').trim() : 'linux',
          name: nameMatch ? nameMatch[1].trim() : 'Linux'
        };
      }
    } catch {}
    return { id: 'linux', name: 'Generic Linux' };
  },

  getOSInfo() {
    let type = os.type();
    let release = os.release();
    let distro = null;

    if (this.isWindows) {
      type = 'Windows';
      const rel = os.release();
      if (rel.startsWith('10.0.22') || rel.startsWith('10.0.26')) {
        type = 'Windows 11';
      } else if (rel.startsWith('10.0')) {
        type = 'Windows 10';
      }
    } else if (this.isMac) {
      type = this.isAppleSilicon ? 'macOS (Apple Silicon)' : 'macOS (Intel)';
    } else if (this.isLinux) {
      distro = this.getLinuxDistro();
      type = distro.name + (this.isWSL ? ' (WSL)' : '');
    }

    return {
      type,
      release,
      arch: process.arch,
      platform: process.platform,
      pkgManager: this.getPackageManager(),
      isWSL: this.isWSL,
      isAppleSilicon: this.isAppleSilicon,
      hostname: os.hostname(),
      uptime: os.uptime()
    };
  },

  isVCRedistInstalled() {
    if (!this.isWindows) return true;
    const sys32 = path.join(process.env.WINDIR || 'C:\\Windows', 'System32');
    const vcruntime = path.join(sys32, 'vcruntime140.dll');
    const msvcp = path.join(sys32, 'msvcp140.dll');
    return fs.existsSync(vcruntime) && fs.existsSync(msvcp);
  },

  getSystemMetrics() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const ramPercent = Math.round((usedMem / totalMem) * 100);

    // Calculate CPU usage delta
    const cpus = os.cpus();
    let user = 0, nice = 0, sys = 0, idle = 0, irq = 0;
    for (const cpu of cpus) {
      user += cpu.times.user;
      nice += cpu.times.nice || 0;
      sys += cpu.times.sys;
      idle += cpu.times.idle;
      irq += cpu.times.irq || 0;
    }
    const currentCpu = { total: user + nice + sys + idle + irq, idle };
    let cpuPercent = 0;

    if (lastCpuMeasure) {
      const totalDelta = currentCpu.total - lastCpuMeasure.total;
      const idleDelta = currentCpu.idle - lastCpuMeasure.idle;
      if (totalDelta > 0) {
        cpuPercent = Math.max(0, Math.min(100, Math.round((1 - idleDelta / totalDelta) * 100)));
      }
    }
    lastCpuMeasure = currentCpu;

    return {
      cpuPercent,
      cpuCores: cpus.length,
      cpuModel: cpus[0]?.model || 'Unknown CPU',
      ramUsedMB: Math.round(usedMem / 1024 / 1024),
      ramTotalMB: Math.round(totalMem / 1024 / 1024),
      ramPercent,
      uptimeSeconds: Math.round(os.uptime()),
      loadAvg: os.loadavg()
    };
  }
};

module.exports = platform;
