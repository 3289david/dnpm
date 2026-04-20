import ora from 'ora';
import chalk from 'chalk';
import fs from 'fs-extra';
import { join } from 'path';
import { log, section } from '../ui/logger.js';
import { ConfigManager } from '../config/index.js';
import { AIProvider } from '../ai/provider.js';

export class DNSManager {
  constructor() {
    this.config = new ConfigManager();
  }

  async configureDNS(options = {}) {
    section('DNS Management');
    const provider = options.provider || 'cloudflare';
    const domain = options.domain;
    const ip = options.ip;

    if (!domain || !ip) {
      throw new Error('Domain and IP required. Use: dnpm dns set --domain example.com --ip 1.2.3.4');
    }

    const handlers = {
      cloudflare: () => this._cloudflare(domain, ip, options),
      route53: () => this._route53(domain, ip, options),
      digitalocean: () => this._digitaloceanDNS(domain, ip, options),
      manual: () => this._manualDNS(domain, ip, options),
    };

    const handler = handlers[provider];
    if (!handler) throw new Error(`Unsupported DNS provider: ${provider}`);
    return handler();
  }

  async _cloudflare(domain, ip, options = {}) {
    const spinner = ora('Configuring Cloudflare DNS...').start();
    try {
      const { default: got } = await import('got');
      const token = await this.config.getAPIKey('cloudflare');
      if (!token) throw new Error('Cloudflare API token required. Run: dnpm config set-key cloudflare <TOKEN>');

      // Get zone ID
      const zones = await got(`https://api.cloudflare.com/client/v4/zones?name=${domain}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      }).json();
      const zoneId = zones.result[0]?.id;
      if (!zoneId) throw new Error(`Zone not found for domain: ${domain}`);

      // Create/update A record
      await got.post(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        json: {
          type: options.type || 'A',
          name: options.subdomain || '@',
          content: ip,
          ttl: options.ttl || 300,
          proxied: options.proxied !== false,
        },
      }).json();

      spinner.succeed(`Cloudflare DNS configured: ${domain} → ${ip}`);
      return { provider: 'cloudflare', domain, ip };
    } catch (err) {
      spinner.fail('Cloudflare DNS configuration failed');
      throw err;
    }
  }

  async _route53(domain, ip, options = {}) {
    const { execa } = await import('execa');
    const spinner = ora('Configuring Route53 DNS...').start();
    try {
      const change = {
        Changes: [{
          Action: 'UPSERT',
          ResourceRecordSet: {
            Name: domain,
            Type: options.type || 'A',
            TTL: options.ttl || 300,
            ResourceRecords: [{ Value: ip }],
          },
        }],
      };

      await execa('aws', [
        'route53', 'change-resource-record-sets',
        '--hosted-zone-id', options.zoneId,
        '--change-batch', JSON.stringify({ Changes: change.Changes }),
      ]);

      spinner.succeed(`Route53 DNS configured: ${domain} → ${ip}`);
      return { provider: 'route53', domain, ip };
    } catch (err) {
      spinner.fail('Route53 DNS configuration failed');
      throw err;
    }
  }

  async _digitaloceanDNS(domain, ip, options = {}) {
    const spinner = ora('Configuring DigitalOcean DNS...').start();
    try {
      const { default: got } = await import('got');
      const token = await this.config.getAPIKey('digitalocean');
      if (!token) throw new Error('DigitalOcean token required. Run: dnpm config set-key digitalocean <TOKEN>');

      await got.post(`https://api.digitalocean.com/v2/domains/${domain}/records`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        json: {
          type: options.type || 'A',
          name: options.subdomain || '@',
          data: ip,
          ttl: options.ttl || 300,
        },
      }).json();

      spinner.succeed(`DigitalOcean DNS configured: ${domain} → ${ip}`);
      return { provider: 'digitalocean', domain, ip };
    } catch (err) {
      spinner.fail('DigitalOcean DNS configuration failed');
      throw err;
    }
  }

  async _manualDNS(domain, ip) {
    section('Manual DNS Setup');
    console.log(chalk.white('\n  Add these records to your DNS provider:\n'));
    console.log(`  ${chalk.cyan('Type')}   ${chalk.cyan('Name')}   ${chalk.cyan('Value')}          ${chalk.cyan('TTL')}`);
    console.log(`  A      @      ${ip}       300`);
    console.log(`  A      www    ${ip}       300`);
    console.log(`  CNAME  *      ${domain}.         300`);
    console.log('');
    return { provider: 'manual', domain, ip };
  }

  async status(domain) {
    section('DNS Status');
    try {
      const { execa } = await import('execa');
      const result = await execa('dig', ['+short', domain], { stdio: 'pipe' });
      const ips = result.stdout.trim().split('\n');
      log(`${domain} resolves to: ${chalk.green(ips.join(', '))}`, 'success');
      return { domain, ips };
    } catch (err) {
      log(`Cannot resolve ${domain}`, 'warning');
    }
  }
}
