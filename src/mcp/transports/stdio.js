const readline = require('readline');
const LocalXWebMcpServer = require('../server');

/**
 * Start LocalXWeb MCP Server over Stdio
 */
function startStdioServer() {
  // Redirect console.log and info to stderr so stdout remains pure JSON-RPC
  const origLog = console.log;
  const origInfo = console.info;
  const origWarn = console.warn;

  console.log = (...args) => console.error('[LocalXWeb MCP]', ...args);
  console.info = (...args) => console.error('[LocalXWeb MCP]', ...args);
  console.warn = (...args) => console.error('[LocalXWeb MCP WARN]', ...args);

  const server = new LocalXWebMcpServer();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  process.stderr.write('[LocalXWeb MCP Server] Stdio transport listening for JSON-RPC 2.0 messages...\n');

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch (e) {
      const errResp = {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: `Parse error: ${e.message}`
        }
      };
      process.stdout.write(JSON.stringify(errResp) + '\n');
      return;
    }

    try {
      const resp = await server.handleMessage(msg);
      if (resp) {
        process.stdout.write(JSON.stringify(resp) + '\n');
      }
    } catch (handlerErr) {
      const errResp = {
        jsonrpc: '2.0',
        id: msg.id || null,
        error: {
          code: -32603,
          message: handlerErr.message
        }
      };
      process.stdout.write(JSON.stringify(errResp) + '\n');
    }
  });

  rl.on('close', () => {
    process.exit(0);
  });

  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
}

module.exports = { startStdioServer };
