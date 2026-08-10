import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

/**
 * Registry of supported AI coding agents, their display names, configuration paths,
 * and detection heuristics.
 */
export const AGENT_REGISTRY = [
  {
    id: 'universal',
    name: 'Universal (.agents/skills)',
    description: 'Industry standard recognized by Antigravity, Claude Code, Cursor, Cline, Codex, etc.',
    category: 'universal',
    resolveGlobalPath: () => path.join(os.homedir(), '.agents', 'skills'),
    resolveProjectPath: (cwd = process.cwd()) => path.join(cwd, '.agents', 'skills'),
    detectInstalled: () => true // Always available
  },
  {
    id: 'antigravity',
    name: 'Google Antigravity / Gemini',
    description: 'Global customization root for Google Antigravity IDE and Gemini CLI',
    category: 'ide',
    resolveGlobalPath: () => path.join(os.homedir(), '.gemini', 'config', 'skills'),
    resolveProjectPath: (cwd = process.cwd()) => path.join(cwd, '.agents', 'skills'),
    detectInstalled: () => {
      const geminiDir = path.join(os.homedir(), '.gemini');
      return fs.existsSync(geminiDir);
    }
  },
  {
    id: 'claude',
    name: 'Claude Code',
    description: 'Anthropic Claude Code CLI agent',
    category: 'cli',
    resolveGlobalPath: () => path.join(os.homedir(), '.claude', 'skills'),
    resolveProjectPath: (cwd = process.cwd()) => path.join(cwd, '.claude', 'skills'),
    detectInstalled: () => {
      const claudeDir = path.join(os.homedir(), '.claude');
      return fs.existsSync(claudeDir);
    }
  },
  {
    id: 'cursor',
    name: 'Cursor',
    description: 'Cursor IDE custom AI skills and rules',
    category: 'ide',
    resolveGlobalPath: () => path.join(os.homedir(), '.cursor', 'skills'),
    resolveProjectPath: (cwd = process.cwd()) => path.join(cwd, '.cursor', 'skills'),
    detectInstalled: () => {
      const cursorDir = path.join(os.homedir(), '.cursor');
      return fs.existsSync(cursorDir);
    }
  },
  {
    id: 'pi',
    name: 'Pi Coding Agent',
    description: 'Pi terminal coding assistant',
    category: 'cli',
    resolveGlobalPath: () => path.join(os.homedir(), '.pi', 'skills'),
    resolveProjectPath: (cwd = process.cwd()) => path.join(cwd, '.pi', 'skills'),
    detectInstalled: () => {
      const piDir = path.join(os.homedir(), '.pi');
      return fs.existsSync(piDir);
    }
  },
  {
    id: 'codex',
    name: 'Codex / OpenCode',
    description: 'OpenAI Codex & OpenCode terminal agents',
    category: 'cli',
    resolveGlobalPath: () => path.join(os.homedir(), '.codex', 'skills'),
    resolveProjectPath: (cwd = process.cwd()) => path.join(cwd, '.agents', 'skills'),
    detectInstalled: () => {
      const codexDir = path.join(os.homedir(), '.codex');
      return fs.existsSync(codexDir);
    }
  },
  {
    id: 'warp',
    name: 'Warp Terminal',
    description: 'Warp AI terminal workflows & skills',
    category: 'terminal',
    resolveGlobalPath: () => path.join(os.homedir(), '.warp', 'skills'),
    resolveProjectPath: (cwd = process.cwd()) => path.join(cwd, '.agents', 'skills'),
    detectInstalled: () => {
      const warpDir = path.join(os.homedir(), '.warp');
      return fs.existsSync(warpDir);
    }
  },
  {
    id: 'zed',
    name: 'Zed Editor',
    description: 'Zed Assistant skills and contexts',
    category: 'ide',
    resolveGlobalPath: () => path.join(os.homedir(), '.config', 'zed', 'skills'),
    resolveProjectPath: (cwd = process.cwd()) => path.join(cwd, '.zed', 'skills'),
    detectInstalled: () => {
      const zedDir = path.join(os.homedir(), '.config', 'zed');
      return fs.existsSync(zedDir);
    }
  }
];

/**
 * Get an agent by its identifier or alias.
 * @param {string} idOrAlias
 * @returns {typeof AGENT_REGISTRY[number] | undefined}
 */
export function getAgent(idOrAlias) {
  const normalized = idOrAlias.toLowerCase().trim();
  return AGENT_REGISTRY.find(
    agent => agent.id === normalized ||
      agent.name.toLowerCase().includes(normalized)
  );
}

/**
 * Resolves destination directory path for an agent given a scope.
 * @param {typeof AGENT_REGISTRY[number]} agent
 * @param {'project' | 'global'} scope
 * @param {string} [cwd]
 * @returns {string}
 */
export function resolveAgentDestination(agent, scope = 'global', cwd = process.cwd()) {
  return scope === 'project' ? agent.resolveProjectPath(cwd) : agent.resolveGlobalPath();
}
