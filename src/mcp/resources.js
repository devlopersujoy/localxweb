const path = require('path');
const fs = require('fs');
const platform = require('../utils/platform');
const config = require('../config');
const { checkPort } = require('../utils/ports');

/**
 * Returns all MCP Resource definitions and their read handlers
 * @param {Object} context - { services, dbManager, sitesManager }
 */
function createMcpResources(context) {
  const { services, dbManager, sitesManager } = context;
  const { apache, mysql, php, phpmyadmin } = services;

  const resources = [
    {
      uri: 'localxweb://status',
      name: 'LocalXWeb Server Stack Status',
      description: 'Real-time operating status of Apache, MySQL, PHP, and phpMyAdmin with active ports',
      mimeType: 'application/json',
      read: async () => {
        const statuses = {};
        for (const [name, svc] of Object.entries(services)) {
          statuses[name] = {
            status: await svc.status(),
            installed: svc.isInstalled(),
            port: svc.port || null
          };
        }
        return JSON.stringify({
          services: statuses,
          dashboardUrl: `http://localhost:${config.get('dashboardPort') || 98}`,
          webUrl: `http://localhost:${apache.port || config.get('apache')?.port || 80}`,
          mysqlHost: `127.0.0.1:${mysql.port || config.get('mysql')?.port || 3306}`,
          phpMyAdminUrl: `http://localhost:${phpmyadmin.port || config.get('phpmyadminPort') || 9999}`,
          documentRoot: platform.htdocsDir,
          timestamp: new Date().toISOString()
        }, null, 2);
      }
    },

    {
      uri: 'localxweb://config',
      name: 'LocalXWeb Configuration',
      description: 'Current localxweb config.json settings including ports and document roots',
      mimeType: 'application/json',
      read: async () => {
        return JSON.stringify(config.get(), null, 2);
      }
    },

    {
      uri: 'localxweb://databases',
      name: 'LocalXWeb Databases',
      description: 'List of all active databases in MySQL/MariaDB',
      mimeType: 'application/json',
      read: async () => {
        const dbs = await dbManager.listDatabases();
        const list = [];
        for (const name of dbs) {
          try {
            list.push(await dbManager.getDatabaseDetails(name));
          } catch {
            list.push({ name, tables: 0, sizeMB: 0 });
          }
        }
        return JSON.stringify(list, null, 2);
      }
    },

    {
      uri: 'localxweb://sites',
      name: 'LocalXWeb Web Projects',
      description: 'Web projects inside DocumentRoot (htdocs)',
      mimeType: 'application/json',
      read: async () => {
        return JSON.stringify(sitesManager.listSites(), null, 2);
      }
    },

    {
      uri: 'localxweb://php-info',
      name: 'LocalXWeb PHP Runtime Info',
      description: 'Active PHP binary, version, php.ini path, and loaded extensions',
      mimeType: 'application/json',
      read: async () => {
        return JSON.stringify({
          binary: php.getInstallPath(),
          version: php.getVersion(),
          phpIni: platform.phpIniFile,
          extensions: php.getLoadedExtensions()
        }, null, 2);
      }
    },

    {
      uri: 'localxweb://ports',
      name: 'LocalXWeb Listener Ports',
      description: 'Port scan results for all LocalXWeb service ports',
      mimeType: 'application/json',
      read: async () => {
        const targetPorts = {
          dashboard: config.get('dashboardPort') || 98,
          apache: config.get('apache')?.port || 80,
          mysql: config.get('mysql')?.port || 3306,
          phpmyadmin: config.get('phpmyadminPort') || 9999
        };
        const results = {};
        for (const [svc, p] of Object.entries(targetPorts)) {
          const inUse = await checkPort(p);
          results[svc] = { port: p, inUse, status: inUse ? 'BUSY' : 'AVAILABLE' };
        }
        return JSON.stringify(results, null, 2);
      }
    },

    {
      uri: 'localxweb://logs/apache',
      name: 'Apache / Web Server Logs',
      description: 'Recent log entries from Apache',
      mimeType: 'text/plain',
      read: async () => {
        if (!fs.existsSync(apache.logFile)) return '(Apache log file is empty or not created yet)';
        const raw = fs.readFileSync(apache.logFile, 'utf8');
        return raw.split('\n').slice(-100).join('\n');
      }
    },

    {
      uri: 'localxweb://logs/mysql',
      name: 'MySQL / MariaDB Logs',
      description: 'Recent log entries from MySQL/MariaDB',
      mimeType: 'text/plain',
      read: async () => {
        if (!fs.existsSync(mysql.logFile)) return '(MySQL log file is empty or not created yet)';
        const raw = fs.readFileSync(mysql.logFile, 'utf8');
        return raw.split('\n').slice(-100).join('\n');
      }
    },

    {
      uri: 'localxweb://logs/php',
      name: 'PHP Error Logs',
      description: 'Recent error log entries from PHP',
      mimeType: 'text/plain',
      read: async () => {
        const phpLog = path.join(platform.logsDir, 'php_errors.log');
        if (!fs.existsSync(phpLog)) return '(No PHP errors logged)';
        const raw = fs.readFileSync(phpLog, 'utf8');
        return raw.split('\n').slice(-100).join('\n');
      }
    },

    {
      uri: 'localxweb://logs/stack',
      name: 'LocalXWeb Server Stack Runtime Log',
      description: 'Recent server stack runtime logs',
      mimeType: 'text/plain',
      read: async () => {
        const stackLog = path.join(platform.logsDir, 'localxweb.log');
        if (!fs.existsSync(stackLog)) return '(No runtime log generated yet)';
        const raw = fs.readFileSync(stackLog, 'utf8');
        return raw.split('\n').slice(-100).join('\n');
      }
    }
  ];

  return resources;
}

module.exports = { createMcpResources };
