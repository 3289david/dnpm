import chalk from 'chalk';

const BANNER = `
${chalk.cyan.bold('╔══════════════════════════════════════════════════╗')}
${chalk.cyan.bold('║')}  ${chalk.white.bold('⚡ dnpm')} ${chalk.gray('— All-in-One DevOps AI Platform')}       ${chalk.cyan.bold('║')}
${chalk.cyan.bold('║')}  ${chalk.gray('npm + Docker + Vercel + AWS + AI = dnpm')}         ${chalk.cyan.bold('║')}
${chalk.cyan.bold('╚══════════════════════════════════════════════════╝')}
`;

const COLORS = {
  primary: chalk.cyan,
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  info: chalk.blue,
  dim: chalk.gray,
  bold: chalk.bold,
  highlight: chalk.magenta,
};

function log(msg, level = 'info') {
  const prefix = {
    info: chalk.blue('ℹ'),
    success: chalk.green('✔'),
    warning: chalk.yellow('⚠'),
    error: chalk.red('✖'),
    deploy: chalk.cyan('🚀'),
    ai: chalk.magenta('🧠'),
    server: chalk.yellow('⚙'),
    monitor: chalk.green('📡'),
    security: chalk.red('🔐'),
    cost: chalk.yellow('💰'),
    plugin: chalk.cyan('🧩'),
  };
  const icon = prefix[level] || prefix.info;
  console.log(`  ${icon} ${msg}`);
}

function banner() {
  console.log(BANNER);
}

function section(title) {
  console.log(`\n  ${chalk.cyan.bold('━━━')} ${chalk.white.bold(title)} ${chalk.cyan.bold('━━━')}\n`);
}

function table(rows) {
  const maxKey = Math.max(...rows.map(r => r[0].length));
  rows.forEach(([key, val]) => {
    console.log(`  ${chalk.gray(key.padEnd(maxKey + 2))} ${val}`);
  });
}

function box(title, lines) {
  const maxLen = Math.max(title.length, ...lines.map(l => l.length)) + 4;
  const hr = '─'.repeat(maxLen);
  console.log(chalk.gray(`  ┌${hr}┐`));
  console.log(chalk.gray('  │') + chalk.bold(` ${title.padEnd(maxLen - 1)}`) + chalk.gray('│'));
  console.log(chalk.gray(`  ├${hr}┤`));
  lines.forEach(line => {
    console.log(chalk.gray('  │') + ` ${line.padEnd(maxLen - 1)}` + chalk.gray('│'));
  });
  console.log(chalk.gray(`  └${hr}┘`));
}

function progressBar(current, total, width = 30) {
  const ratio = current / total;
  const filled = Math.round(width * ratio);
  const empty = width - filled;
  const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  const pct = Math.round(ratio * 100);
  return `${bar} ${pct}%`;
}

export { log, banner, section, table, box, progressBar, COLORS, BANNER };
