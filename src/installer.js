import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { AGENT_REGISTRY, getAgent, resolveAgentDestination } from './agents.js';
import { discoverSkills } from './discovery.js';

/**
 * Performs atomic installation (copy or symlink) for a single skill.
 * @param {object} params
 * @param {string} params.skillName Name of skill
 * @param {string} params.srcDir Absolute path of source skill directory
 * @param {string} params.destDir Target agent skill root directory
 * @param {boolean} params.useSymlink Whether to symlink instead of copy
 * @param {boolean} params.dryRun If true, only simulate
 * @param {boolean} [params.backup] If true, create backup of existing skill
 * @returns {{ success: boolean, targetPath: string, mode: 'symlink' | 'copy', backedUp?: string, error?: string }}
 */
export function installSingleSkill({ skillName, srcDir, destDir, useSymlink = true, dryRun = false, backup = false }) {
  const targetPath = path.join(destDir, skillName);

  if (!fs.existsSync(srcDir)) {
    return {
      success: false,
      targetPath,
      mode: useSymlink ? 'symlink' : 'copy',
      error: `Source directory does not exist: ${srcDir}`
    };
  }

  if (dryRun) {
    return {
      success: true,
      targetPath,
      mode: useSymlink ? 'symlink' : 'copy'
    };
  }

  let backedUpPath = null;
  fs.mkdirSync(destDir, { recursive: true });

  try {
    const exists = fs.existsSync(targetPath) || (fs.lstatSync(targetPath).isSymbolicLink?.() ?? false);
    if (exists) {
      if (backup) {
        backedUpPath = `${targetPath}.bak-${Date.now()}`;
        fs.renameSync(targetPath, backedUpPath);
      } else {
        fs.rmSync(targetPath, { recursive: true, force: true });
      }
    }
  } catch (_) {}

  // Symlink strategy
  if (useSymlink) {
    try {
      const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
      fs.symlinkSync(srcDir, targetPath, symlinkType);
      return {
        success: true,
        targetPath,
        mode: 'symlink',
        backedUp: backedUpPath || undefined
      };
    } catch (err) {
      // Symlink failed, attempt copy fallback
      try {
        fs.cpSync(srcDir, targetPath, { recursive: true });
        return {
          success: true,
          targetPath,
          mode: 'copy',
          backedUp: backedUpPath || undefined
        };
      } catch (copyErr) {
        return {
          success: false,
          targetPath,
          mode: 'copy',
          error: `Symlink failed (${err.message}) and copy failed (${copyErr.message})`
        };
      }
    }
  }

  // Copy strategy
  try {
    fs.mkdirSync(targetPath, { recursive: true });
    fs.cpSync(srcDir, targetPath, {
      recursive: true,
      filter: (src) => {
        const base = path.basename(src);
        return base !== 'node_modules' && base !== '.DS_Store' && base !== '.git';
      }
    });
    return {
      success: true,
      targetPath,
      mode: 'copy',
      backedUp: backedUpPath || undefined
    };
  } catch (err) {
    return {
      success: false,
      targetPath,
      mode: 'copy',
      error: err.message
    };
  }
}

/**
 * Removes an installed skill from destination.
 * @param {string} skillName
 * @param {string} destDir
 * @returns {boolean}
 */
export function removeSingleSkill(skillName, destDir) {
  const targetPath = path.join(destDir, skillName);
  try {
    if (fs.existsSync(targetPath) || fs.lstatSync(targetPath).isSymbolicLink()) {
      fs.rmSync(targetPath, { recursive: true, force: true });
      return true;
    }
  } catch (_) {}
  return false;
}

/**
 * Non-interactive / Programmatic execution engine.
 * @param {object} options
 */
export async function executeInstall(options) {
  const {
    repoRoot,
    skills = [],
    targets = ['universal'],
    scope = 'global',
    method = 'symlink',
    dryRun = false,
    backup = false,
    cwd = process.cwd()
  } = options;

  const discovered = discoverSkills(repoRoot);
  const discoveredMap = new Map(discovered.map(s => [s.id.toLowerCase(), s]));

  const targetSkills = skills.length === 0 || skills.includes('all')
    ? discovered
    : skills.map(name => discoveredMap.get(name.toLowerCase())).filter(Boolean);

  if (targetSkills.length === 0) {
    throw new Error(`No matching skills found to install. Available: ${discovered.map(s => s.id).join(', ')}`);
  }

  const targetAgents = targets.map(t => typeof t === 'string' ? getAgent(t) : t).filter(Boolean);
  if (targetAgents.length === 0) {
    throw new Error(`No valid agent targets provided. Available: ${AGENT_REGISTRY.map(a => a.id).join(', ')}`);
  }

  const results = [];
  const useSymlink = method === 'symlink';

  for (const agent of targetAgents) {
    const destDir = resolveAgentDestination(agent, scope, cwd);

    for (const skill of targetSkills) {
      const outcome = installSingleSkill({
        skillName: skill.id,
        srcDir: skill.skillDir,
        destDir,
        useSymlink,
        dryRun,
        backup
      });

      results.push({
        agent: agent.id,
        agentName: agent.name,
        skill: skill.id,
        skillVersion: skill.version,
        destination: destDir,
        targetPath: outcome.targetPath,
        mode: outcome.mode,
        success: outcome.success,
        backedUp: outcome.backedUp,
        error: outcome.error
      });
    }
  }

  return {
    timestamp: new Date().toISOString(),
    scope,
    method,
    dryRun,
    totalInstalled: results.filter(r => r.success).length,
    results
  };
}

/**
 * Interactive CLI Wizard using @clack/prompts.
 * @param {object} options
 */
export async function runInteractiveWizard(options) {
  const { repoRoot, cwd = process.cwd() } = options;

  console.clear();
  p.intro(pc.bgCyan(pc.black(' 🧠 AgentSkills Universal Installer ')));

  const discovered = discoverSkills(repoRoot);
  if (discovered.length === 0) {
    p.cancel(pc.red('No valid skills containing SKILL.md found in repository.'));
    process.exit(1);
  }

  // 1. Scope Selection
  const scope = await p.select({
    message: 'Installation scope',
    options: [
      {
        value: 'project',
        label: 'Project Workspace',
        hint: 'Install into current project (.agents/skills - committed with team)'
      },
      {
        value: 'global',
        label: 'Global User Environment',
        hint: 'Install into user home directory (available across all projects)'
      }
    ],
    initialValue: 'project'
  });

  if (p.isCancel(scope)) {
    p.cancel('Installation cancelled.');
    process.exit(0);
  }

  // 2. Target Agents Selection (Auto-detect & preselect)
  const agentOptions = AGENT_REGISTRY.map(agent => {
    const installed = agent.detectInstalled();
    return {
      value: agent,
      label: agent.name,
      hint: installed ? pc.green('Detected on system') : agent.description
    };
  });

  // Pre-select universal and any installed agents
  const initialAgents = AGENT_REGISTRY.filter(a => a.id === 'universal' || a.detectInstalled());

  const selectedAgents = await p.multiselect({
    message: 'Which agent(s) do you want to install to?',
    options: agentOptions,
    initialValues: initialAgents,
    required: true
  });

  if (p.isCancel(selectedAgents)) {
    p.cancel('Installation cancelled.');
    process.exit(0);
  }

  // 3. Skill Selection
  const skillOptions = discovered.map(skill => ({
    value: skill,
    label: `${pc.bold(skill.name)} ${pc.dim(`(v${skill.version})`)}`,
    hint: skill.description
  }));

  const selectedSkills = await p.multiselect({
    message: 'Select skills to install:',
    options: skillOptions,
    initialValues: discovered,
    required: true
  });

  if (p.isCancel(selectedSkills)) {
    p.cancel('Installation cancelled.');
    process.exit(0);
  }

  // 4. Installation Method (Symlink vs Copy)
  const method = await p.select({
    message: 'Installation method',
    options: [
      {
        value: 'symlink',
        label: 'Symlink (Recommended)',
        hint: 'Single source of truth; automatically updates when repository is pulled'
      },
      {
        value: 'copy',
        label: 'Copy files',
        hint: 'Independent standalone files in each agent directory'
      }
    ],
    initialValue: 'symlink'
  });

  if (p.isCancel(method)) {
    p.cancel('Installation cancelled.');
    process.exit(0);
  }

  // Execute with Spinner
  const s = p.spinner();
  s.start(pc.cyan('Installing skills...'));

  const executionResult = await executeInstall({
    repoRoot,
    skills: selectedSkills.map(s => s.id),
    targets: selectedAgents,
    scope,
    method,
    dryRun: false,
    backup: false,
    cwd
  });

  s.stop(pc.green(`✓ Successfully installed ${executionResult.totalInstalled} skill target(s)!`));

  // Print configured paths
  const summaryLines = selectedAgents.map(agent => {
    const dest = resolveAgentDestination(agent, scope, cwd);
    return `${pc.cyan(agent.name)}:\n  └─ ${pc.dim(dest)}`;
  });

  p.note(summaryLines.join('\n'), 'Configured Locations');

  p.outro(pc.green(pc.bold('🎉 Done! Your AI coding agents now have access to your installed skills.')));
}
