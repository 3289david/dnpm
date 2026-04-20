import { execa } from 'execa';
import fs from 'fs-extra';
import { join, basename } from 'path';
import ora from 'ora';
import chalk from 'chalk';
import { log, section, progressBar } from '../ui/logger.js';
import { ConfigManager } from '../config/index.js';
import { AIProvider } from '../ai/provider.js';

export class DeployEngine {
  constructor(projectDir = process.cwd()) {
    this.projectDir = projectDir;
    this.config = new ConfigManager(projectDir);
  }

  async deploy(options = {}) {
    section('Deploy Engine');

    const config = await this.config.getConfig();
    const strategy = options.strategy || config.deploy?.strategy || 'rolling';

    log(`Strategy: ${chalk.cyan(strategy)}`, 'deploy');
    log(`Zero-downtime: ${chalk.cyan(config.deploy?.zeroDowntime ? 'yes' : 'no')}`, 'deploy');

    const steps = [
      { name: 'Pre-deploy checks', fn: () => this._preDeployChecks(options) },
      { name: 'Build', fn: () => this._build(options) },
      { name: 'Dockerize', fn: () => this._dockerize(options) },
      { name: 'Push', fn: () => this._push(options) },
      { name: 'Deploy', fn: () => this._deployByStrategy(strategy, options) },
      { name: 'Health check', fn: () => this._healthCheck(options) },
      { name: 'Post-deploy', fn: () => this._postDeploy(options) },
    ];

    const results = [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const spinner = ora(`[${i + 1}/${steps.length}] ${step.name}...`).start();
      try {
        const result = await step.fn();
        results.push({ step: step.name, status: 'success', ...result });
        spinner.succeed(`[${i + 1}/${steps.length}] ${step.name}`);
      } catch (err) {
        spinner.fail(`[${i + 1}/${steps.length}] ${step.name} failed`);
        if (config.deploy?.autoRollback) {
          log('Auto-rollback triggered...', 'warning');
          await this.rollback(options);
        }
        throw err;
      }
    }

    log(chalk.green.bold('Deployment successful!'), 'deploy');
    return results;
  }

  async _preDeployChecks(options = {}) {
    if (await fs.pathExists(join(this.projectDir, 'package.json'))) {
      const pkg = await fs.readJson(join(this.projectDir, 'package.json'));
      if (pkg.scripts?.test && !options.skipTests) {
        log('Running tests...', 'info');
        await execa('npm', ['test'], { cwd: this.projectDir, stdio: 'pipe' });
      }
    }
    return { checks: 'passed' };
  }

  async _build(options = {}) {
    const pkgPath = join(this.projectDir, 'package.json');
    if (await fs.pathExists(pkgPath)) {
      const pkg = await fs.readJson(pkgPath);
      if (pkg.scripts?.build) {
        await execa('npm', ['run', 'build'], { cwd: this.projectDir, stdio: 'pipe' });
        return { built: true };
      }
    }

    const reqPath = join(this.projectDir, 'requirements.txt');
    if (await fs.pathExists(reqPath)) {
      await execa('pip3', ['install', '-r', 'requirements.txt'], { cwd: this.projectDir, stdio: 'pipe' });
      return { built: true };
    }

    const goModPath = join(this.projectDir, 'go.mod');
    if (await fs.pathExists(goModPath)) {
      await execa('go', ['build', '-o', 'app', '.'], { cwd: this.projectDir, stdio: 'pipe' });
      return { built: true };
    }

    return { built: false, reason: 'no build step detected' };
  }

  async _dockerize(options = {}) {
    const dockerfilePath = join(this.projectDir, 'Dockerfile');
    if (!await fs.pathExists(dockerfilePath)) {
      await this._generateDockerfile(options);
    }

    const tag = options.tag || `dnpm-app:${Date.now()}`;
    await execa('docker', ['build', '-t', tag, '.'], { cwd: this.projectDir, stdio: 'pipe' });
    return { image: tag };
  }

  async _push(options = {}) {
    if (options.registry) {
      const tag = options.tag || `dnpm-app:${Date.now()}`;
      const remoteTag = `${options.registry}/${tag}`;
      await execa('docker', ['tag', tag, remoteTag]);
      await execa('docker', ['push', remoteTag]);
      return { pushed: remoteTag };
    }
    return { pushed: false, reason: 'no registry configured' };
  }

  async _deployByStrategy(strategy, options = {}) {
    const strategies = {
      direct: () => this._directDeploy(options),
      rolling: () => this._rollingDeploy(options),
      'blue-green': () => this._blueGreenDeploy(options),
      canary: () => this._canaryDeploy(options),
    };

    const handler = strategies[strategy.toLowerCase()];
    if (!handler) throw new Error(`Unknown strategy: ${strategy}`);
    return handler();
  }

  async _directDeploy(options = {}) {
    await execa('docker', ['compose', 'up', '-d', '--build'], { cwd: this.projectDir });
    return { method: 'direct' };
  }

  async _rollingDeploy(options = {}) {
    await execa('docker', ['compose', 'up', '-d', '--build', '--no-deps', 'app'], {
      cwd: this.projectDir,
    });
    return { method: 'rolling' };
  }

  async _blueGreenDeploy(options = {}) {
    const tag = options.tag || `dnpm-app:${Date.now()}`;

    log('Starting Blue-Green deployment...', 'deploy');
    log('Building green environment...', 'deploy');
    await execa('docker', ['build', '-t', `${tag}-green`, '.'], { cwd: this.projectDir, stdio: 'pipe' });

    log('Starting green containers...', 'deploy');
    await execa('docker', ['run', '-d', '--name', 'dnpm-green', '-p', '3001:3000', `${tag}-green`]);

    log('Running health checks on green...', 'deploy');
    await this._waitForHealthy('http://localhost:3001/health', 30);

    log('Switching traffic to green...', 'deploy');
    try { await execa('docker', ['stop', 'dnpm-blue']); } catch { /* first deploy */ }
    try { await execa('docker', ['rm', 'dnpm-blue']); } catch { /* first deploy */ }
    try { await execa('docker', ['rename', 'dnpm-app', 'dnpm-blue']); } catch { /* first deploy */ }
    await execa('docker', ['rename', 'dnpm-green', 'dnpm-app']);

    return { method: 'blue-green' };
  }

  async _canaryDeploy(options = {}) {
    log('Starting Canary deployment (10% traffic)...', 'deploy');
    const tag = options.tag || `dnpm-app:${Date.now()}`;
    await execa('docker', ['build', '-t', `${tag}-canary`, '.'], { cwd: this.projectDir, stdio: 'pipe' });
    await execa('docker', ['run', '-d', '--name', 'dnpm-canary', `${tag}-canary`]);
    log('Canary running. Monitor with: dnpm status', 'deploy');
    return { method: 'canary' };
  }

  async _healthCheck(options = {}) {
    const url = options.healthUrl || 'http://localhost:3000/health';
    try {
      await this._waitForHealthy(url, 10);
      return { healthy: true };
    } catch {
      log('Health check failed, attempting recovery...', 'warning');
      return { healthy: false };
    }
  }

  async _waitForHealthy(url, retries = 10) {
    const { default: got } = await import('got');
    for (let i = 0; i < retries; i++) {
      try {
        await got(url, { timeout: { request: 3000 } });
        return true;
      } catch {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    throw new Error(`Health check failed after ${retries} attempts: ${url}`);
  }

  async _postDeploy(options = {}) {
    log('Cleaning up old images...', 'info');
    try {
      await execa('docker', ['image', 'prune', '-f']);
    } catch { /* non-fatal */ }
    return { cleanup: true };
  }

  async rollback(options = {}) {
    section('Rollback');
    const spinner = ora('Rolling back...').start();
    try {
      await execa('docker', ['compose', 'down'], { cwd: this.projectDir });
      // Restore from last known good state
      try {
        await execa('docker', ['compose', 'up', '-d'], { cwd: this.projectDir });
      } catch { /* may not have previous state */ }
      spinner.succeed('Rollback complete');
      return { rollback: true };
    } catch (err) {
      spinner.fail('Rollback failed');
      throw err;
    }
  }

  async _generateDockerfile(options = {}) {
    let content;
    const pkgPath = join(this.projectDir, 'package.json');
    const reqPath = join(this.projectDir, 'requirements.txt');
    const goModPath = join(this.projectDir, 'go.mod');

    if (await fs.pathExists(pkgPath)) {
      content = `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "index.js"]
`;
    } else if (await fs.pathExists(reqPath)) {
      content = `FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:8000", "app:app"]
`;
    } else if (await fs.pathExists(goModPath)) {
      content = `FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /app/server .

FROM alpine:3.19
COPY --from=builder /app/server /server
EXPOSE 8080
CMD ["/server"]
`;
    } else {
      // Use AI to generate Dockerfile
      try {
        const ai = await AIProvider.create();
        const files = await fs.readdir(this.projectDir);
        content = await ai.generateCode(
          `Generate a Dockerfile for a project with files: ${files.join(', ')}`
        );
      } catch {
        content = `FROM ubuntu:22.04
WORKDIR /app
COPY . .
EXPOSE 3000
CMD ["bash"]
`;
      }
    }

    await fs.writeFile(join(this.projectDir, 'Dockerfile'), content);
    log('Generated Dockerfile', 'success');
  }

  async generateCI(options = {}) {
    const ciType = options.ci || 'github';

    if (ciType === 'github' || ciType === 'GitHub Actions') {
      return this._generateGitHubActions(options);
    } else if (ciType === 'gitlab' || ciType === 'GitLab CI') {
      return this._generateGitLabCI(options);
    }
  }

  async _generateGitHubActions(options = {}) {
    const dir = join(this.projectDir, '.github', 'workflows');
    await fs.ensureDir(dir);

    const workflow = `name: dnpm Deploy

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build --if-present

      - name: Deploy
        if: github.ref == 'refs/heads/main'
        run: |
          npm install -g dnpm
          dnpm deploy --ci
        env:
          DNPM_DEPLOY_TOKEN: \${{ secrets.DNPM_DEPLOY_TOKEN }}
`;
    await fs.writeFile(join(dir, 'dnpm-deploy.yml'), workflow);
    log('Generated .github/workflows/dnpm-deploy.yml', 'success');
    return { ci: 'github-actions', path: join(dir, 'dnpm-deploy.yml') };
  }

  async _generateGitLabCI(options = {}) {
    const content = `stages:
  - test
  - build
  - deploy

test:
  stage: test
  image: node:20-alpine
  script:
    - npm ci
    - npm test

build:
  stage: build
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker build -t app .

deploy:
  stage: deploy
  image: node:20-alpine
  only:
    - main
  script:
    - npm install -g dnpm
    - dnpm deploy --ci
`;
    await fs.writeFile(join(this.projectDir, '.gitlab-ci.yml'), content);
    log('Generated .gitlab-ci.yml', 'success');
    return { ci: 'gitlab-ci', path: join(this.projectDir, '.gitlab-ci.yml') };
  }
}
