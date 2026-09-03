const tcpPortUsed = require('tcp-port-used');
const net = require('net');

async function checkPort(port, host = '127.0.0.1') {
  try {
    return await tcpPortUsed.check(port, host);
  } catch {
    return false;
  }
}

async function waitForPort(port, timeout = 10000, host = '127.0.0.1') {
  try {
    await tcpPortUsed.waitUntilUsedOnHost(port, host, 200, timeout);
    return true;
  } catch {
    return false;
  }
}

async function waitForPortFree(port, timeout = 10000, host = '127.0.0.1') {
  try {
    await tcpPortUsed.waitUntilFreeOnHost(port, host, 200, timeout);
    return true;
  } catch {
    return false;
  }
}

async function findFreePort(startPort, host = '127.0.0.1') {
  let port = startPort;
  while (await checkPort(port, host)) {
    port++;
  }
  return port;
}

module.exports = { checkPort, waitForPort, waitForPortFree, findFreePort };
