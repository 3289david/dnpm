<div align="center">

# ⚡ dnpm

### The All-in-One AI DevOps Platform

**npm + Docker + Vercel + AWS + GPT — Combined Into a Single Terminal OS**

[![npm version](https://img.shields.io/badge/npm-v1.1.0-7c3aed?style=for-the-badge&logo=npm&logoColor=white)](https://www.npmjs.com/package/@rukkit/dnpm)
[![license](https://img.shields.io/badge/license-MIT-10b981?style=for-the-badge)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D18-06b6d4?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![docker](https://img.shields.io/badge/docker-ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://docker.com)
[![ai](https://img.shields.io/badge/AI-powered-f59e0b?style=for-the-badge&logo=openai&logoColor=white)](#-ai-providers)<br><br>

[![Website](https://img.shields.io/badge/Website-Github%20Pages-20B2AA?style=for-the-badge)](https://3289david.github.io/dnpm/)

<br>

Deploy, scale, monitor, secure, and manage your entire infrastructure with AI-powered intelligence — all from one command.

[📖 Documentation](docs/index.html) · [🚀 Quick Start](#-quick-start) · [💡 Features](#-features) · [🤖 AI Providers](#-ai-providers)

---

</div>

## 🎯 What is dnpm?

**dnpm** replaces your entire DevOps toolchain with a single CLI. Instead of juggling Docker, Kubernetes, Terraform, CI/CD configs, monitoring dashboards, and security scanners separately — dnpm does it all.

```
┌──────────────────────────────────────────────────────────────┐
│                          dnpm                                 │
│                                                               │
│  🚀 Deploy    🤖 AI       ☁️ Cloud     🔒 Security           │
│  📈 Scale     💰 Cost     💾 Backup    📊 Monitor             │
│  🌐 DNS       🔌 Plugins  🏗️ Scaffold  🔄 Recovery           │
│                                                               │
│  One install. One command. Everything handled.                │
└──────────────────────────────────────────────────────────────┘
```

## ⚡ Quick Start

```bash
# Install globally
npm install @rukkit/dnpm

# Setup your AI provider (interactive wizard)
dnpm setup-ai

# Initialize your project
cd my-project
dnpm init

# Deploy!
dnpm deploy
```

### Using Free Local AI (Ollama)

```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh
ollama pull llama3

# dnpm auto-detects Ollama — no API key needed!
dnpm setup-ai    # Select "Ollama"
dnpm ai mode     # Start chatting with your local AI
```

## 💡 Features

### 🤖 AI-Powered Everything

| Feature | Command | Description |
|---------|---------|-------------|
| Interactive AI | `dnpm ai mode` | Full REPL AI assistant in your terminal |
| Auto-Fix | `dnpm ai fix` | AI scans and fixes errors automatically |
| Ask Anything | `dnpm ai ask "question"` | Ask about your project, code, infra |
| Code Generation | `dnpm ai generate "description"` | Generate code from natural language |
| Security Review | `dnpm ai security` | AI-powered security analysis |
| System Analysis | `dnpm analyze` | Deep AI analysis with recommendations |
| Setup Wizard | `dnpm setup-ai` | Interactive provider & model configuration |

### 🚀 Deployment Engine

| Feature | Command | Description |
|---------|---------|-------------|
| Smart Deploy | `dnpm deploy` | Auto-generates Dockerfile & deploys |
| Rolling Deploy | `dnpm deploy --strategy rolling` | Zero-downtime rolling updates |
| Blue-Green | `dnpm deploy --strategy blue-green` | Blue-green deployment strategy |
| Canary Deploy | `dnpm deploy --strategy canary` | Gradual canary releases |
| CI/CD Generate | `dnpm ci` | Generate GitHub Actions or GitLab CI |

### ☁️ Cloud & Infrastructure

| Feature | Command | Description |
|---------|---------|-------------|
| Cloud Create | `dnpm cloud create` | Full cloud deployment (server + DNS + SSL + CI/CD) |
| Cloud Destroy | `dnpm cloud destroy` | Tear down all cloud resources |
| Provision | `dnpm provision` | Provision servers (Docker, AWS, GCP, DO, VPS) |
| Setup | `dnpm setup` | Install runtimes, databases, web servers, SSL |
| DNS Config | `dnpm dns set <domain> <ip>` | Configure DNS (Cloudflare, Route53, DO) |

### 📈 Scaling & Load Balancing

| Feature | Command | Description |
|---------|---------|-------------|
| Scale Up | `dnpm scale up <service> <count>` | Scale to N replicas |
| Auto-Scale | `dnpm scale auto` | AI-powered auto-scaling |
| Load Balance | `dnpm scale loadbalance` | Generate LB configuration |
| Recommendations | `dnpm scale recommend` | AI scaling recommendations |

### 🔒 Security Suite

| Feature | Command | Description |
|---------|---------|-------------|
| Full Audit | `dnpm security audit` | Security audit with AI recommendations |
| Firewall | `dnpm security firewall` | Configure firewall rules |
| SSH Keys | `dnpm security ssh-keygen` | Generate SSH key pairs |
| Hardening | `dnpm security harden` | Apply security hardening |
| DDoS Protect | `dnpm security ddos` | Enable DDoS protection |
| Secrets Vault | `dnpm secrets set <key> <value>` | AES-256-GCM encrypted storage |

### 💾 Backup & Recovery

| Feature | Command | Description |
|---------|---------|-------------|
| Create Backup | `dnpm backup create` | Full backup (files + Docker + DB) |
| Restore | `dnpm backup restore <id>` | One-command restore |
| Schedule | `dnpm backup schedule` | Automatic scheduled backups |
| Self-Healing | `dnpm recovery heal` | Auto-diagnose and fix issues |
| Rollback | `dnpm recovery rollback` | Rollback to last good state |
| Watchdog | `dnpm recovery watchdog` | Auto-healing daemon |

### 📊 Monitoring & Ops

| Feature | Command | Description |
|---------|---------|-------------|
| Live Status | `dnpm status` | CPU, RAM, disk, network, containers |
| Dashboard | `dnpm dashboard` | Full terminal dashboard |
| Monitor | `dnpm monitor` | Real-time monitoring + AI alerts |
| Logs | `dnpm logs [service]` | Stream container logs |
| Cost Analysis | `dnpm cost analyze` | AI infrastructure cost analysis |

### 🏗️ Templates & Environment

| Feature | Command | Description |
|---------|---------|-------------|
| Scaffold | `dnpm scaffold project [runtime]` | Generate Node/Python/Go project |
| Health Check | `dnpm scaffold health [runtime]` | Generate health endpoint |
| Env Init | `dnpm env init` | Create dev/staging/prod env files |
| Env Switch | `dnpm env switch <env>` | Switch active environment |
| Env Compare | `dnpm env compare <a> <b>` | Diff two environments |

## 🤖 AI Providers

dnpm supports 5 AI providers — from free local models to the most powerful cloud APIs:

| Provider | Models | API Key | Cost |
|----------|--------|---------|------|
| **🦙 Ollama** | Llama 3, CodeLlama, Mistral, Mixtral, Phi-3, Gemma | ❌ Not needed | **Free (local)** |
| **🧠 OpenAI** | GPT-4o, GPT-4 Turbo, o1-preview, o1-mini | ✅ Required | Paid |
| **🎭 Claude** | Claude Opus 4, Sonnet 4, Haiku | ✅ Required | Paid |
| **💎 Gemini** | Gemini 1.5 Pro, Ultra, Flash | ✅ Required | Paid |
| **🌐 OpenRouter** | 100+ models from all providers | ✅ Required | Paid |

```bash
# Interactive setup — guides you through everything
dnpm setup-ai

# Or set keys directly
dnpm config set-key openai sk-your-key-here
dnpm config set-key claude sk-ant-your-key-here
dnpm config set-ai ollama llama3   # Use free local AI
```

## 🏗️ Architecture

```
dnpm/
├── bin/dnpm.js              # CLI entry point
├── src/
│   ├── cli.js               # Command router (50+ commands)
│   ├── index.js              # Public API
│   ├── ai/
│   │   ├── provider.js       # Unified AI interface (5 providers)
│   │   └── setup.js          # AI setup wizard
│   ├── config/
│   │   └── index.js          # Global & project config
│   ├── engines/
│   │   ├── provision.js      # Server provisioning
│   │   ├── setup.js          # Runtime & DB installation
│   │   ├── deploy.js         # Docker deployment engine
│   │   ├── ai.js             # AI dev assistant
│   │   ├── ops.js            # Operations & monitoring
│   │   ├── backup.js         # Backup & restore
│   │   ├── scaling.js        # Auto-scaling & load balancing
│   │   ├── dns.js            # DNS management
│   │   ├── env.js            # Environment management
│   │   └── template.js       # Project scaffolding
│   ├── security/
│   │   └── index.js          # Security audit & secrets vault
│   ├── recovery/
│   │   └── index.js          # Self-healing & rollback
│   ├── plugins/
│   │   └── loader.js         # Plugin ecosystem
│   ├── cloud/
│   │   └── manager.js        # Multi-cloud management
│   └── ui/
│       ├── logger.js         # Colored output & progress
│       ├── prompts.js        # Interactive prompts
│       └── dashboard.js      # Terminal dashboard
├── templates/
│   ├── docker/               # Dockerfile templates
│   ├── nginx/                # Nginx configs
│   ├── ci/                   # CI/CD templates
│   └── docker-compose/       # Compose templates
└── docs/
    └── index.html            # Documentation website
```

## ⚙️ Configuration

dnpm stores configuration at `~/.dnpm/config.json` (global) and `dnpm.json` (project-level).

```bash
# Initialize config
dnpm config init

# Set AI provider
dnpm config set-ai ollama llama3

# Set API keys
dnpm config set-key openai sk-xxx
dnpm config set-key claude sk-ant-xxx

# View config (keys are masked)
dnpm config show
```

## 🔌 Plugins

10+ official plugins extend dnpm functionality:

| Plugin | Description |
|--------|-------------|
| `aws` | AWS EC2, S3, RDS, Lambda integration |
| `vercel` | Vercel deployment & domain management |
| `database` | Advanced database management |
| `ai-gpt` | Extended AI capabilities |
| `monitoring` | Prometheus & Grafana setup |
| `security` | Advanced security scanning |
| `kubernetes` | K8s deployment & management |
| `terraform` | Infrastructure as Code |
| `cloudflare` | CDN & DNS management |
| `slack` | Deployment notifications |

```bash
dnpm plugin install aws
dnpm plugin install kubernetes
dnpm plugin list
```

## 💰 vs. The Competition

| | dnpm | Manual Setup |
|---|---|---|
| **Install** | 1 command | 10+ tools to install |
| **Deploy** | `dnpm deploy` | Dockerfile + compose + CI/CD + registry |
| **AI** | Built-in (5 providers) | Separate subscriptions |
| **Monitoring** | `dnpm monitor` | Prometheus + Grafana + AlertManager |
| **Security** | `dnpm security audit` | Snyk + OWASP + manual review |
| **Scaling** | `dnpm scale auto` | K8s HPA + metrics server + config |
| **Cost** | `dnpm cost analyze` | AWS Cost Explorer + spreadsheets |
| **Learning curve** | 30 seconds | Days to weeks |

## 📋 Requirements

- **Node.js** >= 18
- **Docker** (for deployment features)
- **Git** (recommended)
- **Ollama** (for free local AI — optional)

## 📄 License

MIT © dnpm

---

<div align="center">

**⚡ dnpm — One Command to Rule All DevOps**

[Install Now](#-quick-start) · [Documentation](docs/index.html) · [Report Bug](https://github.com/dnpm/dnpm/issues)

</div>
