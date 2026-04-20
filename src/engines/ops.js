import { execa } from 'execa';
import os from 'os';
import fs from 'fs-extra';
import { join } from 'path';
import ora from 'ora';
import chalk from 'chalk';
import { log, section, table, box, progressBar } from '../ui/logger.js';
import { ConfigManager } from '../config/index.js';
import { AIProvider } from '../ai/provider.js';

export class OpsEngine {
  constructor(projectDir = process.cwd()) {
    this.projectDir = projectDir;
    this.config = new ConfigManager(projectDir);
    this.monitorInterval = null;
  }

  async status() {
    section('System Status');

    const metrics = await this.getMetrics();
    const containers = await this.getContainers();

    box('Server Health', [
      `CPU:    ${progressBar(metrics.cpu, 100)}`,
      `Memory: ${progressBar(metrics.memUsed, metrics.memTotal)} (${formatBytes(metrics.memUsed)}/${formatBytes(metrics.memTotal)})`,
      `Disk:   ${progressBar(metrics.diskUsed, metrics.diskTotal)} (${formatBytes(metrics.diskUsed)}/${formatBytes(metrics.diskTotal)})`,
      `Uptime: ${formatUptime(metrics.uptime)}`,
      `Load:   ${metrics.loadAvg.map(l => l.toFixed(2)).join(', ')}`,
    ]);

    if (containers.length > 0) {
      console.log('');
      box('Containers', containers.map(c =>
        `${c.status === 'running' ? chalk.green('●') : chalk.red('●')} ${c.name.padEnd(25)} ${c.status.padEnd(12)} ${c.image}`
      ));
    }

    return { metrics, containers };
  }

  async getMetrics() {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const loadAvg = os.loadavg();
    const uptime = os.uptime();

    // CPU usage
    const cpuUsage = cpus.reduce((acc, cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      const idle = cpu.times.idle;
      return acc + ((total - idle) / total) * 100;
    }, 0) / cpus.length;

    // Disk usage
    let diskUsed = 0;
    let diskTotal = 0;
    try {
      const result = await execa('df', ['-k', '/']);
      const lines = result.stdout.split('\n');
      if (lines.length > 1) {
        const parts = lines[1].split(/\s+/);
        diskTotal = parseInt(parts[1]) * 1024;
        diskUsed = parseInt(parts[2]) * 1024;
      }
    } catch { /* fallback */ }

    return {
      cpu: Math.round(cpuUsage),
      memTotal: totalMem,
      memUsed: totalMem - freeMem,
      memFree: freeMem,
      diskTotal,
      diskUsed,
      loadAvg,
      uptime,
      cpuCount: cpus.length,
    };
  }

  async getContainers() {
    try {
      const result = await execa('docker', ['ps', '-a', '--format', '{{.Names}}\t{{.Status}}\t{{.Image}}\t{{.Ports}}']);
      return result.stdout.split('\n').filter(Boolean).map(line => {
        const [name, status, image, ports] = line.split('\t');
        return {
          name,
          status: status.includes('Up') ? 'running' : 'stopped',
          image,
          ports: ports || '',
        };
      });
    } catch {
      return [];
    }
  }

  async logs(options = {}) {
    section('Log Stream');
    const tail = options.tail || 100;
    try {
      const result = await execa('docker', ['compose', 'logs', '--tail', String(tail), ...(options.follow ? ['-f'] : [])], {
        cwd: this.projectDir,
        stdio: options.follow ? 'inherit' : 'pipe',
      });
      if (!options.follow) {
        console.log(result.stdout);
      }
    } catch (err) {
      log('No Docker logs available. Checking system logs...', 'warning');
      const logDir = join(this.projectDir, 'logs');
      if (await fs.pathExists(logDir)) {
        const files = await fs.readdir(logDir);
        for (const file of files.slice(-3)) {
          console.log(chalk.cyan(`\n--- ${file} ---`));
          const content = await fs.readFile(join(logDir, file), 'utf-8');
          console.log(content.split('\n').slice(-tail).join('\n'));
        }
      }
    }
  }

  async monitor(options = {}) {
    section('Live Monitor');
    log('Press Ctrl+C to stop monitoring.\n', 'info');

    const interval = options.interval || 5;
    const config = await this.config.getConfig();

    const refresh = async () => {
      process.stdout.write('\x1B[2J\x1B[0f'); // clear screen
      console.log(chalk.cyan.bold('\n  📡 dnpm Live Monitor\n'));

      const metrics = await this.getMetrics();
      const containers = await this.getContainers();

      table([
        ['CPU', `${progressBar(metrics.cpu, 100)}`],
        ['Memory', `${progressBar(metrics.memUsed, metrics.memTotal)}`],
        ['Disk', `${progressBar(metrics.diskUsed, metrics.diskTotal)}`],
        ['Load', metrics.loadAvg.map(l => l.toFixed(2)).join(' / ')],
        ['Uptime', formatUptime(metrics.uptime)],
      ]);

      console.log('');
      if (containers.length > 0) {
        containers.forEach(c => {
          const icon = c.status === 'running' ? chalk.green('●') : chalk.red('●');
          console.log(`  ${icon} ${c.name.padEnd(25)} ${chalk.gray(c.status)}`);
        });
      }

      // AI-powered spike detection
      if (config.monitoring?.alertsEnabled) {
        if (metrics.cpu > 90) {
          log(chalk.red.bold('CPU SPIKE DETECTED! ') + `${metrics.cpu}%`, 'warning');
          if (options.aiAssist) {
            try {
              const ai = await AIProvider.create();
              const suggestion = await ai.prompt(
                `CPU is at ${metrics.cpu}%. Load average: ${metrics.loadAvg.join(', ')}. Top processes unknown. Suggest immediate actions.`,
                { system: 'You are a sysadmin. Provide quick, actionable commands to reduce CPU load.' }
              );
              log(`AI: ${suggestion}`, 'ai');
            } catch { /* AI not available */ }
          }
        }
        if (metrics.memUsed / metrics.memTotal > 0.9) {
          log(chalk.red.bold('MEMORY CRITICAL! ') + `${Math.round(metrics.memUsed / metrics.memTotal * 100)}%`, 'warning');
        }
        if (metrics.diskUsed / metrics.diskTotal > 0.85) {
          log(chalk.yellow.bold('DISK WARNING! ') + `${Math.round(metrics.diskUsed / metrics.diskTotal * 100)}%`, 'warning');
        }
      }

      console.log(chalk.gray(`\n  Last updated: ${new Date().toLocaleTimeString()} | Refresh: ${interval}s`));
    };

    await refresh();
    this.monitorInterval = setInterval(refresh, interval * 1000);

    process.on('SIGINT', () => {
      clearInterval(this.monitorInterval);
      log('\nMonitoring stopped.', 'info');
      process.exit(0);
    });
  }

  async aiAnalyze() {
    section('AI Operations Analysis');
    const spinner = ora('AI analyzing system state...').start();

    try {
      const ai = await AIProvider.create();
      const metrics = await this.getMetrics();
      const containers = await this.getContainers();

      const analysis = await ai.prompt(
        `Analyze this server state and provide recommendations:
        
Metrics: ${JSON.stringify(metrics)}
Containers: ${JSON.stringify(containers)}

Provide:
1. Health assessment
2. Performance recommendations
3. Security concerns
4. Cost optimization tips`,
        { system: 'You are a senior DevOps engineer. Analyze server metrics and provide actionable recommendations.' }
      );

      spinner.stop();
      console.log(`\n${chalk.cyan('AI Analysis:')}\n${analysis}\n`);
      return analysis;
    } catch (err) {
      spinner.fail('AI analysis failed');
      throw err;
    }
  }

  async restart(service) {
    const spinner = ora(`Restarting ${service || 'all services'}...`).start();
    try {
      if (service) {
        await execa('docker', ['compose', 'restart', service], { cwd: this.projectDir });
      } else {
        await execa('docker', ['compose', 'restart'], { cwd: this.projectDir });
      }
      spinner.succeed(`Restarted ${service || 'all services'}`);
    } catch (err) {
      spinner.fail('Restart failed');
      throw err;
    }
  }
}

function formatBytes(bytes) {
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${mins}m`;
}
