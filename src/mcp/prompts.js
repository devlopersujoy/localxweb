/**
 * Returns all MCP Prompts definitions and their resolution handlers
 */
function createMcpPrompts() {
  const prompts = [
    // 1. Run PHP App in Current Folder / Project Runner (like CLI `localxweb run`)
    {
      name: 'run-php-app',
      description: 'Run the PHP app or web project in the CURRENT FOLDER (or target directory) on a local server, exactly like CLI "localxweb run" (with auto MySQL DB, credentials, and SQL push)',
      arguments: [
        {
          name: 'directory',
          description: 'Folder path to run (default: "." - the CURRENT WORKING DIRECTORY you are currently in, exactly like "localxweb run")',
          required: false
        },
        {
          name: 'appName',
          description: 'Optional name of the project or app folder',
          required: false
        },
        {
          name: 'port',
          description: 'Custom port to serve on (default: 8080 or next free port)',
          required: false
        },
        {
          name: 'action',
          description: 'Workflow action: "run" (default: serve current folder), "stop" (stop server), "create-db", "push-sql", "edit-db", "delete-db"',
          required: false
        },
        {
          name: 'databaseName',
          description: 'Optional MySQL database name (defaults to current folder name)',
          required: false
        },
        {
          name: 'sqlFileOrQuery',
          description: 'Optional .sql file in this folder to push into database, or raw SQL query to execute',
          required: false
        },
        {
          name: 'withDatabase',
          description: 'Whether the app requires a companion MySQL database ("true" or "false", default: "true")',
          required: false
        }
      ],
      handler: (args) => {
        const dir = args.directory || (args.appName ? args.appName : '.');
        const action = (args.action || 'run').toLowerCase();
        const withDb = args.withDatabase !== 'false';
        const port = args.port || 8080;
        const sql = args.sqlFileOrQuery;
        const app = args.appName || (dir === '.' ? 'current-project' : dir.replace(/^[./\\]+/, ''));
        const dbName = (args.databaseName || app).toLowerCase().replace(/[^a-z0-9_]/g, '_');

        if (action === 'stop') {
          return {
            description: `Stop local project server on port ${port}`,
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Please stop the local development server running for "${dir}":
1. Call \`localxweb_stop_app\` with port=${port}.
2. Confirm the project runner has been terminated.`
                }
              }
            ]
          };
        }

        if (action === 'push-sql' || action === 'import-sql') {
          return {
            description: `Push SQL into database "${dbName}"`,
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Please push/import SQL into MySQL database "${dbName}" for project in "${dir}":
1. Verify MySQL is running via \`localxweb_status\`. If stopped, start via \`localxweb_start_service\` (service="mysql").
2. Ensure database "${dbName}" exists by calling \`localxweb_db_create\` with name="${dbName}".
3. Push the SQL using \`localxweb_db_import\` with name="${dbName}"${sql ? (sql.endsWith('.sql') ? `, sourceFile="${sql}"` : `, sqlContent="${sql.replace(/"/g, '\\"')}"`) : ''}.
4. Call \`localxweb_db_tables\` with database="${dbName}" to verify created tables, schema, and row counts.
5. Provide a summary of the imported database schema and table list.`
                }
              }
            ]
          };
        }

        if (action === 'create-db') {
          return {
            description: `Create MySQL database "${dbName}"`,
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Please create and configure MySQL database "${dbName}":
1. Ensure MySQL is running via \`localxweb_status\`.
2. Call \`localxweb_db_create\` with name="${dbName}".
3. Retrieve credentials via \`localxweb_db_creds\` with name="${dbName}".
${sql ? `4. Import schema/seeds using \`localxweb_db_import\` with name="${dbName}" and ${sql.endsWith('.sql') ? `sourceFile="${sql}"` : `sqlContent="${sql.replace(/"/g, '\\"')}"`}.` : ''}
5. Provide the user with ready-to-use .env configuration, PDO snippet, and credentials.`
                }
              }
            ]
          };
        }

        if (action === 'edit-db' || action === 'query-db') {
          return {
            description: `Execute SQL edit/query on database "${dbName}"`,
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Please edit/query database "${dbName}":
1. Ensure MySQL is running via \`localxweb_status\`.
2. Execute SQL using \`localxweb_db_query\` with database="${dbName}" and query="${(sql || 'SHOW TABLES').replace(/"/g, '\\"')}".
3. Call \`localxweb_db_tables\` with database="${dbName}" to show current tables and row counts.
4. Return results in a clean markdown table.`
                }
              }
            ]
          };
        }

        if (action === 'delete-db') {
          return {
            description: `Delete database "${dbName}"`,
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Please delete/drop database "${dbName}":
1. Ensure MySQL is running via \`localxweb_status\`.
2. Call \`localxweb_db_drop\` with name="${dbName}".
3. Call \`localxweb_db_list\` to confirm remaining databases.
4. Confirm successful deletion.`
                }
              }
            ]
          };
        }

        // Default: Run Current Directory (like CLI `localxweb run`)
        return {
          description: `Run PHP Project in "${dir}" (like CLI "localxweb run")`,
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Please run the PHP/web application in THIS CURRENT FOLDER (or directory="${dir}") on LocalXWeb, exactly like running "localxweb run" in the CLI:
1. Call \`localxweb_run_app\` with:
   - directory: "${dir}" (this serves the current workspace/folder directly)
   - port: ${port}
   - withDatabase: ${withDb}
   - databaseName: "${dbName}"
   ${sql ? `- sqlFile: "${sql}"` : ''}
2. The tool will automatically:
   - Detect project files and start a local development server on \`http://localhost:${port}\`
   ${withDb ? `- Ensure MySQL is running and auto-create database "${dbName}"` : ''}
   ${sql ? `- Push SQL schema/file into "${dbName}"` : ''}
3. Test the live endpoint with \`localxweb_test_endpoint\` (path="http://localhost:${port}/") to verify HTTP 200 OK.
4. Present the developer with:
   - ⚡ Live Web URL: \`http://localhost:${port}\`
   - 📁 Running Directory: "${dir}"
   ${withDb ? `- 🗄️ Database: \`${dbName}\` and connection credentials (.env / PDO block)` : ''}
   - 🛑 Instructions to stop runner: call \`localxweb_stop_app\` or \`run-php-app action="stop"\`.`
              }
            }
          ]
        };
      }
    },

    // 2. Fullstack PHP & MySQL Workflow (Alias/Companion)
    {
      name: 'fullstack-php-workflow',
      description: 'End-to-end fullstack prototype: run PHP web app, auto-create MySQL database, push SQL schema files, edit/query records, and delete/manage',
      arguments: [
        {
          name: 'appName',
          description: 'Name of the web application (e.g. "my-project")',
          required: true
        },
        {
          name: 'sqlFile',
          description: 'Optional path to .sql schema/dump file to push into database',
          required: false
        },
        {
          name: 'action',
          description: 'Action to perform: "run", "push-sql", "edit-db", "delete-db", "delete-app"',
          required: false
        }
      ],
      handler: (args) => {
        const app = args.appName;
        const action = args.action || 'run';
        const sql = args.sqlFile;
        const dbName = app.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        return {
          description: `Fullstack Workflow for "${app}" (${action})`,
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `You are executing the LocalXWeb Fullstack Web & Database Prototype for "${app}".
Action: ${action}
Database: ${dbName}
${sql ? `SQL File: ${sql}` : ''}

Execute the following steps:
1. Ensure Apache and MySQL are running using \`localxweb_status\` and \`localxweb_start_service\`.
2. Ensure project folder exists in DocumentRoot via \`localxweb_site_list\` / \`localxweb_site_create\`.
3. Ensure MySQL database \`${dbName}\` is created via \`localxweb_db_create\` and retrieve connection snippets via \`localxweb_db_creds\`.
${sql ? `4. Push the SQL file into the database using \`localxweb_db_import\` with name="${dbName}" and sourceFile="${sql}". Verify tables via \`localxweb_db_tables\`.` : ''}
5. Check PHP extensions using \`localxweb_php_info\` (enable mysqli/pdo_mysql if needed via \`localxweb_enable_extension\`).
6. Verify live web app with \`localxweb_test_endpoint\` (path="/${app}/").
7. Output complete project status: local URL, credentials, and schema details.`
              }
            }
          ]
        };
      }
    },

    // 3. Fix PHP Error & Debugging
    {
      name: 'fix-php-error',
      description: 'Diagnose, debug, and fix PHP runtime errors, 500 server errors, fatal exceptions, or missing extensions',
      arguments: [
        {
          name: 'errorMessage',
          description: 'Error message or description (e.g. "Call to undefined function mysqli_connect()", "500 Internal Server Error", "PDOException")',
          required: false
        },
        {
          name: 'fileOrSite',
          description: 'Optional file path or site folder experiencing the error',
          required: false
        }
      ],
      handler: (args) => {
        const err = args.errorMessage ? `Reported Error: "${args.errorMessage}"` : 'Investigate recent PHP crashes / 500 errors';
        const site = args.fileOrSite ? `Target: "${args.fileOrSite}"` : '';
        return {
          description: 'Fix PHP Runtime Error / Debug Workflow',
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `You are an expert PHP debugger.
${err}
${site}

Follow these steps to resolve the issue:
1. Call \`localxweb_get_logs\` for service="php" (and service="apache") with lines=60 to locate the exact error line and stack trace.
2. Call \`localxweb_php_info\` to inspect loaded extensions and PHP runtime version.
   - If the error is due to a missing extension (e.g. mysqli, pdo_mysql, curl, gd, mbstring), call \`localxweb_enable_extension\` to enable it immediately in php.ini.
3. If the error is database-related (e.g. Connection refused or Access denied), verify MySQL status via \`localxweb_status\` and verify credentials via \`localxweb_db_creds\`.
4. Provide the exact cause and the corrected PHP code or configuration snippet.
5. Test the fixed script using \`localxweb_test_endpoint\` to confirm the 500 error is resolved.`
              }
            }
          ]
        };
      }
    },

    // 4. Enable PHP Extension
    {
      name: 'enable-php-extension',
      description: 'Check and enable a required PHP extension in php.ini (e.g. mysqli, pdo_mysql, curl, gd, zip, intl) and reload Apache',
      arguments: [
        {
          name: 'extension',
          description: 'Name of the PHP extension to enable (e.g. "mysqli", "pdo_mysql", "curl", "gd", "mbstring", "intl", "zip")',
          required: true
        }
      ],
      handler: (args) => {
        return {
          description: `Enable PHP extension "${args.extension}"`,
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Please enable PHP extension "${args.extension}" in LocalXWeb:
1. Call \`localxweb_php_info\` to check if "${args.extension}" is already loaded.
2. If not loaded, call \`localxweb_enable_extension\` with extension="${args.extension}".
3. If Apache is running, call \`localxweb_restart_service\` with service="apache" so the changes take effect.
4. Call \`localxweb_php_info\` again to confirm "${args.extension}" is now active and present in loadedExtensions.`
              }
            }
          ]
        };
      }
    },

    // 5. Clone and Run Git Repository
    {
      name: 'clone-and-run-repo',
      description: 'Clone a Git repository into LocalXWeb, configure environment and database, and launch it',
      arguments: [
        {
          name: 'repoUrl',
          description: 'Git repository URL to clone (e.g. "https://github.com/user/php-project.git")',
          required: true
        },
        {
          name: 'projectName',
          description: 'Optional destination folder name (defaults to repository name)',
          required: false
        },
        {
          name: 'databaseName',
          description: 'Optional MySQL database name to create and configure',
          required: false
        }
      ],
      handler: (args) => {
        const repo = args.repoUrl;
        const project = args.projectName || repo.split('/').pop().replace(/\.git$/i, '');
        const db = (args.databaseName || project).toLowerCase().replace(/[^a-z0-9_]/g, '_');
        return {
          description: `Clone and Run Repository "${project}"`,
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Please clone and run the Git repository "${repo}" in LocalXWeb:
1. Inspect DocumentRoot via \`localxweb_status\`.
2. Clone \`${repo}\` into DocumentRoot/${project}.
3. Create companion database \`${db}\` via \`localxweb_db_create\` and retrieve connection details via \`localxweb_db_creds\`.
4. If the project has an \`.env.example\` or \`config.sample.php\`, configure database credentials to match LocalXWeb.
5. If there is a \`.sql\` schema dump in the repo, import it using \`localxweb_db_import\`.
6. Test the application via \`localxweb_test_endpoint\` with path="/${project}/".
7. Present the local web URL (\`http://localhost:<port>/${project}/\`) and project details to the user.`
              }
            }
          ]
        };
      }
    },

    // 6. Test API Endpoint
    {
      name: 'test-api-endpoint',
      description: 'Send test HTTP requests to local PHP API endpoints and inspect responses, headers, and logs',
      arguments: [
        {
          name: 'path',
          description: 'Relative endpoint path or URL to test (e.g. "/api/products.php", "/my-app/index.php")',
          required: true
        },
        {
          name: 'method',
          description: 'HTTP method (GET, POST, PUT, DELETE - default: GET)',
          required: false
        },
        {
          name: 'payload',
          description: 'Optional JSON or form string payload for POST/PUT requests',
          required: false
        }
      ],
      handler: (args) => {
        const method = (args.method || 'GET').toUpperCase();
        return {
          description: `Test API Endpoint: ${method} ${args.path}`,
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Please test local endpoint: ${method} ${args.path}
1. Ensure Apache is running via \`localxweb_status\`.
2. Call \`localxweb_test_endpoint\` with path="${args.path}", method="${method}"${args.payload ? `, body=${JSON.stringify(args.payload)}` : ''}.
3. Inspect HTTP statusCode, response body, and duration.
4. If statusCode >= 500, immediately call \`localxweb_get_logs\` with service="php" to inspect PHP errors and recommend fixes.`
              }
            }
          ]
        };
      }
    },

    // 7. Create RESTful PHP CRUD API
    {
      name: 'create-crud-api',
      description: 'Scaffold a complete RESTful PHP CRUD API connected to MySQL database with JSON responses and validation',
      arguments: [
        {
          name: 'resourceName',
          description: 'Resource name to manage (e.g. "products", "todos", "customers", "notes")',
          required: true
        },
        {
          name: 'databaseName',
          description: 'Name of the database to store data (e.g. "api_db")',
          required: true
        }
      ],
      handler: (args) => {
        const res = args.resourceName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        const db = args.databaseName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        return {
          description: `Create PHP CRUD API for "${res}" in "${db}"`,
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Please build a clean, modern RESTful PHP CRUD API for "${res}":
1. Ensure MySQL and Apache are running via \`localxweb_status\`.
2. Call \`localxweb_db_create\` with name="${db}" and get credentials via \`localxweb_db_creds\`.
3. Create the database table for "${res}" using \`localxweb_db_query\` with columns (id INT AUTO_INCREMENT PRIMARY KEY, title/name VARCHAR(255), description TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP).
4. Create a folder in DocumentRoot named "api-${res}" and generate an \`index.php\` handling:
   - GET /: List all items (JSON)
   - GET /?id=X: Get single item (JSON)
   - POST /: Create new item (JSON input)
   - PUT /?id=X: Update item
   - DELETE /?id=X: Delete item
   - Proper PDO prepared statements and error handling.
5. Verify the API with \`localxweb_test_endpoint\` (path="/api-${res}/index.php").
6. Provide ready-to-use curl and JavaScript fetch examples for the developer.`
              }
            }
          ]
        };
      }
    },

    // 8. Quick PHP Snippet Evaluation
    {
      name: 'quick-php-snippet',
      description: 'Quickly test, evaluate, or run a PHP code snippet in LocalXWeb and inspect output and errors',
      arguments: [
        {
          name: 'code',
          description: 'PHP code snippet to run (without <?php tag or with it)',
          required: true
        },
        {
          name: 'scriptName',
          description: 'Filename to write in DocumentRoot (default: "snippet.php")',
          required: false
        }
      ],
      handler: (args) => {
        const file = args.scriptName || 'snippet.php';
        return {
          description: `Execute PHP Snippet: ${file}`,
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Please test this PHP snippet in LocalXWeb:
Snippet Code:
\`\`\`php
${args.code}
\`\`\`

Workflow:
1. Ensure Apache is running via \`localxweb_status\`.
2. Write the snippet to DocumentRoot as "${file}".
3. Call \`localxweb_test_endpoint\` with path="/${file}".
4. If any PHP warnings or errors appear, check \`localxweb_get_logs\` for service="php" and provide corrections.
5. Display the execution output and execution time.`
              }
            }
          ]
        };
      }
    },

    // 9. WordPress Setup
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
    },

    // 10. Scaffold Web Project
    {
      name: 'scaffold-web-app',
      description: 'Scaffold and run a new web project with database integration (php, html, wordpress, laravel)',
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

    // 11. Setup Database
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

    // 12. SQL Query Assistant
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

    // 13. Migrate Database
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

    // 14. Server Performance Tune
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

    // 15. Diagnose Server
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
    }
  ];

  return prompts;
}

module.exports = { createMcpPrompts };
