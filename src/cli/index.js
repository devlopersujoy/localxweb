const { program } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const path = require('path');
const fs = require('fs');
const { createServices, sitesManager, packageManager, runDiagnostics, config } = require('../index');
const logger = require('../utils/logger');
const platform = require('../utils/platform');

const { apache, mysql, php, phpmyadmin, dbManager } = createServices();
const services = { apache, mysql, php, phpmyadmin };

const pkg = require('../../package.json');

program
  .name('localxweb')
  .description('LocalXWeb: XAMPP-like full local development server stack')
  .version(pkg.version || '1.1.0', '-v, --version');

// Default command - start everything and open dashboard
program
  .action(async () => {
    logger.banner();
    logger.info('Initializing LocalXWeb server stack...\n');

    // Check missing services
    const missing = Object.entries(services)
      .filter(([_, svc]) => !svc.isInstalled())
      .map(([name]) => name);

    if (missing.length > 0) {
      logger.warn(`Missing components detected: ${missing.join(', ')}`);
      logger.info(`Run ${chalk.cyan('localxweb install')} to automatically download and configure them.\n`);
    }

    // Auto-fix pipeline to safely resolve ports, permissions & stale locks on all OS
    const AutoFixer = require('../utils/autoFixer');
    await AutoFixer.autoFixPipeline(config);

    // Start services
    await startAll();

    // Start dashboard
    const { startDashboard } = require('../dashboard/server');
    let port = config.get('dashboardPort') || 98;
    const isNonRootPosix = !platform.isWindows && typeof process.getuid === 'function' && process.getuid() !== 0;
    if (isNonRootPosix && port < 1024) {
      port = 9898;
    }
    startDashboard(port);

    // Start Standalone MCP Network Port Server (default port 9900)
    const { McpHttpServer } = require('../mcp');
    const mcpHttpServer = new McpHttpServer({ port: config.get('mcpPort') || 9900 });
    let mcpInfo = null;
    try {
      mcpInfo = await mcpHttpServer.start();
    } catch (mcpErr) {
      logger.warn(`MCP Server port notice: ${mcpErr.message}`);
    }

    const apachePort = apache.port || config.get('apache')?.port || 80;
    const mysqlPort = mysql.port || config.get('mysql')?.port || 3306;
    const pmaPort = phpmyadmin.port || config.get('phpmyadminPort') || 9999;

    console.log(chalk.bold.green('\n  ✔ LocalXWeb Stack is Online!\n'));
    console.log(`  ${chalk.bold('Dashboard:')}   ${chalk.cyan(`http://localhost:${port}`)}`);
    if (mcpInfo) {
      console.log(`  ${chalk.bold('MCP Server:')}  ${chalk.cyan(mcpInfo.sseUrl)} ${chalk.gray(`(Port ${mcpInfo.port})`)}`);
    }
    console.log(`  ${chalk.bold('Web Server:')}  ${chalk.cyan(`http://localhost:${apachePort}`)}`);
    console.log(`  ${chalk.bold('MySQL/MariaDB:')} ${chalk.cyan(`127.0.0.1:${mysqlPort}`)}`);
    console.log(`  ${chalk.bold('phpMyAdmin:')}  ${chalk.cyan(`http://localhost:${pmaPort}`)}`);
    console.log(`  ${chalk.bold('DocumentRoot:')} ${chalk.gray(platform.htdocsDir)}`);
    console.log('');
    console.log(chalk.gray('  Press Ctrl+C to stop all stack services'));

    process.on('SIGINT', async () => {
      logger.info('\nStopping all services...');
      if (mcpHttpServer) {
        try { await mcpHttpServer.stop(); } catch {}
      }
      await stopAll();
      process.exit(0);
    });
  });

// Start command
program
  .command('start [service]')
  .description('Start services (all or specific: apache, mysql, phpmyadmin)')
  .action(async (service) => {
    logger.banner();
    if (service) {
      const svc = services[service.toLowerCase()];
      if (!svc) {
        logger.error(`Unknown service: ${service}`);
        logger.info('Available: apache, mysql, php, phpmyadmin');
        return;
      }
      if (!svc.isInstalled()) {
        logger.warn(`${service} is not installed. Run "localxweb install ${service}" first.`);
        return;
      }
      await svc.start();
    } else {
      const AutoFixer = require('../utils/autoFixer');
      await AutoFixer.autoFixPipeline(config);
      await startAll();
    }
  });

// Stop command
program
  .command('stop [service]')
  .description('Stop services (all or specific)')
  .action(async (service) => {
    if (service) {
      const svc = services[service.toLowerCase()];
      if (!svc) {
        logger.error(`Unknown service: ${service}`);
        return;
      }
      await svc.stop();
    } else {
      await stopAll();
    }
  });

// Restart command
program
  .command('restart [service]')
  .description('Restart services')
  .action(async (service) => {
    if (service) {
      const svc = services[service.toLowerCase()];
      if (!svc) {
        logger.error(`Unknown service: ${service}`);
        return;
      }
      await svc.restart();
    } else {
      await stopAll();
      await new Promise(r => setTimeout(r, 1000));
      await startAll();
    }
  });

// Status command
program
  .command('status')
  .description('Show status of all services')
  .action(async () => {
    logger.banner();
    console.log(chalk.bold('  Service Status:\n'));

    for (const [name, svc] of Object.entries(services)) {
      const s = await svc.status();
      const installed = svc.isInstalled();

      if (!installed) {
        console.log(`  ${chalk.red('●')} ${chalk.bold(name.padEnd(14))} ${chalk.red('not installed')}`);
      } else {
        const icon = s === 'running' ? chalk.green('●') : chalk.yellow('●');
        const statusText = s === 'running' ? chalk.green(s) : chalk.yellow(s);
        const portInfo = svc.port ? chalk.gray(` :${svc.port}`) : '';
        console.log(`  ${icon} ${chalk.bold(name.padEnd(14))} ${statusText}${portInfo}`);
      }
    }
    console.log('');
  });

// Doctor command
program
  .command('doctor')
  .description('Run system diagnostic health check')
  .action(async () => {
    logger.banner();
    console.log(chalk.bold.cyan('  Running LocalXWeb System Doctor...\n'));
    const diag = await runDiagnostics();

    console.log(chalk.bold('  Operating System:'));
    console.log(`    OS:              ${diag.system.os} (${diag.system.release})`);
    console.log(`    Architecture:    ${diag.system.arch}`);
    console.log(`    Node.js:         ${diag.system.node}`);
    console.log(`    Package Manager: ${diag.system.packageManager}`);
    if (platform.isWindows) {
      console.log(`    VC++ Runtime:    ${diag.system.vcRedist ? chalk.green('Installed ✔') : chalk.red('Missing ✖')}`);
    }

    console.log(chalk.bold('\n  Target Ports:'));
    for (const [svc, info] of Object.entries(diag.ports)) {
      const statusStr = info.inUse ? chalk.yellow(`Busy / In use`) : chalk.green('Available ✔');
      console.log(`    Port ${String(info.port).padEnd(6)} (${svc.padEnd(10)}) : ${statusStr}`);
    }

    console.log(chalk.bold('\n  PHP Extensions:'));
    const extKeys = Object.keys(diag.phpExtensions);
    const extList = extKeys.map(k => diag.phpExtensions[k] ? chalk.green(`✔ ${k}`) : chalk.red(`✖ ${k}`)).join('  ');
    console.log(`    ${extList}`);

    if (diag.recommendations.length > 0) {
      console.log(chalk.bold('\n  Recommendations:'));
      for (const r of diag.recommendations) {
        const prefix = r.type === 'warning' ? chalk.yellow('  ⚠') : chalk.blue('  ℹ');
        console.log(`${prefix} ${r.message}`);
      }
    } else {
      console.log(chalk.bold.green('\n  ✔ All system diagnostics passed! Server stack is healthy.'));
    }
    console.log('');
  });

// Install command
program
  .command('install [service]')
  .description('Auto-install missing services for your OS')
  .action(async (service) => {
    logger.banner();
    const toInstall = service ? [service.toLowerCase()] : ['php', 'apache', 'mysql', 'phpmyadmin'];

    for (const name of toInstall) {
      const svc = services[name];
      if (!svc) {
        logger.error(`Unknown service: ${name}`);
        continue;
      }

      if (svc.isInstalled()) {
        logger.success(`${name} is already installed`);
        continue;
      }

      const spinner = ora(`Installing ${name} for ${platform.getOSInfo().type}...`).start();
      try {
        await packageManager.installService(name, svc, (percent) => {
          spinner.text = `Installing ${name}: ${percent}%`;
        });
        spinner.succeed(`${name} installed and configured successfully`);
      } catch (e) {
        spinner.fail(`Failed to install ${name}: ${e.message}`);
      }
    }
  });

// Project // Run project on custom port command
program
  .command('run [target]')
  .description('Run a project folder or file on a local development server')
  .option('-p, --port <port>', 'Custom port to serve on', '8080')
  .option('-b, --browser', 'Open automatically in browser')
  .action(async (target, opts) => {
    logger.banner();

    const targetDir = target ? path.resolve(process.cwd(), target) : process.cwd();
    if (!fs.existsSync(targetDir)) {
      logger.error(`Target path does not exist: ${targetDir}`);
      return;
    }

    const stat = fs.statSync(targetDir);
    const docRoot = stat.isDirectory() ? targetDir : path.dirname(targetDir);
    const port = parseInt(opts.port, 10) || 8080;
    const projectName = path.basename(docRoot);

    // Get PHP executable
    const phpService = services.php;
    const phpBin = phpService ? phpService.getInstallPath() : null;

    if (!phpBin) {
      logger.error('PHP is required to run local projects. Run "localxweb install php" first.');
      return;
    }

    // Ensure php.ini is active
    phpService.ensurePhpIni();

    console.log(chalk.bold.cyan('  ╭─────────────────────────────────────────────────────────────╮'));
    console.log(chalk.bold.cyan('  │  ⚡ LocalXWeb Project Runner                                │'));
    console.log(chalk.bold.cyan('  ├─────────────────────────────────────────────────────────────┤'));
    console.log(`  │  ${chalk.bold('Project:')}   ${chalk.green(projectName.padEnd(46))} │`);
    console.log(`  │  ${chalk.bold('Local URL:')} ${chalk.cyan(`http://localhost:${port}`.padEnd(46))} │`);
    console.log(`  │  ${chalk.bold('Root:')}      ${chalk.gray(docRoot.slice(0, 46).padEnd(46))} │`);
    console.log(`  │  ${chalk.bold('Engine:')}    ${chalk.magenta('PHP 8.x + MySQLi + PDO'.padEnd(46))} │`);
    console.log(chalk.bold.cyan('  ├─────────────────────────────────────────────────────────────┤'));
    console.log(chalk.bold.cyan('  │  Press Ctrl+C to terminate project runner                   │'));
    console.log(chalk.bold.cyan('  ╰─────────────────────────────────────────────────────────────╯\n'));

    const { spawn } = require('child_process');
    const child = spawn(phpBin, [
      '-c', platform.phpIniFile,
      '-S', `127.0.0.1:${port}`,
      '-t', docRoot
    ], {
      stdio: 'inherit'
    });

    if (opts.browser) {
      const openCmd = platform.isWindows ? `start http://localhost:${port}` : platform.isMac ? `open http://localhost:${port}` : `xdg-open http://localhost:${port}`;
      try { require('child_process').execSync(openCmd); } catch {}
    }

    process.on('SIGINT', () => {
      console.log(chalk.yellow('\nStopping project runner...'));
      child.kill();
      process.exit(0);
    });
  });

// Uninstall command
program
  .command('uninstall [service]')
  .description('Uninstall a service or the full stack')
  .option('--purge', 'Purge database files, logs, and config')
  .action(async (service, opts) => {
    logger.banner();

    if (service) {
      const name = service.toLowerCase();
      const svc = services[name];
      if (!svc) {
        logger.error(`Unknown service: ${service}. Choose apache, mysql, or phpmyadmin.`);
        return;
      }
      logger.info(`Uninstalling ${name}...`);
      await svc.stop();
      if (fs.existsSync(svc.installDir)) {
        fs.rmSync(svc.installDir, { recursive: true, force: true });
        logger.success(`Removed ${svc.installDir}`);
      }
      if (name === 'mysql' && opts.purge) {
        if (fs.existsSync(platform.mysqlDataDir)) {
          fs.rmSync(platform.mysqlDataDir, { recursive: true, force: true });
          logger.success(`Purged MySQL data directory: ${platform.mysqlDataDir}`);
        }
      }
      logger.success(`${name} uninstalled successfully.`);
    } else {
      logger.warn('Uninstalling entire LocalXWeb service stack...');
      await stopAll();
      for (const [name, svc] of Object.entries(services)) {
        if (svc.installDir && fs.existsSync(svc.installDir)) {
          fs.rmSync(svc.installDir, { recursive: true, force: true });
          logger.success(`Removed ${name} (${svc.installDir})`);
        }
      }
      if (opts.purge) {
        if (fs.existsSync(platform.localxwebDir)) {
          fs.rmSync(platform.localxwebDir, { recursive: true, force: true });
          logger.success(`Purged ~/.localxweb directory.`);
        }
      }
      logger.success('LocalXWeb stack uninstalled.');
    }
  });



// Database commands
const db = program.command('db').description('Database management');

db.command('list')
  .description('List all databases')
  .action(async () => {
    const databases = await dbManager.listDatabases();
    if (databases.length === 0) {
      logger.info('No databases found in registry. Run "localxweb db create <name>" to create one.');
      return;
    }
    console.log(chalk.bold('\n  Databases:\n'));
    for (const dbName of databases) {
      const info = await dbManager.getDatabaseInfo(dbName);
      const offlineTag = info.mysqlOnline === false ? chalk.yellow(' [JSON registry - MySQL offline]') : '';
      console.log(`  ${chalk.cyan('●')} ${chalk.bold(dbName)} ${chalk.gray(`(${info.tables} tables, ${info.sizeMB} MB)`)}${offlineTag}`);
    }
    console.log('');
  });

db.command('create <name>')
  .description('Create a new database with optional user and password')
  .option('-u, --user <username>', 'Dedicated database username')
  .option('-p, --password <password>', 'Dedicated database password')
  .action(async (name, opts) => {
    try {
      const res = await dbManager.createDatabase(name, {
        username: opts.user,
        password: opts.password
      });
      if (res.mysqlSynced === false) {
        logger.warn(`Database "${name}" saved in JSON registry (MySQL is offline). It will sync when MySQL starts.`);
      } else {
        logger.success(`Database "${name}" ready in MySQL!`);
      }
      if (opts.user) {
        console.log(chalk.bold('\n  Connection Configuration:'));
        console.log(`    Host:     ${chalk.cyan('127.0.0.1')}`);
        console.log(`    Port:     ${chalk.cyan(res.port)}`);
        console.log(`    Database: ${chalk.cyan(name)}`);
        console.log(`    Username: ${chalk.cyan(res.user)}`);
        console.log(`    Password: ${chalk.cyan(res.password || '(empty)')}`);
        console.log(chalk.bold('\n  .env Configuration Snippet:'));
        console.log(chalk.gray(res.envSnippet));
        console.log('');
      }
    } catch (e) {
      logger.error(`Failed to create database: ${e.message}`);
    }
  });

db.command('creds <name>')
  .description('Show saved credentials and reveal password for a database')
  .action((name) => {
    const creds = dbManager.getCredentials(name);
    console.log(chalk.bold.cyan('\n  Database Credentials:'));
    console.log(`    Host:     ${chalk.green(creds.host)}`);
    console.log(`    Port:     ${chalk.green(creds.port)}`);
    console.log(`    Database: ${chalk.green(creds.database)}`);
    console.log(`    Username: ${chalk.green(creds.user)}`);
    console.log(`    Password: ${chalk.yellow(creds.password || '(blank/none)')}`);
    console.log(chalk.bold('\n  .env Configuration Snippet:'));
    console.log(chalk.gray(creds.envSnippet));
    console.log(chalk.bold('\n  PHP PDO Snippet:'));
    console.log(chalk.gray(creds.pdoSnippet));
    console.log('');
  });

db.command('root-password <newPassword>')
  .description('Set or update MySQL root password')
  .action(async (newPassword) => {
    try {
      await dbManager.setRootPassword(newPassword);
      logger.success('MySQL root password updated and phpMyAdmin re-configured.');
    } catch (e) {
      logger.error(`Failed to update root password: ${e.message}`);
    }
  });

db.command('delete <name>')
  .description('Delete a database')
  .action(async (name) => {
    await dbManager.deleteDatabase(name);
  });

db.command('export <name> [file]')
  .description('Export database to a .sql file')
  .action(async (name, file) => {
    const destFile = file || path.join(platform.localxwebDir, `${name}_backup.sql`);
    await dbManager.exportSql(name, destFile);
  });

db.command('import <name> <file>')
  .description('Import a .sql file into database')
  .action(async (name, file) => {
    await dbManager.importSql(name, file);
  });

// Dashboard command
program
  .command('dashboard')
  .description('Start web dashboard only')
  .action(async () => {
    logger.banner();
    const { startDashboard } = require('../dashboard/server');
    const port = config.get('dashboardPort') || 98;
    startDashboard(port);
    logger.info(chalk.cyan(`Dashboard: http://localhost:${port}`));

    const open = require('open');
    await open(`http://localhost:${port}`);

    process.on('SIGINT', () => process.exit(0));
  });

// Helper to open files, URLs, or directories in OS default viewer
async function openTarget(target) {
  try {
    if (platform.isTermux) {
      const { exec } = require('child_process');
      exec(`termux-open-url "${target}" || am start -a android.intent.action.VIEW -d "${target}"`);
      return;
    }
    const open = require('open');
    await open(target);
  } catch {
    const { exec } = require('child_process');
    if (platform.isTermux) {
      exec(`termux-open-url "${target}" || am start -a android.intent.action.VIEW -d "${target}"`);
    } else if (process.platform === 'win32') {
      exec(`start "" "${target}"`);
    } else if (process.platform === 'darwin') {
      exec(`open "${target}"`);
    } else {
      exec(`xdg-open "${target}"`);
    }
  }
}

// Site / Project Management CLI
const siteCmd = program
  .command('site')
  .description('Manage web projects in DocumentRoot (list, create, open)');

siteCmd
  .command('list')
  .description('List all web projects in DocumentRoot')
  .action(() => {
    logger.banner();
    const sites = sitesManager.listSites();
    if (!sites || sites.length === 0) {
      console.log(chalk.yellow('\n  No web projects found in DocumentRoot yet.'));
      console.log(chalk.gray(`  Location: ${platform.htdocsDir}`));
      console.log(chalk.cyan('  Run "localxweb site create <name>" to scaffold your first project.\n'));
      return;
    }

    console.log(chalk.bold(`\n  LocalXWeb Web Projects (${sites.length}):\n`));
    console.log(chalk.gray(`  ${'NAME'.padEnd(20)} ${'TYPE'.padEnd(16)} ${'LOCAL URL'}`));
    console.log(chalk.gray('  ' + '─'.repeat(65)));

    for (const s of sites) {
      const name = s.isRoot ? chalk.bold.magenta(s.name) : chalk.bold.cyan(s.name);
      const type = chalk.yellow(s.type);
      const url = chalk.underline(s.url);
      console.log(`  ${name.padEnd(29)} ${type.padEnd(25)} ${url}`);
    }
    console.log('');
  });

siteCmd
  .command('create <name>')
  .description('Scaffold a new web project')
  .option('-t, --template <type>', 'Template: php, laravel, html', 'php')
  .action(async (name, options) => {
    logger.banner();
    const spinner = ora(`Creating project "${name}"...`).start();
    try {
      const site = sitesManager.createSite(name, options.template);
      spinner.succeed(chalk.green(`Project "${name}" created successfully!`));
      console.log(`\n  ${chalk.bold('Folder:')}    ${chalk.gray(site.path)}`);
      console.log(`  ${chalk.bold('Local URL:')}  ${chalk.cyan(site.url)}`);
      console.log(`  ${chalk.bold('Template:')}   ${chalk.yellow(site.type)}\n`);
      console.log(chalk.gray(`  To launch in browser: ${chalk.white(`localxweb site open ${name}`)}`));
      console.log(chalk.gray(`  To run independently: ${chalk.white(`localxweb run ${name} --port 8080`)}\n`));
    } catch (err) {
      spinner.fail(chalk.red(`Failed to create project: ${err.message}`));
    }
  });

siteCmd
  .command('open <name>')
  .description('Open a web project in default browser')
  .action(async (name) => {
    const apachePort = config.get('apache')?.port || 80;
    const portSuffix = apachePort === 80 ? '' : `:${apachePort}`;
    const url = name === '(root)' ? `http://localhost${portSuffix}/` : `http://localhost${portSuffix}/${name}/`;
    logger.info(`Opening ${chalk.cyan(url)} in browser...`);
    await openTarget(url);
  });

// Open GUI / URLs Quick Launcher
program
  .command('open [target]')
  .description('Quick launch LocalXWeb apps in browser (dashboard, pma, web, docs, sites, db)')
  .action(async (target) => {
    const port = config.get('dashboardPort') || 98;
    const apachePort = apache.port || config.get('apache')?.port || 80;
    const pmaPort = phpmyadmin.port || config.get('phpmyadminPort') || 9999;

    const map = {
      dashboard: `http://localhost:${port}/Control-Center`,
      pma: `http://localhost:${pmaPort}`,
      web: `http://localhost:${apachePort}`,
      docs: `http://localhost:${port}/docs`,
      sites: `http://localhost:${port}/projects`,
      db: `http://localhost:${port}/databases`,
      doctor: `http://localhost:${port}/doctor`,
      logs: `http://localhost:${port}/logs`
    };

    const key = (target || 'dashboard').toLowerCase();
    const url = map[key] || map.dashboard;

    logger.info(`Opening ${chalk.bold.cyan(key)} at ${chalk.underline(url)}...`);
    await openTarget(url);
  });

// Explore Directories in OS File Manager
program
  .command('explore [target]')
  .description('Open LocalXWeb directories in OS file manager (htdocs, config, logs, php)')
  .action(async (target) => {
    const key = (target || 'htdocs').toLowerCase();
    let folder = platform.htdocsDir;

    if (key === 'config') folder = platform.localxwebDir;
    else if (key === 'logs') folder = platform.logsDir;
    else if (key === 'php') {
      const phpPath = php.getInstallPath();
      folder = phpPath ? path.dirname(phpPath) : platform.localxwebDir;
    }

    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }

    logger.info(`Opening ${chalk.bold.cyan(folder)} in file manager...`);
    await openTarget(folder);
  });

// PHP Environment Inspector
program
  .command('php-info')
  .description('Display detailed PHP runtime version, configuration, and extensions')
  .action(() => {
    logger.banner();
    const bin = php.getInstallPath();
    if (!bin) {
      logger.error('PHP is not installed. Run "localxweb install php" first.');
      return;
    }

    console.log(chalk.bold('\n  LocalXWeb PHP Runtime Environment:\n'));
    console.log(`  ${chalk.bold('PHP Binary:')}   ${chalk.cyan(bin)}`);
    console.log(`  ${chalk.bold('Config File:')}  ${chalk.gray(platform.phpIniFile)}`);

    try {
      const { execSync } = require('child_process');
      const ver = execSync(`"${bin}" -v`).toString().split('\n')[0];
      console.log(`  ${chalk.bold('Version:')}      ${chalk.green(ver)}`);

      const modulesOutput = execSync(`"${bin}" -m`).toString();
      const modules = modulesOutput
        .split('\n')
        .map(m => m.trim())
        .filter(m => m && !m.startsWith('['));

      console.log(`\n  ${chalk.bold(`Loaded Extensions (${modules.length}):`)}\n`);
      const cols = 4;
      for (let i = 0; i < modules.length; i += cols) {
        const row = modules.slice(i, i + cols).map(m => chalk.cyan(m.padEnd(16))).join(' ');
        console.log(`    ${row}`);
      }
      console.log('');
    } catch (err) {
      console.log(chalk.red(`  Error inspecting PHP: ${err.message}`));
    }
  });

// Real-Time Port Availability Inspector
program
  .command('ports')
  .description('Scan LocalXWeb default listener ports (80, 3306, 9999, 98)')
  .action(async () => {
    logger.banner();
    const tcpPortUsed = require('tcp-port-used');
    const portList = [
      { name: 'Dashboard Web App', port: config.get('dashboardPort') || 98 },
      { name: 'Apache Web Server', port: config.get('apache')?.port || 80 },
      { name: 'MySQL / MariaDB',   port: config.get('mysql')?.port || 3306 },
      { name: 'phpMyAdmin Client', port: config.get('phpmyadminPort') || 9999 }
    ];

    console.log(chalk.bold('\n  LocalXWeb Listener Port Scan:\n'));
    console.log(chalk.gray(`  ${'PORT'.padEnd(8)} ${'SERVICE'.padEnd(24)} ${'STATUS'}`));
    console.log(chalk.gray('  ' + '─'.repeat(48)));

    for (const p of portList) {
      const inUse = await tcpPortUsed.check(p.port, '127.0.0.1');
      const statusText = inUse ? chalk.bold.green('IN USE / ACTIVE') : chalk.gray('AVAILABLE');
      console.log(`  ${String(p.port).padEnd(8)} ${p.name.padEnd(24)} ${statusText}`);
    }
    console.log('');
  });

// Quick Stack Integrity Check
program
  .command('check')
  .description('Quick stack integrity and health verification')
  .action(async () => {
    logger.banner();
    console.log(chalk.bold('\n  Stack Integrity & Component Check:\n'));

    for (const [key, svc] of Object.entries(services)) {
      const installed = svc.isInstalled();
      const status = installed ? (await svc.status()).status : 'missing';
      const label = key.toUpperCase().padEnd(14);
      const instBadge = installed ? chalk.green('INSTALLED ✔') : chalk.red('MISSING ✖');
      const statBadge = status === 'running' ? chalk.bold.green('RUNNING ▶') : chalk.gray('STOPPED ■');
      console.log(`  ${label} ${instBadge.padEnd(20)} ${statBadge}`);
    }
    console.log('');
  });

// Clean / Clear CLI Command (Cache, Logs, Temp, All)
async function handleClean(target) {
  logger.banner();
  const tgt = (target || 'all').toLowerCase();
  const cleaner = require('../utils/cleaner');
  const spinner = ora(`Running cleanup task for: ${tgt}...`).start();

  try {
    if (tgt === 'cache') {
      const res = cleaner.cleanCache();
      spinner.succeed(chalk.green(`Cleaned ${res.filesCleaned} cache files (Freed: ${res.formattedFreed})`));
    } else if (tgt === 'logs' || tgt === 'log') {
      const res = cleaner.cleanLogs();
      spinner.succeed(chalk.green(`Cleaned & truncated ${res.filesCleaned} log files (Freed: ${res.formattedFreed})`));
    } else if (tgt === 'pids' || tgt === 'pid') {
      cleaner.cleanPids();
      spinner.succeed(chalk.green(`Reset stale process ID registry.`));
    } else {
      // 'all'
      const res = cleaner.cleanAll();
      spinner.succeed(chalk.bold.green(`Complete cleanup successful! (Total Freed: ${res.formattedFreed})`));
      console.log(`\n  ${chalk.bold('Cleanup Breakdown:')}`);
      console.log(`  ● Cache & Temp Files:  ${chalk.cyan(res.cache.filesCleaned)} files (${chalk.green(res.cache.formattedFreed)})`);
      console.log(`  ● Log Files Truncated: ${chalk.cyan(res.logs.filesCleaned)} files (${chalk.green(res.logs.formattedFreed)})`);
      console.log(`  ● Process PID Tracker: ${chalk.cyan('Cleaned & Reset')}\n`);
    }
  } catch (err) {
    spinner.fail(chalk.red(`Cleanup failed: ${err.message}`));
  }
}

program
  .command('clean [target]')
  .description('Clean temporary files, caches, and logs (all, cache, logs, pids)')
  .action(handleClean);

program
  .command('clear [target]')
  .description('Alias for "clean" (clear all, clear cache, clear logs)')
  .action(handleClean);

async function handleAutoFix() {
  logger.banner();
  const spinner = ora('Running LocalXWeb Universal Auto-Fixer & Self-Healing Pipeline...').start();
  try {
    const AutoFixer = require('../utils/autoFixer');
    const result = await AutoFixer.autoFixPipeline(config);
    spinner.succeed(chalk.bold.green('Auto-Fix Pipeline Completed Successfully!\n'));

    console.log(`  ● Core Directories:     ${chalk.green('Verified & Isolated in User-Space')}`);
    console.log(`  ● Stale PID Tracker:    ${chalk.green('Unlocked & Cleaned')}`);
    console.log(`  ● Database Storage:     ${chalk.green('Unlocked & Checked')}`);
    console.log(`  ● Safe Dashboard Port:  ${chalk.cyan(result.dashboardPort)}`);
    console.log(`  ● Safe Web Server Port: ${chalk.cyan(result.webPort)}`);
    console.log(`  ● Safe phpMyAdmin Port: ${chalk.cyan(result.pmaPort)}\n`);
    console.log(chalk.gray('  You can now start LocalXWeb safely on any operating system:'));
    console.log(`  ${chalk.cyan('localxweb')}\n`);
  } catch (err) {
    spinner.fail(chalk.red(`Auto-Fixer notice: ${err.message}`));
  }
}

program
  .command('autofix')
  .description('Automatically resolve port conflicts, permission restrictions, and stale locks')
  .action(handleAutoFix);

program
  .command('fix')
  .description('Alias for "autofix"')
  .action(handleAutoFix);

// Model Context Protocol (MCP) Server Commands
const mcpCmd = program
  .command('mcp')
  .description('Model Context Protocol (MCP) Server for AI Assistants (Runs on Network Port & HTTP/SSE)')
  .option('-p, --port <number>', 'Port for MCP HTTP/SSE server (default: 9900)', 9900)
  .option('-h, --host <string>', 'Host to bind (default: 0.0.0.0)', '0.0.0.0')
  .action(async (options) => {
    const { McpHttpServer } = require('../mcp');
    logger.banner();
    const port = parseInt(options.port, 10) || 9900;
    const server = new McpHttpServer({ port, host: options.host });
    try {
      const info = await server.start();
      console.log(chalk.bold.green(`\n  ✔ LocalXWeb Standalone MCP Server is Live on Port ${info.port}!\n`));
      console.log(`  ● SSE Stream:         ${chalk.cyan(info.sseUrl)}`);
      console.log(`  ● Messages Endpoint:  ${chalk.cyan(info.url + '/messages')}`);
      console.log(`  ● Direct RPC:         ${chalk.cyan(info.rpcUrl)}`);
      console.log(`  ● Health & Info:      ${chalk.cyan(info.url)}`);
      console.log(`  ● Bound Host:         ${chalk.yellow(info.host)} (All interfaces / LAN / Remote)\n`);
      console.log(chalk.bold('  Connect your AI Assistant (Claude, Cursor, Antigravity, Windsurf):'));
      console.log(chalk.gray(`  Add { "mcpServers": { "localxweb": { "serverUrl": "${info.sseUrl}" } } }\n`));
      console.log(chalk.gray('  Press Ctrl+C to stop MCP server'));

      process.on('SIGINT', async () => {
        console.log('\nStopping MCP server...');
        await server.stop();
        process.exit(0);
      });
    } catch (err) {
      console.error(chalk.red(`Failed to start MCP server: ${err.message}`));
      process.exit(1);
    }
  });

mcpCmd
  .command('serve')
  .description('Launch MCP HTTP/SSE server on a network port')
  .option('-p, --port <number>', 'Port for MCP HTTP/SSE server (default: 9900)', 9900)
  .option('-h, --host <string>', 'Host to bind (default: 0.0.0.0)', '0.0.0.0')
  .action(async (options) => {
    const { McpHttpServer } = require('../mcp');
    logger.banner();
    const port = parseInt(options.port, 10) || 9900;
    const server = new McpHttpServer({ port, host: options.host });
    try {
      const info = await server.start();
      console.log(chalk.bold.green(`\n  ✔ LocalXWeb Standalone MCP Server is Live on Port ${info.port}!\n`));
      console.log(`  ● SSE Stream:         ${chalk.cyan(info.sseUrl)}`);
      console.log(`  ● Direct RPC:         ${chalk.cyan(info.rpcUrl)}`);
      console.log(`  ● Bound Host:         ${chalk.yellow(info.host)}\n`);
      console.log(chalk.gray('  Press Ctrl+C to stop MCP server'));

      process.on('SIGINT', async () => {
        console.log('\nStopping MCP server...');
        await server.stop();
        process.exit(0);
      });
    } catch (err) {
      console.error(chalk.red(`Failed to start MCP server: ${err.message}`));
      process.exit(1);
    }
  });

mcpCmd
  .command('stdio')
  .description('Launch LocalXWeb MCP Server over stdio pipe (for CLI piping)')
  .action(() => {
    const { startStdioServer } = require('../mcp');
    startStdioServer();
  });

mcpCmd
  .command('install [client]')
  .description('Auto-install LocalXWeb MCP configuration in Claude Desktop, Cursor, Antigravity, or Windsurf')
  .option('--stdio', 'Use stdio transport instead of network port')
  .option('-p, --port <number>', 'Port for SSE server (default: 9900)', 9900)
  .action((client, options) => {
    const { installMcpConfig, getLocalXWebMcpConfig } = require('../mcp');
    const mode = options.stdio ? 'stdio' : 'sse';
    const port = parseInt(options.port, 10) || 9900;
    logger.banner();
    console.log(chalk.bold(`\n  LocalXWeb MCP Auto-Installer (Mode: ${mode.toUpperCase()} on Port ${port})\n`));
    const results = installMcpConfig(client || 'all', mode, port);
    for (const res of results) {
      if (res.success) {
        console.log(`  ${chalk.green('✔')} ${chalk.bold(res.client.toUpperCase())}: Configured at ${chalk.gray(res.path)}`);
      } else {
        console.log(`  ${chalk.yellow('ℹ')} ${chalk.bold(res.client.toUpperCase())}: Skipped (${res.error})`);
      }
    }
    console.log(chalk.bold('\n  Configuration Snippet:\n'));
    console.log(chalk.cyan(JSON.stringify({ localxweb: getLocalXWebMcpConfig(mode, port) }, null, 2)));
    console.log('\n  Restart your AI client to access all 22 LocalXWeb tools!\n');
  });

mcpCmd
  .command('list')
  .description('List all available MCP tools, resources, and prompts')
  .action(() => {
    const { LocalXWebMcpServer } = require('../mcp');
    const server = new LocalXWebMcpServer();
    logger.banner();
    console.log(chalk.bold('\n  LocalXWeb MCP Server Capabilities:\n'));
    console.log(`  ● Registered Tools:     ${chalk.cyan(server.tools.length)}`);
    console.log(`  ● Registered Resources: ${chalk.cyan(server.resources.length)}`);
    console.log(`  ● Registered Prompts:   ${chalk.cyan(server.prompts.length)}\n`);

    console.log(chalk.bold.underline('  Tools (Executable by AI Models):'));
    for (const t of server.tools) {
      console.log(`    ${chalk.green('⚡ ' + t.name.padEnd(26))} ${chalk.gray(t.description)}`);
    }

    console.log(chalk.bold.underline('\n  Resources (Readable by AI Models):'));
    for (const r of server.resources) {
      console.log(`    ${chalk.blue('📄 ' + r.uri.padEnd(26))} ${chalk.gray(r.name)}`);
    }

    console.log(chalk.bold.underline('\n  Prompts (AI Workflows):'));
    for (const p of server.prompts) {
      console.log(`    ${chalk.yellow('💡 ' + p.name.padEnd(26))} ${chalk.gray(p.description)}`);
    }
    console.log('');
  });

async function startAll() {
  const spinner = ora('Starting Web Server (Apache/PHP)...').start();
  try {
    const ok = await apache.start();
    if (ok) {
      spinner.succeed('Web Server is running');
    } else {
      spinner.warn('Web Server could not start');
    }
  } catch (e) {
    spinner.warn(`Web Server notice: ${e.message}`);
  }

  const spinner2 = ora('Starting MySQL/MariaDB...').start();
  try {
    const ok = await mysql.start();
    if (ok) {
      spinner2.succeed('MySQL/MariaDB is running');
    } else {
      spinner2.warn('MySQL/MariaDB is not installed or not running');
    }
  } catch (e) {
    spinner2.warn(`MySQL notice: ${e.message}`);
  }

  const spinner3 = ora('Starting phpMyAdmin...').start();
  try {
    if (phpmyadmin.isInstalled()) {
      const ok = await phpmyadmin.start();
      if (ok) {
        spinner3.succeed('phpMyAdmin is running');
      } else {
        spinner3.warn('phpMyAdmin could not start');
      }
    } else {
      spinner3.warn('phpMyAdmin is not installed');
    }
  } catch (e) {
    spinner3.warn(`phpMyAdmin notice: ${e.message}`);
  }
}

async function stopAll() {
  await phpmyadmin.stop();
  await mysql.stop();
  await apache.stop();
}

program.parse();
