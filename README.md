# LocalXWeb ⚡

<div align="center">

![LocalXWeb Logo](https://img.shields.io/badge/LocalXWeb-v1.2.0-0ea5e9?style=for-the-badge&logo=apache&logoColor=white)
[![npm install](https://img.shields.io/badge/npm-npm%20install%20--g%20localxweb-cb3837?style=for-the-badge&logo=npm)](https://www.npmjs.com/package/localxweb)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg?style=for-the-badge)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20Termux-blueviolet?style=for-the-badge)](https://github.com/devlopersujoy/localxweb)
[![MCP Supported](https://img.shields.io/badge/MCP-27%20Tools%20%7C%2014%20Prompts%20%7C%20SSE%20%26%20Stdio-amber?style=for-the-badge)](https://modelcontextprotocol.io)

### **The Next-Generation Local Development Server & AI-Native Stack**
*A modern, lightning-fast, self-contained alternative to XAMPP, WampServer, and MAMP for Windows, macOS, Linux, and Android (Termux).*

```bash
npm install -g localxweb
```

[✨ Features](#-key-features) • [🚀 Quick Start](#-quick-start) • [🖥️ Control Center](#️-apple-style-web-control-center) • [🛠️ CLI Commands](#️-cli-command-reference) • [🤖 MCP AI Integration](#-model-context-protocol-mcp-deep-dive) • [🗄️ Database Architecture](#️-database-architecture--offline-resilience) • [📁 Project Runner](#-instant-project-server-runner) • [📄 License](#-license)

</div>

---

## 🌟 Why LocalXWeb?

Traditional local web servers like XAMPP and WampServer were built decades ago. They suffer from messy system file pollution, port conflicts, confusing configuration files, lack of modern database credential persistence, and zero integration with modern AI coding workflows.

**LocalXWeb changes the game:**
- **Zero Pollution**: 100% self-contained inside `~/.localxweb/` — no Windows registry mess or system path contamination.
- **AI-Native Stack**: World-first local stack with a **native Model Context Protocol (MCP) server** featuring **27 tools, 14 human-like prompts, and 6 live resources** for Claude Desktop, Cursor, Google Antigravity, and Windsurf.
- **Zero-SQL Resilience**: Local databases, credentials, virtual hosts, and configs are stored in **JSON registries** (`databases.json`, `credentials.json`, `config.json`). It **never crashes** if MySQL is offline or not installed!
- **Instant Project Server (`localxweb run`)**: Serve any folder or current working directory on demand with auto-assigned ports and live monitoring.
- **Apple-Inspired Control Center**: A sleek, dark-mode web dashboard on Port 98 featuring real-time CPU/RAM/uptime gauges, one-click stack control, and instant credential reveals.

---

## ✨ Key Features

### 🚀 Core Server Stack
- **Apache 2.4**: High-performance HTTP server with virtual hosts and rewrite engine enabled by default.
- **MariaDB 10.11 / MySQL**: Lightweight, fast database server pre-configured with `utf8mb4_unicode_ci`.
- **PHP 8.x**: Fast CGI / CLI engine with popular extensions (`pdo_mysql`, `mbstring`, `curl`, `openssl`, `fileinfo`, `gd`, `zip`, `opcache`).
- **phpMyAdmin**: Web database manager pre-configured on port 9999 with automatic MySQL authentication.

### 🤖 Model Context Protocol (MCP) Server
- **Dual Transports**: Connect AI agents over network **SSE (Port 9900)** or standard I/O (**Stdio** via CLI).
- **27 Automated Tools**: Control stack services, run queries, scaffold sites, export/import SQL dumps, enable PHP extensions, and launch local web apps.
- **14 Conversational AI Prompts**: Pre-engineered workflows like `run-php-app`, `setup-database`, `create-crud-api`, `fix-php-error`, and `wordpress-setup`.
- **6 Live Streaming Resources**: Live CPU/RAM metrics, service status, registered databases, and running apps streamed to your AI assistant.
- **Enterprise-Grade Security**: MCP API Key token authentication (`Authorization: Bearer <key>` or `?apiKey=...`), auto-persisted and toggleable in the dashboard.
- **One-Click AI Client Configurator**: Instantly installs MCP configurations into Claude Desktop, Cursor, Antigravity, and Windsurf with real API keys.

### 🗄️ Database Management & Offline Resilience
- **Persistent JSON Registry**: Every database created is recorded in `~/.localxweb/databases.json` and credentials in `credentials.json`.
- **Offline Mode**: If MySQL is stopped or not installed, database operations succeed without crashing. LocalXWeb remembers credentials and automatically syncs to MySQL when started (`CREATE DATABASE IF NOT EXISTS`).
- **Dedicated Database Users**: Generates isolated MySQL users per database with strong passwords and full privileges.
- **Instant Connection Snippets**: One-click copy for Laravel `.env` (`DB_CONNECTION=mysql`, `DB_PORT=3306`, etc.) and native PHP PDO snippets.

### 📁 Virtual Hosts & Instant Project Runner
- **`localxweb run [dir]`**: Run your current directory (`.`) or any project folder on a dedicated port instantly without editing Apache configs.
- **Site Scaffolding**: One-command project creation with built-in templates (`html`, `php`, `laravel`).
- **DocumentRoot Management**: Map individual sites to custom directories with automated directory browsing.

### 🩺 System Doctor & Port Auto-Fixer
- **Intelligent Port Conflict Resolver**: Scans ports 80, 3306, 9999, 98, and 9900. If a port is occupied by another app (e.g., IIS, Skype, or Node.js), it automatically forwards to the next safe port.
- **System Doctor (`localxweb doctor`)**: Verifies installed binaries, tests database connectivity, checks permissions, and audits PHP extensions.
- **System Cleaner (`localxweb clean all`)**: Deep cleans cache files, truncates log files, and flushes orphaned PID locks.

---

## 🏗️ Architecture Overview

```mermaid
flowchart TD
    subgraph UI_CLI["User Interfaces & AI Clients"]
        Dashboard["🖥️ Control Center (Port 98)"]
        CLI["💻 LocalXWeb CLI Runner"]
        AIAgents["🤖 AI IDEs (Claude, Cursor, Antigravity, Windsurf)"]
    end

    subgraph MCP_Layer["MCP Integration Layer"]
        MCPEngine["⚙️ LocalXWeb MCP Server"]
        MCPTransports["Transports: SSE (Port 9900) & Stdio"]
        MCPEngine --- MCPTransports
    end

    subgraph Core_Services["Self-Contained Stack (~/.localxweb/services)"]
        Apache["🌐 Apache 2.4 (Port 80)"]
        MySQL["🗄️ MariaDB / MySQL (Port 3306)"]
        PHP["🐘 PHP 8.x Engine"]
        PMA["📊 phpMyAdmin (Port 9999)"]
    end

    subgraph Data_Registry["Zero-SQL JSON Registry (~/.localxweb/)"]
        ConfigJSON["config.json (Ports, MCP API Key)"]
        DatabasesJSON["databases.json (DB Registry)"]
        CredsJSON["credentials.json (Passwords & Snippets)"]
        SitesJSON["sites.json (Virtual Hosts)"]
    end

    Dashboard --> Core_Services
    CLI --> Core_Services
    AIAgents --> MCPTransports
    MCPTransports --> Core_Services
    Core_Services --> Data_Registry
```

---

## 📦 Quick Start

### 1. Global Installation (Recommended)

Install LocalXWeb globally with a single command:

```bash
npm install -g localxweb
```

> **⚡ Global Access**: Once installed, the `localxweb` command is instantly accessible across your entire system in any terminal, Command Prompt, PowerShell, or shell.

<details>
<summary><b>🛠️ Alternative: Install from Source (Git Clone)</b></summary>

```bash
git clone https://github.com/devlopersujoy/localxweb.git
cd localxweb
npm install
npm link
```
</details>

### 2. Start the Stack

Start all services (Apache, MySQL, phpMyAdmin, and Dashboard) in one command:

```bash
localxweb start
```

Or run the interactive CLI menu:

```bash
localxweb
```

### 3. Open Control Center

Access your local development environment via browser:

| Component | Default URL | Description |
| :--- | :--- | :--- |
| **Control Center Dashboard** | [http://localhost:98/Control-Center](http://localhost:98/Control-Center) | Modern GUI control center & gauges |
| **Apache Web Server** | [http://localhost:80](http://localhost:80) | DocumentRoot (`~/.localxweb/htdocs`) |
| **phpMyAdmin Client** | [http://localhost:9999](http://localhost:9999) | MySQL web database interface |
| **MCP AI Server (SSE)** | [http://localhost:9900/sse](http://localhost:9900/sse) | AI Agent Model Context Protocol endpoint |

---

## 🖥️ Apple-Style Web Control Center

The LocalXWeb Control Center is designed with an Apple-inspired glassmorphism dark aesthetic:

- **Hardware Telemetry Gauges**: Live CPU utilization %, real-time RAM usage, and server uptime.
- **Service Jewel Indicators**: Real-time status pills (running, stopped, missing) with individual **Start / Stop / Restart / Uninstall** controls.
- **Quick Launch Dock**: One-click buttons to launch DocumentRoot, phpMyAdmin, System Doctor, and logs.
- **Interactive Database Manager**:
  - Create databases with dedicated users and passwords.
  - Reveal passwords anytime and copy Laravel `.env` / PHP PDO snippets with one click.
  - View database tables, rows, engines, and size.
  - Export and import `.sql` files directly from the browser.
- **Project Site Manager**: Create and open virtual hosts with templates (`PHP`, `Laravel`, `HTML5`).
- **System Cleaner Modal**: One-click purge of temporary caches, PHP OPcache buffers, and logs.
- **Live Console Logs**: Real-time streaming log viewer with component filtering (Apache, MySQL, PHP, MCP).

---

## 🛠️ CLI Command Reference

LocalXWeb includes an extensive CLI suite powered by `commander` and `chalk`:

```
Usage: localxweb [command] [options]
```

### 🟢 Service Management

| Command | Description | Example |
| :--- | :--- | :--- |
| `localxweb start` | Start all stack services (Apache, MySQL, PMA) | `localxweb start` |
| `localxweb stop` | Stop all running services cleanly | `localxweb stop` |
| `localxweb restart` | Restart all stack services | `localxweb restart` |
| `localxweb status` | Display formatted status table of all services | `localxweb status` |

### ⚡ Instant Project Runner

| Command | Description | Example |
| :--- | :--- | :--- |
| `localxweb run` | Serve CURRENT directory on default port 8080 | `localxweb run` |
| `localxweb run <dir>` | Serve specific folder on custom port | `localxweb run ./my-app -p 5000` |
| `localxweb run -b` | Serve project and automatically open browser | `localxweb run . -b` |

### 🗄️ Database Operations

| Command | Description | Example |
| :--- | :--- | :--- |
| `localxweb db list` | List all databases (shows tables, size, and offline status) | `localxweb db list` |
| `localxweb db create <name>` | Create database with optional dedicated user & password | `localxweb db create blog_db -u blogger -p secret123` |
| `localxweb db creds <name>` | Show saved credentials, password, and `.env` snippets | `localxweb db creds blog_db` |
| `localxweb db export <name> <file>` | Export database to `.sql` file (mysqldump / Node fallback) | `localxweb db export blog_db backup.sql` |
| `localxweb db import <name> <file>` | Import `.sql` file into database | `localxweb db import blog_db schema.sql` |
| `localxweb db query <sql>` | Execute SQL query directly from CLI | `localxweb db query "SHOW TABLES" -d blog_db` |
| `localxweb db delete <name>` | Delete database from MySQL and local JSON registry | `localxweb db delete blog_db` |

### 📁 Virtual Hosts & Sites

| Command | Description | Example |
| :--- | :--- | :--- |
| `localxweb site list` | List all registered sites and virtual hosts | `localxweb site list` |
| `localxweb site create <name>` | Scaffold a new site (`--template php\|laravel\|html`) | `localxweb site create mysite -t php` |
| `localxweb site open <name>` | Open site URL in your default browser | `localxweb site open mysite` |
| `localxweb site delete <name>` | Remove site configuration | `localxweb site delete mysite` |

### 🩺 System Diagnostics & Maintenance

| Command | Description | Example |
| :--- | :--- | :--- |
| `localxweb doctor` | Run full diagnostic suite with recommendations | `localxweb doctor` |
| `localxweb ports` | Scan standard stack ports (80, 3306, 9999, 98, 9900) | `localxweb ports` |
| `localxweb check` | Verify integrity of installed binaries & packages | `localxweb check` |
| `localxweb php-info` | Display active PHP version, binary path, and extensions | `localxweb php-info` |
| `localxweb clean all` | Deep clean temporary cache, logs, and PID locks | `localxweb clean all` |
| `localxweb clean logs` | Truncate service log files | `localxweb clean logs` |
| `localxweb clean cache` | Remove cached downloads and temporary archives | `localxweb clean cache` |
| `localxweb explore htdocs` | Open DocumentRoot directory in File Explorer / Finder | `localxweb explore htdocs` |
| `localxweb uninstall <service>` | Uninstall a service (`--purge` to remove data) | `localxweb uninstall mysql --purge` |

---

## 🤖 Model Context Protocol (MCP) Deep Dive

LocalXWeb is the **first local development server stack in the world** to implement the official [Model Context Protocol (MCP)](https://modelcontextprotocol.io).

Any AI programming assistant (Claude Desktop, Cursor, Google Antigravity, Windsurf) can connect directly to LocalXWeb to inspect services, create databases, run queries, fix errors, and launch apps autonomously.

### 🌐 Dual Transport Architecture

1. **Network SSE Transport (Recommended for all IDEs)**:
   - URL: `http://localhost:9900/sse`
   - Messages: `http://localhost:9900/messages`
   - Real-time bi-directional events over HTTP.
2. **Stdio Transport**:
   - Command: `node path/to/localxweb/bin/localxweb.js mcp`
   - Traditional standard input/output pipe for local CLI environments.

---

### 🔐 Enterprise API Key Authentication

LocalXWeb protects your local development environment from unauthorized network access with configurable API Key authentication:

- **Saved in JSON**: Stored in `~/.localxweb/config.json` under `mcpApiKey`.
- **Instant GUI Toggle**: Enable or disable anytime from the **Settings** or **MCP** dashboard tabs. Toggling auto-saves instantly without needing a full page reload.
- **Authentication Headers**: Pass your key via HTTP Bearer token or URL parameter:
  ```http
  Authorization: Bearer lxw_3bd8ce31ba7c26e20681acf08bed9892
  ```
  Or via query parameter:
  ```
  http://localhost:9900/sse?apiKey=lxw_3bd8ce31ba7c26e20681acf08bed9892
  ```

---

### ⚙️ 10-Second Auto-Configuration for AI IDEs

You can click **"Auto-Install All Configs"** in the Control Center (`/mcp` tab) or manually configure your favorite IDE:

#### 1. Claude Desktop (`claude_desktop_config.json`)
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "localxweb": {
      "url": "http://localhost:9900/sse?apiKey=YOUR_MCP_API_KEY",
      "transport": "sse"
    }
  }
}
```

#### 2. Cursor (`mcp.json`)
- Add to `.cursor/mcp.json` or your Cursor Global MCP settings:

```json
{
  "mcpServers": {
    "localxweb": {
      "url": "http://localhost:9900/sse?apiKey=YOUR_MCP_API_KEY"
    }
  }
}
```

#### 3. Google Antigravity (`~/.gemini/antigravity/mcp_config.json`)
```json
{
  "mcpServers": {
    "localxweb": {
      "url": "http://localhost:9900/sse?apiKey=YOUR_MCP_API_KEY",
      "transport": "sse"
    }
  }
}
```

#### 4. Windsurf (`~/.codeium/windsurf/mcp_config.json`)
```json
{
  "mcpServers": {
    "localxweb": {
      "serverUrl": "http://localhost:9900/sse?apiKey=YOUR_MCP_API_KEY"
    }
  }
}
```

---

### 🧰 Complete Catalog of 27 MCP Tools

| Tool Name | Parameters | Description |
| :--- | :--- | :--- |
| `localxweb_run_app` | `directory`, `port`, `router`, `env` | Launch current folder or target path as local PHP/web server |
| `localxweb_stop_app` | `port` | Stop running project server on specific port |
| `localxweb_list_running_apps` | _none_ | List all active project servers with ports, PIDs, and runtimes |
| `localxweb_status` | _none_ | Real-time status of Apache, MySQL, PHP, PMA, and ports |
| `localxweb_start_service` | `service` (`apache\|mysql\|phpmyadmin\|all`) | Start one or all stack services |
| `localxweb_stop_service` | `service` (`apache\|mysql\|phpmyadmin\|all`) | Stop one or all stack services |
| `localxweb_restart_service` | `service` (`apache\|mysql\|phpmyadmin\|all`) | Restart one or all stack services |
| `localxweb_db_list` | _none_ | List all databases from JSON registry and live MySQL |
| `localxweb_db_create` | `name`, `username`, `password`, `collation` | Create database with dedicated user & password (offline safe) |
| `localxweb_db_query` | `query`, `database` | Execute SQL query against MySQL database |
| `localxweb_db_creds` | `name` | Get database credentials, password, and `.env` snippets |
| `localxweb_db_tables` | `database` | List tables, engine, row counts, and size for a database |
| `localxweb_db_import` | `name`, `sourceFile`, `sqlContent` | Import `.sql` file or raw SQL string into database |
| `localxweb_db_export` | `name`, `destinationFile` | Export database schema and data to `.sql` file |
| `localxweb_db_drop` | `name` | Drop database from MySQL and local JSON registry |
| `localxweb_site_list` | _none_ | List all virtual host sites and DocumentRoots |
| `localxweb_site_create` | `name`, `template` (`php\|laravel\|html`) | Scaffold a new site with standard directory structure |
| `localxweb_doctor` | _none_ | Run system diagnostic audit with automated recommendations |
| `localxweb_autofix` | `issueType` | Automatically fix port conflicts, permissions, and service issues |
| `localxweb_scan_ports` | `ports` | Scan availability of ports and identify blocking processes |
| `localxweb_clean` | `target` (`all\|cache\|logs\|pids`) | Purge cache, clear logs, and reset PID files |
| `localxweb_php_info` | _none_ | Get loaded PHP version, ini path, and enabled extensions |
| `localxweb_enable_extension` | `extension` | Enable PHP extension in `php.ini` (e.g., `pdo_mysql`, `curl`) |
| `localxweb_get_config` | _none_ | Read complete `config.json` configuration |
| `localxweb_update_config` | `updates` | Update server ports, root password, and preferences |
| `localxweb_get_logs` | `service`, `lines` | Read tail of service log files (`apache`, `mysql`, `php`, `mcp`) |
| `localxweb_test_endpoint` | `url`, `method`, `headers`, `body` | Send HTTP test request to local endpoint and return response |

---

### 💬 14 Conversational AI Prompts

LocalXWeb provides ready-to-use structured prompts that any AI agent can execute:

1. **`run-php-app`**: Run the PHP app or web project in the CURRENT FOLDER (`.`) on a local server, exactly like CLI `localxweb run` (with auto MySQL database creation, credentials, and SQL push).
2. **`fullstack-php-workflow`**: End-to-end PHP web application setup with database, tables, credentials, and live testing.
3. **`fix-php-error`**: Diagnose and resolve PHP fatal errors, warnings, syntax mistakes, or missing extensions.
4. **`enable-php-extension`**: Guide AI to enable extensions like `pdo_mysql`, `curl`, `mbstring`, or `zip`.
5. **`clone-and-run-repo`**: Clone a GitHub repository into DocumentRoot and start serving it immediately.
6. **`test-api-endpoint`**: Automated local HTTP API test runner with status codes, headers, and payload verification.
7. **`create-crud-api`**: Scaffold complete RESTful CRUD API endpoints in PHP with prepared statements.
8. **`quick-php-snippet`**: Run a temporary PHP code snippet locally and inspect output.
9. **`wordpress-setup`**: Complete WordPress installation workflow with automated database configuration.
10. **`scaffold-web-app`**: Scaffold HTML5, PHP, or Laravel boilerplate projects in seconds.
11. **`setup-database`**: Create a database with secure credentials and return `.env` configuration.
12. **`sql-query-assistant`**: Write, optimize, and debug SQL queries for MySQL/MariaDB.
13. **`migrate-database`**: Export schema and data, or import `.sql` dump into target database.
14. **`diagnose-server`**: Troubleshoot Apache, MySQL, port binding, and permission errors.

---

### 📡 6 Real-Time MCP Resources

AI agents can subscribe to real-time resources to monitor your stack dynamically:

| Resource URI | Description |
| :--- | :--- |
| `localxweb://stack/status` | Live status, port assignments, and health of all services |
| `localxweb://system/metrics` | Hardware telemetry (CPU load %, memory usage MB/%, uptime) |
| `localxweb://databases` | Complete registry of databases, table counts, sizes, and credentials |
| `localxweb://sites` | Registered virtual host projects, paths, and URLs |
| `localxweb://apps/running` | Actively running project server instances (started via runner) |
| `localxweb://config` | Global configuration settings (`config.json`) |

---

## 🗄️ Database Architecture & Offline Resilience

Most developer stacks crash or show confusing errors if MySQL isn't running. LocalXWeb is architected with **Zero-SQL Local Persistence**:

### 1. JSON Registry (`~/.localxweb/databases.json`)
- Every database is registered with metadata:
  ```json
  {
    "ecommerce_app": {
      "name": "ecommerce_app",
      "user": "ecommerce_user",
      "password": "StrongSecretPassword123!",
      "collation": "utf8mb4_unicode_ci",
      "tables": 14,
      "sizeMB": 1.25,
      "createdAt": "2026-09-04T10:00:00.000Z",
      "updatedAt": "2026-09-04T11:00:00.000Z"
    }
  }
  ```
- Credentials are also mirrored in `credentials.json` for rapid CLI retrieval (`localxweb db creds <name>`).

### 2. Zero-Crash Offline Mode
- If you're building a static site, testing SQLite, or working on battery saver mode without starting MySQL:
  - `localxweb db create <name>` saves to `databases.json` and returns your connection snippets immediately with `{ mysqlSynced: false }`.
  - `localxweb db list` lists all registered databases with a friendly `[JSON registry - MySQL offline]` indicator.
  - The Web Dashboard displays `JSON Registry (MySQL Offline)` badges without throwing errors.

### 3. Automatic Synchronization
- When MySQL is started (`localxweb start` or via Dashboard), LocalXWeb iterates over `databases.json` and automatically runs `CREATE DATABASE IF NOT EXISTS` and recreates users with full privileges.

---

## 📁 Instant Project Server Runner

Want to test a standalone PHP file or web project without moving files to `htdocs` or configuring Apache?

```bash
# Navigate to your project folder
cd ~/my-php-project

# Run directly:
localxweb run
```

Output:
```
✔ LocalXWeb Project Server started!
  Local URL:   http://localhost:8080
  Directory:   C:\Users\...\my-php-project
  Port:        8080
  PID:         14292
  Stop Server: Press Ctrl+C or run: localxweb stop-app --port 8080
```

- Automatically finds the next available port if `8080` is busy.
- Can be launched and monitored via MCP (`localxweb_run_app` / `localxweb_stop_app`).
- Add `-b` to automatically open the project in your default web browser.

---

## 📂 File System Layout

All configuration, service binaries, logs, and databases reside cleanly inside your user directory:

```
~/.localxweb/
├── config.json              # Global configuration & MCP API Key
├── databases.json           # Local database registry & metadata
├── credentials.json         # Database credentials & connection snippets
├── sites.json               # Virtual host site configurations
├── pids.json                # Active process PID tracking
├── htdocs/                  # Default Apache DocumentRoot
│   └── index.php            # Default welcome portal
├── config/                  # Component configuration files
│   ├── httpd.conf           # Apache configuration
│   ├── my.ini               # MySQL/MariaDB configuration
│   └── php.ini              # PHP runtime configuration
├── logs/                    # Centralized log directory
│   ├── apache_error.log     # Apache error logs
│   ├── apache_access.log    # Apache HTTP access logs
│   ├── mysql_error.log      # MySQL/MariaDB error logs
│   └── php_error.log        # PHP runtime error logs
├── mysql-data/              # MySQL database binary storage
└── services/                # Portable service binaries (Apache, MariaDB, PHP, PMA)
```

---

## ⚙️ Configuration Reference (`config.json`)

You can edit `~/.localxweb/config.json` directly or use `localxweb config`:

| Setting | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `dashboardPort` | `number` | `98` | Port for the Web Control Center dashboard |
| `apache.port` | `number` | `80` | Main HTTP listener port |
| `apache.sslPort` | `number` | `443` | HTTPS SSL listener port |
| `mysql.port` | `number` | `3306` | MySQL/MariaDB TCP listener port |
| `mysql.rootPassword` | `string` | `""` | MySQL root user password |
| `phpmyadminPort` | `number` | `9999` | phpMyAdmin web client port |
| `mcpPort` | `number` | `9900` | Model Context Protocol SSE port |
| `mcpAuthEnabled` | `boolean` | `false` | Require API Key authentication for MCP |
| `mcpApiKey` | `string` | _Auto-generated_ | Active 32-character MCP API Key (`lxw_...`) |
| `autoStart` | `array` | `["apache", "mysql"]` | Services to start on `localxweb start` |

---

## 🌐 Supported Platforms

| Platform | Architecture | Installation Method |
| :--- | :--- | :--- |
| **Windows 10 / 11** | x64 | Portable zip auto-installer, native Windows paths |
| **macOS (Sonoma, Ventura, etc.)** | Apple Silicon (M1/M2/M3) & Intel | Homebrew automated detection & service wrapper |
| **Linux (Ubuntu, Debian, Fedora, Arch)** | x64, ARM64 | System package manager integration (`apt`, `dnf`, `pacman`) |
| **Android (Termux)** | ARM64, ARM | Termux package integration (`pkg install php mariadb apache2`) |

---

## ❓ Frequently Asked Questions (FAQ)

<details>
<summary><b>Q: How is LocalXWeb different from XAMPP?</b></summary>
LocalXWeb is completely modular and self-contained in <code>~/.localxweb</code>. It includes a modern web-based Control Center with hardware gauges, an instant project runner (<code>localxweb run</code>), automatic port collision resolution, persistent database credentials, and a native Model Context Protocol (MCP) server for AI coding agents.
</details>

<details>
<summary><b>Q: What happens if Port 80 or 3306 is already in use?</b></summary>
LocalXWeb's built-in <b>AutoFixer</b> scans for occupied ports. If Port 80 is blocked by IIS or Skype, it will offer to auto-forward Apache to Port 8080 or the next free port without failing to launch.
</details>

<details>
<summary><b>Q: Can I use LocalXWeb without starting MySQL?</b></summary>
<b>Yes!</b> All database definitions and credentials are kept in a local JSON registry (<code>databases.json</code>). You can create, list, and reveal database credentials offline. When you start MySQL, LocalXWeb automatically syncs the databases into MySQL.
</details>

<details>
<summary><b>Q: How do I connect Cursor or Claude Desktop to LocalXWeb?</b></summary>
Open the Control Center at <a href="http://localhost:98/Control-Center">http://localhost:98</a>, navigate to the <b>MCP</b> tab, and click <b>"Install All Configs"</b>. LocalXWeb will automatically write the correct SSE configuration and real API key into Claude Desktop, Cursor, Antigravity, and Windsurf config files.
</details>

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**Built with ❤️ for modern developers and AI-assisted workflows.**  
*Star ⭐ this repository on GitHub if you love LocalXWeb!*

</div>
