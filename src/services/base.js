const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const platform = require('../utils/platform');
const logger = require('../utils/logger');
const { checkPort } = require('../utils/ports');

class BaseService {
  constructor(name, options = {}) {
    this.name = name;
    this.port = options.port || null;
    this.installDir = path.join(platform.servicesDir, name);
    this.logFile = path.join(platform.logsDir, `${name}.log`);
    this._process = null;
  }

  _ensureDirs() {
    [platform.servicesDir, platform.logsDir, this.installDir].forEach(dir => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });
  }

  detect() {
    throw new Error(`detect() not implemented for ${this.name}`);
  }

  getInstallPath() {
    throw new Error(`getInstallPath() not implemented for ${this.name}`);
  }

  async install() {
    throw new Error(`install() not implemented for ${this.name}`);
  }

  async start() {
    throw new Error(`start() not implemented for ${this.name}`);
  }

  async stop() {
    const pids = this._loadPids();
    const pid = pids[this.name];

    if (pid) {
      try {
        if (platform.isWindows) {
          execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
        } else {
          process.kill(pid, 'SIGTERM');
        }
      } catch {}
      delete pids[this.name];
      this._savePids(pids);
    }

    // Windows fallback cleanup for known binaries
    if (platform.isWindows) {
      const exeMap = {
        apache: ['httpd.exe'],
        mysql: ['mysqld.exe', 'mariadbd.exe'],
        phpmyadmin: []
      };
      const exes = exeMap[this.name] || [];
      for (const exe of exes) {
        try {
          execSync(`taskkill /IM ${exe} /F`, { stdio: 'ignore' });
        } catch {}
      }
    }

    logger.success(`${this.name} stopped`);
    return true;
  }

  async restart() {
    await this.stop();
    await new Promise(r => setTimeout(r, 1000));
    return this.start();
  }

  async status() {
    if (this.port) {
      const inUse = await checkPort(this.port);
      return inUse ? 'running' : 'stopped';
    }

    const pids = this._loadPids();
    if (!pids[this.name]) return 'stopped';

    try {
      process.kill(pids[this.name], 0);
      return 'running';
    } catch {
      return 'stopped';
    }
  }

  isInstalled() {
    const installPath = this.getInstallPath();
    return installPath !== null && installPath !== undefined;
  }

  _savePid(pid) {
    const pids = this._loadPids();
    pids[this.name] = pid;
    this._savePids(pids);
  }

  _loadPids() {
    try {
      return JSON.parse(fs.readFileSync(platform.pidsFile, 'utf8'));
    } catch {
      return {};
    }
  }

  _savePids(pids) {
    const dir = path.dirname(platform.pidsFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(platform.pidsFile, JSON.stringify(pids, null, 2));
  }

  _findInPath(cmd) {
    try {
      const whereCmd = platform.isWindows ? 'where' : 'which';
      const result = execSync(`${whereCmd} ${cmd}`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();
      return result.split('\n')[0].trim();
    } catch {
      return null;
    }
  }

  _checkPaths(paths) {
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  _spawnDetached(cmd, args = [], options = {}) {
    this._ensureDirs();

    if (platform.isWindows) {
      try {
        const quoteArg = (a) => (a.includes(' ') || a.includes('\t')) ? `\\"${a}\\"` : a;
        const fullArgs = args.length > 0 ? ' ' + args.map(quoteArg).join(' ') : '';
        const commandLine = `\\"${cmd}\\"${fullArgs}`;
        const psScript = `(Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine = "${commandLine}"}).ProcessId`;
        const out = execSync(`powershell.exe -NoProfile -NonInteractive -Command "${psScript}"`, {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe']
        }).trim();

        const pid = parseInt(out, 10);
        if (pid && !isNaN(pid)) {
          this._savePid(pid);
          return { pid };
        }
      } catch (err) {
        // Fallback below
      }
    }

    const child = spawn(cmd, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      ...options
    });

    child.unref();
    this._savePid(child.pid);
    return child;
  }

  getLog(lines = 50) {
    try {
      const content = fs.readFileSync(this.logFile, 'utf8');
      const allLines = content.split('\n');
      return allLines.slice(-lines).join('\n');
    } catch {
      return '';
    }
  }
}

module.exports = BaseService;
