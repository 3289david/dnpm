import chalk from 'chalk';
import { log, section, table, box, progressBar } from '../ui/logger.js';
import { OpsEngine } from '../engines/ops.js';

export class TerminalDashboard {
  constructor(projectDir = process.cwd()) {
    this.ops = new OpsEngine(projectDir);
    this.running = false;
  }

  async render() {
    const metrics = await this.ops.getMetrics();
    const containers = await this.ops.getContainers();

    process.stdout.write('\x1B[2J\x1B[0f');

    console.log(chalk.cyan.bold(`
  ╔══════════════════════════════════════════════════════════════╗
  ║            ⚡ dnpm Dashboard — Live System Monitor           ║
  ╚══════════════════════════════════════════════════════════════╝
`));

    // System Metrics
    console.log(chalk.white.bold('  📊 System Metrics'));
    console.log(chalk.gray('  ─────────────────────────────────────────────'));
    console.log(`  CPU Usage:   ${this._coloredBar(metrics.cpu, 100)}`);
    console.log(`  Memory:      ${this._coloredBar(metrics.memUsed, metrics.memTotal)} ${this._formatBytes(metrics.memUsed)}/${this._formatBytes(metrics.memTotal)}`);
    console.log(`  Disk:        ${this._coloredBar(metrics.diskUsed, metrics.diskTotal)} ${this._formatBytes(metrics.diskUsed)}/${this._formatBytes(metrics.diskTotal)}`);
    console.log(`  Load Avg:    ${metrics.loadAvg.map(l => chalk.white(l.toFixed(2))).join(' / ')}`);
    console.log(`  CPUs:        ${chalk.white(metrics.cpuCount)}`);
    console.log(`  Uptime:      ${chalk.white(this._formatUptime(metrics.uptime))}`);

    // Containers
    console.log(chalk.white.bold('\n  🐳 Containers'));
    console.log(chalk.gray('  ─────────────────────────────────────────────'));
    if (containers.length === 0) {
      console.log(chalk.gray('  No containers running'));
    } else {
      console.log(`  ${'NAME'.padEnd(25)} ${'STATUS'.padEnd(15)} ${'IMAGE'.padEnd(30)} PORTS`);
      console.log(chalk.gray(`  ${'─'.repeat(25)} ${'─'.repeat(15)} ${'─'.repeat(30)} ${'─'.repeat(15)}`));
      containers.forEach(c => {
        const statusIcon = c.status === 'running' ? chalk.green('● UP  ') : chalk.red('● DOWN');
        console.log(`  ${chalk.white(c.name.padEnd(25))} ${statusIcon.padEnd(15)} ${chalk.gray(c.image.padEnd(30))} ${chalk.gray(c.ports)}`);
      });
    }

    // Alerts
    console.log(chalk.white.bold('\n  🚨 Alerts'));
    console.log(chalk.gray('  ─────────────────────────────────────────────'));
    const alerts = this._checkAlerts(metrics, containers);
    if (alerts.length === 0) {
      console.log(chalk.green('  ✔ All systems nominal'));
    } else {
      alerts.forEach(alert => {
        const color = alert.level === 'critical' ? chalk.red : alert.level === 'warning' ? chalk.yellow : chalk.blue;
        console.log(`  ${color('●')} ${color(`[${alert.level.toUpperCase()}]`)} ${alert.message}`);
      });
    }

    console.log(chalk.gray(`\n  Last update: ${new Date().toLocaleTimeString()} | Press Ctrl+C to exit`));
  }

  async startLive(interval = 5) {
    this.running = true;
    await this.render();

    const timer = setInterval(async () => {
      if (this.running) {
        await this.render();
      }
    }, interval * 1000);

    process.on('SIGINT', () => {
      this.running = false;
      clearInterval(timer);
      console.log(chalk.gray('\n  Dashboard stopped.'));
      process.exit(0);
    });
  }

  _coloredBar(used, total, width = 30) {
    if (total === 0) return chalk.gray('░'.repeat(width));
    const ratio = used / total;
    const filled = Math.round(width * ratio);
    const empty = width - filled;
    const pct = Math.round(ratio * 100);

    let color;
    if (pct > 90) color = chalk.red;
    else if (pct > 70) color = chalk.yellow;
    else color = chalk.green;

    return `${color('█'.repeat(filled))}${chalk.gray('░'.repeat(empty))} ${color(`${pct}%`)}`;
  }

  _formatBytes(bytes) {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + sizes[i];
  }

  _formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${mins}m`;
  }

  _checkAlerts(metrics, containers) {
    const alerts = [];
    if (metrics.cpu > 90) alerts.push({ level: 'critical', message: `CPU at ${metrics.cpu}%` });
    else if (metrics.cpu > 70) alerts.push({ level: 'warning', message: `CPU at ${metrics.cpu}%` });

    const memPct = Math.round(metrics.memUsed / metrics.memTotal * 100);
    if (memPct > 90) alerts.push({ level: 'critical', message: `Memory at ${memPct}%` });
    else if (memPct > 75) alerts.push({ level: 'warning', message: `Memory at ${memPct}%` });

    if (metrics.diskTotal > 0) {
      const diskPct = Math.round(metrics.diskUsed / metrics.diskTotal * 100);
      if (diskPct > 90) alerts.push({ level: 'critical', message: `Disk at ${diskPct}%` });
      else if (diskPct > 80) alerts.push({ level: 'warning', message: `Disk at ${diskPct}%` });
    }

    const downContainers = containers.filter(c => c.status !== 'running');
    if (downContainers.length > 0) {
      alerts.push({
        level: 'critical',
        message: `${downContainers.length} container(s) down: ${downContainers.map(c => c.name).join(', ')}`,
      });
    }

    return alerts;
  }
}
