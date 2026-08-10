import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { AGENT_REGISTRY, resolveAgentDestination } from './agents.js';
import { discoverSkills } from './discovery.js';

/**
 * Runs comprehensive diagnostics on local agent configurations and repository integrity.
 * @param {{ repoRoot: string, cwd?: string }} options
 * @returns {object} Diagnostic results
 */
export function runDoctor({ repoRoot, cwd = process.cwd() }) {
  const report = {
    timestamp: new Date().toISOString(),
    skills: [],
    agents: [],
    issues: [],
    healthy: true
  };

  // 1. Audit Skills
  const skills = discoverSkills(repoRoot);
  for (const skill of skills) {
    const item = {
      id: skill.id,
      name: skill.name,
      version: skill.version,
      path: skill.skillDir,
      isValid: skill.isValid,
      errors: skill.errors
    };

    if (!skill.isValid) {
      report.healthy = false;
      report.issues.push(`Skill "${skill.name}" failed schema validation: ${skill.errors.map(e => e.message).join(', ')}`);
    }

    report.skills.push(item);
  }

  // 2. Audit Agent Platforms
  for (const agent of AGENT_REGISTRY) {
    const isInstalled = agent.detectInstalled();
    const globalPath = agent.resolveGlobalPath();
    const projectPath = agent.resolveProjectPath(cwd);

    let globalAccessible = false;
    try {
      if (fs.existsSync(globalPath)) {
        fs.accessSync(globalPath, fs.constants.W_OK);
        globalAccessible = true;
      }
    } catch (_) {}

    report.agents.push({
      id: agent.id,
      name: agent.name,
      isInstalled,
      globalPath,
      projectPath,
      globalExists: fs.existsSync(globalPath),
      globalAccessible
    });
  }

  return report;
}

/**
 * Prints formatted diagnostic report to console.
 * @param {ReturnType<typeof runDoctor>} report
 */
export function printDoctorReport(report) {
  console.log(pc.bold(pc.cyan('\n🩺 AgentSkills Health & Diagnostics Report\n')));
  console.log(`${pc.dim('Timestamp:')} ${report.timestamp}\n`);

  // Skills Summary
  console.log(pc.bold('📦 Discovered Skills:'));
  for (const skill of report.skills) {
    const icon = skill.isValid ? pc.green('✓') : pc.red('✗');
    console.log(`  ${icon} ${pc.bold(skill.name)} ${pc.dim(`(v${skill.version})`)} - ${pc.dim(skill.path)}`);
    if (!skill.isValid) {
      for (const err of skill.errors) {
        console.log(`    ${pc.red('└─')} ${err.message}`);
      }
    }
  }

  // Agents Summary
  console.log(pc.bold('\n🤖 Target Agent Platforms:'));
  for (const agent of report.agents) {
    const status = agent.isInstalled ? pc.green('Installed') : pc.dim('Not Detected');
    console.log(`  • ${pc.bold(agent.name)} [${status}]`);
    console.log(`    ${pc.dim('Global Path:')}  ${agent.globalPath} ${agent.globalExists ? pc.green('(exists)') : pc.dim('(not created yet)')}`);
    console.log(`    ${pc.dim('Project Path:')} ${agent.projectPath}`);
  }

  // Overall Health
  console.log('\n' + pc.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  if (report.healthy && report.issues.length === 0) {
    console.log(pc.green(pc.bold('✅ System Healthy. Ready to distribute & install skills.')));
  } else {
    console.log(pc.yellow(pc.bold(`⚠️ Found ${report.issues.length} issue(s):`)));
    for (const issue of report.issues) {
      console.log(`  ${pc.red('•')} ${issue}`);
    }
  }
  console.log(pc.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
}
