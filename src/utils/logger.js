const chalk = require('chalk');

const logger = {
  info: (msg) => console.log(chalk.blue('ℹ'), msg),
  debug: (msg) => {
    if (process.env.DEBUG) console.log(chalk.gray('⚙'), chalk.gray(msg));
  },
  success: (msg) => console.log(chalk.green('✔'), msg),
  warn: (msg) => console.log(chalk.yellow('⚠'), msg),
  error: (msg) => console.log(chalk.red('✖'), msg),
  service: (name, status) => {
    const icon = status === 'running' ? chalk.green('●') : chalk.red('●');
    console.log(`  ${icon} ${chalk.bold(name)} - ${status}`);
  },
  banner: () => {
    console.log('');
    console.log(chalk.cyan.bold('  ╔══════════════════════════════════════╗'));
    console.log(chalk.cyan.bold('  ║') + chalk.white.bold('         LocalXWeb Server v1.0        ') + chalk.cyan.bold('║'));
    console.log(chalk.cyan.bold('  ║') + chalk.gray('   Apache · MySQL · PHP · phpMyAdmin  ') + chalk.cyan.bold('║'));
    console.log(chalk.cyan.bold('  ╚══════════════════════════════════════╝'));
    console.log('');
  },
  table: (data) => {
    const maxKey = Math.max(...data.map(d => d[0].length));
    data.forEach(([key, value]) => {
      console.log(`  ${chalk.gray(key.padEnd(maxKey))}  ${value}`);
    });
  }
};

module.exports = logger;
