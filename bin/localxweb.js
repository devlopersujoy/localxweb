#!/usr/bin/env node

const { program } = require('commander');
const path = require('path');
const pkg = require('../package.json');

// Fast handling for version flags & typos (-v, -V, --version, -version, -verson, version)
const versionFlags = ['-v', '-V', '--version', '-version', '-verson', '--v', 'version'];
const userArgs = process.argv.slice(2);
if (userArgs.length === 1 && versionFlags.includes(userArgs[0])) {
  console.log(`LocalXWeb v${pkg.version}`);
  process.exit(0);
}

process.env.LOCALXWEB_ROOT = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  '.localxweb'
);

require('../src/cli/index.js');
