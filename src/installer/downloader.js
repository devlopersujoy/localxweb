const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');
const platform = require('../utils/platform');
const logger = require('../utils/logger');

function download(url, destPath, onProgress, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      return reject(new Error('Too many redirects'));
    }

    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const file = fs.createWriteStream(destPath);
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 LocalXWeb/1.0',
        'Accept': '*/*'
      }
    };

    const request = client.get(url, options, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        const nextUrl = new URL(response.headers.location, url).href;
        return download(nextUrl, destPath, onProgress, maxRedirects - 1).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        return reject(new Error(`Download failed: HTTP ${response.statusCode} for ${url}`));
      }

      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloadedSize = 0;

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (onProgress && totalSize) {
          onProgress(Math.round((downloadedSize / totalSize) * 100), downloadedSize, totalSize);
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve(destPath);
      });
    });

    request.on('error', (err) => {
      file.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(err);
    });

    request.setTimeout(180000, () => {
      request.destroy();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(new Error('Download timeout (3 minutes exceeded)'));
    });
  });
}

function normalizeDirectory(targetDir) {
  try {
    const items = fs.readdirSync(targetDir);
    // If there is only 1 entry and it's a directory (excluding Apache24 if it's apache)
    if (items.length === 1) {
      const singleItem = items[0];
      const singlePath = path.join(targetDir, singleItem);
      if (fs.statSync(singlePath).isDirectory() && singleItem.toLowerCase() !== 'apache24') {
        const subItems = fs.readdirSync(singlePath);
        for (const sub of subItems) {
          const src = path.join(singlePath, sub);
          const dest = path.join(targetDir, sub);
          if (fs.existsSync(dest)) {
            if (fs.statSync(dest).isDirectory()) {
              fs.rmSync(dest, { recursive: true, force: true });
            } else {
              fs.unlinkSync(dest);
            }
          }
          fs.renameSync(src, dest);
        }
        try {
          fs.rmdirSync(singlePath);
        } catch {}
      }
    }
  } catch (err) {
    logger.debug && logger.debug(`Directory normalization note: ${err.message}`);
  }
}

async function downloadAndExtract(url, extractDir, serviceName, onProgress) {
  const tmpDir = path.join(platform.localxwebDir, 'tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const fileName = path.basename(url.split('?')[0]) || `${serviceName}.zip`;
  const tmpFile = path.join(tmpDir, fileName);

  logger.info(`Downloading ${serviceName}...`);

  let lastPercent = -1;
  await download(url, tmpFile, (percent, curr, total) => {
    if (onProgress) onProgress(percent, curr, total);
    if (percent !== lastPercent && percent % 10 === 0) {
      process.stdout.write(`\r  Downloading ${serviceName}: ${percent}%`);
      lastPercent = percent;
    }
  });
  console.log('');

  logger.info(`Extracting ${serviceName}...`);

  if (!fs.existsSync(extractDir)) {
    fs.mkdirSync(extractDir, { recursive: true });
  }

  if (fileName.endsWith('.zip')) {
    const extractZip = require('extract-zip');
    await extractZip(tmpFile, { dir: extractDir });
  } else if (fileName.endsWith('.tar.gz') || fileName.endsWith('.tgz')) {
    try {
      execSync(`tar -xzf "${tmpFile}" -C "${extractDir}"`);
    } catch (e) {
      throw new Error(`Failed to extract tar archive: ${e.message}`);
    }
  }

  // Normalize nested single subfolder (e.g. phpMyAdmin-5.2.1-all-languages -> phpmyadmin root)
  normalizeDirectory(extractDir);

  // Cleanup tmp file
  if (fs.existsSync(tmpFile)) {
    try {
      fs.unlinkSync(tmpFile);
    } catch {}
  }

  logger.success(`${serviceName} installed to ${extractDir}`);
  return extractDir;
}

module.exports = { download, downloadAndExtract, normalizeDirectory };
