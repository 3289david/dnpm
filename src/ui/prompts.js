import Enquirer from 'enquirer';
import chalk from 'chalk';

const enquirer = new Enquirer();

export async function askProjectType() {
  const response = await enquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: chalk.cyan('Project name:'),
      initial: 'my-server',
    },
    {
      type: 'select',
      name: 'runtime',
      message: chalk.cyan('Server runtime:'),
      choices: ['Node.js', 'Python', 'Go', 'Rust', 'Fullstack (Node + React)'],
    },
    {
      type: 'select',
      name: 'database',
      message: chalk.cyan('Database:'),
      choices: ['PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'SQLite', 'None'],
    },
    {
      type: 'select',
      name: 'deploy',
      message: chalk.cyan('Deployment target:'),
      choices: ['Docker (local)', 'AWS EC2', 'DigitalOcean', 'GCP', 'Railway', 'Fly.io', 'VPS (SSH)'],
    },
    {
      type: 'select',
      name: 'ci',
      message: chalk.cyan('CI/CD pipeline:'),
      choices: ['GitHub Actions', 'GitLab CI', 'None'],
    },
    {
      type: 'confirm',
      name: 'ssl',
      message: chalk.cyan('Auto SSL (Let\'s Encrypt)?'),
      initial: true,
    },
    {
      type: 'confirm',
      name: 'monitoring',
      message: chalk.cyan('Enable monitoring & alerts?'),
      initial: true,
    },
    {
      type: 'select',
      name: 'aiProvider',
      message: chalk.cyan('AI provider for smart ops:'),
      choices: ['Ollama (local)', 'OpenAI (GPT)', 'Claude (Anthropic)', 'Gemini (Google)', 'OpenRouter', 'None'],
    },
  ]);
  return response;
}

export async function askDeployConfig() {
  return enquirer.prompt([
    {
      type: 'select',
      name: 'strategy',
      message: chalk.cyan('Deployment strategy:'),
      choices: ['Rolling', 'Blue-Green', 'Canary', 'Direct'],
    },
    {
      type: 'confirm',
      name: 'zeroDowntime',
      message: chalk.cyan('Zero-downtime deployment?'),
      initial: true,
    },
    {
      type: 'confirm',
      name: 'autoRollback',
      message: chalk.cyan('Auto-rollback on failure?'),
      initial: true,
    },
  ]);
}

export async function askCloudConfig() {
  return enquirer.prompt([
    {
      type: 'select',
      name: 'provider',
      message: chalk.cyan('Cloud provider:'),
      choices: ['AWS', 'DigitalOcean', 'GCP', 'Azure', 'Fly.io', 'Railway'],
    },
    {
      type: 'select',
      name: 'region',
      message: chalk.cyan('Region:'),
      choices: ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-northeast-1', 'ap-southeast-1'],
    },
    {
      type: 'select',
      name: 'size',
      message: chalk.cyan('Instance size:'),
      choices: ['micro (1 vCPU, 1GB)', 'small (2 vCPU, 2GB)', 'medium (2 vCPU, 4GB)', 'large (4 vCPU, 8GB)'],
    },
  ]);
}

export async function askAIConfig() {
  return enquirer.prompt([
    {
      type: 'select',
      name: 'provider',
      message: chalk.cyan('AI provider:'),
      choices: ['ollama', 'openai', 'claude', 'gemini', 'openrouter'],
    },
    {
      type: 'input',
      name: 'apiKey',
      message: chalk.cyan('API key (leave blank for Ollama):'),
    },
    {
      type: 'input',
      name: 'model',
      message: chalk.cyan('Model name:'),
      initial: 'llama3',
    },
  ]);
}

export async function confirm(message) {
  const { ok } = await enquirer.prompt({
    type: 'confirm',
    name: 'ok',
    message: chalk.yellow(message),
  });
  return ok;
}

export async function input(message, initial = '') {
  const { value } = await enquirer.prompt({
    type: 'input',
    name: 'value',
    message: chalk.cyan(message),
    initial,
  });
  return value;
}
