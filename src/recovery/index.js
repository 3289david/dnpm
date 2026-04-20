import { execa } from 'execa';
import fs from 'fs-extra';
import { join } from 'path';
import ora from 'ora';
import chalk from 'chalk';
import { log, section } from '../ui/logger.js';
import { ConfigManager } from '../config/index.js';
import { AIProvider } from '../ai/provider.js';

export class RecoveryEngine {
  constructor(projectDir = process.cwd()) {
    this.projectDir = projectDir;
    this.config = new ConfigManager(projectDir);
  }

  async selfHeal() {
    section('Self-Healing System');
    const issues = await this.diagnose();

    if (issues.length === 0) {
      log('All systems healthy!', 'success');
      return { healed: 0 };
    }

    log(`Found ${issues.length} issue(s). Auto-healing...`, 'warning');
    let healed = 0;

    for (const issue of issues) {
      const spinner = ora(`Healing: ${issue.description}...`).start();
      try {
        await this._heal(issue);
        spinner.succeed(`Healed: ${issue.description}`);
        healed++;
      } catch (err) {
        spinner.fail(`Failed to heal: ${issue.description}`);
        // Ask AI for help
        try {
          const ai = await AIProvider.create();
          const fix = await ai.analyzeError(`Failed to auto-heal: ${issue.description}\nError: ${err.message}`);
          log(`AI suggestion: ${fix}`, 'ai');
        } catch { /* AI not available */ }
      }
    }

    log(`Healed ${healed}/${issues.length} issues`, healed === issues.length ? 'success' : 'warning');
    return { healed, total: issues.length };
  }

  async diagnose() {
    const issues = [];

    // Check Docker containers
    try {
      const result = await execa('docker', ['compose', 'ps', '--format', 'json'], {
        cwd: this.projectDir,
        stdio: 'pipe',
      });
      const containers = result.stdout.split('\n').filter(Boolean).map(l => JSON.parse(l));
      for (const c of containers) {
        if (c.State !== 'running') {
          issues.push({
            type: 'container-down',
            service: c.Service,
            description: `Container ${c.Service} is ${c.State}`,
          });
        }
      }
    } catch { /* no docker compose */ }

    // Check disk space
    try {
      const result = await execa('df', ['-h', '/']);
      const line = result.stdout.split('\n')[1];
      const usage = parseInt(line.match(/(\d+)%/)?.[1] || '0');
      if (usage > 90) {
        issues.push({
          type: 'disk-full',
          usage,
          description: `Disk usage at ${usage}%`,
        });
      }
    } catch { /* ignore */ }

    // Check if main app port is responding
    try {
      const { default: got } = await import('got');
      await got('http://localhost:3000/health', { timeout: { request: 3000 } });
    } catch {
      issues.push({
        type: 'app-unresponsive',
        description: 'App health endpoint not responding',
      });
    }

    return issues;
  }

  async _heal(issue) {
    const healers = {
      'container-down': async () => {
        await execa('docker', ['compose', 'up', '-d', issue.service], { cwd: this.projectDir });
      },
      'disk-full': async () => {
        await execa('docker', ['system', 'prune', '-f']);
        await execa('bash', ['-c', 'find /tmp -type f -mtime +7 -delete']);
        await execa('bash', ['-c', 'journalctl --vacuum-time=3d']);
      },
      'app-unresponsive': async () => {
        await execa('docker', ['compose', 'restart'], { cwd: this.projectDir });
      },
    };

    const healer = healers[issue.type];
    if (healer) {
      await healer();
    } else {
      throw new Error(`No auto-healer for issue type: ${issue.type}`);
    }
  }

  async rollbackDeployment() {
    section('Deployment Rollback');
    const spinner = ora('Rolling back to last known good state...').start();
    try {
      // Check git history
      const result = await execa('git', ['log', '--oneline', '-5'], { cwd: this.projectDir, stdio: 'pipe' });
      log(`Recent commits:\n${result.stdout}`, 'info');

      await execa('docker', ['compose', 'down'], { cwd: this.projectDir });
      await execa('git', ['revert', 'HEAD', '--no-edit'], { cwd: this.projectDir });
      await execa('docker', ['compose', 'up', '-d', '--build'], { cwd: this.projectDir });

      spinner.succeed('Rollback complete');
    } catch (err) {
      spinner.fail('Rollback failed');
      throw err;
    }
  }

  async startWatchdog(options = {}) {
    section('Watchdog Active');
    log('Self-healing watchdog started. Checking every 30s...', 'monitor');

    const interval = options.interval || 30;
    const check = async () => {
      const issues = await this.diagnose();
      if (issues.length > 0) {
        log(`Detected ${issues.length} issue(s), auto-healing...`, 'warning');
        await this.selfHeal();
      }
    };

    setInterval(check, interval * 1000);
    await check(); // Initial check

    process.on('SIGINT', () => {
      log('\nWatchdog stopped.', 'info');
      process.exit(0);
    });
  }
}
