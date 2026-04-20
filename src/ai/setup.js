import Enquirer from 'enquirer';
import chalk from 'chalk';
import ora from 'ora';
import { log, section, banner, box } from '../ui/logger.js';
import { ConfigManager } from '../config/index.js';
import { AIProvider } from '../ai/provider.js';

const enquirer = new Enquirer();

const PROVIDERS = {
  ollama: {
    name: 'Ollama',
    description: 'Free, local AI. No API key needed.',
    models: ['llama3', 'llama3:70b', 'codellama', 'mistral', 'mixtral', 'phi3', 'gemma', 'qwen2'],
    keyRequired: false,
    url: 'https://ollama.ai',
    setupGuide: 'Install: curl -fsSL https://ollama.ai/install.sh | sh\nThen: ollama pull llama3',
  },
  openai: {
    name: 'OpenAI (GPT)',
    description: 'GPT-4o, GPT-4 Turbo, GPT-3.5',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1-preview', 'o1-mini'],
    keyRequired: true,
    url: 'https://platform.openai.com/api-keys',
    keyPrefix: 'sk-',
  },
  claude: {
    name: 'Claude (Anthropic)',
    description: 'Claude Opus 4, Sonnet 4, Haiku',
    models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-haiku-4-20250514', 'claude-3-5-sonnet-20241022'],
    keyRequired: true,
    url: 'https://console.anthropic.com/settings/keys',
    keyPrefix: 'sk-ant-',
  },
  gemini: {
    name: 'Gemini (Google)',
    description: 'Gemini Pro, Gemini Ultra',
    models: ['gemini-pro', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-ultra'],
    keyRequired: true,
    url: 'https://aistudio.google.com/app/apikey',
    keyPrefix: 'AI',
  },
  openrouter: {
    name: 'OpenRouter',
    description: 'Access 100+ models with one API key',
    models: ['openai/gpt-4o', 'anthropic/claude-sonnet-4-20250514', 'google/gemini-pro', 'meta-llama/llama-3-70b-instruct'],
    keyRequired: true,
    url: 'https://openrouter.ai/keys',
    keyPrefix: 'sk-or-',
  },
};

export async function setupWizard() {
  banner();
  section('AI Provider Setup Wizard');

  console.log(chalk.gray('  Configure your AI provider for intelligent DevOps.\n'));

  // Show provider options
  const { provider } = await enquirer.prompt({
    type: 'select',
    name: 'provider',
    message: chalk.cyan('Choose your AI provider:'),
    choices: Object.entries(PROVIDERS).map(([key, p]) => ({
      name: key,
      message: `${p.name.padEnd(22)} ${chalk.gray(p.description)}`,
      value: key,
    })),
  });

  const providerInfo = PROVIDERS[provider];
  const cm = new ConfigManager();
  await cm.init();

  console.log('');
  box(providerInfo.name, [
    providerInfo.description,
    `Key Required: ${providerInfo.keyRequired ? chalk.yellow('Yes') : chalk.green('No')}`,
    providerInfo.keyRequired ? `Get your key: ${chalk.cyan(providerInfo.url)}` : providerInfo.setupGuide,
  ]);

  // API Key input
  if (providerInfo.keyRequired) {
    console.log('');
    log(`Get your API key from: ${chalk.cyan.underline(providerInfo.url)}`, 'info');
    console.log('');

    const { apiKey } = await enquirer.prompt({
      type: 'password',
      name: 'apiKey',
      message: chalk.cyan(`Enter your ${providerInfo.name} API key:`),
      validate: (val) => {
        if (!val || val.trim().length < 10) return 'API key is too short';
        if (providerInfo.keyPrefix && !val.startsWith(providerInfo.keyPrefix)) {
          return `Key should start with "${providerInfo.keyPrefix}"`;
        }
        return true;
      },
    });

    await cm.setAPIKey(provider, apiKey.trim());
    log(`API key saved for ${providerInfo.name}`, 'success');
  }

  // Model selection
  const { model } = await enquirer.prompt({
    type: 'select',
    name: 'model',
    message: chalk.cyan('Choose your default model:'),
    choices: providerInfo.models.map((m, i) => ({
      name: m,
      message: m,
      value: m,
    })),
  });

  await cm.setAIProvider(provider, model);
  log(`Default AI set to ${chalk.cyan(providerInfo.name)} / ${chalk.green(model)}`, 'success');

  // Test connection
  console.log('');
  const { testIt } = await enquirer.prompt({
    type: 'confirm',
    name: 'testIt',
    message: chalk.cyan('Test the AI connection now?'),
    initial: true,
  });

  if (testIt) {
    const spinner = ora('Testing AI connection...').start();
    try {
      const ai = await AIProvider.create();
      const response = await ai.prompt('Say "dnpm AI connected successfully!" in one line.');
      spinner.succeed(`AI connected: ${chalk.green(response.slice(0, 100))}`);
    } catch (err) {
      spinner.fail(`Connection failed: ${err.message}`);
      log('Check your API key and try again with: dnpm setup-ai', 'warning');
    }
  }

  console.log('');
  log('AI setup complete! You can now use:', 'success');
  console.log(chalk.gray(`
    dnpm ai mode           # Interactive AI assistant
    dnpm ai fix            # Auto-fix errors
    dnpm ai ask "question" # Ask anything
    dnpm ai generate "..." # Generate code
    dnpm analyze           # AI system analysis
  `));
}

export async function quickSetKey(provider, key) {
  const providerInfo = PROVIDERS[provider];
  if (!providerInfo) {
    const available = Object.keys(PROVIDERS).join(', ');
    throw new Error(`Unknown provider: ${provider}. Available: ${available}`);
  }

  if (providerInfo.keyRequired && (!key || key.trim().length < 10)) {
    throw new Error('API key is too short or missing');
  }

  const cm = new ConfigManager();
  await cm.init();

  if (key) {
    await cm.setAPIKey(provider, key.trim());
    log(`API key saved for ${providerInfo.name}`, 'success');
  }

  return { provider, saved: true };
}

export async function listProviders() {
  section('AI Providers');
  const cm = new ConfigManager();
  const config = await cm.getGlobalConfig();
  const currentProvider = config.ai?.provider;
  const currentModel = config.ai?.model;

  for (const [key, p] of Object.entries(PROVIDERS)) {
    const isCurrent = key === currentProvider;
    const hasKey = config.ai?.apiKeys?.[key] || !p.keyRequired;
    const icon = isCurrent ? chalk.green('▶') : hasKey ? chalk.cyan('●') : chalk.gray('○');
    const status = isCurrent ? chalk.green(` (active: ${currentModel})`) : hasKey && p.keyRequired ? chalk.gray(' (key set)') : '';

    console.log(`  ${icon} ${chalk.white(p.name.padEnd(22))} ${chalk.gray(p.description)}${status}`);
  }

  console.log(`\n  ${chalk.gray('Setup:')} ${chalk.cyan('dnpm setup-ai')}`);
  console.log(`  ${chalk.gray('Set key:')} ${chalk.cyan('dnpm config set-key <provider> <key>')}\n`);
}

export { PROVIDERS };
