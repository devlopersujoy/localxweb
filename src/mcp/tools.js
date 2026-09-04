const path = require('path');
const fs = require('fs');
const platform = require('../utils/platform');
const config = require('../config');
const { checkPort } = require('../utils/ports');
const AutoFixer = require('../utils/autoFixer');
const { runDiagnostics } = require('../utils/doctor');

/**
 * Returns all MCP Tool definitions and their execution handlers
 * @param {Object} context - { services, dbManager, sitesManager }
 */
function createMcpTools(context) {
  const { services, dbManager, sitesManager } = context;
  const { apache, mysql, php, phpmyadmin } = services;

  const tools = [
    // 1. Stack Status
    {
      name: 'localxweb_status',
      description: 'Get real-time status of all LocalXWeb services (Apache, MySQL/MariaDB, PHP, phpMyAdmin), ports, and document root',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      handler: async () => {
        const statuses = {};
        for (const [name, svc] of Object.entries(services)) {
          statuses[name] = {
            status: await svc.status(),
            installed: svc.isInstalled(),
            port: svc.port || null,
            version: svc.getVersion ? svc.getVersion() : null,
            path: svc.getInstallPath ? svc.getInstallPath() : null
          };
        }
        return {
          online: statuses.apache.status === 'running' || statuses.mysql.status === 'running',
          services: statuses,
          dashboardUrl: `http://localhost:${config.get('dashboardPort') || 98}`,
          webUrl: `http://localhost:${apache.port || config.get('apache')?.port || 80}`,
          mysqlHost: `127.0.0.1:${mysql.port || config.get('mysql')?.port || 3306}`,
          phpMyAdminUrl: `http://localhost:${phpmyadmin.port || config.get('phpmyadminPort') || 9999}`,
          documentRoot: platform.htdocsDir,
          os: platform.getOSInfo()
        };
      }
    },

    // 2. Start Service
    {
      name: 'localxweb_start_service',
      description: 'Start a specific LocalXWeb service or all services (apache, mysql, phpmyadmin, all)',
      inputSchema: {
        type: 'object',
        properties: {
          service: {
            type: 'string',
            description: 'Name of the service to start ("apache", "mysql", "phpmyadmin", or "all")',
            enum: ['apache', 'mysql', 'phpmyadmin', 'all']
          }
        },
        required: ['service']
      },
      handler: async ({ service }) => {
        const target = (service || 'all').toLowerCase();
        if (target === 'all') {
          const results = {};
          results.apache = await apache.start();
          results.mysql = await mysql.start();
          if (phpmyadmin.isInstalled()) results.phpmyadmin = await phpmyadmin.start();
          return { message: 'Attempted startup of all services', results };
        }
        const svc = services[target];
        if (!svc) throw new Error(`Unknown service: "${target}". Available: apache, mysql, phpmyadmin, all`);
        const ok = await svc.start();
        return {
          service: target,
          success: ok,
          status: await svc.status(),
          port: svc.port || null
        };
      }
    },

    // 3. Stop Service
    {
      name: 'localxweb_stop_service',
      description: 'Stop a specific LocalXWeb service or all services (apache, mysql, phpmyadmin, all)',
      inputSchema: {
        type: 'object',
        properties: {
          service: {
            type: 'string',
            description: 'Name of the service to stop ("apache", "mysql", "phpmyadmin", or "all")',
            enum: ['apache', 'mysql', 'phpmyadmin', 'all']
          }
        },
        required: ['service']
      },
      handler: async ({ service }) => {
        const target = (service || 'all').toLowerCase();
        if (target === 'all') {
          await phpmyadmin.stop();
          await mysql.stop();
          await apache.stop();
          return { message: 'Stopped all stack services successfully' };
        }
        const svc = services[target];
        if (!svc) throw new Error(`Unknown service: "${target}". Available: apache, mysql, phpmyadmin, all`);
        const ok = await svc.stop();
        return {
          service: target,
          success: ok,
          status: await svc.status()
        };
      }
    },

    // 4. Restart Service
    {
      name: 'localxweb_restart_service',
      description: 'Restart a specific LocalXWeb service or all services',
      inputSchema: {
        type: 'object',
        properties: {
          service: {
            type: 'string',
            description: 'Name of the service to restart ("apache", "mysql", "phpmyadmin", or "all")',
            enum: ['apache', 'mysql', 'phpmyadmin', 'all']
          }
        },
        required: ['service']
      },
      handler: async ({ service }) => {
        const target = (service || 'all').toLowerCase();
        if (target === 'all') {
          await phpmyadmin.restart();
          await mysql.restart();
          await apache.restart();
          return { message: 'Restarted all stack services successfully' };
        }
        const svc = services[target];
        if (!svc) throw new Error(`Unknown service: "${target}"`);
        const ok = await svc.restart();
        return {
          service: target,
          success: ok,
          status: await svc.status()
        };
      }
    },

    // 5. System Doctor Diagnostics
    {
      name: 'localxweb_doctor',
      description: 'Run deep diagnostic health check on OS, architecture, ports, PHP extensions, and stack components',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      handler: async () => {
        return await runDiagnostics();
      }
    },

    // 6. Auto-Fix & Self-Healing Pipeline
    {
      name: 'localxweb_autofix',
      description: 'Run the universal self-healing pipeline: resolves port conflicts, elevates low ports, unlocks stale PIDs and database lockfiles',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      handler: async () => {
        const result = await AutoFixer.autoFixPipeline(config);
        return {
          success: true,
          message: 'Auto-Fix Pipeline completed successfully',
          resolvedPorts: result
        };
      }
    },

    // 7. Scan Listener Ports
    {
      name: 'localxweb_scan_ports',
      description: 'Scan default and configured LocalXWeb listener ports to verify if they are available or busy',
      inputSchema: {
        type: 'object',
        properties: {
          customPorts: {
            type: 'array',
            items: { type: 'number' },
            description: 'Optional additional ports to check'
          }
        }
      },
      handler: async ({ customPorts = [] }) => {
        const checkList = {
          dashboard: config.get('dashboardPort') || 98,
          apache: config.get('apache')?.port || 80,
          mysql: config.get('mysql')?.port || 3306,
          phpmyadmin: config.get('phpmyadminPort') || 9999
        };

        const portResults = [];
        for (const [svc, p] of Object.entries(checkList)) {
          const inUse = await checkPort(p);
          portResults.push({ service: svc, port: p, inUse, status: inUse ? 'BUSY' : 'AVAILABLE' });
        }

        for (const cp of customPorts) {
          const inUse = await checkPort(cp);
          portResults.push({ service: 'custom', port: cp, inUse, status: inUse ? 'BUSY' : 'AVAILABLE' });
        }

        return portResults;
      }
    },

    // 8. Cleanup Caches and Logs
    {
      name: 'localxweb_clean',
      description: 'Clean temporary files, truncate log files, or reset stale process ID tracker',
      inputSchema: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: 'What to clean ("all", "cache", "logs", "pids")',
            enum: ['all', 'cache', 'logs', 'pids'],
            default: 'all'
          }
        }
      },
      handler: async ({ target = 'all' }) => {
        const { cleanCache, cleanLogs, cleanPids, cleanAll } = require('../utils/cleaner');
        if (target === 'cache') return cleanCache();
        if (target === 'logs') return cleanLogs();
        if (target === 'pids') return cleanPids();
        return cleanAll();
      }
    },

    // 9. List Databases
    {
      name: 'localxweb_db_list',
      description: 'List all user databases in MySQL/MariaDB with table counts and disk size',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      handler: async () => {
        const dbs = await dbManager.listDatabases();
        const details = [];
        for (const name of dbs) {
          try {
            const info = await dbManager.getDatabaseDetails(name);
            details.push(info);
          } catch {
            details.push({ name, tables: 0, sizeMB: 0 });
          }
        }
        return {
          total: details.length,
          databases: details
        };
      }
    },

    // 10. Execute SQL Query
    {
      name: 'localxweb_db_query',
      description: 'Execute a raw SQL query against MySQL/MariaDB database and return results',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The SQL statement to execute (e.g., "SHOW TABLES", "SELECT * FROM users LIMIT 10")'
          },
          database: {
            type: 'string',
            description: 'Optional database name to execute the query within'
          }
        },
        required: ['query']
      },
      handler: async ({ query, database = null }) => {
        return await dbManager.executeQuery(query, database);
      }
    },

    // 11. Create Database
    {
      name: 'localxweb_db_create',
      description: 'Create a new MySQL database with optional dedicated user and password',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Database name (letters, numbers, underscores only)'
          },
          username: {
            type: 'string',
            description: 'Optional dedicated MySQL username for this database'
          },
          password: {
            type: 'string',
            description: 'Optional password for dedicated user'
          },
          collation: {
            type: 'string',
            description: 'Database collation (default: utf8mb4_unicode_ci)',
            default: 'utf8mb4_unicode_ci'
          }
        },
        required: ['name']
      },
      handler: async ({ name, username, password, collation }) => {
        return await dbManager.createDatabase(name, { username, password, collation });
      }
    },

    // 12. Drop Database
    {
      name: 'localxweb_db_drop',
      description: 'Drop/delete a MySQL database permanently',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Database name to delete'
          }
        },
        required: ['name']
      },
      handler: async ({ name }) => {
        await dbManager.deleteDatabase(name);
        return { success: true, message: `Database "${name}" deleted successfully` };
      }
    },

    // 13. Export Database SQL
    {
      name: 'localxweb_db_export',
      description: 'Export a database to a .sql backup file',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Database name to export'
          },
          destinationFile: {
            type: 'string',
            description: 'Optional destination file path. If omitted, saves to ~/.localxweb/<name>_backup.sql'
          }
        },
        required: ['name']
      },
      handler: async ({ name, destinationFile }) => {
        if (!name) throw new Error('Parameter "name" (database name to export) is required.');
        const dest = destinationFile || path.join(platform.localxwebDir, `${name}_backup.sql`);
        const ok = await dbManager.exportSql(name, dest);
        if (!ok) {
          throw new Error(`Failed to export database "${name}". Please verify the database exists and MySQL is running.`);
        }
        return {
          success: true,
          database: name,
          filePath: dest,
          fileSize: fs.existsSync(dest) ? fs.statSync(dest).size : 0
        };
      }
    },

    // 14. Import Database SQL
    {
      name: 'localxweb_db_import',
      description: 'Import a .sql file into a MySQL database',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Target database name'
          },
          sourceFile: {
            type: 'string',
            description: 'Path to the .sql file to import'
          }
        },
        required: ['name', 'sourceFile']
      },
      handler: async ({ name, sourceFile }) => {
        if (!name) throw new Error('Parameter "name" (target database) is required.');
        if (!sourceFile) throw new Error('Parameter "sourceFile" (.sql path) is required.');
        if (!fs.existsSync(sourceFile)) {
          throw new Error(`SQL file "${sourceFile}" does not exist.`);
        }
        await dbManager.importSql(name, sourceFile);
        return {
          success: true,
          message: `Imported "${sourceFile}" into database "${name}" successfully`
        };
      }
    },

    // 15. Get Database Credentials & Snippets
    {
      name: 'localxweb_db_creds',
      description: 'Get saved database credentials, .env configuration snippet, and PHP PDO connection snippet',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Database name'
          }
        },
        required: ['name']
      },
      handler: async ({ name }) => {
        return dbManager.getCredentials(name);
      }
    },

    // 16. List Database Tables
    {
      name: 'localxweb_db_tables',
      description: 'List all tables inside a database with row counts and schema engine details',
      inputSchema: {
        type: 'object',
        properties: {
          database: {
            type: 'string',
            description: 'Database name'
          }
        },
        required: ['database']
      },
      handler: async ({ database }) => {
        const tables = await dbManager.listTables(database);
        return {
          database,
          totalTables: tables.length,
          tables
        };
      }
    },

    // 17. List Web Sites / Projects
    {
      name: 'localxweb_site_list',
      description: 'List all web projects hosted in DocumentRoot (htdocs) with local URLs and project types',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      handler: async () => {
        return {
          documentRoot: platform.htdocsDir,
          sites: sitesManager.listSites()
        };
      }
    },

    // 18. Create / Scaffold Web Project
    {
      name: 'localxweb_site_create',
      description: 'Scaffold a new web project in DocumentRoot (htdocs) with ready-to-use templates (php, html, wordpress, laravel)',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Name of project folder to create'
          },
          template: {
            type: 'string',
            description: 'Template to scaffold ("php", "html", "wordpress", "laravel")',
            enum: ['php', 'html', 'wordpress', 'laravel'],
            default: 'php'
          }
        },
        required: ['name']
      },
      handler: async ({ name, template = 'php' }) => {
        return sitesManager.createSite(name, template);
      }
    },

    // 19. PHP Runtime Info & Extensions
    {
      name: 'localxweb_php_info',
      description: 'Inspect PHP runtime environment: binary path, version, active php.ini path, and list of loaded extensions',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      handler: async () => {
        return {
          binaryPath: php.getInstallPath(),
          version: php.getVersion(),
          phpIniPath: platform.phpIniFile,
          loadedExtensions: php.getLoadedExtensions(),
          hasMysqli: php.getLoadedExtensions().map(e => e.toLowerCase()).includes('mysqli'),
          hasPdoMysql: php.getLoadedExtensions().map(e => e.toLowerCase()).includes('pdo_mysql'),
          hasMbstring: php.getLoadedExtensions().map(e => e.toLowerCase()).includes('mbstring')
        };
      }
    },

    // 20. Read Configuration
    {
      name: 'localxweb_get_config',
      description: 'Read the full LocalXWeb configuration (ports, directories, autostart services)',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      handler: async () => {
        return config.get();
      }
    },

    // 21. Update Configuration
    {
      name: 'localxweb_update_config',
      description: 'Update LocalXWeb configuration settings (ports, docRoot, etc.) and save immediately',
      inputSchema: {
        type: 'object',
        properties: {
          dashboardPort: { type: 'number', description: 'Port for Web Dashboard' },
          phpmyadminPort: { type: 'number', description: 'Port for phpMyAdmin' },
          apachePort: { type: 'number', description: 'Port for Apache / Web Server' },
          mysqlPort: { type: 'number', description: 'Port for MySQL Server' },
          docRoot: { type: 'string', description: 'DocumentRoot directory path' }
        }
      },
      handler: async (args) => {
        const cur = config.get();
        if (args.dashboardPort) cur.dashboardPort = args.dashboardPort;
        if (args.phpmyadminPort) cur.phpmyadminPort = args.phpmyadminPort;
        if (args.apachePort) {
          cur.apache = cur.apache || {};
          cur.apache.port = args.apachePort;
          apache.port = args.apachePort;
        }
        if (args.mysqlPort) {
          cur.mysql = cur.mysql || {};
          cur.mysql.port = args.mysqlPort;
          mysql.port = args.mysqlPort;
        }
        if (args.docRoot) {
          cur.apache = cur.apache || {};
          cur.apache.docRoot = args.docRoot;
          apache.docRoot = args.docRoot;
        }
        config.save();
        return {
          success: true,
          message: 'Configuration updated and synchronized',
          config: cur
        };
      }
    },

    // 22. Get Service Logs
    {
      name: 'localxweb_get_logs',
      description: 'Get recent log entries for a service (apache, mysql, php, stack)',
      inputSchema: {
        type: 'object',
        properties: {
          service: {
            type: 'string',
            description: 'Service name ("apache", "mysql", "php", "stack")',
            enum: ['apache', 'mysql', 'php', 'stack'],
            default: 'stack'
          },
          lines: {
            type: 'number',
            description: 'Number of recent lines to retrieve (default: 50)',
            default: 50
          }
        }
      },
      handler: async ({ service = 'stack', lines = 50 }) => {
        const logMap = {
          apache: apache.logFile,
          mysql: mysql.logFile,
          php: path.join(platform.logsDir, 'php_errors.log'),
          stack: path.join(platform.logsDir, 'localxweb.log')
        };
        const targetLog = logMap[service.toLowerCase()] || logMap.stack;
        if (!fs.existsSync(targetLog)) {
          return { service, logFile: targetLog, content: '(No log file generated yet)' };
        }
        try {
          const raw = fs.readFileSync(targetLog, 'utf8');
          const allLines = raw.split('\n');
          const recent = allLines.slice(-lines).join('\n');
          return {
            service,
            logFile: targetLog,
            totalLines: allLines.length,
            content: recent
          };
        } catch (e) {
          return { service, error: e.message };
        }
      }
    },

    // 23. Test Local HTTP Endpoint
    {
      name: 'localxweb_test_endpoint',
      description: 'Send an HTTP request to a local PHP site or API endpoint hosted on LocalXWeb and inspect the response',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path or URL to test (e.g. "/index.php", "/my-app/api.php", or "http://localhost:80/...")'
          },
          method: {
            type: 'string',
            description: 'HTTP method (GET, POST, PUT, DELETE)',
            enum: ['GET', 'POST', 'PUT', 'DELETE'],
            default: 'GET'
          },
          body: {
            type: 'string',
            description: 'Optional request body string (JSON, form-encoded, or raw text)'
          },
          headers: {
            type: 'object',
            description: 'Optional custom headers key-value map'
          }
        },
        required: ['path']
      },
      handler: async ({ path: reqPath, method = 'GET', body = null, headers = {} }) => {
        const http = require('http');
        const apachePort = apache.port || config.get('apache')?.port || 80;
        let urlStr = reqPath;
        if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) {
          if (!urlStr.startsWith('/')) urlStr = '/' + urlStr;
          urlStr = `http://127.0.0.1:${apachePort}${urlStr}`;
        }
        const parsedUrl = new URL(urlStr);
        return new Promise((resolve) => {
          const startTime = Date.now();
          const reqHeaders = {
            'User-Agent': 'LocalXWeb-MCP-Client/1.0',
            ...headers
          };
          if (body && !reqHeaders['Content-Type']) {
            reqHeaders['Content-Type'] = 'application/json';
          }
          if (body && !reqHeaders['Content-Length']) {
            reqHeaders['Content-Length'] = Buffer.byteLength(body);
          }
          const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 80,
            path: parsedUrl.pathname + parsedUrl.search,
            method: method.toUpperCase(),
            headers: reqHeaders,
            timeout: 10000
          };
          const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
              const durationMs = Date.now() - startTime;
              let parsedJson = null;
              if (res.headers['content-type'] && res.headers['content-type'].includes('application/json')) {
                try { parsedJson = JSON.parse(data); } catch (_) {}
              }
              resolve({
                success: res.statusCode >= 200 && res.statusCode < 400,
                url: urlStr,
                statusCode: res.statusCode,
                statusMessage: res.statusMessage,
                headers: res.headers,
                durationMs,
                body: parsedJson || (data.length > 2000 ? data.slice(0, 2000) + '... [truncated]' : data)
              });
            });
          });
          req.on('error', (err) => {
            resolve({
              success: false,
              url: urlStr,
              error: err.message,
              durationMs: Date.now() - startTime
            });
          });
          req.on('timeout', () => {
            req.destroy();
            resolve({
              success: false,
              url: urlStr,
              error: 'Request timed out after 10000ms',
              durationMs: Date.now() - startTime
            });
          });
          if (body) {
            req.write(body);
          }
          req.end();
        });
      }
    },

    // 24. Enable PHP Extension
    {
      name: 'localxweb_enable_extension',
      description: 'Check and enable a PHP extension in php.ini (e.g. mysqli, pdo_mysql, curl, gd, mbstring, intl, zip)',
      inputSchema: {
        type: 'object',
        properties: {
          extension: {
            type: 'string',
            description: 'Name of the PHP extension to enable (e.g. "mysqli", "pdo_mysql", "curl", "gd", "zip")'
          }
        },
        required: ['extension']
      },
      handler: async ({ extension }) => {
        const extName = extension.trim().toLowerCase().replace(/^php_/, '').replace(/\.dll$/, '').replace(/\.so$/, '');
        const phpIni = platform.phpIniFile;
        if (!fs.existsSync(phpIni)) {
          return { success: false, error: `php.ini file not found at ${phpIni}` };
        }
        let content = fs.readFileSync(phpIni, 'utf8');
        const regex = new RegExp(`^[;\\s]*extension\\s*=\\s*["']?(${extName}|php_${extName})(\\.dll|\\.so)?["']?`, 'mi');
        let modified = false;
        if (regex.test(content)) {
          content = content.replace(regex, `extension=${extName}`);
          modified = true;
        } else {
          content += `\nextension=${extName}\n`;
          modified = true;
        }
        if (modified) {
          fs.writeFileSync(phpIni, content, 'utf8');
        }
        let restartStatus = 'unchanged';
        if (await apache.status() === 'running') {
          await apache.restart();
          restartStatus = 'apache_restarted';
        }
        return {
          success: true,
          extension: extName,
          phpIniPath: phpIni,
          action: modified ? 'enabled_in_php_ini' : 'already_enabled',
          webServerAction: restartStatus,
          loadedExtensions: php.getLoadedExtensions()
        };
      }
    }
  ];

  return tools;
}

module.exports = { createMcpTools };
