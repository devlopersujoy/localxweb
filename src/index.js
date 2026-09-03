const ApacheService = require('./services/apache');
const MySQLService = require('./services/mysql');
const PHPService = require('./services/php');
const PhpMyAdminService = require('./services/phpmyadmin');
const DatabaseManager = require('./database/manager');
const sitesManager = require('./services/sites');
const packageManager = require('./installer/packageManager');
const { runDiagnostics } = require('./utils/doctor');
const config = require('./config');

function createServices() {
  const apache = new ApacheService();
  const mysql = new MySQLService();
  const php = new PHPService();
  const phpmyadmin = new PhpMyAdminService();
  const dbManager = new DatabaseManager(mysql);

  return { apache, mysql, php, phpmyadmin, dbManager, sitesManager };
}

module.exports = { createServices, sitesManager, packageManager, runDiagnostics, config };
