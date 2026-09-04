const LocalXWebMcpServer = require('./server');
const { createMcpTools } = require('./tools');
const { createMcpResources } = require('./resources');
const { createMcpPrompts } = require('./prompts');
const { startStdioServer } = require('./transports/stdio');
const { createSseRouter } = require('./transports/sse');
const { installMcpConfig, getLocalXWebMcpConfig, getClientConfigPaths } = require('./installer');

const McpHttpServer = require('./transports/httpServer');

module.exports = {
  LocalXWebMcpServer,
  McpHttpServer,
  createMcpTools,
  createMcpResources,
  createMcpPrompts,
  startStdioServer,
  createSseRouter,
  installMcpConfig,
  getLocalXWebMcpConfig,
  getClientConfigPaths
};
