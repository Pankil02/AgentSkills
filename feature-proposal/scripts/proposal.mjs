#!/usr/bin/env node
// @ts-check
/**
 * @file CLI Router for feature planning proposal operations (check, compile, view).
 * Standalone native Node.js executable (no dependencies).
 */

import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { realpathSync } from 'node:fs';
import { readBundle, writeExport } from './files.mjs';
import { compileBundle } from './format.mjs';

const HELP_TEXT = `
feature-proposal CLI

Usage:
  node proposal.mjs check --plan <path> [--json]
  node proposal.mjs compile --plan <path> [--out <file>] [--force]
  node proposal.mjs view --plan <path> [--port <number>] [--no-open]
  node proposal.mjs --help

Commands:
  check     Validates the proposal bundle and reports diagnostics
  compile   Emits derived JSON AST to stdout or an atomic export file
  view      Launches the local loopback browser proposal viewer

Options:
  --plan <path>     Path to proposal.md (required for all operations)
  --json            Output machine-readable JSON envelope (check command)
  --out <file>      Destination path for compiled JSON export
  --force           Overwrite existing export file
  --port <number>   Loopback HTTP port (default: 4317, 0 for ephemeral)
  --no-open         Do not launch the browser automatically
  -h, --help        Show this help message
`;

/**
 * Runs the CLI command.
 * @param {string[]} argv
 * @param {{ stdout?: NodeJS.WriteStream | { write(s: string): void }; stderr?: NodeJS.WriteStream | { write(s: string): void } }} [io]
 * @returns {Promise<number>} Exit code (0 = success, 1 = failure, 2 = usage error)
 */
export async function runCli(argv, io = {}) {
  const out = io.stdout || process.stdout;
  const err = io.stderr || process.stderr;

  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    out.write(HELP_TEXT.trim() + '\n');
    return 0;
  }

  const command = argv[0];
  const commandArgs = argv.slice(1);

  if (!['check', 'compile', 'view'].includes(command)) {
    err.write(`Unknown command "${command}". Use --help for available commands.\n`);
    return 2;
  }

  try {
    const { values } = parseArgs({
      args: commandArgs,
      options: {
        plan: { type: 'string' },
        json: { type: 'boolean', default: false },
        out: { type: 'string' },
        force: { type: 'boolean', default: false },
        port: { type: 'string' },
        'no-open': { type: 'boolean', default: false }
      },
      strict: true,
      allowPositionals: false
    });

    if (!values.plan) {
      err.write(`Error: Missing required option --plan <path> for command "${command}".\n`);
      return 2;
    }

    const planPath = values.plan;

    // Load bundle
    const bundle = await readBundle(planPath);
    const compileResult = compileBundle(bundle);

    if (command === 'check') {
      const errors = compileResult.diagnostics.filter((d) => d.severity === 'error');
      const warnings = compileResult.diagnostics.filter((d) => d.severity === 'warning');

      if (values.json) {
        const payload = {
          schemaVersion: 1,
          valid: errors.length === 0,
          version: compileResult.value ? compileResult.value.version : null,
          diagnostics: compileResult.diagnostics
        };
        out.write(JSON.stringify(payload, null, 2) + '\n');
        return errors.length === 0 ? 0 : 1;
      }

      out.write(`\n🔍 Checking proposal bundle: "${planPath}"\n`);
      if (errors.length === 0 && warnings.length === 0) {
        out.write(`✅ Proposal is valid. Version: ${compileResult.value?.version.slice(0, 12)}\n`);
        return 0;
      }

      if (warnings.length > 0) {
        out.write(`\n⚠️  Warnings (${warnings.length}):\n`);
        for (const w of warnings) {
          out.write(`  [${w.code}] ${w.documentId}${w.line ? `:${w.line}` : ''}: ${w.message}\n`);
        }
      }

      if (errors.length > 0) {
        out.write(`\n❌ Errors (${errors.length}):\n`);
        for (const e of errors) {
          out.write(`  [${e.code}] ${e.documentId}${e.line ? `:${e.line}` : ''}: ${e.message}\n`);
        }
        return 1;
      }

      return 0;
    }

    if (command === 'compile') {
      const errors = compileResult.diagnostics.filter((d) => d.severity === 'error');
      if (errors.length > 0 || !compileResult.value) {
        err.write(`Cannot compile: Proposal contains ${errors.length} validation errors.\n`);
        for (const e of errors) {
          err.write(`  [${e.code}] ${e.documentId}${e.line ? `:${e.line}` : ''}: ${e.message}\n`);
        }
        return 1;
      }

      const jsonStr = JSON.stringify(compileResult.value, null, 2);

      if (values.out) {
        const proposalDir = dirname(resolve(process.cwd(), planPath));
        const skillDir = dirname(dirname(fileURLToPath(import.meta.url)));

        await writeExport(values.out, jsonStr, {
          force: values.force,
          forbiddenPaths: [proposalDir, skillDir]
        });
        out.write(`Successfully exported compiled proposal to "${values.out}".\n`);
        return 0;
      }

      out.write(jsonStr + '\n');
      return 0;
    }

    if (command === 'view') {
      // Lazy load server module
      const serverModule = await import('./server.mjs');
      let portNum;
      if (values.port !== undefined) {
        try {
          portNum = serverModule.validatePort(values.port);
        } catch {
          err.write(`Error: Invalid port "${values.port}". Port must be an integer between 0 and 65535.\n`);
          return 2;
        }
      }

      const viewer = await serverModule.startViewer({
        planPath,
        port: portNum
      });

      const targetUrl = `${viewer.origin}/`;
      out.write(`\n🚀 Proposal viewer active on:\n${targetUrl}\n\nPress Ctrl+C to stop the server.\n`);

      if (!values['no-open']) {
        try {
          const { spawn } = await import('node:child_process');
          const platform = process.platform;
          let cmd = 'open';
          let args = [targetUrl];
          if (platform === 'win32') {
            cmd = 'cmd.exe';
            args = ['/c', 'start', '""', targetUrl];
          } else if (platform !== 'darwin') {
            cmd = 'xdg-open';
            args = [targetUrl];
          }
          const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
          child.unref();
          child.on('error', () => {
            out.write('Could not launch browser automatically. Open the URL above manually.\n');
          });
        } catch {
          out.write('Could not launch browser automatically. Open the URL above manually.\n');
        }
      }

      // Keep alive until SIGINT or SIGTERM with idempotent shutdown
      await new Promise((resolveShutdown) => {
        let shuttingDown = false;
        const shutdown = async () => {
          if (shuttingDown) return;
          shuttingDown = true;
          process.removeListener('SIGINT', shutdown);
          process.removeListener('SIGTERM', shutdown);
          out.write('\nShutting down viewer server...\n');
          try {
            await viewer.close();
          } finally {
            resolveShutdown(null);
          }
        };
        process.once('SIGINT', shutdown);
        process.once('SIGTERM', shutdown);
      });

      return 0;
    }

    return 0;
  } catch (error) {
    err.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    if (error && typeof error === 'object' && 'code' in error && String(error.code).startsWith('ERR_PARSE_ARGS_')) {
      return 2;
    }
    return 1;
  }
}

// Direct execution entrypoint guard
const isMainModule = () => {
  try {
    if (!process.argv[1]) return false;
    const thisFile = fileURLToPath(import.meta.url);
    const scriptArg = resolve(process.argv[1]);
    if (thisFile === scriptArg) return true;
    try {
      return realpathSync(thisFile) === realpathSync(scriptArg);
    } catch {
      return false;
    }
  } catch {
    return false;
  }
};

if (isMainModule()) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exit(code);
  });
}
