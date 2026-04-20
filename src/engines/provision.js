import { execa } from 'execa';
import fs from 'fs-extra';
import { join } from 'path';
import ora from 'ora';
import chalk from 'chalk';
import { log, section } from '../ui/logger.js';
import { ConfigManager } from '../config/index.js';
import { AIProvider } from '../ai/provider.js';

export class ProvisionEngine {
  constructor(projectDir = process.cwd()) {
    this.projectDir = projectDir;
    this.config = new ConfigManager(projectDir);
  }

  async provision(options = {}) {
    section('Provision Engine');
    const target = options.target || 'docker';

    const handlers = {
      docker: () => this.provisionDocker(options),
      'aws-ec2': () => this.provisionAWS(options),
      digitalocean: () => this.provisionDigitalOcean(options),
      gcp: () => this.provisionGCP(options),
      vps: () => this.provisionVPS(options),
      local: () => this.provisionLocal(options),
    };

    const handler = handlers[target];
    if (!handler) throw new Error(`Unknown provision target: ${target}`);
    return handler();
  }

  async provisionDocker(options = {}) {
    const spinner = ora('Provisioning Docker environment...').start();
    try {
      await execa('docker', ['version']);
      spinner.text = 'Docker detected, creating containers...';

      const composePath = join(this.projectDir, 'docker-compose.yml');
      if (!await fs.pathExists(composePath)) {
        await this._generateDockerCompose(options);
      }

      await execa('docker', ['compose', 'up', '-d', '--build'], { cwd: this.projectDir });
      spinner.succeed('Docker environment provisioned');
      return { target: 'docker', status: 'running' };
    } catch (err) {
      spinner.fail('Docker provisioning failed');
      if (options.aiAssist) {
        log('Asking AI for help...', 'ai');
        const ai = await AIProvider.create();
        const fix = await ai.analyzeError(err.message);
        log(`AI suggestion: ${fix}`, 'ai');
      }
      throw err;
    }
  }

  async provisionAWS(options = {}) {
    const spinner = ora('Provisioning AWS EC2 instance...').start();
    try {
      const config = await this.config.getConfig();
      const apiKey = await this.config.getAPIKey('aws');
      if (!apiKey) throw new Error('AWS credentials not configured. Run: dnpm config set-key aws <ACCESS_KEY>');

      const region = options.region || config.cloud?.region || 'us-east-1';
      const instanceType = options.size || 't3.micro';
      const ami = options.ami || 'ami-0c02fb55956c7d316'; // Amazon Linux 2

      const result = await execa('aws', [
        'ec2', 'run-instances',
        '--image-id', ami,
        '--instance-type', instanceType,
        '--region', region,
        '--count', '1',
        '--tag-specifications', `ResourceType=instance,Tags=[{Key=Name,Value=dnpm-${options.name || 'server'}}]`,
        '--output', 'json',
      ], {
        env: {
          ...process.env,
          AWS_ACCESS_KEY_ID: apiKey,
          AWS_SECRET_ACCESS_KEY: await this.config.getAPIKey('aws-secret'),
        },
      });

      const data = JSON.parse(result.stdout);
      const instanceId = data.Instances[0].InstanceId;
      spinner.succeed(`AWS EC2 instance created: ${instanceId}`);

      log('Waiting for instance to start...', 'server');
      await execa('aws', [
        'ec2', 'wait', 'instance-running',
        '--instance-ids', instanceId,
        '--region', region,
      ]);

      return { target: 'aws-ec2', instanceId, region, status: 'running' };
    } catch (err) {
      spinner.fail('AWS provisioning failed');
      throw err;
    }
  }

  async provisionDigitalOcean(options = {}) {
    const spinner = ora('Provisioning DigitalOcean Droplet...').start();
    try {
      const { default: got } = await import('got');
      const token = await this.config.getAPIKey('digitalocean');
      if (!token) throw new Error('DigitalOcean token not configured. Run: dnpm config set-key digitalocean <TOKEN>');

      const response = await got.post('https://api.digitalocean.com/v2/droplets', {
        headers: { Authorization: `Bearer ${token}` },
        json: {
          name: `dnpm-${options.name || 'server'}`,
          region: options.region || 'nyc3',
          size: options.size || 's-1vcpu-1gb',
          image: 'ubuntu-22-04-x64',
          ssh_keys: options.sshKeys || [],
          tags: ['dnpm'],
        },
      }).json();

      const droplet = response.droplet;
      spinner.succeed(`DigitalOcean Droplet created: ${droplet.id}`);
      return { target: 'digitalocean', dropletId: droplet.id, status: 'new' };
    } catch (err) {
      spinner.fail('DigitalOcean provisioning failed');
      throw err;
    }
  }

  async provisionGCP(options = {}) {
    const spinner = ora('Provisioning GCP instance...').start();
    try {
      const project = options.project || process.env.GCLOUD_PROJECT;
      if (!project) throw new Error('GCP project not set. Use --project or set GCLOUD_PROJECT');

      const zone = options.zone || 'us-central1-a';
      const machineType = options.size || 'e2-micro';
      const name = `dnpm-${options.name || 'server'}`;

      await execa('gcloud', [
        'compute', 'instances', 'create', name,
        '--project', project,
        '--zone', zone,
        '--machine-type', machineType,
        '--image-family', 'ubuntu-2204-lts',
        '--image-project', 'ubuntu-os-cloud',
        '--tags', 'dnpm,http-server,https-server',
      ]);

      spinner.succeed(`GCP instance created: ${name}`);
      return { target: 'gcp', name, zone, status: 'running' };
    } catch (err) {
      spinner.fail('GCP provisioning failed');
      throw err;
    }
  }

  async provisionVPS(options = {}) {
    const spinner = ora('Connecting to VPS via SSH...').start();
    try {
      if (!options.host) throw new Error('VPS host required. Use --host <IP>');

      const { NodeSSH } = await import('node-ssh');
      const ssh = new NodeSSH();
      await ssh.connect({
        host: options.host,
        username: options.user || 'root',
        privateKeyPath: options.keyPath || join(process.env.HOME, '.ssh', 'id_rsa'),
      });

      spinner.text = 'Connected. Setting up base system...';
      await ssh.execCommand('apt-get update && apt-get upgrade -y');
      await ssh.execCommand('apt-get install -y curl wget git ufw');

      spinner.succeed(`VPS provisioned: ${options.host}`);
      ssh.dispose();
      return { target: 'vps', host: options.host, status: 'ready' };
    } catch (err) {
      spinner.fail('VPS provisioning failed');
      throw err;
    }
  }

  async provisionLocal(options = {}) {
    const spinner = ora('Setting up local development environment...').start();
    await fs.ensureDir(this.projectDir);
    spinner.succeed('Local environment ready');
    return { target: 'local', path: this.projectDir, status: 'ready' };
  }

  async _generateDockerCompose(options = {}) {
    const runtime = options.runtime || 'node';
    const database = options.database || null;

    let services = {
      app: {
        build: '.',
        ports: ['3000:3000'],
        environment: ['NODE_ENV=production'],
        restart: 'unless-stopped',
      },
    };

    if (database === 'postgresql' || database === 'PostgreSQL') {
      services.db = {
        image: 'postgres:16-alpine',
        environment: ['POSTGRES_DB=app', 'POSTGRES_USER=app', 'POSTGRES_PASSWORD=${DB_PASSWORD:-changeme}'],
        volumes: ['pgdata:/var/lib/postgresql/data'],
        ports: ['5432:5432'],
        restart: 'unless-stopped',
      };
      services.app.depends_on = ['db'];
    } else if (database === 'mysql' || database === 'MySQL') {
      services.db = {
        image: 'mysql:8',
        environment: ['MYSQL_DATABASE=app', 'MYSQL_ROOT_PASSWORD=${DB_PASSWORD:-changeme}'],
        volumes: ['mysqldata:/var/lib/mysql'],
        ports: ['3306:3306'],
        restart: 'unless-stopped',
      };
      services.app.depends_on = ['db'];
    } else if (database === 'mongodb' || database === 'MongoDB') {
      services.db = {
        image: 'mongo:7',
        volumes: ['mongodata:/data/db'],
        ports: ['27017:27017'],
        restart: 'unless-stopped',
      };
      services.app.depends_on = ['db'];
    }

    if (database === 'redis' || database === 'Redis') {
      services.redis = {
        image: 'redis:7-alpine',
        ports: ['6379:6379'],
        restart: 'unless-stopped',
      };
    }

    const { default: yaml } = await import('js-yaml');
    const compose = {
      version: '3.8',
      services,
      volumes: {},
    };

    if (services.db?.volumes) {
      const volName = services.db.volumes[0].split(':')[0];
      compose.volumes[volName] = {};
    }

    await fs.writeFile(
      join(this.projectDir, 'docker-compose.yml'),
      yaml.dump(compose)
    );
    log('Generated docker-compose.yml', 'success');
  }
}
