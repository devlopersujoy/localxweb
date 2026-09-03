const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const logger = require('../utils/logger');
const config = require('../config');

class DatabaseManager {
  constructor(mysqlService) {
    this.mysqlService = mysqlService;
  }

  async _getConnection(database = null) {
    const mysql = require('mysql2/promise');
    const mysqlCfg = config.get('mysql') || {};

    const connOpts = {
      host: '127.0.0.1',
      port: mysqlCfg.port || 3306,
      user: 'root',
      password: mysqlCfg.rootPassword || '',
      connectTimeout: 5000,
    };
    if (database) connOpts.database = database;

    return mysql.createConnection(connOpts);
  }

  async listDatabases() {
    let conn;
    try {
      conn = await this._getConnection();
      const [rows] = await conn.query('SHOW DATABASES');
      return rows.map(r => r.Database).filter(
        db => !['information_schema', 'performance_schema', 'mysql', 'sys'].includes(db)
      );
    } catch (e) {
      logger.error(`Failed to list databases: ${e.message}`);
      return [];
    } finally {
      if (conn) await conn.end();
    }
  }

  async createDatabase(name, options = {}) {
    if (!name || !/^[a-zA-Z0-9_]+$/.test(name)) {
      throw new Error('Invalid database name. Use only letters, numbers, and underscores.');
    }

    const { username, password, collation = 'utf8mb4_unicode_ci' } = options;
    const mysqlCfg = config.get('mysql') || {};
    const port = mysqlCfg.port || 3306;

    let conn;
    try {
      conn = await this._getConnection();
      await conn.query(`CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE ${collation}`);
      logger.success(`Database "${name}" created`);

      let userCreated = false;
      if (username && username.trim()) {
        const safeUser = username.trim().replace(/['\\]/g, '');
        const pass = password || '';
        const escapedPass = pass.replace(/'/g, "''");

        // Create user for both localhost and 127.0.0.1
        try {
          await conn.query(`CREATE USER IF NOT EXISTS '${safeUser}'@'localhost' IDENTIFIED BY '${escapedPass}'`);
          await conn.query(`ALTER USER '${safeUser}'@'localhost' IDENTIFIED BY '${escapedPass}'`);
          await conn.query(`GRANT ALL PRIVILEGES ON \`${name}\`.* TO '${safeUser}'@'localhost' WITH GRANT OPTION`);

          await conn.query(`CREATE USER IF NOT EXISTS '${safeUser}'@'%' IDENTIFIED BY '${escapedPass}'`);
          await conn.query(`ALTER USER '${safeUser}'@'%' IDENTIFIED BY '${escapedPass}'`);
          await conn.query(`GRANT ALL PRIVILEGES ON \`${name}\`.* TO '${safeUser}'@'%' WITH GRANT OPTION`);

          await conn.query('FLUSH PRIVILEGES');
          userCreated = true;
          logger.success(`Dedicated user "${safeUser}" created with full privileges on "${name}"`);
        } catch (uErr) {
          logger.warn(`Could not create user "${safeUser}": ${uErr.message}`);
        }
      }

      const activeUser = userCreated ? username.trim() : 'root';
      const activePass = userCreated ? (password || '') : (mysqlCfg.rootPassword || '');

      const credDetails = {
        success: true,
        database: name,
        host: '127.0.0.1',
        port,
        user: activeUser,
        password: activePass,
        envSnippet: `DB_CONNECTION=mysql\nDB_HOST=127.0.0.1\nDB_PORT=${port}\nDB_DATABASE=${name}\nDB_USERNAME=${activeUser}\nDB_PASSWORD=${activePass}`,
        pdoSnippet: `$pdo = new PDO('mysql:host=127.0.0.1;port=${port};dbname=${name};charset=utf8mb4', '${activeUser}', '${activePass}', [\n    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,\n    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC\n]);`
      };

      // Persist credentials so password is ALWAYS available in GUI & CLI
      this._saveCredential(name, { user: activeUser, password: activePass });

      return credDetails;
    } catch (e) {
      logger.error(`Failed to create database: ${e.message}`);
      throw e;
    } finally {
      if (conn) await conn.end();
    }
  }

  _getCredsFilePath() {
    const platform = require('../utils/platform');
    return path.join(platform.localxwebDir, 'credentials.json');
  }

  _loadCredentials() {
    try {
      const file = this._getCredsFilePath();
      if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
      }
    } catch {}
    return {};
  }

  _saveCredential(dbName, creds) {
    try {
      const file = this._getCredsFilePath();
      const all = this._loadCredentials();
      all[dbName] = {
        ...creds,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(file, JSON.stringify(all, null, 2));
    } catch (e) {
      logger.warn(`Could not save credentials file: ${e.message}`);
    }
  }

  getCredentials(dbName) {
    const all = this._loadCredentials();
    const mysqlCfg = config.get('mysql') || {};
    const port = mysqlCfg.port || 3306;

    if (all[dbName]) {
      const cred = all[dbName];
      const pwd = cred.password !== undefined ? cred.password : '';
      const usr = cred.user || 'root';
      return {
        database: dbName,
        host: '127.0.0.1',
        port,
        user: usr,
        password: pwd,
        envSnippet: `DB_CONNECTION=mysql\nDB_HOST=127.0.0.1\nDB_PORT=${port}\nDB_DATABASE=${dbName}\nDB_USERNAME=${usr}\nDB_PASSWORD=${pwd}`,
        pdoSnippet: `$pdo = new PDO('mysql:host=127.0.0.1;port=${port};dbname=${dbName};charset=utf8mb4', '${usr}', '${pwd}', [\n    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,\n    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC\n]);`
      };
    }

    const rootPass = mysqlCfg.rootPassword || '';
    return {
      database: dbName,
      host: '127.0.0.1',
      port,
      user: 'root',
      password: rootPass,
      envSnippet: `DB_CONNECTION=mysql\nDB_HOST=127.0.0.1\nDB_PORT=${port}\nDB_DATABASE=${dbName}\nDB_USERNAME=root\nDB_PASSWORD=${rootPass}`,
      pdoSnippet: `$pdo = new PDO('mysql:host=127.0.0.1;port=${port};dbname=${dbName};charset=utf8mb4', 'root', '${rootPass}', [\n    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,\n    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC\n]);`
    };
  }

  async setRootPassword(newPassword) {
    let conn;
    try {
      conn = await this._getConnection();
      const escaped = (newPassword || '').replace(/'/g, "''");

      await conn.query(`ALTER USER 'root'@'localhost' IDENTIFIED BY '${escaped}'`);
      try {
        await conn.query(`ALTER USER 'root'@'127.0.0.1' IDENTIFIED BY '${escaped}'`);
      } catch {}
      await conn.query('FLUSH PRIVILEGES');

      // Update local configuration
      const mysqlCfg = config.get('mysql') || {};
      config.set('mysql', { ...mysqlCfg, rootPassword: newPassword || '' });

      // Update phpMyAdmin configuration if phpmyadmin service exists
      try {
        const pmaService = new (require('../services/phpmyadmin'))();
        pmaService.configure();
      } catch {}

      logger.success('Root password updated successfully');
      return true;
    } catch (e) {
      logger.error(`Failed to update root password: ${e.message}`);
      throw e;
    } finally {
      if (conn) await conn.end();
    }
  }

  async deleteDatabase(name) {
    if (!name || !/^[a-zA-Z0-9_]+$/.test(name)) {
      logger.error('Invalid database name.');
      return false;
    }

    let conn;
    try {
      conn = await this._getConnection();
      await conn.query(`DROP DATABASE IF EXISTS \`${name}\``);
      logger.success(`Database "${name}" deleted`);
      return true;
    } catch (e) {
      logger.error(`Failed to delete database: ${e.message}`);
      return false;
    } finally {
      if (conn) await conn.end();
    }
  }

  async getDatabaseInfo(name) {
    let conn;
    try {
      conn = await this._getConnection();
      const [tables] = await conn.query(`SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = ?`, [name]);
      const [size] = await conn.query(
        `SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) as size_mb
         FROM information_schema.tables WHERE table_schema = ?`, [name]
      );
      return {
        name,
        tables: tables[0]?.count || 0,
        sizeMB: parseFloat(size[0]?.size_mb || 0),
      };
    } catch (e) {
      return { name, tables: 0, sizeMB: 0 };
    } finally {
      if (conn) await conn.end();
    }
  }

  async listTables(dbName) {
    let conn;
    try {
      conn = await this._getConnection(dbName);
      const [tables] = await conn.query(`SHOW TABLE STATUS FROM \`${dbName}\``);
      return tables.map(t => ({
        name: t.Name,
        rows: t.Rows || 0,
        engine: t.Engine || 'InnoDB',
        sizeMB: parseFloat((((t.Data_length || 0) + (t.Index_length || 0)) / 1024 / 1024).toFixed(2))
      }));
    } catch (e) {
      return [];
    } finally {
      if (conn) await conn.end();
    }
  }

  async getTableData(dbName, tableName, limit = 50) {
    let conn;
    try {
      conn = await this._getConnection(dbName);
      const [columns] = await conn.query(`SHOW COLUMNS FROM \`${tableName}\``);
      const [rows] = await conn.query(`SELECT * FROM \`${tableName}\` LIMIT ?`, [limit]);
      return {
        columns: columns.map(c => ({ name: c.Field, type: c.Type, key: c.Key, null: c.Null })),
        rows
      };
    } catch (e) {
      return { columns: [], rows: [], error: e.message };
    } finally {
      if (conn) await conn.end();
    }
  }

  async exportSql(dbName, destFile) {
    const dumpTool = this.mysqlService.getDumpClientPath();
    const mysqlCfg = config.get('mysql') || {};
    const port = mysqlCfg.port || 3306;
    const passArg = mysqlCfg.rootPassword ? `-p"${mysqlCfg.rootPassword}"` : '';

    if (dumpTool) {
      try {
        const cmd = `"${dumpTool}" -h 127.0.0.1 -P ${port} -u root ${passArg} "${dbName}" > "${destFile}"`;
        execSync(cmd, { shell: true, stdio: 'ignore' });
        logger.success(`Database "${dbName}" exported to ${destFile}`);
        return true;
      } catch (e) {
        logger.error(`Export failed via mysqldump: ${e.message}`);
      }
    }

    // Node-based dump fallback
    let conn;
    try {
      conn = await this._getConnection(dbName);
      const [tables] = await conn.query(`SHOW TABLES FROM \`${dbName}\``);
      const tableKey = `Tables_in_${dbName}`;
      let sql = `-- LocalXWeb Database Dump for ${dbName}\n-- Date: ${new Date().toISOString()}\n\n`;

      for (const t of tables) {
        const tableName = t[tableKey];
        const [createTable] = await conn.query(`SHOW CREATE TABLE \`${tableName}\``);
        sql += `DROP TABLE IF EXISTS \`${tableName}\`;\n`;
        sql += `${createTable[0]['Create Table']};\n\n`;

        const [rows] = await conn.query(`SELECT * FROM \`${tableName}\``);
        if (rows.length > 0) {
          for (const row of rows) {
            const keys = Object.keys(row).map(k => `\`${k}\``).join(', ');
            const values = Object.values(row).map(v => (v === null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`)).join(', ');
            sql += `INSERT INTO \`${tableName}\` (${keys}) VALUES (${values});\n`;
          }
          sql += '\n';
        }
      }

      fs.writeFileSync(destFile, sql);
      logger.success(`Database "${dbName}" exported to ${destFile}`);
      return true;
    } catch (e) {
      logger.error(`Export failed: ${e.message}`);
      return false;
    } finally {
      if (conn) await conn.end();
    }
  }

  async importSql(dbName, srcFile) {
    if (!fs.existsSync(srcFile)) {
      throw new Error(`SQL file "${srcFile}" does not exist`);
    }

    const clientTool = this.mysqlService.getMysqlClientPath();
    const mysqlCfg = config.get('mysql') || {};
    const port = mysqlCfg.port || 3306;
    const passArg = mysqlCfg.rootPassword ? `-p"${mysqlCfg.rootPassword}"` : '';

    if (clientTool) {
      try {
        const cmd = `"${clientTool}" -h 127.0.0.1 -P ${port} -u root ${passArg} "${dbName}" < "${srcFile}"`;
        execSync(cmd, { shell: true, stdio: 'ignore' });
        logger.success(`Database "${dbName}" imported from ${srcFile}`);
        return true;
      } catch (e) {
        logger.warn(`Client import failed: ${e.message}. Trying Node query runner...`);
      }
    }

    let conn;
    try {
      conn = await this._getConnection(dbName);
      const sql = fs.readFileSync(srcFile, 'utf8');
      const statements = sql
        .split(/;\s*[\r\n]+/)
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));

      for (const statement of statements) {
        try {
          await conn.query(statement);
        } catch (err) {
          logger.warn(`Query warning during import: ${err.message}`);
        }
      }
      logger.success(`Database "${dbName}" imported successfully`);
      return true;
    } catch (e) {
      logger.error(`Import failed: ${e.message}`);
      return false;
    } finally {
      if (conn) await conn.end();
    }
  }
}

module.exports = DatabaseManager;
