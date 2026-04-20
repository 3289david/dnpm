import fs from 'fs-extra';
import { join } from 'path';
import ora from 'ora';
import chalk from 'chalk';
import { log, section } from '../ui/logger.js';
import { AIProvider } from '../ai/provider.js';
import { execa } from 'execa';

export class AIDevEngine {
  constructor(projectDir = process.cwd()) {
    this.projectDir = projectDir;
    this.ai = null;
  }

  async init() {
    this.ai = await AIProvider.create();
  }

  async interactiveMode() {
    section('AI Dev Mode');
    log('AI Dev Mode active. Type your commands in natural language.', 'ai');
    log('Type "exit" to leave AI mode.\n', 'info');

    const { createInterface } = await import('readline');
    const rl = createInterface({ input: process.stdin, output: process.stdout });

    await this.init();

    const askQuestion = () => {
      rl.question(chalk.magenta('\n🧠 dnpm ai > '), async (input) => {
        if (input.toLowerCase() === 'exit') {
          log('Exiting AI mode.', 'info');
          rl.close();
          return;
        }

        const spinner = ora('AI thinking...').start();
        try {
          const response = await this.processCommand(input);
          spinner.stop();
          console.log(`\n${chalk.cyan('AI:')} ${response}\n`);
        } catch (err) {
          spinner.fail(`Error: ${err.message}`);
        }
        askQuestion();
      });
    };

    askQuestion();
  }

  async processCommand(command) {
    if (!this.ai) await this.init();

    const lowerCmd = command.toLowerCase();

    if (lowerCmd.includes('create api') || lowerCmd.includes('make api') || lowerCmd.includes('build api')) {
      return this.generateAPI(command);
    }
    if (lowerCmd.includes('fix') || lowerCmd.includes('error') || lowerCmd.includes('debug')) {
      return this.fixError(command);
    }
    if (lowerCmd.includes('structure') || lowerCmd.includes('architecture') || lowerCmd.includes('recommend')) {
      return this.suggestArchitecture(command);
    }
    if (lowerCmd.includes('scale') || lowerCmd.includes('scaling') || lowerCmd.includes('traffic')) {
      return this.handleScaling(command);
    }
    if (lowerCmd.includes('security') || lowerCmd.includes('secure') || lowerCmd.includes('vulnerability')) {
      return this.securityAudit(command);
    }
    if (lowerCmd.includes('database') || lowerCmd.includes('schema') || lowerCmd.includes('db')) {
      return this.generateDBSchema(command);
    }
    if (lowerCmd.includes('deploy') || lowerCmd.includes('deployment')) {
      return this.assistDeploy(command);
    }

    return this.ai.prompt(command);
  }

  async generateAPI(description) {
    log('Generating API...', 'ai');
    const code = await this.ai.prompt(
      `Generate a complete REST API based on this description: ${description}. 
       Include routes, controllers, error handling, and validation. 
       Use Express.js for Node.js. Include the full file content.`,
      { system: 'You are an expert API developer. Generate production-ready REST APIs with proper structure, validation, error handling, and documentation.' }
    );

    const apiDir = join(this.projectDir, 'src', 'api');
    await fs.ensureDir(apiDir);

    const filePath = join(apiDir, 'generated-api.js');
    await fs.writeFile(filePath, code);
    log(`API generated at ${filePath}`, 'success');
    return `API generated at ${filePath}\n\n${code}`;
  }

  async fixError(errorDescription) {
    log('Analyzing error...', 'ai');

    let errorContext = errorDescription;
    const logDir = join(this.projectDir, 'logs');
    if (await fs.pathExists(logDir)) {
      const logFiles = await fs.readdir(logDir);
      if (logFiles.length > 0) {
        const latestLog = logFiles.sort().pop();
        const logContent = await fs.readFile(join(logDir, latestLog), 'utf-8');
        errorContext += `\n\nRecent logs:\n${logContent.slice(-2000)}`;
      }
    }

    try {
      const result = await execa('docker', ['compose', 'logs', '--tail=50'], {
        cwd: this.projectDir,
        stdio: 'pipe',
      });
      errorContext += `\n\nDocker logs:\n${result.stdout}`;
    } catch { /* no docker logs */ }

    const fix = await this.ai.prompt(
      `Fix this error:\n\n${errorContext}`,
      { system: 'You are a debugging expert. Analyze errors and provide step-by-step fixes with exact code changes.' }
    );

    return fix;
  }

  async suggestArchitecture(requirements) {
    log('Analyzing architecture...', 'ai');

    let projectContext = '';
    const pkgPath = join(this.projectDir, 'package.json');
    if (await fs.pathExists(pkgPath)) {
      const pkg = await fs.readJson(pkgPath);
      projectContext = `\nCurrent project: ${JSON.stringify(pkg, null, 2)}`;
    }

    return this.ai.prompt(
      `Suggest optimal server architecture for: ${requirements}${projectContext}`,
      { system: 'You are a cloud architect. Suggest scalable, cost-effective architectures with specific service recommendations.' }
    );
  }

  async handleScaling(description) {
    log('Planning scaling strategy...', 'ai');
    return this.ai.prompt(
      `Create an auto-scaling plan for: ${description}`,
      { system: 'You are a DevOps scaling expert. Provide concrete scaling configurations for Docker, K8s, or cloud services.' }
    );
  }

  async securityAudit(context) {
    log('Running security audit...', 'ai');

    let files = '';
    const dockerfilePath = join(this.projectDir, 'Dockerfile');
    if (await fs.pathExists(dockerfilePath)) {
      files += `\nDockerfile:\n${await fs.readFile(dockerfilePath, 'utf-8')}`;
    }
    const composePath = join(this.projectDir, 'docker-compose.yml');
    if (await fs.pathExists(composePath)) {
      files += `\ndocker-compose.yml:\n${await fs.readFile(composePath, 'utf-8')}`;
    }
    const nginxPath = join(this.projectDir, 'nginx.conf');
    if (await fs.pathExists(nginxPath)) {
      files += `\nnginx.conf:\n${await fs.readFile(nginxPath, 'utf-8')}`;
    }

    return this.ai.prompt(
      `Perform a security audit: ${context}\n\nProject files:${files}`,
      { system: 'You are a security expert. Find vulnerabilities and provide fixes with OWASP Top 10 categories.' }
    );
  }

  async generateDBSchema(description) {
    log('Generating database schema...', 'ai');
    return this.ai.prompt(
      `Generate a database schema for: ${description}. 
       Include CREATE TABLE statements, indexes, constraints, and seed data.`,
      { system: 'You are a database expert. Generate optimized schemas with proper normalization, indexes, and constraints.' }
    );
  }

  async assistDeploy(description) {
    log('AI-assisted deployment planning...', 'ai');
    return this.ai.prompt(
      `Plan a deployment for: ${description}. 
       Include Dockerfile, docker-compose, nginx config, and CI/CD pipeline.`,
      { system: 'You are a deployment expert. Provide complete deployment configs with zero-downtime strategies.' }
    );
  }

  async autoFix() {
    section('AI Auto-Fix');
    log('Scanning for issues...', 'ai');

    await this.init();

    let issues = [];

    try {
      const dockerLogs = await execa('docker', ['compose', 'logs', '--tail=100'], {
        cwd: this.projectDir,
        stdio: 'pipe',
      });
      if (dockerLogs.stdout.includes('error') || dockerLogs.stdout.includes('Error')) {
        issues.push({ type: 'docker', logs: dockerLogs.stdout });
      }
    } catch { /* no docker */ }

    try {
      if (await fs.pathExists(join(this.projectDir, 'package.json'))) {
        const result = await execa('npm', ['audit', '--json'], {
          cwd: this.projectDir,
          stdio: 'pipe',
        });
        const audit = JSON.parse(result.stdout);
        if (audit.metadata?.vulnerabilities) {
          issues.push({ type: 'npm-audit', data: audit });
        }
      }
    } catch { /* no npm */ }

    if (issues.length === 0) {
      log('No issues found!', 'success');
      return 'No issues detected.';
    }

    log(`Found ${issues.length} issue(s). Getting AI fixes...`, 'warning');
    const fixes = await this.ai.prompt(
      `Fix these server issues:\n${JSON.stringify(issues, null, 2)}`,
      { system: 'You are a DevOps expert. Provide exact commands and code to fix each issue.' }
    );

    return fixes;
  }
}
