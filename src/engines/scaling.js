import { execa } from 'execa';
import ora from 'ora';
import chalk from 'chalk';
import { log, section } from '../ui/logger.js';
import { ConfigManager } from '../config/index.js';
import { AIProvider } from '../ai/provider.js';

export class ScalingEngine {
  constructor(projectDir = process.cwd()) {
    this.projectDir = projectDir;
    this.config = new ConfigManager(projectDir);
  }

  async scaleContainers(service, replicas) {
    section('Auto-Scaling');
    const spinner = ora(`Scaling ${service} to ${replicas} replicas...`).start();
    try {
      await execa('docker', ['compose', 'up', '-d', '--scale', `${service}=${replicas}`], {
        cwd: this.projectDir,
      });
      spinner.succeed(`Scaled ${chalk.cyan(service)} to ${chalk.green(replicas)} replicas`);
      return { service, replicas, status: 'scaled' };
    } catch (err) {
      spinner.fail(`Scaling failed: ${err.message}`);
      throw err;
    }
  }

  async autoScale(options = {}) {
    section('Auto-Scale Monitor');
    const cpuThreshold = options.cpuThreshold || 80;
    const memThreshold = options.memThreshold || 85;
    const minReplicas = options.min || 1;
    const maxReplicas = options.max || 10;
    const service = options.service || 'app';
    let currentReplicas = options.current || 1;

    log(`Auto-scaling ${chalk.cyan(service)}: CPU>${cpuThreshold}% scale up, min=${minReplicas}, max=${maxReplicas}`, 'info');
    log('Press Ctrl+C to stop.\n', 'info');

    const check = async () => {
      try {
        const result = await execa('docker', ['stats', '--no-stream', '--format', '{{.Name}}\t{{.CPUPerc}}\t{{.MemPerc}}'], { stdio: 'pipe' });
        const containers = result.stdout.split('\n').filter(l => l.includes(service));

        let avgCpu = 0;
        let avgMem = 0;
        for (const line of containers) {
          const [, cpu, mem] = line.split('\t');
          avgCpu += parseFloat(cpu);
          avgMem += parseFloat(mem);
        }
        if (containers.length > 0) {
          avgCpu /= containers.length;
          avgMem /= containers.length;
        }

        log(`CPU: ${avgCpu.toFixed(1)}% | Memory: ${avgMem.toFixed(1)}% | Replicas: ${currentReplicas}`, 'monitor');

        // Scale UP
        if ((avgCpu > cpuThreshold || avgMem > memThreshold) && currentReplicas < maxReplicas) {
          currentReplicas = Math.min(currentReplicas + 1, maxReplicas);
          log(`📈 Scaling UP to ${currentReplicas} replicas`, 'warning');
          await this.scaleContainers(service, currentReplicas);
        }
        // Scale DOWN
        else if (avgCpu < cpuThreshold / 2 && avgMem < memThreshold / 2 && currentReplicas > minReplicas) {
          currentReplicas = Math.max(currentReplicas - 1, minReplicas);
          log(`📉 Scaling DOWN to ${currentReplicas} replicas`, 'info');
          await this.scaleContainers(service, currentReplicas);
        }
      } catch { /* stats unavailable */ }
    };

    await check();
    const interval = setInterval(check, (options.interval || 30) * 1000);
    process.on('SIGINT', () => { clearInterval(interval); process.exit(0); });
  }

  async loadBalance(options = {}) {
    section('Load Balancer');
    const spinner = ora('Configuring load balancer...').start();

    const upstream = options.upstream || 'app';
    const servers = options.servers || [
      { host: '127.0.0.1', port: 3000, weight: 1 },
      { host: '127.0.0.1', port: 3001, weight: 1 },
    ];

    const nginxConf = `upstream ${upstream} {
    ${options.method === 'ip_hash' ? 'ip_hash;' : options.method === 'least_conn' ? 'least_conn;' : ''}
    ${servers.map(s => `server ${s.host}:${s.port} weight=${s.weight};`).join('\n    ')}
}

server {
    listen 80;
    server_name ${options.domain || '_'};

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location / {
        proxy_pass http://${upstream};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    location /health {
        proxy_pass http://${upstream}/health;
        access_log off;
    }
}`;

    const { default: fsExtra } = await import('fs-extra');
    const { join } = await import('path');
    await fsExtra.writeFile(join(this.projectDir, 'nginx-lb.conf'), nginxConf);
    spinner.succeed('Load balancer configuration generated');
    log(`Config: ${join(this.projectDir, 'nginx-lb.conf')}`, 'info');
    return { config: nginxConf };
  }

  async aiRecommendScaling() {
    section('AI Scaling Recommendation');
    try {
      const ai = await AIProvider.create();
      const result = await execa('docker', ['stats', '--no-stream', '--format', '{{.Name}}\t{{.CPUPerc}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}'], { stdio: 'pipe' });

      const recommendation = await ai.prompt(
        `Current container stats:\n${result.stdout}\n\nRecommend optimal scaling configuration. Include exact numbers for replicas, CPU/memory limits, and load balancing strategy.`,
        { system: 'You are a scaling expert. Provide specific, actionable scaling recommendations with exact numbers.' }
      );
      console.log(`\n${chalk.cyan('AI Recommendation:')}\n${recommendation}\n`);
      return recommendation;
    } catch (err) {
      log('Could not get AI recommendation', 'warning');
    }
  }
}
