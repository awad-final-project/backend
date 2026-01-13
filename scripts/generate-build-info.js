#!/usr/bin/env node

/**
 * Generate build-info.json with version, build time, and git info
 * Run this script before building the application
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function exec(command) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch (error) {
    return 'unknown';
  }
}

// Read package.json for version
let packageJson = { version: '1.0.0' };
try {
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
} catch (error) {
  console.warn('Warning: Could not read package.json, using defaults');
}

const buildInfo = {
  version: packageJson.version || '1.0.0',
  buildTime: new Date().toISOString(),
  environment: process.env.NODE_ENV || 'development',
  git: {
    commit: exec('git rev-parse HEAD'),
    commitShort: exec('git rev-parse --short HEAD'),
    branch: exec('git rev-parse --abbrev-ref HEAD'),
    tag: exec('git describe --tags --abbrev=0 2>/dev/null'),
    author: exec('git log -1 --pretty=format:"%an"'),
    date: exec('git log -1 --pretty=format:"%ai"'),
    message: exec('git log -1 --pretty=format:"%s"'),
  },
  deployment: {
    deployedAt: new Date().toISOString(),
    deployedBy: process.env.USER || process.env.USERNAME || 'docker',
  },
};

const outputPath = path.join(__dirname, '..', 'build-info.json');
try {
  fs.writeFileSync(outputPath, JSON.stringify(buildInfo, null, 2));
  console.log('✅ Build info generated successfully!');
  console.log(JSON.stringify(buildInfo, null, 2));
} catch (error) {
  console.error('Warning: Could not write build-info.json:', error.message);
  console.error('Build will continue without build info...');
  // Don't fail the build
  process.exit(0);
}
