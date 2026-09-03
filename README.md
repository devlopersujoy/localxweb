# LocalXWeb ⚡

> **A modern, lightning-fast alternative to XAMPP for Windows, macOS, and Linux.**
> Portable Apache, MySQL / MariaDB, PHP 8.x, and phpMyAdmin with an Apple-inspired Control Center and powerful CLI runner.

---

## ✨ Features

- **🚀 100% Self-Contained Stack**: Runs Apache 2.4, MariaDB 10.11, PHP 8.x, and phpMyAdmin without polluting system paths.
- **🖥️ Modern Control Center**: Clean web dashboard with real-time hardware gauges, service status jewels, one-click stack control, project manager, and system logs.
- **⚡ Instant Project Server Runner**: localxweb run launches any directory or project folder on custom ports on the fly.
- **📁 Site Scaffolding**: localxweb site create <name> --template <php|laravel|html> scaffolds and links local web projects instantly.
- **🗄️ Database Management**: Create databases with dedicated credentials (localxweb db create <name> --user <usr> --password <pwd>) and copy-paste ready Laravel .env / PDO connection snippets.
- **🩺 System Doctor & Port Diagnostics**: Scan listening ports (80, 3306, 9999, 98), detect IIS/Skype conflicts, verify binary integrity, and inspect loaded PHP extensions.
- **🧹 System Cleaner Suite**: localxweb clean [all|cache|logs|pids] frees disk space and resets PID tracking.
- **🌐 Universal Cross-Platform**: Works natively on Windows (10/11), macOS (Apple Silicon / Intel via Homebrew), and Linux (apt, dnf, pacman).

---

## 📦 Quick Start

### 1. Install Dependencies
`ash
npm install
`

### 2. Launch LocalXWeb Stack
`ash
node bin/localxweb.js
# Or start full stack in daemon mode:
node bin/localxweb.js start
`

### 3. Open Control Center
Open your browser at:
- **Control Center Dashboard**: [http://localhost:98/Control-Center](http://localhost:98/Control-Center)
- **Apache Web Server**: [http://localhost:80](http://localhost:80)
- **phpMyAdmin**: [http://localhost:9999](http://localhost:9999)

---

## 🛠️ CLI Commands & Runner

`ash
# Start & Stop Full Stack
localxweb start
localxweb stop
localxweb restart

# Run current folder on a custom port:
localxweb run
localxweb run myapp --port 8888 --browser

# Project & Site Scaffolding
localxweb site list
localxweb site create myblog --template php
localxweb site open myblog

# Quick Launchers
localxweb open          # Dashboard
localxweb open pma      # phpMyAdmin (port 9999)
localxweb open docs     # Documentation

# Database Control
localxweb db create shop_db --user shop_admin --password MySecret123!
localxweb db creds shop_db
localxweb db export shop_db backup.sql

# Diagnostics & Explorer
localxweb ports         # Scan ports 80, 3306, 9999, 98
localxweb check         # Stack component integrity audit
localxweb php-info      # PHP binary & extension inspector
localxweb explore htdocs# Open DocumentRoot in Explorer/Finder

# System Cleanup
localxweb clean all     # Deep clean temp, cache, logs, PIDs
localxweb clean logs    # Truncate service log files
localxweb clean cache   # Clean temporary cache files

# Service Uninstall
localxweb uninstall apache
localxweb uninstall mysql --purge
localxweb uninstall --purge # Clean uninstall of full stack
`

---

## 📄 License

MIT License © 2026 LocalXWeb
