import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import { join } from 'path';
import { banner, log, section } from './ui/logger.js';
import { ConfigManager } from './config/index.js';
import { AIProvider } from './ai/provider.js';
import { ProvisionEngine } from './engines/provision.js';
import { SetupEngine } from './engines/setup.js';
import { DeployEngine } from './engines/deploy.js';
import { AIDevEngine } from './engines/ai.js';
import { OpsEngine } from './engines/ops.js';
import { SecurityEngine } from './security/index.js';
import { RecoveryEngine } from './recovery/index.js';
import { PluginLoader } from './plugins/loader.js';
import { CloudManager, CostOptimizer } from './cloud/manager.js';
import { TerminalDashboard } from './ui/dashboard.js';
import { BackupEngine } from './engines/backup.js';
import { ScalingEngine } from './engines/scaling.js';
import { DNSManager } from './engines/dns.js';
import { EnvManager } from './engines/env.js';
import { TemplateEngine } from './engines/template.js';
import { setupWizard, listProviders } from './ai/setup.js';
import { askProjectType, askDeployConfig, askCloudConfig, askAIConfig, confirm } from './ui/prompts.js';

export function createCLI() {
  const program = new Command();

  program
    .name('dnpm')
    .description('⚡ dnpm — All-in-One Server Provisioning, Deployment, Operations & AI DevOps Platform')
    .version('1.2.0');

  // ===== INIT =====
  program
    .command('init [name]')
    .description('Initialize a new dnpm project with interactive setup')
    .option('--runtime <runtime>', 'Server runtime (node/python/go/rust)')
    .option('--db <database>', 'Database (postgres/mysql/mongo/redis/sqlite)')
    .option('--deploy <target>', 'Deploy target (docker/aws/digitalocean/gcp/vps)')
    .option('-y, --yes', 'Skip prompts, use defaults')
    .action(async (name, options) => {
      banner();
      section('Project Initialization');

      let config;
      if (options.yes) {
        config = {
          name: name || 'my-server',
          runtime: options.runtime || 'Node.js',
          database: options.db || 'None',
          deploy: options.deploy || 'Docker (local)',
          ci: 'GitHub Actions',
          ssl: true,
          monitoring: true,
          aiProvider: 'Ollama (local)',
        };
      } else {
        config = await askProjectType();
        if (name) config.name = name;
      }

      const projectDir = join(process.cwd(), config.name);
      await fs.ensureDir(projectDir);

      // Save project config
      const cm = new ConfigManager(projectDir);
      await cm.init();
      await cm.setProjectConfig({
        name: config.name,
        runtime: config.runtime,
        database: config.database,
        deploy: config.deploy,
        ci: config.ci,
        ssl: config.ssl,
        monitoring: config.monitoring,
        aiProvider: config.aiProvider,
        created: new Date().toISOString(),
      });

      // Generate project files
      const spinner = ora('Generating project structure...').start();

      // Dockerfile
      const deploy = new DeployEngine(projectDir);
      await deploy._generateDockerfile({ runtime: config.runtime });

      // Docker Compose
      const provision = new ProvisionEngine(projectDir);
      await provision._generateDockerCompose({
        runtime: config.runtime,
        database: config.database,
      });

      // Nginx config
      const setup = new SetupEngine(projectDir);
      await setup._generateNginxConfig({ domain: '_', port: 3000 });

      // CI/CD
      if (config.ci !== 'None') {
        await deploy.generateCI({ ci: config.ci });
      }

      // .dockerignore
      await fs.writeFile(join(projectDir, '.dockerignore'), `node_modules
npm-debug.log
.git
.env
.env.local
*.md
.github
`);

      // .gitignore
      await fs.writeFile(join(projectDir, '.gitignore'), `node_modules/
.env
.env.local
dist/
build/
*.log
.dnpm/
`);

      // .env.example
      await fs.writeFile(join(projectDir, '.env.example'), `NODE_ENV=production
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=app
DB_USER=app
DB_PASSWORD=changeme
# AI Provider API Keys
# DNPM_OPENAI_API_KEY=
# DNPM_CLAUDE_API_KEY=
# DNPM_GEMINI_API_KEY=
# DNPM_OPENROUTER_API_KEY=
`);

      spinner.succeed('Project structure generated');

      log(`\nProject created at ${chalk.cyan(projectDir)}`, 'success');
      log('Next steps:', 'info');
      console.log(chalk.gray(`
    cd ${config.name}
    dnpm deploy          # Deploy your app
    dnpm status          # Check system health
    dnpm ai mode         # Enter AI dev mode
    dnpm monitor         # Live monitoring
  `));
    });

  // ===== DEPLOY =====
  program
    .command('deploy')
    .description('Build, dockerize, and deploy your application')
    .option('-s, --strategy <strategy>', 'Deploy strategy (rolling/blue-green/canary/direct)')
    .option('--skip-tests', 'Skip running tests')
    .option('--tag <tag>', 'Docker image tag')
    .option('--registry <registry>', 'Docker registry URL')
    .option('--ci', 'Running in CI mode (non-interactive)')
    .action(async (options) => {
      banner();
      const deploy = new DeployEngine();
      await deploy.deploy(options);
    });

  // ===== STATUS =====
  program
    .command('status')
    .description('Show system health, container status, and metrics')
    .action(async () => {
      banner();
      const ops = new OpsEngine();
      await ops.status();
    });

  // ===== MONITOR =====
  program
    .command('monitor')
    .description('Live monitoring dashboard with real-time metrics')
    .option('-i, --interval <seconds>', 'Refresh interval', '5')
    .option('--ai', 'Enable AI-powered alerts')
    .action(async (options) => {
      const ops = new OpsEngine();
      await ops.monitor({ interval: parseInt(options.interval), aiAssist: options.ai });
    });

  // ===== DASHBOARD =====
  program
    .command('dashboard')
    .description('Full terminal dashboard with metrics, containers, and alerts')
    .option('-i, --interval <seconds>', 'Refresh interval', '5')
    .action(async (options) => {
      const dashboard = new TerminalDashboard();
      await dashboard.startLive(parseInt(options.interval));
    });

  // ===== LOGS =====
  program
    .command('logs')
    .description('Stream application and container logs')
    .option('-f, --follow', 'Follow log output')
    .option('-n, --tail <lines>', 'Number of lines', '100')
    .action(async (options) => {
      const ops = new OpsEngine();
      await ops.logs({ follow: options.follow, tail: options.tail });
    });

  // ===== AI COMMANDS =====
  const aiCmd = program
    .command('ai')
    .description('AI-powered development and operations');

  aiCmd
    .command('mode')
    .description('Enter interactive AI dev mode')
    .action(async () => {
      banner();
      const ai = new AIDevEngine();
      await ai.interactiveMode();
    });

  aiCmd
    .command('fix')
    .description('AI auto-detect and fix errors')
    .action(async () => {
      banner();
      const ai = new AIDevEngine();
      const result = await ai.autoFix();
      console.log(result);
    });

  aiCmd
    .command('ask <question...>')
    .description('Ask AI a question about your infrastructure')
    .action(async (question) => {
      const ai = new AIDevEngine();
      await ai.init();
      const spinner = ora('AI thinking...').start();
      const answer = await ai.processCommand(question.join(' '));
      spinner.stop();
      console.log(`\n${chalk.cyan('AI:')} ${answer}\n`);
    });

  aiCmd
    .command('generate <description...>')
    .description('Generate code with AI')
    .action(async (description) => {
      const provider = await AIProvider.create();
      const spinner = ora('Generating...').start();
      const code = await provider.generateCode(description.join(' '));
      spinner.stop();
      console.log(`\n${code}\n`);
    });

  aiCmd
    .command('security')
    .description('AI security audit')
    .action(async () => {
      banner();
      const ai = new AIDevEngine();
      const result = await ai.securityAudit('Full security audit of this project');
      console.log(result);
    });

  // ===== PROVISION =====
  program
    .command('provision')
    .description('Provision a new server instance')
    .option('-t, --target <target>', 'Target (docker/aws-ec2/digitalocean/gcp/vps/local)')
    .option('--name <name>', 'Server name')
    .option('--region <region>', 'Cloud region')
    .option('--size <size>', 'Instance size')
    .option('--host <host>', 'VPS host IP (for VPS target)')
    .option('--ai', 'Enable AI-assisted provisioning')
    .action(async (options) => {
      banner();
      const provision = new ProvisionEngine();
      await provision.provision({ ...options, aiAssist: options.ai });
    });

  // ===== SETUP =====
  program
    .command('setup')
    .description('Set up server software (runtime, DB, web server, SSL)')
    .option('--runtime <runtime>', 'Runtime to install')
    .option('--db <database>', 'Database to install')
    .option('--webserver <server>', 'Web server (nginx/caddy)')
    .option('--ssl', 'Setup SSL')
    .option('--domain <domain>', 'Domain for SSL')
    .action(async (options) => {
      banner();
      const setup = new SetupEngine();
      await setup.setup(options);
    });

  // ===== SECURITY =====
  const secCmd = program
    .command('security')
    .description('Security tools and audit');

  secCmd
    .command('audit')
    .description('Run full security audit')
    .action(async () => {
      banner();
      const sec = new SecurityEngine();
      await sec.fullAudit();
    });

  secCmd
    .command('firewall')
    .description('Configure firewall')
    .option('-p, --ports <ports...>', 'Additional ports to allow')
    .action(async (options) => {
      const sec = new SecurityEngine();
      await sec.setupFirewall({ additionalPorts: options.ports });
    });

  secCmd
    .command('ssh-keygen')
    .description('Generate SSH key pair')
    .option('-p, --path <path>', 'Key file path')
    .action(async (options) => {
      const sec = new SecurityEngine();
      await sec.generateSSHKey(options);
    });

  secCmd
    .command('harden')
    .description('Harden SSH configuration')
    .action(async () => {
      const sec = new SecurityEngine();
      await sec.hardenSSH();
    });

  secCmd
    .command('ddos')
    .description('Enable basic DDoS protection')
    .action(async () => {
      const sec = new SecurityEngine();
      await sec.ddosProtection();
    });

  // ===== SECRETS =====
  const secretsCmd = program
    .command('secrets')
    .description('Encrypted secrets vault');

  secretsCmd
    .command('set <key> <value>')
    .description('Store an encrypted secret')
    .option('-p, --password <password>', 'Master password')
    .action(async (key, value, options) => {
      const sec = new SecurityEngine();
      const password = options.password || await (await import('./ui/prompts.js')).input('Master password:');
      await sec.encryptSecret(key, value, password);
    });

  secretsCmd
    .command('get <key>')
    .description('Retrieve a decrypted secret')
    .option('-p, --password <password>', 'Master password')
    .action(async (key, options) => {
      const sec = new SecurityEngine();
      const password = options.password || await (await import('./ui/prompts.js')).input('Master password:');
      const value = await sec.decryptSecret(key, password);
      console.log(value);
    });

  secretsCmd
    .command('list')
    .description('List all secret keys')
    .action(async () => {
      const sec = new SecurityEngine();
      const keys = await sec.listSecrets();
      keys.forEach(k => console.log(`  ${chalk.cyan('●')} ${k}`));
    });

  // ===== RECOVERY =====
  const recoveryCmd = program
    .command('recovery')
    .description('Auto-healing and recovery tools');

  recoveryCmd
    .command('heal')
    .description('Run self-healing diagnostics and auto-fix')
    .action(async () => {
      banner();
      const recovery = new RecoveryEngine();
      await recovery.selfHeal();
    });

  recoveryCmd
    .command('rollback')
    .description('Rollback to last known good deployment')
    .action(async () => {
      banner();
      if (await confirm('Are you sure you want to rollback?')) {
        const recovery = new RecoveryEngine();
        await recovery.rollbackDeployment();
      }
    });

  recoveryCmd
    .command('watchdog')
    .description('Start self-healing watchdog daemon')
    .option('-i, --interval <seconds>', 'Check interval', '30')
    .action(async (options) => {
      const recovery = new RecoveryEngine();
      await recovery.startWatchdog({ interval: parseInt(options.interval) });
    });

  // ===== CLOUD =====
  const cloudCmd = program
    .command('cloud')
    .description('Cloud infrastructure management');

  cloudCmd
    .command('create')
    .description('Create full cloud deployment (server + DNS + SSL + CI/CD + monitoring)')
    .option('-p, --provider <provider>', 'Cloud provider')
    .action(async (options) => {
      banner();
      if (!options.provider) {
        const config = await askCloudConfig();
        Object.assign(options, config);
      }
      const cloud = new CloudManager();
      await cloud.create(options);
    });

  cloudCmd
    .command('destroy')
    .description('Destroy cloud resources')
    .action(async () => {
      if (await confirm('This will DESTROY all cloud resources. Continue?')) {
        const cloud = new CloudManager();
        await cloud.destroy();
      }
    });

  cloudCmd
    .command('providers')
    .description('List supported cloud providers')
    .action(async () => {
      const cloud = new CloudManager();
      await cloud.listProviders();
    });

  // ===== COST =====
  const costCmd = program
    .command('cost')
    .description('Cost analysis and optimization');

  costCmd
    .command('analyze')
    .description('Analyze infrastructure costs')
    .action(async () => {
      banner();
      const cost = new CostOptimizer();
      await cost.analyze();
    });

  costCmd
    .command('recommend')
    .description('AI-powered cheapest infrastructure recommendation')
    .action(async () => {
      banner();
      const cost = new CostOptimizer();
      await cost.recommend();
    });

  costCmd
    .command('optimize')
    .description('Auto-shutdown idle resources')
    .action(async () => {
      const cost = new CostOptimizer();
      await cost.autoShutdownIdle();
    });

  // ===== PLUGIN =====
  const pluginCmd = program
    .command('plugin')
    .description('Plugin management');

  pluginCmd
    .command('install <name>')
    .description('Install a plugin')
    .action(async (name) => {
      const loader = new PluginLoader();
      await loader.install(name);
    });

  pluginCmd
    .command('uninstall <name>')
    .description('Uninstall a plugin')
    .action(async (name) => {
      const loader = new PluginLoader();
      await loader.uninstall(name);
    });

  pluginCmd
    .command('list')
    .description('List installed plugins')
    .action(async () => {
      const loader = new PluginLoader();
      await loader.list();
    });

  // ===== CONFIG =====
  const configCmd = program
    .command('config')
    .description('Configuration management');

  configCmd
    .command('set-key <provider> <key>')
    .description('Set an API key for a provider (openai/claude/gemini/openrouter/aws/digitalocean)')
    .action(async (provider, key) => {
      const cm = new ConfigManager();
      await cm.setAPIKey(provider, key);
      log(`API key set for ${provider}`, 'success');
    });

  configCmd
    .command('set-ai <provider> [model]')
    .description('Set default AI provider and model')
    .action(async (provider, model) => {
      const cm = new ConfigManager();
      await cm.setAIProvider(provider, model || 'default');
      log(`AI provider set to ${provider}${model ? ` (model: ${model})` : ''}`, 'success');
    });

  configCmd
    .command('show')
    .description('Show current configuration')
    .action(async () => {
      const cm = new ConfigManager();
      const config = await cm.getConfig();
      // Redact API keys for display
      const display = JSON.parse(JSON.stringify(config));
      if (display.ai?.apiKeys) {
        for (const key of Object.keys(display.ai.apiKeys)) {
          const val = display.ai.apiKeys[key];
          if (val) display.ai.apiKeys[key] = val.slice(0, 4) + '****';
        }
      }
      console.log(JSON.stringify(display, null, 2));
    });

  configCmd
    .command('init')
    .description('Initialize global configuration')
    .action(async () => {
      const cm = new ConfigManager();
      await cm.init();
      log('Configuration initialized', 'success');
    });

  // ===== RESTART =====
  program
    .command('restart [service]')
    .description('Restart services')
    .action(async (service) => {
      const ops = new OpsEngine();
      await ops.restart(service);
    });

  // ===== OPS ANALYZE =====
  program
    .command('analyze')
    .description('AI-powered system analysis and recommendations')
    .action(async () => {
      banner();
      const ops = new OpsEngine();
      await ops.aiAnalyze();
    });

  // ===== CI/CD GENERATE =====
  program
    .command('ci')
    .description('Generate CI/CD pipeline')
    .option('-t, --type <type>', 'CI type (github/gitlab)', 'github')
    .action(async (options) => {
      const deploy = new DeployEngine();
      await deploy.generateCI({ ci: options.type });
    });

  // ===== VERSION INFO =====
  program
    .command('info')
    .description('Show dnpm system information')
    .action(async () => {
      banner();
      section('System Info');
      const cm = new ConfigManager();
      const config = await cm.getGlobalConfig();

      const { execa: exec } = await import('execa');
      let dockerVersion = 'not installed';
      try { dockerVersion = (await exec('docker', ['--version'])).stdout.split(',')[0]; } catch {}
      let nodeVersion = process.version;
      let gitVersion = 'not installed';
      try { gitVersion = (await exec('git', ['--version'])).stdout; } catch {}

      console.log(`  ${chalk.cyan('dnpm')}          v1.0.0`);
      console.log(`  ${chalk.cyan('Node.js')}       ${nodeVersion}`);
      console.log(`  ${chalk.cyan('Docker')}        ${dockerVersion}`);
      console.log(`  ${chalk.cyan('Git')}           ${gitVersion}`);
      console.log(`  ${chalk.cyan('AI Provider')}   ${config.ai?.provider || 'not set'}`);
      console.log(`  ${chalk.cyan('AI Model')}      ${config.ai?.model || 'not set'}`);
      console.log(`  ${chalk.cyan('Config Dir')}    ${cm.getConfigDir()}`);
      console.log(`  ${chalk.cyan('Plugins')}       ${(config.plugins || []).length} installed`);
      console.log('');
    });

  // ===== AI SETUP WIZARD =====
  program
    .command('setup-ai')
    .description('Interactive AI provider setup wizard (API keys, model selection)')
    .action(async () => {
      await setupWizard();
    });

  program
    .command('ai-providers')
    .description('List all AI providers and their status')
    .action(async () => {
      await listProviders();
    });

  // ===== BACKUP =====
  const backupCmd = program
    .command('backup')
    .description('Backup and restore management');

  backupCmd
    .command('create')
    .description('Create a full project backup')
    .option('-n, --name <name>', 'Backup name')
    .action(async (options) => {
      banner();
      const backup = new BackupEngine();
      await backup.createBackup({ name: options.name });
    });

  backupCmd
    .command('restore <id>')
    .description('Restore from a backup')
    .action(async (id) => {
      if (await confirm('Restore will overwrite current files. Continue?')) {
        const backup = new BackupEngine();
        await backup.restoreBackup(id);
      }
    });

  backupCmd
    .command('list')
    .description('List all backups')
    .action(async () => {
      const backup = new BackupEngine();
      await backup.listBackups();
    });

  backupCmd
    .command('delete <id>')
    .description('Delete a backup')
    .action(async (id) => {
      const backup = new BackupEngine();
      await backup.deleteBackup(id);
    });

  backupCmd
    .command('schedule')
    .description('Configure automatic backups')
    .option('-i, --interval <hours>', 'Backup interval in hours', '24')
    .option('-r, --retention <count>', 'Number of backups to keep', '7')
    .action(async (options) => {
      const backup = new BackupEngine();
      await backup.scheduleBackup({
        interval: parseInt(options.interval),
        retention: parseInt(options.retention),
      });
    });

  // ===== SCALING =====
  const scaleCmd = program
    .command('scale')
    .description('Scaling and load balancing');

  scaleCmd
    .command('up <service> <count>')
    .description('Scale a service to N replicas')
    .action(async (service, count) => {
      banner();
      const scaling = new ScalingEngine();
      await scaling.scaleContainers(service, parseInt(count));
    });

  scaleCmd
    .command('auto')
    .description('Enable AI-powered auto-scaling')
    .option('--cpu <percent>', 'CPU threshold', '80')
    .option('--memory <percent>', 'Memory threshold', '85')
    .action(async (options) => {
      const scaling = new ScalingEngine();
      await scaling.autoScale({
        cpuThreshold: parseInt(options.cpu),
        memThreshold: parseInt(options.memory),
      });
    });

  scaleCmd
    .command('loadbalance')
    .description('Generate load balancer configuration')
    .option('-p, --port <port>', 'Service port', '3000')
    .action(async (options) => {
      const scaling = new ScalingEngine();
      await scaling.loadBalance({ port: parseInt(options.port) });
    });

  scaleCmd
    .command('recommend')
    .description('AI scaling recommendations')
    .action(async () => {
      const scaling = new ScalingEngine();
      await scaling.aiRecommendScaling();
    });

  // ===== DNS =====
  const dnsCmd = program
    .command('dns')
    .description('DNS management');

  dnsCmd
    .command('set <domain> <ip>')
    .description('Configure DNS records')
    .option('-p, --provider <provider>', 'DNS provider (cloudflare/route53/digitalocean/manual)', 'manual')
    .option('-t, --type <type>', 'Record type (A/CNAME/MX/TXT)', 'A')
    .action(async (domain, ip, options) => {
      banner();
      const dns = new DNSManager();
      await dns.setupDNS({
        domain,
        ip,
        provider: options.provider,
        recordType: options.type,
      });
    });

  dnsCmd
    .command('status <domain>')
    .description('Check DNS status')
    .action(async (domain) => {
      const dns = new DNSManager();
      await dns.checkDNSStatus(domain);
    });

  // ===== ENVIRONMENT =====
  const envCmd = program
    .command('env')
    .description('Environment management (dev/staging/production)');

  envCmd
    .command('init')
    .description('Initialize environment files')
    .action(async () => {
      const env = new EnvManager();
      await env.init();
    });

  envCmd
    .command('switch <environment>')
    .description('Switch to an environment (development/staging/production)')
    .action(async (environment) => {
      const env = new EnvManager();
      await env.switchEnv(environment);
    });

  envCmd
    .command('show [environment]')
    .description('Show environment variables')
    .action(async (environment) => {
      const env = new EnvManager();
      await env.showEnv(environment || 'development');
    });

  envCmd
    .command('compare <env1> <env2>')
    .description('Compare two environments')
    .action(async (env1, env2) => {
      const env = new EnvManager();
      await env.compareEnvs(env1, env2);
    });

  envCmd
    .command('validate [environment]')
    .description('Validate environment configuration')
    .action(async (environment) => {
      const env = new EnvManager();
      await env.validate(environment || 'production');
    });

  // ===== TEMPLATE / SCAFFOLD =====
  const templateCmd = program
    .command('scaffold')
    .description('Project scaffolding and code generation');

  templateCmd
    .command('project [runtime]')
    .description('Scaffold a new project (node/python/go)')
    .option('-n, --name <name>', 'Project name')
    .action(async (runtime, options) => {
      banner();
      const tmpl = new TemplateEngine();
      await tmpl.scaffoldProject(runtime || 'node', options);
    });

  templateCmd
    .command('health [runtime]')
    .description('Generate health check endpoint (node/python/go)')
    .action(async (runtime) => {
      const tmpl = new TemplateEngine();
      await tmpl.generateHealthCheck(runtime || 'node');
    });

  templateCmd
    .command('generate <description>')
    .description('AI-generate code from a description')
    .action(async (description) => {
      const tmpl = new TemplateEngine();
      await tmpl.aiGenerate(description);
    });

  return program;
}
