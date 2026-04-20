import chalk from 'chalk';
import ora from 'ora';
import { log, section } from '../ui/logger.js';
import { ConfigManager } from '../config/index.js';

export class AIProvider {
  constructor(config = {}) {
    this.provider = config.provider || 'ollama';
    this.model = config.model || 'llama3';
    this.apiKey = config.apiKey || null;
    this.ollamaUrl = config.ollamaUrl || 'http://localhost:11434';
    this.baseUrl = config.baseUrl || null;
    this.endpoint = config.endpoint || null;
    this.projectId = config.projectId || null;
    this.region = config.region || null;
    this.configManager = new ConfigManager();
  }

  static async create(overrides = {}) {
    const cm = new ConfigManager();
    const config = await cm.getGlobalConfig();
    const aiConfig = { ...config.ai, ...overrides };
    const FREE_PROVIDERS = ['ollama', 'pollinations'];

    if (!FREE_PROVIDERS.includes(aiConfig.provider)) {
      const key = aiConfig.apiKeys?.[aiConfig.provider]
        || await cm.getAPIKey(aiConfig.provider);
      if (!key) {
        throw new Error(
          `API key required for ${aiConfig.provider}. Run: dnpm config set-key ${aiConfig.provider} <YOUR_KEY>`
        );
      }
      aiConfig.apiKey = key;
    }

    return new AIProvider(aiConfig);
  }

  async chat(messages, options = {}) {
    const handler = this._getHandler();
    return handler.call(this, messages, options);
  }

  async prompt(userMessage, options = {}) {
    const messages = [
      { role: 'system', content: options.system || 'You are dnpm AI assistant. Help with server setup, deployment, debugging, and infrastructure management.' },
      { role: 'user', content: userMessage },
    ];
    return this.chat(messages, options);
  }

  async analyzeError(errorLog) {
    return this.prompt(
      `Analyze this server error and provide a fix:\n\n${errorLog}`,
      { system: 'You are a DevOps expert. Analyze errors and provide concrete fixes with code.' }
    );
  }

  async generateCode(description) {
    return this.prompt(
      `Generate code for: ${description}`,
      { system: 'You are an expert programmer. Generate clean, production-ready code. Return only the code without explanation.' }
    );
  }

  async suggestInfra(requirements) {
    return this.prompt(
      `Suggest optimal infrastructure for: ${JSON.stringify(requirements)}`,
      { system: 'You are an infrastructure architect. Suggest the most cost-effective and performant setup.' }
    );
  }

  async reviewSecurity(config) {
    return this.prompt(
      `Review this server configuration for security issues:\n\n${JSON.stringify(config, null, 2)}`,
      { system: 'You are a security expert. Find vulnerabilities and suggest fixes.' }
    );
  }

  // =========================================================================
  // HANDLER ROUTER — 25+ Providers
  // =========================================================================
  _getHandler() {
    const handlers = {
      // Free
      ollama: this._ollamaChat,
      pollinations: this._pollinationsChat,
      // Tier 1
      openai: this._openaiChat,
      claude: this._claudeChat,
      gemini: this._geminiChat,
      xai: this._xaiChat,
      // Tier 2
      deepseek: this._deepseekChat,
      mistral: this._mistralChat,
      cohere: this._cohereChat,
      perplexity: this._perplexityChat,
      groq: this._groqChat,
      together: this._togetherChat,
      fireworks: this._fireworksChat,
      // Tier 3 (Cloud)
      azure: this._azureChat,
      bedrock: this._bedrockChat,
      vertex: this._vertexChat,
      // Aggregators
      openrouter: this._openrouterChat,
      litellm: this._litellmChat,
      // Specialized
      replicate: this._replicateChat,
      huggingface: this._huggingfaceChat,
      ai21: this._ai21Chat,
      sambanova: this._sambanovaChat,
      cerebras: this._cerebrasChat,
      lepton: this._leptonChat,
      novita: this._novitaChat,
      anyscale: this._anyscaleChat,
    };
    const handler = handlers[this.provider];
    if (!handler) throw new Error(`Unknown AI provider: ${this.provider}. Run "dnpm ai-providers" to see all available.`);
    return handler;
  }

  // =========================================================================
  // FREE PROVIDERS
  // =========================================================================
  async _ollamaChat(messages, options = {}) {
    const { Ollama } = await import('ollama');
    const ollama = new Ollama({ host: this.ollamaUrl });
    const response = await ollama.chat({
      model: this.model,
      messages,
      stream: false,
      ...options,
    });
    return response.message.content;
  }

  async _pollinationsChat(messages, options = {}) {
    const { default: got } = await import('got');
    const response = await got.post('https://text.pollinations.ai/', {
      json: {
        messages,
        model: this.model || 'openai',
        seed: 42,
      },
      headers: { 'Content-Type': 'application/json' },
    }).json();
    if (typeof response === 'string') return response;
    return response?.choices?.[0]?.message?.content || JSON.stringify(response);
  }

  // =========================================================================
  // TIER 1 — MAJOR PROVIDERS
  // =========================================================================
  async _openaiChat(messages, options = {}) {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: this.apiKey });
    const response = await client.chat.completions.create({
      model: this.model || 'gpt-4o',
      messages,
      temperature: options.temperature || 0.3,
    });
    return response.choices[0].message.content;
  }

  async _claudeChat(messages, options = {}) {
    const { default: got } = await import('got');
    const systemMsg = messages.find(m => m.role === 'system')?.content || '';
    const chatMessages = messages.filter(m => m.role !== 'system');
    const response = await got.post('https://api.anthropic.com/v1/messages', {
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      json: {
        model: this.model || 'claude-sonnet-4-20250514',
        max_tokens: options.maxTokens || 4096,
        system: systemMsg,
        messages: chatMessages,
      },
    }).json();
    return response.content[0].text;
  }

  async _geminiChat(messages, options = {}) {
    const { default: got } = await import('got');
    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
    const response = await got.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model || 'gemini-2.5-pro'}:generateContent?key=${this.apiKey}`,
      { json: { contents } }
    ).json();
    return response.candidates[0].content.parts[0].text;
  }

  async _xaiChat(messages, options = {}) {
    const { default: got } = await import('got');
    const response = await got.post('https://api.x.ai/v1/chat/completions', {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      json: {
        model: this.model || 'grok-3',
        messages,
        temperature: options.temperature || 0.3,
      },
    }).json();
    return response.choices[0].message.content;
  }

  // =========================================================================
  // TIER 2 — SPECIALIZED PROVIDERS
  // =========================================================================
  async _deepseekChat(messages, options = {}) {
    const { default: got } = await import('got');
    const response = await got.post('https://api.deepseek.com/chat/completions', {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      json: {
        model: this.model || 'deepseek-chat',
        messages,
        temperature: options.temperature || 0.3,
      },
    }).json();
    return response.choices[0].message.content;
  }

  async _mistralChat(messages, options = {}) {
    const { default: got } = await import('got');
    const response = await got.post('https://api.mistral.ai/v1/chat/completions', {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      json: {
        model: this.model || 'mistral-large-latest',
        messages,
        temperature: options.temperature || 0.3,
      },
    }).json();
    return response.choices[0].message.content;
  }

  async _cohereChat(messages, options = {}) {
    const { default: got } = await import('got');
    const chatHistory = messages.filter(m => m.role !== 'system' && m.role !== 'user').map(m => ({
      role: m.role === 'assistant' ? 'CHATBOT' : 'USER',
      message: m.content,
    }));
    const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
    const preamble = messages.find(m => m.role === 'system')?.content || '';
    const response = await got.post('https://api.cohere.ai/v1/chat', {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      json: {
        model: this.model || 'command-r-plus',
        message: lastUserMsg,
        preamble,
        chat_history: chatHistory,
      },
    }).json();
    return response.text;
  }

  async _perplexityChat(messages, options = {}) {
    const { default: got } = await import('got');
    const response = await got.post('https://api.perplexity.ai/chat/completions', {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      json: {
        model: this.model || 'sonar-pro',
        messages,
      },
    }).json();
    return response.choices[0].message.content;
  }

  async _groqChat(messages, options = {}) {
    const { default: got } = await import('got');
    const response = await got.post('https://api.groq.com/openai/v1/chat/completions', {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      json: {
        model: this.model || 'llama-3.3-70b-versatile',
        messages,
        temperature: options.temperature || 0.3,
      },
    }).json();
    return response.choices[0].message.content;
  }

  async _togetherChat(messages, options = {}) {
    const { default: got } = await import('got');
    const response = await got.post('https://api.together.xyz/v1/chat/completions', {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      json: {
        model: this.model || 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
        messages,
        temperature: options.temperature || 0.3,
      },
    }).json();
    return response.choices[0].message.content;
  }

  async _fireworksChat(messages, options = {}) {
    const { default: got } = await import('got');
    const response = await got.post('https://api.fireworks.ai/inference/v1/chat/completions', {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      json: {
        model: this.model || 'accounts/fireworks/models/llama-v3p3-70b-instruct',
        messages,
        temperature: options.temperature || 0.3,
      },
    }).json();
    return response.choices[0].message.content;
  }

  // =========================================================================
  // TIER 3 — CLOUD PLATFORM AI
  // =========================================================================
  async _azureChat(messages, options = {}) {
    const { default: got } = await import('got');
    const endpoint = this.endpoint || 'https://your-resource.openai.azure.com';
    const response = await got.post(
      `${endpoint}/openai/deployments/${this.model || 'gpt-4o'}/chat/completions?api-version=2024-02-01`,
      {
        headers: {
          'api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        json: { messages, temperature: options.temperature || 0.3 },
      }
    ).json();
    return response.choices[0].message.content;
  }

  async _bedrockChat(messages, options = {}) {
    const { default: got } = await import('got');
    // Bedrock requires AWS SDK — simplified HTTP fallback via proxy
    throw new Error('AWS Bedrock requires the @aws-sdk/client-bedrock-runtime package. Install it: npm i @aws-sdk/client-bedrock-runtime');
  }

  async _vertexChat(messages, options = {}) {
    const { default: got } = await import('got');
    const projectId = this.projectId || 'your-project';
    const location = this.region || 'us-central1';
    const model = this.model || 'gemini-2.5-pro';
    const contents = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const response = await got.post(
      `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        json: { contents },
      }
    ).json();
    return response.candidates[0].content.parts[0].text;
  }

  // =========================================================================
  // AGGREGATORS & ROUTERS
  // =========================================================================
  async _openrouterChat(messages, options = {}) {
    const { default: got } = await import('got');
    const response = await got.post('https://openrouter.ai/api/v1/chat/completions', {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      json: {
        model: this.model || 'openai/gpt-4o',
        messages,
      },
    }).json();
    return response.choices[0].message.content;
  }

  async _litellmChat(messages, options = {}) {
    const { default: got } = await import('got');
    const baseUrl = this.baseUrl || 'http://localhost:4000';
    const response = await got.post(`${baseUrl}/v1/chat/completions`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      json: {
        model: this.model || 'gpt-4o',
        messages,
      },
    }).json();
    return response.choices[0].message.content;
  }

  // =========================================================================
  // SPECIALIZED PROVIDERS
  // =========================================================================
  async _replicateChat(messages, options = {}) {
    const { default: got } = await import('got');
    const lastMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
    const systemPrompt = messages.find(m => m.role === 'system')?.content || '';
    const response = await got.post('https://api.replicate.com/v1/predictions', {
      headers: {
        'Authorization': `Token ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      json: {
        model: this.model || 'meta/llama-3-70b-instruct',
        input: {
          prompt: lastMsg,
          system_prompt: systemPrompt,
          max_tokens: options.maxTokens || 2048,
        },
      },
    }).json();
    // Replicate returns async — poll for result
    let prediction = response;
    while (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
      await new Promise(r => setTimeout(r, 1000));
      prediction = await got(prediction.urls.get, {
        headers: { 'Authorization': `Token ${this.apiKey}` },
      }).json();
    }
    if (prediction.status === 'failed') throw new Error(`Replicate failed: ${prediction.error}`);
    return Array.isArray(prediction.output) ? prediction.output.join('') : prediction.output;
  }

  async _huggingfaceChat(messages, options = {}) {
    const { default: got } = await import('got');
    const lastMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
    const response = await got.post(
      `https://api-inference.huggingface.co/models/${this.model || 'meta-llama/Llama-3.3-70B-Instruct'}`,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        json: {
          inputs: lastMsg,
          parameters: { max_new_tokens: options.maxTokens || 2048 },
        },
      }
    ).json();
    if (Array.isArray(response)) return response[0]?.generated_text || JSON.stringify(response);
    return response?.generated_text || response?.[0]?.generated_text || JSON.stringify(response);
  }

  async _ai21Chat(messages, options = {}) {
    const { default: got } = await import('got');
    const response = await got.post('https://api.ai21.com/studio/v1/chat/completions', {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      json: {
        model: this.model || 'jamba-1.5-large',
        messages,
        temperature: options.temperature || 0.3,
      },
    }).json();
    return response.choices[0].message.content;
  }

  async _sambanovaChat(messages, options = {}) {
    const { default: got } = await import('got');
    const response = await got.post('https://api.sambanova.ai/v1/chat/completions', {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      json: {
        model: this.model || 'Meta-Llama-3.3-70B-Instruct',
        messages,
        temperature: options.temperature || 0.3,
      },
    }).json();
    return response.choices[0].message.content;
  }

  async _cerebrasChat(messages, options = {}) {
    const { default: got } = await import('got');
    const response = await got.post('https://api.cerebras.ai/v1/chat/completions', {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      json: {
        model: this.model || 'llama-3.3-70b',
        messages,
        temperature: options.temperature || 0.3,
      },
    }).json();
    return response.choices[0].message.content;
  }

  async _leptonChat(messages, options = {}) {
    const { default: got } = await import('got');
    const model = (this.model || 'llama3-70b').replace(/[^a-zA-Z0-9-]/g, '');
    const response = await got.post(`https://${model}.lepton.run/api/v1/chat/completions`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      json: { messages, temperature: options.temperature || 0.3 },
    }).json();
    return response.choices[0].message.content;
  }

  async _novitaChat(messages, options = {}) {
    const { default: got } = await import('got');
    const response = await got.post('https://api.novita.ai/v3/openai/chat/completions', {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      json: {
        model: this.model || 'meta-llama/llama-3-70b-instruct',
        messages,
        temperature: options.temperature || 0.3,
      },
    }).json();
    return response.choices[0].message.content;
  }

  async _anyscaleChat(messages, options = {}) {
    const { default: got } = await import('got');
    const response = await got.post('https://api.endpoints.anyscale.com/v1/chat/completions', {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      json: {
        model: this.model || 'meta-llama/Llama-3-70b-chat-hf',
        messages,
        temperature: options.temperature || 0.3,
      },
    }).json();
    return response.choices[0].message.content;
  }
}
