const fs = require('fs');
const path = require('path');
const platform = require('./platform');

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function cleanDir(dirPath, keepDir = true) {
  let freed = 0;
  let count = 0;
  if (!fs.existsSync(dirPath)) return { freed, count };

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      try {
        if (entry.isDirectory()) {
          const sub = cleanDir(fullPath, false);
          freed += sub.freed;
          count += sub.count;
          if (!keepDir) fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
          const stat = fs.statSync(fullPath);
          freed += stat.size;
          fs.unlinkSync(fullPath);
          count++;
        }
      } catch {}
    }
  } catch {}
  return { freed, count };
}

function cleanCache() {
  let totalFreed = 0;
  let totalFiles = 0;

  const cacheDirs = [
    path.join(platform.localxwebDir, 'cache'),
    path.join(platform.localxwebDir, 'tmp'),
    path.join(platform.localxwebDir, 'temp'),
    path.join(platform.localxwebDir, 'downloads')
  ];

  for (const d of cacheDirs) {
    const res = cleanDir(d, true);
    totalFreed += res.freed;
    totalFiles += res.count;
  }

  return {
    success: true,
    target: 'cache',
    filesCleaned: totalFiles,
    bytesFreed: totalFreed,
    formattedFreed: formatBytes(totalFreed)
  };
}

function cleanLogs() {
  let totalFreed = 0;
  let filesCount = 0;
  const logsDir = platform.logsDir;

  if (fs.existsSync(logsDir)) {
    try {
      const files = fs.readdirSync(logsDir);
      for (const file of files) {
        const fullPath = path.join(logsDir, file);
        try {
          const stat = fs.statSync(fullPath);
          totalFreed += stat.size;
          // Truncate file rather than deleting to preserve file handles
          fs.writeFileSync(fullPath, '');
          filesCount++;
        } catch {}
      }
    } catch {}
  }

  return {
    success: true,
    target: 'logs',
    filesCleaned: filesCount,
    bytesFreed: totalFreed,
    formattedFreed: formatBytes(totalFreed)
  };
}

function cleanPids() {
  const pidsFile = platform.pidsFile;
  let cleaned = 0;
  if (fs.existsSync(pidsFile)) {
    try {
      fs.writeFileSync(pidsFile, JSON.stringify({}, null, 2));
      cleaned++;
    } catch {}
  }
  return { success: true, target: 'pids', cleaned };
}

function cleanAll() {
  const cacheRes = cleanCache();
  const logsRes = cleanLogs();
  const pidsRes = cleanPids();

  const totalBytes = cacheRes.bytesFreed + logsRes.bytesFreed;
  const totalFiles = cacheRes.filesCleaned + logsRes.filesCleaned;

  return {
    success: true,
    target: 'all',
    cache: cacheRes,
    logs: logsRes,
    pids: pidsRes,
    totalFilesCleaned: totalFiles,
    totalBytesFreed: totalBytes,
    formattedFreed: formatBytes(totalBytes)
  };
}

module.exports = {
  cleanCache,
  cleanLogs,
  cleanPids,
  cleanAll,
  formatBytes
};
