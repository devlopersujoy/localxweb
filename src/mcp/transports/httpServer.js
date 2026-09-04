const express = require('express');
const http = require('http');
const crypto = require('crypto');
const LocalXWebMcpServer = require('../server');
const config = require('../../config');
const { findFreePort } = require('../../utils/ports');
const pkg = require('../../../package.json');

/**
 * Dedicated Standalone MCP HTTP/SSE Network Server
 */
class McpHttpServer {
  constructor(options = {}) {
    this.requestedPort = options.port || config.get('mcpPort') || 9900;
    this.host = options.host || '0.0.0.0';
    this.context = options.context || null;
    this.mcpServer = new LocalXWebMcpServer(this.context);
    this.sessions = new Map();
    this.app = express();
    this.httpServer = null;
    this.activePort = null;

    this._setupRoutes();
  }

  _setupRoutes() {
    this.app.use(express.json({ limit: '10mb' }));

    // Global CORS headers for remote, local, and cross-origin AI clients
    this.app.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });

    // Authentication Verification Middleware
    const verifyMcpAuth = (req, res, next) => {
      const isAuthEnabled = !!config.get('mcpAuthEnabled');
      if (!isAuthEnabled) return next();

      const validKey = config.get('mcpApiKey');
      if (!validKey) return next();

      // 1. Query parameter: ?apiKey=... or ?api_key=... or ?key=...
      const queryKey = req.query.apiKey || req.query.api_key || req.query.key;
      if (queryKey && queryKey === validKey) return next();

      // 2. Authorization Header: Bearer <key>
      const authHeader = req.headers['authorization'];
      if (authHeader) {
        const match = authHeader.match(/^Bearer\s+(.+)$/i);
        if (match && match[1] === validKey) return next();
        if (authHeader === validKey) return next();
      }

      // 3. Custom Header: X-API-Key or X-MCP-Key
      const xApiKey = req.headers['x-api-key'] || req.headers['x-mcp-key'];
      if (xApiKey && xApiKey === validKey) return next();

      return res.status(401).json({
        jsonrpc: '2.0',
        id: req.body?.id || null,
        error: {
          code: -32001,
          message: 'Unauthorized: Invalid or missing MCP API Key. Provide ?apiKey=... or Authorization: Bearer ...'
        }
      });
    };

    // Health & Info Home View
    const handleInfo = (req, res) => {
      const port = this.activePort || this.requestedPort;
      const hostHeader = req.headers.host || `localhost:${port}`;
      const baseUrl = `${req.protocol}://${hostHeader}`;
      const isAuth = !!config.get('mcpAuthEnabled');
      const apiKey = config.get('mcpApiKey');
      const sseUrl = isAuth && apiKey ? `${baseUrl}/sse?apiKey=${apiKey}` : `${baseUrl}/sse`;

      if (req.accepts('html') && !req.accepts('json')) {
        return res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>LocalXWeb MCP Server</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 2rem; max-width: 900px; margin: 0 auto; line-height: 1.6; }
              h1 { color: #818cf8; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 10px; }
              .badge { background: #10b981; color: #fff; padding: 3px 10px; border-radius: 9999px; font-size: 0.8rem; }
              .badge-auth { background: ${isAuth ? '#f59e0b' : '#64748b'}; color: #fff; padding: 3px 10px; border-radius: 9999px; font-size: 0.8rem; }
              .card { background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 1.5rem; margin-bottom: 1.5rem; }
              code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
              pre { background: #090d16; padding: 1rem; border-radius: 8px; overflow-x: auto; color: #38bdf8; }
              .endpoint { color: #38bdf8; font-weight: bold; }
              .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1rem; }
              .stat-box { background: #090d16; padding: 1rem; border-radius: 8px; text-align: center; border: 1px solid #334155; }
              .stat-val { font-size: 1.8rem; font-weight: bold; color: #818cf8; display: block; }
            </style>
          </head>
          <body>
            <h1>LocalXWeb MCP Server <span class="badge">RUNNING ON PORT ${port}</span> <span class="badge-auth">${isAuth ? 'API KEY REQUIRED' : 'OPEN ACCESS'}</span></h1>
            <p style="color: #94a3b8;">Standalone Model Context Protocol (MCP) Server for AI Assistants over Network & HTTP.</p>

            <div class="stat-grid">
              <div class="stat-box">
                <span class="stat-val">${this.mcpServer.tools.length}</span>
                <span style="color: #94a3b8; font-size: 0.9rem;">Registered Tools</span>
              </div>
              <div class="stat-box">
                <span class="stat-val">${this.mcpServer.resources.length}</span>
                <span style="color: #94a3b8; font-size: 0.9rem;">Live Resources</span>
              </div>
              <div class="stat-box">
                <span class="stat-val">${this.mcpServer.prompts.length}</span>
                <span style="color: #94a3b8; font-size: 0.9rem;">AI Prompts</span>
              </div>
            </div>

            <div class="card">
              <h3>📡 Network Endpoints</h3>
              <p>• SSE Stream: <code class="endpoint">${sseUrl}</code></p>
              <p>• Messages Post: <code class="endpoint">${baseUrl}/messages</code></p>
              <p>• Direct JSON-RPC: <code class="endpoint">${baseUrl}/rpc</code></p>
            </div>

            <div class="card">
              <h3>🤖 AI Client Configuration (Claude Desktop, Cursor, Antigravity, Windsurf)</h3>
              <pre>{
  "mcpServers": {
    "localxweb": {
      "serverUrl": "${sseUrl}"${isAuth && apiKey ? `,\n      "headers": {\n        "Authorization": "Bearer ${apiKey}"\n      }` : ''}
    }
  }
}</pre>
            </div>
          </body>
          </html>
        `);
      }

      res.json({
        name: 'LocalXWeb MCP Server',
        status: 'ONLINE',
        version: pkg.version || '1.2.0',
        protocolVersion: '2024-11-05',
        port,
        host: this.host,
        authRequired: isAuth,
        endpoints: {
          sse: sseUrl,
          messages: `${baseUrl}/messages`,
          rpc: `${baseUrl}/rpc`,
          info: `${baseUrl}/info`
        },
        toolsCount: this.mcpServer.tools.length,
        resourcesCount: this.mcpServer.resources.length,
        promptsCount: this.mcpServer.prompts.length,
        activeSessions: this.sessions.size
      });
    };

    this.app.get('/', handleInfo);
    this.app.get('/status', handleInfo);
    this.app.get('/info', handleInfo);
    this.app.get('/mcp/info', handleInfo);

    // SSE Handlers (/sse and /mcp/sse)
    const handleSse = (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      const sessionId = crypto.randomBytes(16).toString('hex');
      this.sessions.set(sessionId, res);

      const isAuth = !!config.get('mcpAuthEnabled');
      const apiKey = config.get('mcpApiKey');
      const authQuery = isAuth && apiKey ? `&apiKey=${encodeURIComponent(apiKey)}` : '';
      const endpointUrl = `/messages?sessionId=${sessionId}${authQuery}`;
      res.write(`event: endpoint\ndata: ${endpointUrl}\n\n`);

      const pingInterval = setInterval(() => {
        res.write(': ping\n\n');
      }, 25000);

      req.on('close', () => {
        clearInterval(pingInterval);
        this.sessions.delete(sessionId);
      });
    };

    this.app.get('/sse', verifyMcpAuth, handleSse);
    this.app.get('/mcp/sse', verifyMcpAuth, handleSse);

    // Messages Handlers (/messages and /mcp/messages)
    const handleMessages = async (req, res) => {
      const sessionId = req.query.sessionId;
      const sseClient = sessionId ? this.sessions.get(sessionId) : null;
      const msg = req.body;

      if (!msg || typeof msg !== 'object') {
        return res.status(400).json({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32600, message: 'Invalid Request: payload must be JSON' }
        });
      }

      try {
        const resp = await this.mcpServer.handleMessage(msg);
        if (resp && sseClient) {
          sseClient.write(`event: message\ndata: ${JSON.stringify(resp)}\n\n`);
          return res.status(202).json({ status: 'Accepted' });
        }
        if (resp) {
          return res.json(resp);
        }
        return res.status(204).end();
      } catch (err) {
        return res.status(500).json({
          jsonrpc: '2.0',
          id: msg.id || null,
          error: { code: -32603, message: err.message }
        });
      }
    };

    this.app.post('/messages', verifyMcpAuth, handleMessages);
    this.app.post('/mcp/messages', verifyMcpAuth, handleMessages);

    // Direct JSON-RPC POST (/rpc and /mcp/rpc)
    const handleRpc = async (req, res) => {
      const msg = req.body;
      const resp = await this.mcpServer.handleMessage(msg);
      if (resp) {
        return res.json(resp);
      }
      return res.status(204).end();
    };

    this.app.post('/rpc', verifyMcpAuth, handleRpc);
    this.app.post('/mcp/rpc', verifyMcpAuth, handleRpc);
  }

  async start() {
    let port = await findFreePort(this.requestedPort, '127.0.0.1');

    // On non-root posix (e.g. Linux / Termux), ensure port is >= 1024
    if (process.platform !== 'win32' && typeof process.getuid === 'function' && process.getuid() !== 0) {
      if (port < 1024) port = 9900;
    }

    this.activePort = port;

    return new Promise((resolve, reject) => {
      this.httpServer = http.createServer(this.app);
      this.httpServer.listen(port, this.host, () => {
        resolve({
          port,
          host: this.host,
          url: `http://localhost:${port}`,
          sseUrl: `http://localhost:${port}/sse`,
          rpcUrl: `http://localhost:${port}/rpc`
        });
      });

      this.httpServer.on('error', (err) => {
        reject(err);
      });
    });
  }

  async stop() {
    if (this.httpServer) {
      return new Promise((resolve) => {
        this.httpServer.close(() => {
          this.httpServer = null;
          this.activePort = null;
          resolve();
        });
      });
    }
  }
}

module.exports = McpHttpServer;
