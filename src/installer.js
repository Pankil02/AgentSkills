import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { AGENT_REGISTRY, getAgent, resolveAgentDestination } from './agents.js';
import { discoverSkills } from './discovery.js';
import { isEphemeralPath } from './updater.js';

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
export function installSingleSkill({ skillName, srcDir, destDir, useSymlink = true, dryRun = false, backup = false, cwd = process.cwd() }) {
  const targetPath = path.join(destDir, skillName);

  if (!fs.existsSync(srcDir)) {
    return {
      success: false,
      targetPath,
      mode: useSymlink ? 'symlink' : 'copy',
      error: `Source directory does not exist: ${srcDir}`
    };
  }

  // Safety check: Never install a skill directory onto itself
  if (path.resolve(targetPath) === path.resolve(srcDir)) {
    return {
      success: false,
      targetPath,
      mode: useSymlink ? 'symlink' : 'copy',
      error: `Refusing to install skill onto itself (source and destination paths are identical: ${srcDir})`
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

  // Inspect existing target
  let exists = false;
  let isSymlink = false;
  let currentLinkTarget = null;

  try {
    const stat = fs.lstatSync(targetPath);
    exists = true;
    isSymlink = stat.isSymbolicLink();
    if (isSymlink) {
      try {
        currentLinkTarget = fs.readlinkSync(targetPath);
      } catch (_) {}
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      return {
        success: false,
        targetPath,
        mode: useSymlink ? 'symlink' : 'copy',
        error: `Failed to inspect existing path ${targetPath}: ${err.message}`
      };
    }
  }

  // Idempotent symlink check: If already symlinked to the same source directory, skip re-linking
  if (useSymlink && isSymlink && currentLinkTarget) {
    const resolvedLink = path.resolve(path.dirname(targetPath), currentLinkTarget);
    if (resolvedLink === path.resolve(srcDir)) {
      return {
        success: true,
        targetPath,
        mode: 'symlink',
        alreadyInstalled: true
      };
    }
  }

  // Handle backup or removal of existing target
  if (exists) {
    if (backup) {
      backedUpPath = `${targetPath}.bak-${Date.now()}`;
      try {
        fs.renameSync(targetPath, backedUpPath);
      } catch (backupErr) {
        return {
          success: false,
          targetPath,
          mode: useSymlink ? 'symlink' : 'copy',
          error: `Failed to create backup at ${backedUpPath}: ${backupErr.message}`
        };
      }
    } else {
      try {
        if (isSymlink) {
          try {
            fs.unlinkSync(targetPath);
          } catch (_) {
            fs.rmSync(targetPath, { recursive: true, force: true });
          }
        } else {
          fs.rmSync(targetPath, { recursive: true, force: true });
        }
      } catch (rmErr) {
        return {
          success: false,
          targetPath,
          mode: useSymlink ? 'symlink' : 'copy',
          error: `Failed to remove existing file/directory at ${targetPath}: ${rmErr.message}`
        };
      }
    }
  }

  // Symlink strategy
  if (useSymlink) {
    try {
      let linkSource = path.resolve(srcDir);
      const isWindows = process.platform === 'win32';
      const symlinkType = isWindows ? 'junction' : 'dir';

      if (!isWindows) {
        // For POSIX: If both srcDir and destDir share the current working directory,
        // create a clean relative symlink for maximum portability across repo clones/moves.
        const absCwd = path.resolve(cwd);
        const absSrc = path.resolve(srcDir);
        const absTargetDir = path.resolve(destDir);

        if (absSrc.startsWith(absCwd + path.sep) && absTargetDir.startsWith(absCwd + path.sep)) {
          linkSource = path.relative(absTargetDir, absSrc);
        }
      }

      fs.symlinkSync(linkSource, targetPath, symlinkType);
      return {
        success: true,
        targetPath,
        mode: 'symlink',
        backedUp: backedUpPath || undefined
      };
    } catch (err) {
      // Symlink failed, attempt copy fallback
      try {
        fs.mkdirSync(targetPath, { recursive: true });
        fs.cpSync(srcDir, targetPath, {
          recursive: true,
          dereference: true,
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
      dereference: true,
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
    let stat;
    try {
      stat = fs.lstatSync(targetPath);
    } catch (e) {
      if (e.code === 'ENOENT') return false;
      throw e;
    }
    if (stat.isSymbolicLink()) {
      try {
        fs.unlinkSync(targetPath);
      } catch (_) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      }
      return true;
    }
    fs.rmSync(targetPath, { recursive: true, force: true });
    return true;
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
    scope = 'project',
    method = 'symlink',
    dryRun = false,
    backup = false,
    cwd = process.cwd()
  } = options;

  const discovered = discoverSkills(repoRoot);
  const discoveredMap = new Map(discovered.map(s => [s.id.toLowerCase(), s]));

  // Backward-compatible aliases for renamed skills
  const SKILL_ALIASES = {
    'new-feature-planning-proposal': 'feature-proposal'
  };

  // Parse comma-separated or space-separated skills
  const normalizedRequested = (Array.isArray(skills) ? skills : [skills])
    .flatMap(s => typeof s === 'string' ? s.split(',') : s)
    .map(s => typeof s === 'string' ? s.trim().toLowerCase() : s)
    .map(s => SKILL_ALIASES[s] || s)
    .filter(Boolean);

  const isAll = normalizedRequested.length === 0 ||
    normalizedRequested.includes('all') ||
    normalizedRequested.includes('*');

  const targetSkills = isAll
    ? discovered
    : normalizedRequested.map(name => discoveredMap.get(name)).filter(Boolean);

  if (targetSkills.length === 0) {
    throw new Error(`No matching skills found to install. Available: ${discovered.map(s => s.id).join(', ')}`);
  }

  // Resolve target agents
  const normalizedTargets = (Array.isArray(targets) ? targets : [targets])
    .flatMap(t => typeof t === 'string' ? t.split(',') : t)
    .map(t => typeof t === 'string' ? t.trim().toLowerCase() : t)
    .filter(Boolean);

  let targetAgents = [];
  if (normalizedTargets.length === 0 || normalizedTargets.includes('all')) {
    targetAgents = [...AGENT_REGISTRY];
  } else {
    targetAgents = normalizedTargets.map(t => typeof t === 'string' ? getAgent(t) : t).filter(Boolean);
  }

  if (targetAgents.length === 0) {
    throw new Error(`No valid agent targets provided. Available: ${AGENT_REGISTRY.map(a => a.id).join(', ')}`);
  }

  const results = [];
  // Symlinks into an npx/bunx cache break when the cache is purged; always copy from there.
  const useSymlink = method === 'symlink' && !isEphemeralPath(path.resolve(repoRoot) + path.sep);
  const processedDestinations = new Map();

  for (const agent of targetAgents) {
    const destDir = resolveAgentDestination(agent, scope, cwd);

    for (const skill of targetSkills) {
      const destKey = `${path.resolve(destDir)}::${skill.id.toLowerCase()}`;
      let outcome;

      if (processedDestinations.has(destKey)) {
        // Reuse outcome for duplicate destinations (e.g. universal and antigravity project paths)
        outcome = processedDestinations.get(destKey);
      } else {
        outcome = installSingleSkill({
          skillName: skill.id,
          srcDir: skill.skillDir,
          destDir,
          useSymlink,
          dryRun,
          backup,
          cwd
        });
        processedDestinations.set(destKey, outcome);
      }

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
        alreadyInstalled: outcome.alreadyInstalled,
        error: outcome.error
      });
    }
  }

  return {
    timestamp: new Date().toISOString(),
    scope,
    method: useSymlink ? 'symlink' : 'copy',
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
