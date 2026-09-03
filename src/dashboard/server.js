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
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  let activePort = port || 98;
  const isNonRootPosix = process.platform !== 'win32' && typeof process.getuid === 'function' && process.getuid() !== 0;
  if (isNonRootPosix && activePort < 1024) {
    activePort = 9898;
  }

  let server;
  try {
    server = app.listen(activePort, () => {
      // Dashboard started
    });

    server.on('error', (err) => {
      if (err.code === 'EACCES') {
        console.error(`Port ${activePort} requires root privileges. Falling back to port 9898...`);
        try {
          app.listen(9898);
        } catch {}
      } else if (err.code === 'EADDRINUSE') {
        console.error(`Port ${activePort} is already in use. Dashboard may already be running.`);
      }
    });
  } catch (err) {
    if (err.code === 'EACCES') {
      try { server = app.listen(9898); } catch {}
    }
  }

  return server;
}

module.exports = { startDashboard };
