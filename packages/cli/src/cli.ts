#!/usr/bin/env node
import { cac } from 'cac';
import { VERSION } from './index.js';

const cli = cac('frame-relay');

cli.help();
cli.version(VERSION);

cli.parse();
