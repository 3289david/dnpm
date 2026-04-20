import { execa } from 'execa';
import fs from 'fs-extra';
import { join } from 'path';
import ora from 'ora';
import chalk from 'chalk';
import { log, section } from '../ui/logger.js';
import { AIProvider } from '../ai/provider.js';

export class SetupEngine {
  constructor(projectDir = process.cwd()) {
    this.projectDir = projectDir;
  }

  async setup(options = {}) {
    section('Setup Engine');
    const tasks = [];

    if (options.runtime) tasks.push(this.installRuntime(options.runtime));
    if (options.database) tasks.push(this.installDatabase(options.database));
    if (options.webserver !== false) tasks.push(this.setupWebServer(options.webserver || 'nginx'));
    if (options.ssl !== false) tasks.push(this.setupSSL(options));

    const results = [];
    for (const task of tasks) {
      results.push(await task);
    }
    return results;
  }

  async installRuntime(runtime) {
    const spinner = ora(`Installing ${runtime}...`).start();
    try {
      const installers = {
        'Node.js': async () => {
          await this._remoteExec('curl -fsSL https://deb.nodesource.com/setup_20.x | bash -');
          await this._remoteExec('apt-get install -y nodejs');
          await this._remoteExec('npm install -g pm2');
          return 'Node.js 20 + PM2';
        },
        'Python': async () => {
          await this._remoteExec('apt-get install -y python3 python3-pip python3-venv');
          await this._remoteExec('pip3 install gunicorn uvicorn');
          return 'Python 3 + Gunicorn + Uvicorn';
        },
        'Go': async () => {
          await this._remoteExec('wget -q https://go.dev/dl/go1.22.0.linux-amd64.tar.gz');
          await this._remoteExec('tar -C /usr/local -xzf go1.22.0.linux-amd64.tar.gz');
          await this._remoteExec('echo "export PATH=$PATH:/usr/local/go/bin" >> /etc/profile');
          return 'Go 1.22';
        },
        'Rust': async () => {
          await this._remoteExec('curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y');
          return 'Rust (latest)';
        },
        'Fullstack (Node + React)': async () => {
          await this._remoteExec('curl -fsSL https://deb.nodesource.com/setup_20.x | bash -');
          await this._remoteExec('apt-get install -y nodejs');
          await this._remoteExec('npm install -g pm2 serve');
          return 'Node.js 20 + PM2 + serve';
        },
      };

      const installer = installers[runtime];
      if (!installer) throw new Error(`Unsupported runtime: ${runtime}`);
      const result = await installer();
      spinner.succeed(`Installed: ${result}`);
      return { runtime, status: 'installed' };
    } catch (err) {
      spinner.fail(`Failed to install ${runtime}`);
      throw err;
    }
  }

  async installDatabase(db) {
    const spinner = ora(`Installing ${db}...`).start();
    try {
      const installers = {
        'PostgreSQL': async () => {
          await this._remoteExec('apt-get install -y postgresql postgresql-contrib');
          await this._remoteExec('systemctl enable postgresql && systemctl start postgresql');
          return 'PostgreSQL';
        },
        'MySQL': async () => {
          await this._remoteExec('apt-get install -y mysql-server');
          await this._remoteExec('systemctl enable mysql && systemctl start mysql');
          return 'MySQL';
        },
        'MongoDB': async () => {
          await this._remoteExec('apt-get install -y gnupg curl');
          await this._remoteExec('curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg');
          await this._remoteExec('apt-get install -y mongodb-org');
          return 'MongoDB 7';
        },
        'Redis': async () => {
          await this._remoteExec('apt-get install -y redis-server');
          await this._remoteExec('systemctl enable redis-server && systemctl start redis-server');
          return 'Redis';
        },
        'SQLite': async () => {
          await this._remoteExec('apt-get install -y sqlite3');
          return 'SQLite';
        },
      };

      const installer = installers[db];
      if (!installer) {
        spinner.info(`No database selected`);
        return { database: 'none', status: 'skipped' };
      }
      const result = await installer();
      spinner.succeed(`Installed: ${result}`);
      return { database: db, status: 'installed' };
    } catch (err) {
      spinner.fail(`Failed to install ${db}`);
      throw err;
    }
  }

  async setupWebServer(server = 'nginx') {
    const spinner = ora(`Setting up ${server}...`).start();
    try {
      if (server === 'nginx') {
        await this._remoteExec('apt-get install -y nginx');
        await this._remoteExec('systemctl enable nginx && systemctl start nginx');
        await this._generateNginxConfig();
        spinner.succeed('Nginx configured');
      } else if (server === 'caddy') {
        await this._remoteExec('apt-get install -y debian-keyring debian-archive-keyring apt-transport-https');
        await this._remoteExec('curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/gpg.key" | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg');
        await this._remoteExec('apt-get install -y caddy');
        spinner.succeed('Caddy configured');
      }
      return { webserver: server, status: 'running' };
    } catch (err) {
      spinner.fail(`Failed to set up ${server}`);
      throw err;
    }
  }

  async setupSSL(options = {}) {
    if (!options.domain) {
      log('No domain specified, skipping SSL', 'warning');
      return { ssl: false, status: 'skipped' };
    }

    const spinner = ora('Setting up SSL with Let\'s Encrypt...').start();
    try {
      await this._remoteExec('apt-get install -y certbot python3-certbot-nginx');
      await this._remoteExec(
        `certbot --nginx -d ${options.domain} --non-interactive --agree-tos -m ${options.email || 'admin@' + options.domain}`
      );
      await this._remoteExec('systemctl reload nginx');
      spinner.succeed(`SSL certificate installed for ${options.domain}`);
      return { ssl: true, domain: options.domain, status: 'active' };
    } catch (err) {
      spinner.fail('SSL setup failed');
      throw err;
    }
  }

  async _generateNginxConfig(options = {}) {
    const port = options.port || 3000;
    const domain = options.domain || '_';
    const config = `server {
    listen 80;
    server_name ${domain};

    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}`;
    const confPath = join(this.projectDir, 'nginx.conf');
    await fs.writeFile(confPath, config);
    log(`Nginx config written to ${confPath}`, 'success');
    return confPath;
  }

  async _remoteExec(command) {
    if (this.ssh) {
      return this.ssh.execCommand(command);
    }
    return execa('bash', ['-c', command], { cwd: this.projectDir });
  }

  setSSH(sshConnection) {
    this.ssh = sshConnection;
  }

  async aiOptimize() {
    const ai = await AIProvider.create();
    log('AI analyzing setup for optimization...', 'ai');
    const suggestion = await ai.prompt(
      'Analyze a standard Ubuntu server setup with Nginx + Node.js + PostgreSQL. Suggest optimizations for performance and security.',
      { system: 'You are a Linux server optimization expert. Provide concrete sysctl, nginx, and pg config changes.' }
    );
    log(suggestion, 'ai');
    return suggestion;
  }
}
