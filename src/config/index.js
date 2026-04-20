import { homedir } from 'os';
import { join } from 'path';
import fs from 'fs-extra';

const CONFIG_DIR = join(homedir(), '.dnpm');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const SECRETS_FILE = join(CONFIG_DIR, 'secrets.enc.json');
const PLUGINS_DIR = join(CONFIG_DIR, 'plugins');
const LOGS_DIR = join(CONFIG_DIR, 'logs');

const DEFAULT_CONFIG = {
  version: '1.0.0',
  ai: {
    provider: 'ollama',
    model: 'llama3',
    ollamaUrl: 'http://localhost:11434',
    apiKeys: {},
  },
  cloud: {
    defaultProvider: null,
    region: 'us-east-1',
  },
  deploy: {
    strategy: 'rolling',
    zeroDowntime: true,
    autoRollback: true,
    dockerRegistry: null,
  },
  monitoring: {
    enabled: true,
    interval: 30,
    alertsEnabled: true,
    webhookUrl: null,
  },
  security: {
    autoFirewall: true,
    ddosProtection: true,
    autoSSL: true,
    secretsEncryption: true,
  },
  cost: {
    autoShutdownIdle: true,
    idleThresholdMinutes: 30,
    spotInstances: false,
  },
  plugins: [],
};

export class ConfigManager {
  constructor(projectDir = process.cwd()) {
    this.projectDir = projectDir;
    this.globalConfigDir = CONFIG_DIR;
    this.projectConfigFile = join(projectDir, 'dnpm.json');
  }

  async init() {
    await fs.ensureDir(CONFIG_DIR);
    await fs.ensureDir(PLUGINS_DIR);
    await fs.ensureDir(LOGS_DIR);

    if (!await fs.pathExists(CONFIG_FILE)) {
      await fs.writeJson(CONFIG_FILE, DEFAULT_CONFIG, { spaces: 2 });
    }
  }

  async getGlobalConfig() {
    await this.init();
    return fs.readJson(CONFIG_FILE);
  }

  async setGlobalConfig(config) {
    await this.init();
    await fs.writeJson(CONFIG_FILE, config, { spaces: 2 });
  }

  async updateGlobalConfig(updates) {
    const config = await this.getGlobalConfig();
    const merged = deepMerge(config, updates);
    await this.setGlobalConfig(merged);
    return merged;
  }

  async getProjectConfig() {
    if (await fs.pathExists(this.projectConfigFile)) {
      return fs.readJson(this.projectConfigFile);
    }
    return null;
  }

  async setProjectConfig(config) {
    await fs.writeJson(this.projectConfigFile, config, { spaces: 2 });
  }

  async getConfig() {
    const global = await this.getGlobalConfig();
    const project = await this.getProjectConfig();
    return project ? deepMerge(global, project) : global;
  }

  async setAPIKey(provider, key) {
    const config = await this.getGlobalConfig();
    config.ai.apiKeys[provider] = key;
    await this.setGlobalConfig(config);
  }

  async getAPIKey(provider) {
    const config = await this.getGlobalConfig();
    return config.ai.apiKeys[provider] || process.env[`DNPM_${provider.toUpperCase()}_API_KEY`] || null;
  }

  async setAIProvider(provider, model) {
    await this.updateGlobalConfig({
      ai: { provider, model },
    });
  }

  getConfigDir() {
    return CONFIG_DIR;
  }

  getPluginsDir() {
    return PLUGINS_DIR;
  }

  getLogsDir() {
    return LOGS_DIR;
  }
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export { CONFIG_DIR, CONFIG_FILE, PLUGINS_DIR, LOGS_DIR, DEFAULT_CONFIG };
