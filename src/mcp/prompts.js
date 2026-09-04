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
    }
  ];

  return prompts;
}

module.exports = { createMcpPrompts };
