const express = require('express');
const path = require('path');
const apiRouter = require('./api');

function startDashboard(port) {
  const app = express();

  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  app.use('/api', apiRouter);

  // Fallback 404 for unknown API endpoints
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: 'API route not found', path: req.path });
  });

  // Clean HTML5 URL routing: /Control-Center, /projects, /databases, /doctor, /logs, /docs, /settings, /404, or any route
  app.get('*', (req, res, next) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  const server = app.listen(port, () => {
    // Dashboard started silently - logging handled by caller
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Dashboard may already be running.`);
    }
  });

  return server;
}

module.exports = { startDashboard };
