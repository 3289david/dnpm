#!/usr/bin/env node

/**
 * dnpm — All-in-one server provisioning, deployment, operations & AI DevOps platform
 * "Say it, and the server is built. Errors? AI fixes them. Deploy? Automatic. Ops? Automatic."
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  try {
    const { createCLI } = await import('../src/cli.js');
    const program = createCLI();
    await program.parseAsync(process.argv);
  } catch (err) {
    console.error('\x1b[31m[dnpm] Fatal error:\x1b[0m', err.message);
    if (process.env.DNPM_DEBUG === '1') {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

main();
