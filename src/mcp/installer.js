const fs = require('fs');
const path = require('path');
const os = require('os');
const platform = require('../utils/platform');

/**
 * Get configuration file path for different AI IDEs and clients
 */
function getClientConfigPaths() {
  const home = os.homedir();
  const paths = {};

  // Antigravity
  paths.antigravity = path.join(home, '.gemini', 'config', 'mcp_config.json');

  // Claude Desktop
  if (platform.isWindows) {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    paths.claude = path.join(appData, 'Claude', 'claude_desktop_config.json');
  } else if (platform.isMac) {
    paths.claude = path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  } else {
    paths.claude = path.join(home, '.config', 'Claude', 'claude_desktop_config.json');
  }

  // Cursor
  paths.cursor = path.join(home, '.cursor', 'mcp.json');

  // Windsurf
  paths.windsurf = path.join(home, '.codeium', 'windsurf', 'mcp_config.json');

  return paths;
}

/**
 * Generate standard MCP server config object for LocalXWeb
 * @param {string} mode - 'sse' | 'stdio'
 * @param {number} port - port number for SSE mode
 */
function getLocalXWebMcpConfig(mode = 'sse', port = 9900) {
  if (mode === 'sse') {
    return {
      serverUrl: `http://localhost:${port}/sse`
    };
  }

  const binPath = path.resolve(__dirname, '../../bin/localxweb.js');

  return {
    command: 'node',
    args: [binPath, 'mcp', 'stdio'],
    env: {
      NODE_ENV: 'production'
    }
  };
}

/**
 * Install LocalXWeb MCP server into target AI client configuration
 * @param {string} clientName - 'all' | 'claude' | 'antigravity' | 'cursor' | 'windsurf'
 * @param {string} mode - 'sse' | 'stdio'
 * @param {number} port - Port number for SSE mode
 */
function installMcpConfig(clientName = 'all', mode = 'sse', port = 9900) {
  const clientPaths = getClientConfigPaths();
  const mcpConfig = getLocalXWebMcpConfig(mode, port);
  const results = [];

  const targets = clientName === 'all'
    ? Object.entries(clientPaths)
    : [[clientName, clientPaths[clientName]]];

  for (const [name, targetFile] of targets) {
    if (!targetFile) continue;

    try {
      const dir = path.dirname(targetFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      let existing = {};
      if (fs.existsSync(targetFile)) {
        try {
          existing = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
        } catch {
          existing = {};
        }
      }

      existing.mcpServers = existing.mcpServers || {};
      existing.mcpServers.localxweb = mcpConfig;

      fs.writeFileSync(targetFile, JSON.stringify(existing, null, 2));
      results.push({ client: name, path: targetFile, success: true });
    } catch (e) {
      results.push({ client: name, path: targetFile, success: false, error: e.message });
    }
  }

  return results;
}

module.exports = {
  getClientConfigPaths,
  getLocalXWebMcpConfig,
  installMcpConfig
};
