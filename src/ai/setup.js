import Enquirer from 'enquirer';
import chalk from 'chalk';
import ora from 'ora';
import { log, section, banner, box } from '../ui/logger.js';
import { ConfigManager } from '../config/index.js';
import { AIProvider } from '../ai/provider.js';

const enquirer = new Enquirer();

// ============================================================================
// 25+ AI PROVIDERS — All API Key Required (except Ollama & Pollinations)
// ============================================================================
const PROVIDERS = {
  // ── FREE / NO-KEY PROVIDERS ──────────────────────────────────────────────
  ollama: {
    name: 'Ollama (Local)',
    category: 'free',
    description: 'Free, local AI. No API key needed.',
    models: ['llama3', 'llama3:70b', 'codellama', 'mistral', 'mixtral', 'phi3', 'gemma', 'qwen2', 'deepseek-coder-v2', 'command-r'],
    keyRequired: false,
    url: 'https://ollama.ai',
    setupGuide: 'Install: curl -fsSL https://ollama.ai/install.sh | sh\nThen: ollama pull llama3',
  },
  pollinations: {
    name: 'Pollinations.ai',
    category: 'free',
    description: 'Free AI text & image generation. No API key.',
    models: ['openai', 'mistral', 'llama', 'deepseek', 'command-r'],
    keyRequired: false,
    url: 'https://pollinations.ai',
    setupGuide: 'No setup needed. Free tier with generous limits.',
  },

  // ── TIER 1: MAJOR PROVIDERS (API KEY REQUIRED) ──────────────────────────
  openai: {
    name: 'OpenAI (GPT)',
    category: 'tier1',
    description: 'GPT-4o, GPT-4.1, o3, o4-mini',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'o3', 'o3-mini', 'o4-mini', 'gpt-4-turbo'],
    keyRequired: true,
    url: 'https://platform.openai.com/api-keys',
    keyPrefix: 'sk-',
  },
  claude: {
    name: 'Claude (Anthropic)',
    category: 'tier1',
    description: 'Claude Opus 4, Sonnet 4, Haiku',
    models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-haiku-4-20250514', 'claude-3.5-sonnet-20241022', 'claude-3-opus-20240229'],
    keyRequired: true,
    url: 'https://console.anthropic.com/settings/keys',
    keyPrefix: 'sk-ant-',
  },
  gemini: {
    name: 'Gemini (Google)',
    category: 'tier1',
    description: 'Gemini 2.5 Pro, Flash, Ultra',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-ultra'],
    keyRequired: true,
    url: 'https://aistudio.google.com/app/apikey',
    keyPrefix: 'AI',
  },
  xai: {
    name: 'xAI (Grok)',
    category: 'tier1',
    description: 'Grok-3, Grok-3 Mini by xAI',
    models: ['grok-3', 'grok-3-mini', 'grok-2', 'grok-2-mini'],
    keyRequired: true,
    url: 'https://console.x.ai',
    keyPrefix: 'xai-',
  },

  // ── TIER 2: SPECIALIZED PROVIDERS (API KEY REQUIRED) ────────────────────
  deepseek: {
    name: 'DeepSeek',
    category: 'tier2',
    description: 'DeepSeek-V3, Coder, Reasoner (R1)',
    models: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
    keyRequired: true,
    url: 'https://platform.deepseek.com/api_keys',
    keyPrefix: 'sk-',
  },
  mistral: {
    name: 'Mistral AI',
    category: 'tier2',
    description: 'Mistral Large, Medium, Codestral',
    models: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest', 'codestral-latest', 'open-mixtral-8x22b'],
    keyRequired: true,
    url: 'https://console.mistral.ai/api-keys',
    keyPrefix: '',
  },
  cohere: {
    name: 'Cohere',
    category: 'tier2',
    description: 'Command R+, Command R, Embed',
    models: ['command-r-plus', 'command-r', 'command-light', 'command-nightly'],
    keyRequired: true,
    url: 'https://dashboard.cohere.com/api-keys',
    keyPrefix: '',
  },
  perplexity: {
    name: 'Perplexity AI',
    category: 'tier2',
    description: 'Sonar Large, Sonar Small — search-powered AI',
    models: ['sonar-pro', 'sonar', 'sonar-reasoning-pro', 'sonar-reasoning'],
    keyRequired: true,
    url: 'https://www.perplexity.ai/settings/api',
    keyPrefix: 'pplx-',
  },
  groq: {
    name: 'Groq',
    category: 'tier2',
    description: 'Ultra-fast inference. Llama, Mixtral, Gemma',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
    keyRequired: true,
    url: 'https://console.groq.com/keys',
    keyPrefix: 'gsk_',
  },
  together: {
    name: 'Together AI',
    category: 'tier2',
    description: 'Open-source models at scale. Llama, Qwen, DeepSeek',
    models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-72B-Instruct-Turbo', 'deepseek-ai/DeepSeek-R1', 'mistralai/Mixtral-8x22B-Instruct-v0.1'],
    keyRequired: true,
    url: 'https://api.together.xyz/settings/api-keys',
    keyPrefix: '',
  },
  fireworks: {
    name: 'Fireworks AI',
    category: 'tier2',
    description: 'Fast open-source model hosting. Llama, Mixtral',
    models: ['accounts/fireworks/models/llama-v3p3-70b-instruct', 'accounts/fireworks/models/mixtral-8x22b-instruct', 'accounts/fireworks/models/qwen2p5-72b-instruct'],
    keyRequired: true,
    url: 'https://fireworks.ai/account/api-keys',
    keyPrefix: '',
  },

  // ── TIER 3: CLOUD PLATFORM AI (API KEY REQUIRED) ───────────────────────
  azure: {
    name: 'Azure OpenAI',
    category: 'tier3',
    description: 'Microsoft Azure-hosted GPT-4, GPT-4o',
    models: ['gpt-4o', 'gpt-4', 'gpt-4-turbo', 'gpt-35-turbo'],
    keyRequired: true,
    url: 'https://portal.azure.com/#view/Microsoft_Azure_ProjectOxford/CognitiveServicesHub',
    keyPrefix: '',
    extraConfig: ['endpoint'],
  },
  bedrock: {
    name: 'AWS Bedrock',
    category: 'tier3',
    description: 'AWS-hosted Claude, Llama, Titan, Mistral',
    models: ['anthropic.claude-sonnet-4-20250514-v1:0', 'meta.llama3-70b-instruct-v1:0', 'amazon.titan-text-premier-v1:0', 'mistral.mixtral-8x7b-instruct-v0:1'],
    keyRequired: true,
    url: 'https://console.aws.amazon.com/bedrock',
    keyPrefix: '',
    extraConfig: ['region', 'accessKeyId', 'secretAccessKey'],
  },
  vertex: {
    name: 'Google Vertex AI',
    category: 'tier3',
    description: 'Google Cloud-hosted Gemini, PaLM',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-1.5-pro', 'text-bison'],
    keyRequired: true,
    url: 'https://console.cloud.google.com/vertex-ai',
    keyPrefix: '',
    extraConfig: ['projectId', 'location'],
  },

  // ── TIER 4: AGGREGATORS & ROUTERS (API KEY REQUIRED) ───────────────────
  openrouter: {
    name: 'OpenRouter',
    category: 'aggregator',
    description: 'Access 200+ models with one API key',
    models: ['openai/gpt-4o', 'anthropic/claude-sonnet-4-20250514', 'google/gemini-2.5-pro', 'meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-r1'],
    keyRequired: true,
    url: 'https://openrouter.ai/keys',
    keyPrefix: 'sk-or-',
  },
  litellm: {
    name: 'LiteLLM Proxy',
    category: 'aggregator',
    description: 'Unified proxy for 100+ LLMs. Self-hosted.',
    models: ['gpt-4o', 'claude-sonnet-4-20250514', 'gemini-pro', 'command-r-plus'],
    keyRequired: true,
    url: 'https://docs.litellm.ai',
    keyPrefix: '',
    extraConfig: ['baseUrl'],
  },

  // ── TIER 5: OPEN-SOURCE / SPECIALIZED (API KEY REQUIRED) ───────────────
  replicate: {
    name: 'Replicate',
    category: 'specialized',
    description: 'Run open-source models via API. Llama, Stable Diffusion',
    models: ['meta/llama-3-70b-instruct', 'mistralai/mixtral-8x7b-instruct-v0.1', 'meta/llama-3-8b-instruct'],
    keyRequired: true,
    url: 'https://replicate.com/account/api-tokens',
    keyPrefix: 'r8_',
  },
  huggingface: {
    name: 'Hugging Face Inference',
    category: 'specialized',
    description: 'Run 200k+ models via Inference API',
    models: ['meta-llama/Llama-3.3-70B-Instruct', 'mistralai/Mixtral-8x7B-Instruct-v0.1', 'Qwen/Qwen2.5-72B-Instruct', 'google/gemma-2-9b-it'],
    keyRequired: true,
    url: 'https://huggingface.co/settings/tokens',
    keyPrefix: 'hf_',
  },
  ai21: {
    name: 'AI21 Labs (Jamba)',
    category: 'specialized',
    description: 'Jamba 1.5 Large, Jamba 1.5 Mini',
    models: ['jamba-1.5-large', 'jamba-1.5-mini', 'j2-ultra', 'j2-mid'],
    keyRequired: true,
    url: 'https://studio.ai21.com/account/api-key',
    keyPrefix: '',
  },
  sambanova: {
    name: 'SambaNova',
    category: 'specialized',
    description: 'Ultra-fast Llama & custom models on RDU chips',
    models: ['Meta-Llama-3.3-70B-Instruct', 'Meta-Llama-3.1-8B-Instruct', 'Meta-Llama-3.1-405B-Instruct'],
    keyRequired: true,
    url: 'https://cloud.sambanova.ai/apis',
    keyPrefix: '',
  },
  cerebras: {
    name: 'Cerebras',
    category: 'specialized',
    description: 'Fastest inference on Wafer-Scale chips',
    models: ['llama-3.3-70b', 'llama-3.1-8b'],
    keyRequired: true,
    url: 'https://cloud.cerebras.ai',
    keyPrefix: 'csk-',
  },
  lepton: {
    name: 'Lepton AI',
    category: 'specialized',
    description: 'Fast serverless AI. Llama, Mixtral hosting',
    models: ['llama3-70b', 'mixtral-8x7b', 'llama3-8b'],
    keyRequired: true,
    url: 'https://dashboard.lepton.ai',
    keyPrefix: '',
  },
  novita: {
    name: 'Novita AI',
    category: 'specialized',
    description: 'Affordable GPU cloud for LLM inference',
    models: ['meta-llama/llama-3-70b-instruct', 'mistralai/mixtral-8x7b-instruct', 'nousresearch/hermes-3-llama-3.1-70b'],
    keyRequired: true,
    url: 'https://novita.ai/dashboard/key',
    keyPrefix: '',
  },
  anyscale: {
    name: 'Anyscale Endpoints',
    category: 'specialized',
    description: 'Scalable open-source model hosting (Ray-based)',
    models: ['meta-llama/Llama-3-70b-chat-hf', 'mistralai/Mixtral-8x7B-Instruct-v0.1', 'codellama/CodeLlama-70b-Instruct-hf'],
    keyRequired: true,
    url: 'https://app.endpoints.anyscale.com',
    keyPrefix: '',
  },
};

export async function setupWizard() {
  banner();
  section('AI Provider Setup Wizard — 25+ Providers');

  console.log(chalk.gray('  Configure your AI provider for intelligent DevOps.\n'));

  // Group providers by category
  const categories = {
    free: { label: '🆓 Free / No API Key', providers: [] },
    tier1: { label: '⭐ Tier 1 — Major Providers', providers: [] },
    tier2: { label: '🚀 Tier 2 — Specialized', providers: [] },
    tier3: { label: '☁️  Tier 3 — Cloud Platform AI', providers: [] },
    aggregator: { label: '🔀 Aggregators & Routers', providers: [] },
    specialized: { label: '🔬 Open-Source & Specialized', providers: [] },
  };

  for (const [key, p] of Object.entries(PROVIDERS)) {
    const cat = p.category || 'specialized';
    if (categories[cat]) categories[cat].providers.push({ key, ...p });
  }

  // Build choices with category separators
  const choices = [];
  for (const [, cat] of Object.entries(categories)) {
    if (cat.providers.length === 0) continue;
    choices.push({ role: 'separator', message: chalk.bold.yellow(`\n  ─── ${cat.label} ───`) });
    for (const p of cat.providers) {
      const keyTag = p.keyRequired ? chalk.yellow(' [KEY]') : chalk.green(' [FREE]');
      choices.push({
        name: p.key,
        message: `${p.name.padEnd(28)} ${chalk.gray(p.description)}${keyTag}`,
        value: p.key,
      });
    }
  }

  const { provider } = await enquirer.prompt({
    type: 'select',
    name: 'provider',
    message: chalk.cyan('Choose your AI provider:'),
    choices,
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
  section('AI Providers — 25+ Supported');
  const cm = new ConfigManager();
  const config = await cm.getGlobalConfig();
  const currentProvider = config.ai?.provider;
  const currentModel = config.ai?.model;

  const categories = {
    free: '🆓 Free / No API Key',
    tier1: '⭐ Tier 1 — Major Providers',
    tier2: '🚀 Tier 2 — Specialized',
    tier3: '☁️  Cloud Platform AI',
    aggregator: '🔀 Aggregators & Routers',
    specialized: '🔬 Open-Source & Specialized',
  };

  const grouped = {};
  for (const [key, p] of Object.entries(PROVIDERS)) {
    const cat = p.category || 'specialized';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({ key, ...p });
  }

  for (const [catKey, catLabel] of Object.entries(categories)) {
    if (!grouped[catKey] || grouped[catKey].length === 0) continue;
    console.log(`\n  ${chalk.bold.yellow(catLabel)}`);
    for (const p of grouped[catKey]) {
      const isCurrent = p.key === currentProvider;
      const hasKey = config.ai?.apiKeys?.[p.key] || !p.keyRequired;
      const icon = isCurrent ? chalk.green('▶') : hasKey ? chalk.cyan('●') : chalk.gray('○');
      const status = isCurrent ? chalk.green(` (active: ${currentModel})`) : hasKey && p.keyRequired ? chalk.gray(' (key set)') : '';
      const keyTag = p.keyRequired ? '' : chalk.green(' FREE');

      console.log(`    ${icon} ${chalk.white(p.name.padEnd(28))} ${chalk.gray(p.description)}${status}${keyTag}`);
    }
  }

  console.log(`\n  ${chalk.white(`Total: ${Object.keys(PROVIDERS).length} providers`)}`);
  console.log(`\n  ${chalk.gray('Setup:')} ${chalk.cyan('dnpm setup-ai')}`);
  console.log(`  ${chalk.gray('Set key:')} ${chalk.cyan('dnpm config set-key <provider> <key>')}\n`);
}

export { PROVIDERS };
