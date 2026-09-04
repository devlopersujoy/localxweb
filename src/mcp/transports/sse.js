const express = require('express');
const crypto = require('crypto');
const LocalXWebMcpServer = require('../server');

function createSseRouter(context = null) {
  const router = express.Router();
  const server = new LocalXWebMcpServer(context);

  // Active SSE client sessions
  const sessions = new Map();

  /**
   * GET /mcp/sse - Establish Server-Sent Events stream
   */
  router.get('/sse', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const sessionId = crypto.randomBytes(16).toString('hex');
    sessions.set(sessionId, res);

    // Initial endpoint notification per MCP spec
    const postEndpoint = `/mcp/messages?sessionId=${sessionId}`;
    res.write(`event: endpoint\ndata: ${postEndpoint}\n\n`);

    // Keepalive ping every 25 seconds
    const pingInterval = setInterval(() => {
      res.write(': ping\n\n');
    }, 25000);

    req.on('close', () => {
      clearInterval(pingInterval);
      sessions.delete(sessionId);
    });
  });

  /**
   * POST /mcp/messages - Receive JSON-RPC message from client
   */
  router.post('/messages', async (req, res) => {
    const sessionId = req.query.sessionId;
    const sseClient = sessionId ? sessions.get(sessionId) : null;
    const msg = req.body;

    if (!msg || typeof msg !== 'object') {
      return res.status(400).json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'Invalid Request: payload must be JSON' }
      });
    }

    try {
      const resp = await server.handleMessage(msg);

      if (resp && sseClient) {
        // Send response via active SSE stream
        sseClient.write(`event: message\ndata: ${JSON.stringify(resp)}\n\n`);
        return res.status(202).json({ status: 'Accepted' });
      }

      // If no SSE session or direct request, respond directly in HTTP body
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
  });

  /**
   * Direct POST /mcp/rpc endpoint for standard HTTP JSON-RPC 2.0 calls
   */
  router.post('/rpc', async (req, res) => {
    const msg = req.body;
    const resp = await server.handleMessage(msg);
    if (resp) {
      return res.json(resp);
    }
    return res.status(204).end();
  });

  /**
   * GET /mcp/info - Inspection endpoint for Dashboard
   */
  router.get('/info', (req, res) => {
    res.json({
      name: 'LocalXWeb MCP Server',
      version: '1.1.0',
      protocolVersion: '2024-11-05',
      activeSessions: sessions.size,
      toolsCount: server.tools.length,
      resourcesCount: server.resources.length,
      promptsCount: server.prompts.length,
      tools: server.tools.map(t => ({ name: t.name, description: t.description })),
      resources: server.resources.map(r => ({ uri: r.uri, name: r.name, mimeType: r.mimeType })),
      prompts: server.prompts.map(p => ({ name: p.name, description: p.description }))
    });
  });

  return router;
}

module.exports = { createSseRouter };
