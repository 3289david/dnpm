import fs from 'fs-extra';
import { join } from 'path';
import { execa } from 'execa';
import chalk from 'chalk';
import { log, section } from '../ui/logger.js';
import { ConfigManager } from '../config/index.js';

const OFFICIAL_PLUGINS = {
  'aws': { name: 'dnpm-plugin-aws', description: 'AWS EC2, S3, RDS integration' },
  'vercel': { name: 'dnpm-plugin-vercel', description: 'Vercel deployment' },
  'database': { name: 'dnpm-plugin-database', description: 'Database management & migrations' },
  'ai-gpt': { name: 'dnpm-plugin-ai-gpt', description: 'Advanced GPT integration' },
  'monitoring': { name: 'dnpm-plugin-monitoring', description: 'Advanced monitoring & Grafana' },
  'security': { name: 'dnpm-plugin-security', description: 'Advanced security scanning' },
  'kubernetes': { name: 'dnpm-plugin-kubernetes', description: 'Kubernetes deployment & management' },
  'terraform': { name: 'dnpm-plugin-terraform', description: 'Terraform IaC integration' },
  'cloudflare': { name: 'dnpm-plugin-cloudflare', description: 'Cloudflare DNS & CDN' },
  'slack': { name: 'dnpm-plugin-slack', description: 'Slack notifications & alerts' },
};

export class PluginLoader {
  constructor() {
    this.config = new ConfigManager();
    this.plugins = new Map();
  }

  async loadAll() {
    const config = await this.config.getGlobalConfig();
    const pluginList = config.plugins || [];

    for (const pluginName of pluginList) {
      try {
        await this.load(pluginName);
      } catch (err) {
        log(`Failed to load plugin ${pluginName}: ${err.message}`, 'warning');
      }
    }

    return this.plugins;
  }

  async load(pluginName) {
    const pluginsDir = this.config.getPluginsDir();
    const pluginPath = join(pluginsDir, pluginName);

    if (!await fs.pathExists(pluginPath)) {
      throw new Error(`Plugin '${pluginName}' not installed. Run: dnpm plugin install ${pluginName}`);
    }

    const pkgPath = join(pluginPath, 'package.json');
    if (!await fs.pathExists(pkgPath)) {
      throw new Error(`Invalid plugin: missing package.json`);
    }

    const pkg = await fs.readJson(pkgPath);
    const mainFile = join(pluginPath, pkg.main || 'index.js');

    const plugin = await import(mainFile);
    this.plugins.set(pluginName, {
      name: pluginName,
      version: pkg.version,
      instance: plugin.default || plugin,
    });

    log(`Plugin loaded: ${pluginName} v${pkg.version}`, 'plugin');
    return plugin;
  }

  async install(name) {
    section('Plugin Install');
    const pluginsDir = this.config.getPluginsDir();
    await fs.ensureDir(pluginsDir);

    // Check if it's an official plugin alias
    const official = OFFICIAL_PLUGINS[name];
    const packageName = official ? official.name : name;

    log(`Installing plugin: ${packageName}...`, 'plugin');

    try {
      await execa('npm', ['install', packageName, '--prefix', pluginsDir], { stdio: 'pipe' });

      // Register plugin
      const config = await this.config.getGlobalConfig();
      if (!config.plugins.includes(name)) {
        config.plugins.push(name);
        await this.config.setGlobalConfig(config);
      }

      log(`Plugin installed: ${packageName}`, 'success');
      return { name: packageName, status: 'installed' };
    } catch (err) {
      log(`Failed to install ${packageName}: ${err.message}`, 'error');
      throw err;
    }
  }

  async uninstall(name) {
    const pluginsDir = this.config.getPluginsDir();
    const pluginPath = join(pluginsDir, 'node_modules', name);

    if (await fs.pathExists(pluginPath)) {
      await fs.remove(pluginPath);
    }

    const config = await this.config.getGlobalConfig();
    config.plugins = config.plugins.filter(p => p !== name);
    await this.config.setGlobalConfig(config);

    log(`Plugin uninstalled: ${name}`, 'success');
  }

  async list() {
    section('Installed Plugins');
    const config = await this.config.getGlobalConfig();
    const installed = config.plugins || [];

    if (installed.length === 0) {
      log('No plugins installed.', 'info');
      console.log('\n  Available plugins:');
      for (const [alias, info] of Object.entries(OFFICIAL_PLUGINS)) {
        console.log(`    ${chalk.cyan(alias.padEnd(15))} ${chalk.gray(info.description)}`);
      }
      console.log(`\n  Install: ${chalk.cyan('dnpm plugin install <name>')}\n`);
    } else {
      installed.forEach(p => {
        console.log(`  ${chalk.green('●')} ${p}`);
      });
    }

    return installed;
  }

  getPlugin(name) {
    return this.plugins.get(name);
  }

  async execPlugin(name, method, ...args) {
    const plugin = this.getPlugin(name);
    if (!plugin) throw new Error(`Plugin '${name}' not loaded`);
    if (typeof plugin.instance[method] !== 'function') {
      throw new Error(`Plugin '${name}' has no method '${method}'`);
    }
    return plugin.instance[method](...args);
  }
}

export { OFFICIAL_PLUGINS };
