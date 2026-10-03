#!/usr/bin/env node
import { cac } from 'cac';
import { VERSION } from './index.js';

const cli = cac('Frame-Relay');

cli.help();
cli.version(VERSION);

cli.parse();
