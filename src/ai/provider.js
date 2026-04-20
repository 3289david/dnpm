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
    this.configManager = new ConfigManager();
  }

  static async create(overrides = {}) {
    const cm = new ConfigManager();
    const config = await cm.getGlobalConfig();
    const aiConfig = { ...config.ai, ...overrides };

    if (aiConfig.provider !== 'ollama') {
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

  _getHandler() {
    const handlers = {
      ollama: this._ollamaChat,
      openai: this._openaiChat,
      claude: this._claudeChat,
      gemini: this._geminiChat,
      openrouter: this._openrouterChat,
    };
    const handler = handlers[this.provider];
    if (!handler) throw new Error(`Unknown AI provider: ${this.provider}`);
    return handler;
  }

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
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model || 'gemini-pro'}:generateContent?key=${this.apiKey}`,
      {
        json: { contents },
      }
    ).json();
    return response.candidates[0].content.parts[0].text;
  }

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
}
