import { execa } from 'execa';
import fs from 'fs-extra';
import { join } from 'path';
import ora from 'ora';
import chalk from 'chalk';
import crypto from 'crypto';
import { log, section } from '../ui/logger.js';
import { ConfigManager } from '../config/index.js';
import { AIProvider } from '../ai/provider.js';

const ALGORITHM = 'aes-256-gcm';

export class SecurityEngine {
  constructor(projectDir = process.cwd()) {
    this.projectDir = projectDir;
    this.config = new ConfigManager(projectDir);
  }

  async fullAudit() {
    section('Security Audit');
    const results = [];

    results.push(await this.checkFirewall());
    results.push(await this.checkSSH());
    results.push(await this.checkPorts());
    results.push(await this.checkDeps());
    results.push(await this.checkDockerSecurity());

    const issues = results.filter(r => r.severity !== 'ok');
    if (issues.length === 0) {
      log(chalk.green('All security checks passed!'), 'security');
    } else {
      log(chalk.yellow(`Found ${issues.length} security issue(s)`), 'security');
      issues.forEach(issue => {
        const color = issue.severity === 'critical' ? chalk.red : issue.severity === 'warning' ? chalk.yellow : chalk.gray;
        console.log(`  ${color('●')} [${issue.severity.toUpperCase()}] ${issue.check}: ${issue.message}`);
      });

      // AI-powered security fix suggestions
      try {
        const ai = await AIProvider.create();
        const aiAdvice = await ai.reviewSecurity({ issues });
        log('\nAI Security Recommendations:', 'ai');
        console.log(aiAdvice);
      } catch { /* AI not available */ }
    }

    return results;
  }

  async checkFirewall() {
    try {
      const result = await execa('ufw', ['status']);
      const active = result.stdout.includes('active');
      return {
        check: 'Firewall',
        severity: active ? 'ok' : 'critical',
        message: active ? 'UFW is active' : 'Firewall is NOT active!',
      };
    } catch {
      return { check: 'Firewall', severity: 'warning', message: 'UFW not installed' };
    }
  }

  async setupFirewall(options = {}) {
    const spinner = ora('Configuring firewall...').start();
    try {
      await execa('ufw', ['default', 'deny', 'incoming']);
      await execa('ufw', ['default', 'allow', 'outgoing']);
      await execa('ufw', ['allow', 'ssh']);
      await execa('ufw', ['allow', '80/tcp']);
      await execa('ufw', ['allow', '443/tcp']);

      if (options.additionalPorts) {
        for (const port of options.additionalPorts) {
          await execa('ufw', ['allow', String(port)]);
        }
      }

      await execa('ufw', ['--force', 'enable']);
      spinner.succeed('Firewall configured');
    } catch (err) {
      spinner.fail('Firewall setup failed');
      throw err;
    }
  }

  async checkSSH() {
    try {
      const config = await fs.readFile('/etc/ssh/sshd_config', 'utf-8');
      const issues = [];

      if (config.includes('PermitRootLogin yes')) {
        issues.push('Root login is enabled');
      }
      if (config.includes('PasswordAuthentication yes')) {
        issues.push('Password authentication is enabled');
      }
      if (!config.includes('MaxAuthTries')) {
        issues.push('No MaxAuthTries limit');
      }

      return {
        check: 'SSH',
        severity: issues.length > 0 ? 'warning' : 'ok',
        message: issues.length > 0 ? issues.join('; ') : 'SSH is properly configured',
      };
    } catch {
      return { check: 'SSH', severity: 'info', message: 'Cannot read SSH config (not on server)' };
    }
  }

  async hardenSSH() {
    const spinner = ora('Hardening SSH...').start();
    try {
      const configPath = '/etc/ssh/sshd_config';
      let config = await fs.readFile(configPath, 'utf-8');

      config = config.replace(/PermitRootLogin\s+yes/g, 'PermitRootLogin no');
      config = config.replace(/PasswordAuthentication\s+yes/g, 'PasswordAuthentication no');

      if (!config.includes('MaxAuthTries')) {
        config += '\nMaxAuthTries 3\n';
      }

      await fs.writeFile(configPath, config);
      await execa('systemctl', ['restart', 'sshd']);
      spinner.succeed('SSH hardened');
    } catch (err) {
      spinner.fail('SSH hardening failed');
      throw err;
    }
  }

  async generateSSHKey(options = {}) {
    const spinner = ora('Generating SSH key pair...').start();
    const keyPath = options.path || join(process.env.HOME, '.ssh', 'dnpm_key');

    try {
      await execa('ssh-keygen', [
        '-t', 'ed25519',
        '-f', keyPath,
        '-N', '',
        '-C', 'dnpm-generated',
      ]);
      spinner.succeed(`SSH key generated: ${keyPath}`);
      return { privateKey: keyPath, publicKey: `${keyPath}.pub` };
    } catch (err) {
      spinner.fail('SSH key generation failed');
      throw err;
    }
  }

  async checkPorts() {
    try {
      const result = await execa('ss', ['-tlnp']);
      const lines = result.stdout.split('\n').slice(1);
      const openPorts = lines.map(l => {
        const parts = l.split(/\s+/);
        return parts[3];
      }).filter(Boolean);

      const suspicious = openPorts.filter(p => {
        const port = parseInt(p.split(':').pop());
        return ![22, 80, 443, 3000, 5432, 3306, 6379, 8080].includes(port);
      });

      return {
        check: 'Open Ports',
        severity: suspicious.length > 0 ? 'warning' : 'ok',
        message: suspicious.length > 0
          ? `Unexpected open ports: ${suspicious.join(', ')}`
          : `${openPorts.length} expected ports open`,
      };
    } catch {
      return { check: 'Open Ports', severity: 'info', message: 'Cannot check ports (not on server)' };
    }
  }

  async checkDeps() {
    try {
      if (await fs.pathExists(join(this.projectDir, 'package.json'))) {
        const result = await execa('npm', ['audit', '--json'], {
          cwd: this.projectDir,
          stdio: 'pipe',
        });
        const audit = JSON.parse(result.stdout);
        const vulns = audit.metadata?.vulnerabilities || {};
        const total = Object.values(vulns).reduce((a, b) => a + b, 0);

        return {
          check: 'Dependencies',
          severity: vulns.critical > 0 ? 'critical' : total > 0 ? 'warning' : 'ok',
          message: total > 0 ? `${total} vulnerabilities found` : 'No vulnerabilities',
          details: vulns,
        };
      }
      return { check: 'Dependencies', severity: 'ok', message: 'No package.json' };
    } catch {
      return { check: 'Dependencies', severity: 'info', message: 'Cannot run npm audit' };
    }
  }

  async checkDockerSecurity() {
    const dockerfilePath = join(this.projectDir, 'Dockerfile');
    if (!await fs.pathExists(dockerfilePath)) {
      return { check: 'Docker', severity: 'ok', message: 'No Dockerfile' };
    }

    const content = await fs.readFile(dockerfilePath, 'utf-8');
    const issues = [];

    if (content.includes('FROM') && !content.includes('AS ')) {
      // Single-stage build (not necessarily an issue)
    }
    if (content.match(/USER\s+root/) || !content.includes('USER')) {
      issues.push('Running as root');
    }
    if (content.includes('COPY . .') && !await fs.pathExists(join(this.projectDir, '.dockerignore'))) {
      issues.push('No .dockerignore file');
    }

    return {
      check: 'Docker',
      severity: issues.length > 0 ? 'warning' : 'ok',
      message: issues.length > 0 ? issues.join('; ') : 'Docker config looks good',
    };
  }

  // Secrets Vault
  async encryptSecret(key, value, masterPassword) {
    const salt = crypto.randomBytes(16);
    const derivedKey = crypto.scryptSync(masterPassword, salt, 32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);

    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    const secretsFile = join(this.config.getConfigDir(), 'secrets.json');
    let secrets = {};
    if (await fs.pathExists(secretsFile)) {
      secrets = await fs.readJson(secretsFile);
    }

    secrets[key] = {
      encrypted,
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      authTag,
    };

    await fs.writeJson(secretsFile, secrets, { spaces: 2 });
    log(`Secret '${key}' stored securely`, 'security');
  }

  async decryptSecret(key, masterPassword) {
    const secretsFile = join(this.config.getConfigDir(), 'secrets.json');
    if (!await fs.pathExists(secretsFile)) throw new Error('No secrets file');

    const secrets = await fs.readJson(secretsFile);
    const secret = secrets[key];
    if (!secret) throw new Error(`Secret '${key}' not found`);

    const salt = Buffer.from(secret.salt, 'hex');
    const derivedKey = crypto.scryptSync(masterPassword, salt, 32);
    const iv = Buffer.from(secret.iv, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv);
    decipher.setAuthTag(Buffer.from(secret.authTag, 'hex'));

    let decrypted = decipher.update(secret.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  async listSecrets() {
    const secretsFile = join(this.config.getConfigDir(), 'secrets.json');
    if (!await fs.pathExists(secretsFile)) return [];
    const secrets = await fs.readJson(secretsFile);
    return Object.keys(secrets);
  }

  async ddosProtection() {
    const spinner = ora('Setting up DDoS protection...').start();
    try {
      // Rate limiting with iptables
      await execa('iptables', ['-A', 'INPUT', '-p', 'tcp', '--dport', '80', '-m', 'limit', '--limit', '25/minute', '--limit-burst', '100', '-j', 'ACCEPT']);
      await execa('iptables', ['-A', 'INPUT', '-p', 'tcp', '--dport', '443', '-m', 'limit', '--limit', '25/minute', '--limit-burst', '100', '-j', 'ACCEPT']);

      // SYN flood protection
      await execa('sysctl', ['-w', 'net.ipv4.tcp_syncookies=1']);
      await execa('sysctl', ['-w', 'net.ipv4.tcp_max_syn_backlog=2048']);

      spinner.succeed('Basic DDoS protection enabled');
    } catch (err) {
      spinner.fail('DDoS protection setup failed (may need root)');
    }
  }
}
