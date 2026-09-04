/**
 * Returns all MCP Prompts definitions and their resolution handlers
 */
function createMcpPrompts() {
  const prompts = [
    {
      name: 'diagnose-server',
      description: 'Systematic diagnosis guide for troubleshooting LocalXWeb services, ports, and permissions',
      arguments: [
        {
          name: 'issueDescription',
          description: 'Optional description of the error or problem encountered',
          required: false
        }
      ],
      handler: (args) => {
        const issue = args.issueDescription ? `Reported issue: "${args.issueDescription}"` : 'General health diagnosis';
        return {
          description: 'LocalXWeb Diagnostic and Self-Healing Workflow',
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `You are an expert DevOps engineer and server administrator for LocalXWeb.
${issue}

Please follow these systematic steps to investigate and resolve any issues:
1. Call \`localxweb_doctor\` to check operating system integrity, missing VC++ runtime, target port conflicts, and PHP extensions.
2. Call \`localxweb_status\` to inspect whether Apache, MySQL, PHP, and phpMyAdmin are running or stopped.
3. If any port conflicts or stale process locks are found, call \`localxweb_autofix\` to automatically forward ports and unlock resources.
4. Call \`localxweb_get_logs\` for the problematic service to identify root causes.
5. Provide a clear, actionable summary of the diagnosis and confirm all services are online.`
              }
            }
          ]
        };
      }
    },

    {
      name: 'setup-database',
      description: 'Guided workflow for creating a new database with dedicated credentials and .env configuration',
      arguments: [
        {
          name: 'databaseName',
          description: 'Name of the database to create',
          required: true
        },
        {
          name: 'username',
          description: 'Optional dedicated MySQL username',
          required: false
        }
      ],
      handler: (args) => {
        return {
          description: `Create and configure database "${args.databaseName}"`,
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Please set up a new database in LocalXWeb:
1. Verify MySQL is running via \`localxweb_status\`. If not running, call \`localxweb_start_service\` with service="mysql".
2. Call \`localxweb_db_create\` with name="${args.databaseName}"${args.username ? ` and username="${args.username}"` : ''}.
3. Retrieve credentials via \`localxweb_db_creds\`.
4. Provide the user with their DB connection string, ready-to-use .env configuration, and sample PHP PDO connection snippet.`
              }
            }
          ]
        };
      }
    },

    {
      name: 'scaffold-web-app',
      description: 'Scaffold and run a new web project with database integration',
      arguments: [
        {
          name: 'projectName',
          description: 'Name of the web project',
          required: true
        },
        {
          name: 'template',
          description: 'Template type ("php", "html", "wordpress", "laravel")',
          required: false
        }
      ],
      handler: (args) => {
        const tpl = args.template || 'php';
        return {
          description: `Scaffold and initialize web project "${args.projectName}" (${tpl})`,
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Please scaffold a new web application in LocalXWeb:
1. Call \`localxweb_site_create\` with name="${args.projectName}" and template="${tpl}".
2. Create a companion database using \`localxweb_db_create\` with name="${args.projectName.replace(/[^a-zA-Z0-9_]/g, '_')}".
3. Provide the user with the local project URL, folder location, and database credentials.`
              }
            }
          ]
        };
      }
    },

    {
      name: 'sql-query-assistant',
      description: 'Inspect schemas, examine tables, write and optimize raw SQL queries on MySQL/MariaDB',
      arguments: [
        {
          name: 'database',
          description: 'Database name to query',
          required: true
        },
        {
          name: 'goal',
          description: 'What you want to do (e.g. "Find active users", "Examine schema", "Check table sizes")',
          required: false
        }
      ],
      handler: (args) => {
        const goalText = args.goal ? `User Goal: "${args.goal}"` : 'Database inspection and query optimization';
        return {
          description: `SQL Assistant for database "${args.database}"`,
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `You are an expert MySQL Database Administrator.
Target Database: \`${args.database}\`
${goalText}

Please perform the following workflow:
1. Call \`localxweb_db_tables\` with database="${args.database}" to view all tables and sizes.
2. If schema inspection is needed, use \`localxweb_db_query\` with "DESCRIBE <tablename>" or "SHOW CREATE TABLE <tablename>".
3. Formulate safe, optimized SQL queries and execute them using \`localxweb_db_query\`.
4. Return the data to the user in a clean markdown table, highlighting any performance tips or missing indexes.`
              }
            }
          ]
        };
      }
    },

    {
      name: 'migrate-database',
      description: 'Backup, export, or import database SQL dump files for versioning and migrations',
      arguments: [
        {
          name: 'database',
          description: 'Database name to backup or restore',
          required: true
        },
        {
          name: 'action',
          description: '"export" to backup or "import" to restore',
          required: true
        },
        {
          name: 'filePath',
          description: 'Path to .sql dump file (required for import, optional for export)',
          required: false
        }
      ],
      handler: (args) => {
        const isExport = (args.action || 'export').toLowerCase() === 'export';
        return {
          description: `Database Migration for "${args.database}" (${args.action})`,
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: isExport
                  ? `Please backup and export database "${args.database}":
1. Call \`localxweb_db_export\` with name="${args.database}"${args.filePath ? ` and destinationFile="${args.filePath}"` : ''}.
2. Confirm the dump file location and disk size, and provide instructions on how to use it.`
                  : `Please restore and import SQL file into database "${args.database}":
1. Ensure the database exists by calling \`localxweb_db_create\` with name="${args.database}".
2. Call \`localxweb_db_import\` with name="${args.database}" and sourceFile="${args.filePath}".
3. Run \`localxweb_db_tables\` to verify the imported tables and row counts.`
              }
            }
          ]
        };
      }
    },

    {
      name: 'server-performance-tune',
      description: 'Analyze Apache, MySQL, PHP configurations, memory limits, and error logs for optimization',
      arguments: [
        {
          name: 'focusArea',
          description: 'Area to focus ("php", "mysql", "apache", "all")',
          required: false
        }
      ],
      handler: (args) => {
        const focus = args.focusArea || 'all';
        return {
          description: `Server Performance Audit (${focus})`,
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `You are an expert server performance engineer.
Please audit LocalXWeb stack performance focusing on: ${focus}:
1. Inspect active configurations using \`localxweb_get_config\` and \`localxweb_php_info\`.
2. Check recent logs using \`localxweb_get_logs\` for apache, mysql, and php to catch recurring warnings or slow queries.
3. Check port health and latencies using \`localxweb_scan_ports\`.
4. Provide recommendations for opcache, memory limits, max_execution_time, and MySQL buffer pool adjustments.`
              }
            }
          ]
        };
      }
    },

    {
      name: 'wordpress-setup',
      description: 'Complete automated setup workflow for a local WordPress site and companion database',
      arguments: [
        {
          name: 'siteName',
          description: 'Name of the WordPress project folder (e.g. "my-wordpress-blog")',
          required: true
        }
      ],
      handler: (args) => {
        const dbName = args.siteName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        return {
          description: `Set up WordPress for "${args.siteName}"`,
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Please set up a local WordPress installation named "${args.siteName}":
1. Call \`localxweb_site_create\` with name="${args.siteName}" and template="wordpress".
2. Call \`localxweb_db_create\` with name="${dbName}".
3. Retrieve database credentials via \`localxweb_db_creds\` with name="${dbName}".
4. Generate the exact \`wp-config.php\` database configuration block:
   - DB_NAME: ${dbName}
   - DB_USER: root
   - DB_PASSWORD: (from creds)
   - DB_HOST: 127.0.0.1:<mysql_port>
5. Provide the user with the direct URL to open and complete the 5-minute WordPress installation in their browser!`
              }
            }
          ]
        };
      }
    }
  ];

  return prompts;
}

module.exports = { createMcpPrompts };
