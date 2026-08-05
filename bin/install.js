#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const AVAILABLE_SKILLS = [
  { name: 'project-memory', description: 'Persistent Markdown project wiki for AI agents (.memory/)' },
  { name: 'software-design-patterns', description: 'Zero-overengineering design patterns & architecture guide' }
];

const TARGET_PRESETS = {
  antigravity: { name: 'Google Antigravity / Gemini', path: path.join(os.homedir(), '.gemini', 'config', 'skills') },
  pi: { name: 'Pi Agent', path: path.join(os.homedir(), '.pi', 'skills') },
  claude: { name: 'Claude Code', path: path.join(os.homedir(), '.claude', 'skills') },
  local: { name: 'Current Workspace (.agents/skills)', path: path.join(process.cwd(), '.agents', 'skills') }
};

async function promptUser(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(query);
  rl.close();
  return answer.trim();
}

function installSkill(skillName, destDir, useSymlink = false) {
  const srcDir = path.join(REPO_ROOT, skillName);
  if (!fs.existsSync(srcDir)) {
    console.error(`\n❌ Error: Skill "${skillName}" not found in repository.`);
    return false;
  }

  const targetPath = path.join(destDir, skillName);
  fs.mkdirSync(destDir, { recursive: true });

  try {
    if (fs.existsSync(targetPath) || fs.lstatSync(targetPath).isSymbolicLink()) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    }
  } catch (_) {}

  if (useSymlink) {
    try {
      const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
      fs.symlinkSync(srcDir, targetPath, symlinkType);
      console.log(`  🔗 Symlinked "${skillName}" -> ${targetPath}`);
      return true;
    } catch (err) {
      console.warn(`  ⚠️ Symlink failed (${err.message}). Falling back to copy...`);
    }
  }

  fs.mkdirSync(targetPath, { recursive: true });
  fs.cpSync(srcDir, targetPath, {
    recursive: true,
    filter: (src) => {
      const base = path.basename(src);
      return base !== 'node_modules' && base !== '.DS_Store';
    }
  });

  console.log(`  ✓ Installed "${skillName}" -> ${targetPath}`);
  return true;
}

async function main() {
  console.log(`\n🧠 AgentSkills Installer\n======================`);

  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    strict: false,
    options: {
      path: { type: 'string' },
      target: { type: 'string' },
      antigravity: { type: 'boolean' },
      gemini: { type: 'boolean' },
      pi: { type: 'boolean' },
      claude: { type: 'boolean' },
      local: { type: 'boolean' },
      symlink: { type: 'boolean', short: 's' }
    }
  });

  let selectedSkills = [];
  let targetPath = null;
  let useSymlink = Boolean(values.symlink);

  // Determine skills to install
  const requestedSkill = positionals[0];
  if (requestedSkill) {
    if (requestedSkill.toLowerCase() === 'all') {
      selectedSkills = AVAILABLE_SKILLS.map(s => s.name);
    } else {
      const match = AVAILABLE_SKILLS.find(s => s.name.toLowerCase() === requestedSkill.toLowerCase());
      if (match) {
        selectedSkills = [match.name];
      } else {
        console.error(`❌ Unknown skill "${requestedSkill}". Available skills: ${AVAILABLE_SKILLS.map(s => s.name).join(', ')}, all`);
        process.exit(1);
      }
    }
  }

  // Determine target directory
  if (values.path) {
    targetPath = path.resolve(values.path);
  } else if (values.target && TARGET_PRESETS[values.target.toLowerCase()]) {
    targetPath = TARGET_PRESETS[values.target.toLowerCase()].path;
  } else if (values.antigravity || values.gemini) {
    targetPath = TARGET_PRESETS.antigravity.path;
  } else if (values.pi) {
    targetPath = TARGET_PRESETS.pi.path;
  } else if (values.claude) {
    targetPath = TARGET_PRESETS.claude.path;
  } else if (values.local) {
    targetPath = TARGET_PRESETS.local.path;
  }

  // Interactive selection if not provided
  if (selectedSkills.length === 0) {
    console.log(`\nAvailable Skills:`);
    AVAILABLE_SKILLS.forEach((s, idx) => {
      console.log(`  [${idx + 1}] ${s.name} - ${s.description}`);
    });
    console.log(`  [A] All skills`);

    const choice = await promptUser(`\nSelect skill to install (1-${AVAILABLE_SKILLS.length} or A) [default: A]: `);
    if (!choice || choice.toUpperCase() === 'A') {
      selectedSkills = AVAILABLE_SKILLS.map(s => s.name);
    } else {
      const num = parseInt(choice, 10);
      if (num >= 1 && num <= AVAILABLE_SKILLS.length) {
        selectedSkills = [AVAILABLE_SKILLS[num - 1].name];
      } else {
        console.error(`Invalid selection.`);
        process.exit(1);
      }
    }
  }

  if (!targetPath) {
    console.log(`\nTarget Platforms:`);
    const keys = Object.keys(TARGET_PRESETS);
    keys.forEach((key, idx) => {
      console.log(`  [${idx + 1}] ${TARGET_PRESETS[key].name} (${TARGET_PRESETS[key].path})`);
    });

    const choice = await promptUser(`\nSelect target platform (1-${keys.length}) [default: 1]: `);
    const selectedKey = keys[parseInt(choice, 10) - 1] || 'antigravity';
    targetPath = TARGET_PRESETS[selectedKey].path;
  }

  if (!values.symlink && process.isTTY) {
    const installType = await promptUser(`\nInstallation Mode:\n  [1] Symlink (auto-updates when repo is pulled) [default]\n  [2] Copy (standalone files)\nSelect (1 or 2): `);
    if (installType.trim() === '2') {
      useSymlink = false;
    } else {
      useSymlink = true;
    }
  }

  console.log(`\nInstalling skill(s) into: ${targetPath} (Mode: ${useSymlink ? 'Symlink 🔗' : 'Copy 📁'})\n`);

  let count = 0;
  for (const skill of selectedSkills) {
    if (installSkill(skill, targetPath, useSymlink)) {
      count++;
    }
  }

  console.log(`\n🎉 Successfully installed ${count} skill(s)!\n`);
}

main().catch(err => {
  console.error('\n❌ Installation failed:', err);
  process.exit(1);
});
