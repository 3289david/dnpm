import ora from 'ora';
import chalk from 'chalk';
import fs from 'fs-extra';
import { join } from 'path';
import { log, section, table, box } from '../ui/logger.js';
import { ConfigManager } from '../config/index.js';
import { AIProvider } from '../ai/provider.js';

export class EnvManager {
  constructor(projectDir = process.cwd()) {
    this.projectDir = projectDir;
    this.config = new ConfigManager(projectDir);
    this.environments = ['development', 'staging', 'production'];
  }

  async init() {
    section('Environment Manager');
    for (const env of this.environments) {
      const envFile = join(this.projectDir, `.env.${env}`);
      if (!await fs.pathExists(envFile)) {
        await fs.writeFile(envFile, this._defaultEnv(env));
        log(`Created .env.${env}`, 'success');
      }
    }
    log('All environment files initialized', 'success');
  }

  async switchEnv(env) {
    if (!this.environments.includes(env) && !await fs.pathExists(join(this.projectDir, `.env.${env}`))) {
      throw new Error(`Unknown environment: ${env}. Available: ${this.environments.join(', ')}`);
    }
    const envFile = join(this.projectDir, `.env.${env}`);
    const targetFile = join(this.projectDir, '.env');
    await fs.copy(envFile, targetFile, { overwrite: true });
    log(`Switched to ${chalk.cyan(env)} environment`, 'success');
    return env;
  }

  async showEnv(env) {
    const envFile = join(this.projectDir, `.env.${env || 'production'}`);
    if (!await fs.pathExists(envFile)) {
      log(`No .env.${env} found`, 'warning');
      return;
    }
    const content = await fs.readFile(envFile, 'utf-8');
    const lines = content.split('\n').filter(l => l && !l.startsWith('#'));
    section(`Environment: ${env || 'production'}`);
    for (const line of lines) {
      const [key, ...rest] = line.split('=');
      const val = rest.join('=');
      // Mask sensitive values
      const masked = key.toLowerCase().includes('password') || key.toLowerCase().includes('secret') || key.toLowerCase().includes('key')
        ? val.slice(0, 3) + '****'
        : val;
      console.log(`  ${chalk.cyan(key.padEnd(25))} ${chalk.white(masked)}`);
    }
  }

  async compareEnvs(env1, env2) {
    section(`Compare: ${env1} vs ${env2}`);
    const file1 = await this._parseEnv(join(this.projectDir, `.env.${env1}`));
    const file2 = await this._parseEnv(join(this.projectDir, `.env.${env2}`));
    const allKeys = [...new Set([...Object.keys(file1), ...Object.keys(file2)])].sort();

    for (const key of allKeys) {
      const v1 = file1[key] || chalk.red('MISSING');
      const v2 = file2[key] || chalk.red('MISSING');
      const same = file1[key] === file2[key];
      const icon = same ? chalk.green('=') : chalk.yellow('≠');
      console.log(`  ${icon} ${chalk.white(key.padEnd(25))} ${chalk.gray(env1)}=${v1.toString().slice(0, 20).padEnd(22)} ${chalk.gray(env2)}=${v2.toString().slice(0, 20)}`);
    }
  }

  async validate(env = 'production') {
    section(`Validate: ${env}`);
    const envFile = join(this.projectDir, `.env.${env}`);
    if (!await fs.pathExists(envFile)) {
      log(`No .env.${env} found`, 'error');
      return false;
    }

    const vars = await this._parseEnv(envFile);
    const required = ['NODE_ENV', 'PORT'];
    const issues = [];

    for (const key of required) {
      if (!vars[key]) issues.push(`Missing required variable: ${key}`);
    }

    for (const [key, val] of Object.entries(vars)) {
      if (!val || val === 'changeme' || val === 'CHANGE_ME') {
        issues.push(`${key} has a placeholder/empty value`);
      }
    }

    if (issues.length === 0) {
      log(`Environment ${env} is valid!`, 'success');
    } else {
      log(`Found ${issues.length} issue(s):`, 'warning');
      issues.forEach(i => console.log(`  ${chalk.yellow('⚠')} ${i}`));
    }

    return issues.length === 0;
  }

  _defaultEnv(env) {
    const port = env === 'development' ? 3000 : env === 'staging' ? 3001 : 3000;
    return `# dnpm ${env} environment
NODE_ENV=${env}
PORT=${port}
HOST=0.0.0.0

# Database
DB_HOST=${env === 'development' ? 'localhost' : 'db'}
DB_PORT=5432
DB_NAME=app_${env}
DB_USER=app
DB_PASSWORD=changeme

# Redis
REDIS_HOST=${env === 'development' ? 'localhost' : 'redis'}
REDIS_PORT=6379

# API Keys (set via dnpm config set-key)
# DNPM_OPENAI_API_KEY=
# DNPM_CLAUDE_API_KEY=
# DNPM_GEMINI_API_KEY=
# DNPM_OPENROUTER_API_KEY=

# Logging
LOG_LEVEL=${env === 'production' ? 'warn' : 'debug'}

# Security
JWT_SECRET=changeme
CORS_ORIGIN=${env === 'production' ? 'https://yourdomain.com' : '*'}
`;
  }

  async _parseEnv(filePath) {
    if (!await fs.pathExists(filePath)) return {};
    const content = await fs.readFile(filePath, 'utf-8');
    const vars = {};
    for (const line of content.split('\n')) {
      if (!line || line.startsWith('#')) continue;
      const idx = line.indexOf('=');
      if (idx > 0) {
        vars[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
    }
    return vars;
  }
}
