#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import pc from 'picocolors';
import { AGENT_REGISTRY, getAgent } from '../src/agents.js';
import { discoverSkills } from '../src/discovery.js';
import { runDoctor, printDoctorReport } from '../src/doctor.js';
import { executeInstall, runInteractiveWizard, removeSingleSkill } from '../src/installer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const HELP_TEXT = `
${pc.bold(pc.cyan('🧠 AgentSkills CLI'))} - Enterprise Installer for AI Coding Agent Skills

${pc.bold('USAGE:')}
  $ ${pc.green('npx @pankil/agent-skills')} [command] [options]
  $ ${pc.green('agent-skills')} [command] [options]

${pc.bold('COMMANDS:')}
  ${pc.cyan('install, add')} [skills...]   Install skills (interactive if no flags provided)
  ${pc.cyan('list, ls')}                 List all available skills in this repository
  ${pc.cyan('doctor, check')}            Run system diagnostics & verify agent environments
  ${pc.cyan('validate')}                 Validate all SKILL.md files against schema
  ${pc.cyan('uninstall, remove')}        Remove skills from target agent directory
  ${pc.cyan('help')}                     Show this help documentation

${pc.bold('OPTIONS:')}
  ${pc.yellow('--scope')} <project|global> Installation scope (default: project)
  ${pc.yellow('--target')} <agent>         Target agent (${AGENT_REGISTRY.map(a => a.id).join(', ')}, all)
  ${pc.yellow('-s, --symlink')}            Use symbolic links (auto-updates with git pull)
  ${pc.yellow('--copy')}                   Copy files instead of symlinking
  ${pc.yellow('-y, --yes')}                Non-interactive auto-confirm (for CI/CD)
  ${pc.yellow('--dry-run')}                Simulate installation without writing to disk
  ${pc.yellow('--json')}                   Output results in machine-readable JSON format
  ${pc.yellow('--backup')}                 Create timestamped backup if skill already exists

${pc.bold('EXAMPLES:')}
  $ ${pc.dim('# Interactive wizard (recommended):')}
  $ npx @pankil/agent-skills

  $ ${pc.dim('# Install all skills to Google Antigravity & Gemini with symlinks:')}
  $ npx @pankil/agent-skills install all --target antigravity --symlink -y

  $ ${pc.dim('# Install to current project workspace (.agents/skills):')}
  $ npx @pankil/agent-skills install --scope project --symlink -y

  $ ${pc.dim('# Run diagnostics:')}
  $ npx @pankil/agent-skills doctor
`;

async function main() {
  const rawArgs = process.argv.slice(2);

  const { positionals, values } = parseArgs({
    args: rawArgs,
    allowPositionals: true,
    strict: false,
    options: {
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
      scope: { type: 'string' },
      target: { type: 'string', short: 't' },
      symlink: { type: 'boolean', short: 's' },
      copy: { type: 'boolean' },
      yes: { type: 'boolean', short: 'y' },
      'dry-run': { type: 'boolean' },
      json: { type: 'boolean' },
      backup: { type: 'boolean' },
      local: { type: 'boolean' },
      global: { type: 'boolean', short: 'g' }
    }
  });

  if (values.help || positionals[0] === 'help') {
    console.log(HELP_TEXT);
    return;
  }

  if (values.version || positionals[0] === 'version') {
    console.log('1.1.0');
    return;
  }

  const command = positionals[0] || 'install';

  // 1. LIST COMMAND
  if (command === 'list' || command === 'ls') {
    const skills = discoverSkills(REPO_ROOT);
    if (values.json) {
      console.log(JSON.stringify(skills, null, 2));
      return;
    }

    console.log(pc.bold(pc.cyan('\n📦 Available Agent Skills:\n')));
    for (const s of skills) {
      const validBadge = s.isValid ? pc.green('✓ Valid') : pc.red('✗ Invalid');
      console.log(`  • ${pc.bold(s.name)} ${pc.dim(`(v${s.version})`)} [${validBadge}]`);
      console.log(`    ${pc.dim(s.description)}`);
      if (s.tags.length > 0) {
        console.log(`    ${pc.dim('Tags:')} ${s.tags.map(t => pc.cyan(`#${t}`)).join(' ')}`);
      }
      console.log();
    }
    return;
  }

  // 2. DOCTOR COMMAND
  if (command === 'doctor' || command === 'check') {
    const report = runDoctor({ repoRoot: REPO_ROOT });
    if (values.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printDoctorReport(report);
    }
    process.exit(report.healthy ? 0 : 1);
  }

  // 3. VALIDATE COMMAND
  if (command === 'validate') {
    const skills = discoverSkills(REPO_ROOT);
    let hasError = false;

    console.log(pc.bold(pc.cyan('\n🔍 Validating SKILL.md Frontmatter Schemas...\n')));
    for (const s of skills) {
      if (s.isValid) {
        console.log(`  ${pc.green('✓')} ${pc.bold(s.name)} - Passed schema validation`);
      } else {
        hasError = true;
        console.log(`  ${pc.red('✗')} ${pc.bold(s.name)} - Failed schema validation:`);
        for (const err of s.errors) {
          console.log(`    ${pc.red('└─')} ${err.message}`);
        }
      }
    }

    if (hasError) {
      console.log(pc.red(pc.bold('\n❌ Validation failed. Please fix schema errors above.\n')));
      process.exit(1);
    } else {
      console.log(pc.green(pc.bold('\n✅ All skills passed schema validation!\n')));
      process.exit(0);
    }
  }

  // 4. UNINSTALL COMMAND
  if (command === 'uninstall' || command === 'remove') {
    const skillsToRemove = positionals.slice(1);
    if (skillsToRemove.length === 0) {
      console.error(pc.red('Error: Please specify one or more skills to remove.'));
      process.exit(1);
    }

    const targetAgentId = values.target || 'universal';
    const agent = getAgent(targetAgentId);
    if (!agent) {
      console.error(pc.red(`Error: Unknown agent target "${targetAgentId}".`));
      process.exit(1);
    }

    const scope = values.global ? 'global' : (values.scope || 'project');
    const destDir = scope === 'project' ? agent.resolveProjectPath() : agent.resolveGlobalPath();

    let removed = 0;
    for (const skill of skillsToRemove) {
      if (removeSingleSkill(skill, destDir)) {
        console.log(pc.green(`✓ Removed "${skill}" from ${destDir}`));
        removed++;
      } else {
        console.log(pc.yellow(`⚠️ Skill "${skill}" was not found in ${destDir}`));
      }
    }

    console.log(pc.bold(`\nFinished. Removed ${removed} skill(s).\n`));
    return;
  }

  // 5. INSTALL / ADD COMMAND
  if (command === 'install' || command === 'add') {
    const requestedSkills = positionals.slice(command === 'install' || command === 'add' ? 1 : 0);

    // If no specific flags or positional arguments provided AND running in an interactive TTY, launch Wizard
    const isInteractive = !values.yes && !values.json && process.stdout.isTTY &&
      requestedSkills.length === 0 && !values.target && !values.scope;

    if (isInteractive) {
      await runInteractiveWizard({ repoRoot: REPO_ROOT, cwd: process.cwd() });
      return;
    }

    // Headless / Non-Interactive Execution
    const scope = values.global ? 'global' : (values.local ? 'project' : (values.scope || 'global'));
    const method = values.copy ? 'copy' : 'symlink';

    let targets = ['universal'];
    if (values.target) {
      if (values.target.toLowerCase() === 'all') {
        targets = AGENT_REGISTRY.map(a => a.id);
      } else {
        targets = values.target.split(',').map(t => t.trim());
      }
    }

    try {
      const result = await executeInstall({
        repoRoot: REPO_ROOT,
        skills: requestedSkills.length > 0 ? requestedSkills : ['all'],
        targets,
        scope,
        method,
        dryRun: Boolean(values['dry-run']),
        backup: Boolean(values.backup),
        cwd: process.cwd()
      });

      if (values.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(pc.bold(pc.green(`\n🎉 Installation Complete!`)));
      console.log(`${pc.dim('Scope:')} ${result.scope} | ${pc.dim('Method:')} ${result.method} | ${pc.dim('Dry Run:')} ${result.dryRun}`);
      console.log(`${pc.dim('Total Targets Installed:')} ${result.totalInstalled}\n`);

      for (const item of result.results) {
        const icon = item.success ? pc.green('✓') : pc.red('✗');
        console.log(`  ${icon} ${pc.bold(item.skill)} -> ${pc.cyan(item.agentName)}`);
        console.log(`    ${pc.dim('Path:')} ${item.targetPath} (${item.mode})`);
        if (item.backedUp) {
          console.log(`    ${pc.yellow('Backup:')} ${item.backedUp}`);
        }
        if (item.error) {
          console.log(`    ${pc.red('Error:')} ${item.error}`);
        }
      }
      console.log();
    } catch (err) {
      if (values.json) {
        console.error(JSON.stringify({ error: err.message }, null, 2));
      } else {
        console.error(pc.red(`\n❌ Installation failed: ${err.message}\n`));
      }
      process.exit(1);
    }
  }
}

main().catch(err => {
  console.error(pc.red(`\n❌ Unexpected CLI Error: ${err.message}\n`));
  process.exit(1);
});
