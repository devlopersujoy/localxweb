const { createMcpTools } = require('./tools');
const { createMcpResources } = require('./resources');
const { createMcpPrompts } = require('./prompts');
const pkg = require('../../package.json');

const PROTOCOL_VERSION = '2024-11-05';

class LocalXWebMcpServer {
  constructor(context = null) {
    if (!context) {
      const { createServices, sitesManager } = require('../index');
      const { apache, mysql, php, phpmyadmin, dbManager } = createServices();
      context = {
        services: { apache, mysql, php, phpmyadmin },
        dbManager,
        sitesManager
      };
    }

    this.context = context;
    this.tools = createMcpTools(context);
    this.resources = createMcpResources(context);
    this.prompts = createMcpPrompts();

    this.toolMap = new Map(this.tools.map(t => [t.name, t]));
    this.resourceMap = new Map(this.resources.map(r => [r.uri, r]));
    this.promptMap = new Map(this.prompts.map(p => [p.name, p]));
  }

  /**
   * Handle incoming JSON-RPC 2.0 message
   * @param {Object} msg - The parsed JSON-RPC request/notification
   * @returns {Object|null} The JSON-RPC response, or null if notification
   */
  async handleMessage(msg) {
    if (!msg || typeof msg !== 'object') {
      return this._formatError(null, -32600, 'Invalid Request: payload must be a JSON object');
    }

    const { id, method, params } = msg;

    // Notifications do not return a response (id is undefined or null)
    if (id === undefined || id === null) {
      if (method === 'notifications/initialized') {
        // Client confirmed initialization
        return null;
      }
      return null;
    }

    try {
      switch (method) {
        case 'initialize': {
          return this._formatResult(id, {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: {
              tools: { listChanged: false },
              resources: { subscribe: false, listChanged: false },
              prompts: { listChanged: false }
            },
            serverInfo: {
              name: 'localxweb-mcp-server',
              version: pkg.version || '1.1.0'
            },
            instructions: 'LocalXWeb MCP Server: full management of Apache, MySQL, PHP, phpMyAdmin, databases, and local projects.'
          });
        }

        case 'ping': {
          return this._formatResult(id, {});
        }

        // Tools
        case 'tools/list': {
          const toolList = this.tools.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema || { type: 'object', properties: {} }
          }));
          return this._formatResult(id, { tools: toolList });
        }

        case 'tools/call': {
          if (!params || !params.name) {
            return this._formatError(id, -32602, 'Missing "name" parameter in tools/call');
          }
          const tool = this.toolMap.get(params.name);
          if (!tool) {
            return this._formatError(id, -32601, `Tool not found: "${params.name}"`);
          }

          try {
            const rawResult = await tool.handler(params.arguments || {});
            const textContent = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult, null, 2);
            return this._formatResult(id, {
              content: [
                {
                  type: 'text',
                  text: textContent
                }
              ],
              isError: false
            });
          } catch (execErr) {
            return this._formatResult(id, {
              content: [
                {
                  type: 'text',
                  text: `Error executing tool "${params.name}": ${execErr.message}`
                }
              ],
              isError: true
            });
          }
        }

        // Resources
        case 'resources/list': {
          const resList = this.resources.map(r => ({
            uri: r.uri,
            name: r.name,
            description: r.description,
            mimeType: r.mimeType || 'application/json'
          }));
          return this._formatResult(id, { resources: resList });
        }

        case 'resources/read': {
          if (!params || !params.uri) {
            return this._formatError(id, -32602, 'Missing "uri" parameter in resources/read');
          }
          const res = this.resourceMap.get(params.uri);
          if (!res) {
            return this._formatError(id, -32602, `Resource not found: "${params.uri}"`);
          }

          const content = await res.read();
          return this._formatResult(id, {
            contents: [
              {
                uri: res.uri,
                mimeType: res.mimeType,
                text: content
              }
            ]
          });
        }

        // Prompts
        case 'prompts/list': {
          const promptList = this.prompts.map(p => ({
            name: p.name,
            description: p.description,
            arguments: p.arguments || []
          }));
          return this._formatResult(id, { prompts: promptList });
        }

        case 'prompts/get': {
          if (!params || !params.name) {
            return this._formatError(id, -32602, 'Missing "name" parameter in prompts/get');
          }
          const p = this.promptMap.get(params.name);
          if (!p) {
            return this._formatError(id, -32602, `Prompt not found: "${params.name}"`);
          }

          const result = p.handler(params.arguments || {});
          return this._formatResult(id, result);
        }

        default:
          return this._formatError(id, -32601, `Method not found: "${method}"`);
      }
    } catch (err) {
      return this._formatError(id, -32603, `Internal server error: ${err.message}`);
    }
  }

  _formatResult(id, result) {
    return {
      jsonrpc: '2.0',
      id,
      result
    };
  }

  _formatError(id, code, message) {
    return {
      jsonrpc: '2.0',
      id: id || null,
      error: {
        code,
        message
      }
    };
  }
}

module.exports = LocalXWebMcpServer;
