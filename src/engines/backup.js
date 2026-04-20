import { execa } from 'execa';
import fs from 'fs-extra';
import { join } from 'path';
import ora from 'ora';
import chalk from 'chalk';
import { log, section } from '../ui/logger.js';
import { ConfigManager } from '../config/index.js';
import { AIProvider } from '../ai/provider.js';

export class BackupEngine {
  constructor(projectDir = process.cwd()) {
    this.projectDir = projectDir;
    this.config = new ConfigManager(projectDir);
    this.backupDir = join(this.config.getConfigDir(), 'backups');
  }

  async createBackup(options = {}) {
    section('Backup Engine');
    const spinner = ora('Creating backup...').start();

    try {
      await fs.ensureDir(this.backupDir);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const name = options.name || `backup-${timestamp}`;
      const backupPath = join(this.backupDir, name);
      await fs.ensureDir(backupPath);

      // Backup project files
      spinner.text = 'Backing up project files...';
      const filesToBackup = await this._getProjectFiles();
      for (const file of filesToBackup) {
        const dest = join(backupPath, 'files', file);
        await fs.ensureDir(join(dest, '..'));
        await fs.copy(join(this.projectDir, file), dest);
      }

      // Backup Docker volumes
      spinner.text = 'Backing up Docker volumes...';
      await this._backupDockerVolumes(backupPath);

      // Backup database
      if (options.database) {
        spinner.text = 'Backing up database...';
        await this._backupDatabase(backupPath, options);
      }

      // Backup config
      spinner.text = 'Backing up configuration...';
      const config = await this.config.getConfig();
      await fs.writeJson(join(backupPath, 'config.json'), config, { spaces: 2 });

      // Create manifest
      const manifest = {
        name,
        timestamp: new Date().toISOString(),
        projectDir: this.projectDir,
        files: filesToBackup.length,
        database: !!options.database,
        size: await this._getDirSize(backupPath),
      };
      await fs.writeJson(join(backupPath, 'manifest.json'), manifest, { spaces: 2 });

      spinner.succeed(`Backup created: ${chalk.cyan(name)}`);
      log(`Location: ${backupPath}`, 'info');
      log(`Files: ${filesToBackup.length}`, 'info');
      return manifest;
    } catch (err) {
      spinner.fail('Backup failed');
      throw err;
    }
  }

  async restoreBackup(name) {
    section('Restore Backup');
    const backupPath = join(this.backupDir, name);
    if (!await fs.pathExists(backupPath)) {
      throw new Error(`Backup not found: ${name}`);
    }

    const manifest = await fs.readJson(join(backupPath, 'manifest.json'));
    const spinner = ora(`Restoring backup: ${name}...`).start();

    try {
      // Restore files
      spinner.text = 'Restoring project files...';
      const filesDir = join(backupPath, 'files');
      if (await fs.pathExists(filesDir)) {
        await fs.copy(filesDir, this.projectDir, { overwrite: true });
      }

      // Restore config
      spinner.text = 'Restoring configuration...';
      const configPath = join(backupPath, 'config.json');
      if (await fs.pathExists(configPath)) {
        const config = await fs.readJson(configPath);
        await this.config.setProjectConfig(config);
      }

      // Restore database
      if (manifest.database) {
        spinner.text = 'Restoring database...';
        await this._restoreDatabase(backupPath);
      }

      spinner.succeed(`Backup restored: ${name}`);
      return manifest;
    } catch (err) {
      spinner.fail('Restore failed');
      throw err;
    }
  }

  async listBackups() {
    section('Backups');
    await fs.ensureDir(this.backupDir);
    const dirs = await fs.readdir(this.backupDir);
    const backups = [];

    for (const dir of dirs) {
      const manifestPath = join(this.backupDir, dir, 'manifest.json');
      if (await fs.pathExists(manifestPath)) {
        const manifest = await fs.readJson(manifestPath);
        backups.push(manifest);
      }
    }

    if (backups.length === 0) {
      log('No backups found.', 'info');
    } else {
      backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      for (const b of backups) {
        const date = new Date(b.timestamp).toLocaleString();
        console.log(`  ${chalk.cyan('●')} ${chalk.white(b.name.padEnd(40))} ${chalk.gray(date)} ${chalk.gray(`${b.files} files`)}`);
      }
    }

    return backups;
  }

  async deleteBackup(name) {
    const backupPath = join(this.backupDir, name);
    if (!await fs.pathExists(backupPath)) {
      throw new Error(`Backup not found: ${name}`);
    }
    await fs.remove(backupPath);
    log(`Backup deleted: ${name}`, 'success');
  }

  async scheduleBackup(intervalHours = 24) {
    log(`Auto-backup scheduled every ${intervalHours} hours`, 'info');
    const run = async () => {
      try {
        await this.createBackup({ name: `auto-${Date.now()}` });
        // Keep only last 7 auto-backups
        const backups = await this.listBackups();
        const autoBackups = backups.filter(b => b.name.startsWith('auto-'));
        if (autoBackups.length > 7) {
          for (const old of autoBackups.slice(7)) {
            await this.deleteBackup(old.name);
          }
        }
      } catch (err) {
        log(`Auto-backup failed: ${err.message}`, 'error');
      }
    };

    await run();
    setInterval(run, intervalHours * 3600 * 1000);
  }

  async _getProjectFiles() {
    const ignore = ['node_modules', '.git', 'dist', 'build', '.dnpm', 'backups'];
    const files = [];
    const walk = async (dir, prefix = '') => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (ignore.includes(entry.name)) continue;
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          await walk(join(dir, entry.name), rel);
        } else {
          files.push(rel);
        }
      }
    };
    await walk(this.projectDir);
    return files;
  }

  async _backupDockerVolumes(backupPath) {
    try {
      const volumeDir = join(backupPath, 'volumes');
      await fs.ensureDir(volumeDir);
      const result = await execa('docker', ['volume', 'ls', '--format', '{{.Name}}'], { stdio: 'pipe' });
      const volumes = result.stdout.split('\n').filter(v => v.includes('dnpm') || v.includes('app'));
      for (const vol of volumes) {
        if (!vol) continue;
        await execa('docker', [
          'run', '--rm', '-v', `${vol}:/data`, '-v', `${volumeDir}:/backup`,
          'alpine', 'tar', 'czf', `/backup/${vol}.tar.gz`, '-C', '/data', '.',
        ], { stdio: 'pipe' });
      }
    } catch { /* Docker not available or no volumes */ }
  }

  async _backupDatabase(backupPath, options = {}) {
    const dbDir = join(backupPath, 'database');
    await fs.ensureDir(dbDir);
    try {
      if (options.database === 'postgresql' || options.database === 'PostgreSQL') {
        await execa('docker', ['exec', 'dnpm-db', 'pg_dump', '-U', 'app', 'app'], {
          stdio: ['pipe', fs.createWriteStream(join(dbDir, 'dump.sql')), 'pipe'],
        });
      } else if (options.database === 'mysql' || options.database === 'MySQL') {
        await execa('docker', ['exec', 'dnpm-db', 'mysqldump', '-u', 'root', 'app'], {
          stdio: ['pipe', fs.createWriteStream(join(dbDir, 'dump.sql')), 'pipe'],
        });
      } else if (options.database === 'mongodb' || options.database === 'MongoDB') {
        await execa('docker', ['exec', 'dnpm-db', 'mongodump', '--archive'], {
          stdio: ['pipe', fs.createWriteStream(join(dbDir, 'dump.archive')), 'pipe'],
        });
      }
    } catch { /* DB backup failed silently */ }
  }

  async _restoreDatabase(backupPath) {
    const dbDir = join(backupPath, 'database');
    if (!await fs.pathExists(dbDir)) return;
    try {
      const dumpFile = join(dbDir, 'dump.sql');
      if (await fs.pathExists(dumpFile)) {
        await execa('docker', ['exec', '-i', 'dnpm-db', 'psql', '-U', 'app', 'app'], {
          input: await fs.readFile(dumpFile, 'utf-8'),
        });
      }
    } catch { /* restore failed */ }
  }

  async _getDirSize(dir) {
    let size = 0;
    const walk = async (d) => {
      const entries = await fs.readdir(d, { withFileTypes: true });
      for (const e of entries) {
        const p = join(d, e.name);
        if (e.isDirectory()) await walk(p);
        else {
          const stat = await fs.stat(p);
          size += stat.size;
        }
      }
    };
    await walk(dir);
    return size;
  }
}
