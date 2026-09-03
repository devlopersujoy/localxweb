#!/usr/bin/env node

const { program } = require('commander');
const path = require('path');

process.env.LOCALXWEB_ROOT = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  '.localxweb'
);

require('../src/cli/index.js');
