import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { AGENT_REGISTRY, getAgent, resolveAgentDestination } from '../src/agents.js';
import { discoverSkills, SkillFrontmatterSchema, extractFrontmatter } from '../src/discovery.js';
import { installSingleSkill, executeInstall, removeSingleSkill } from '../src/installer.js';
import { runDoctor } from '../src/doctor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

describe('AgentSkills Enterprise Suite', () => {
  let tempDir;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentskills-test-'));
  });

  after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  });

  describe('Agent Registry & Resolvers', () => {
    it('should contain all required major coding agents', () => {
      const agentIds = AGENT_REGISTRY.map(a => a.id);
      assert.ok(agentIds.includes('universal'));
      assert.ok(agentIds.includes('antigravity'));
      assert.ok(agentIds.includes('claude'));
      assert.ok(agentIds.includes('cursor'));
      assert.ok(agentIds.includes('pi'));
    });

    it('should resolve agent by alias or case-insensitive name', () => {
      const agent = getAgent('Antigravity');
      assert.ok(agent);
      assert.equal(agent.id, 'antigravity');
    });

    it('should resolve project path to .agents/skills by default for universal', () => {
      const universal = getAgent('universal');
      const resolved = resolveAgentDestination(universal, 'project', tempDir);
      assert.equal(resolved, path.join(tempDir, '.agents', 'skills'));
    });
  });

  describe('Skill Discovery & Schema Validation', () => {
    it('should parse frontmatter and body accurately', () => {
      const sample = `---\nname: test-skill\ndescription: A valid test skill description with enough length\nversion: 2.0.0\n---\n# Header\nBody content`;
      const { frontmatterRaw, body } = extractFrontmatter(sample);
      assert.ok(frontmatterRaw.includes('name: test-skill'));
      assert.equal(body, '# Header\nBody content');
    });

    it('should validate schema successfully on valid metadata', () => {
      const valid = {
        name: 'test-skill',
        description: 'Comprehensive skill description exceeding minimum length requirement',
        version: '1.0.0',
        author: 'Developer',
        tags: ['test', 'ci']
      };
      const result = SkillFrontmatterSchema.safeParse(valid);
      assert.equal(result.success, true);
    });

    it('should reject descriptions that are too short', () => {
      const invalid = {
        name: 'test-skill',
        description: 'short'
      };
      const result = SkillFrontmatterSchema.safeParse(invalid);
      assert.equal(result.success, false);
    });

    it('should discover all repo skills without validation errors', () => {
      const skills = discoverSkills(REPO_ROOT);
      assert.ok(skills.length >= 2);
      
      const memorySkill = skills.find(s => s.id === 'project-memory');
      const patternsSkill = skills.find(s => s.id === 'software-design-patterns');

      assert.ok(memorySkill, 'project-memory skill discovered');
      assert.equal(memorySkill.isValid, true);
      assert.ok(patternsSkill, 'software-design-patterns skill discovered');
      assert.equal(patternsSkill.isValid, true);
    });
  });

  describe('Installation Engine', () => {
    it('should support dry-run execution without modifying filesystem', async () => {
      const result = await executeInstall({
        repoRoot: REPO_ROOT,
        skills: ['software-design-patterns'],
        targets: ['universal'],
        scope: 'project',
        method: 'copy',
        dryRun: true,
        cwd: tempDir
      });

      assert.equal(result.dryRun, true);
      assert.equal(result.totalInstalled, 1);
      assert.equal(fs.existsSync(path.join(tempDir, '.agents', 'skills', 'software-design-patterns')), false);
    });

    it('should install a skill via copy mode and allow removal', () => {
      const destDir = path.join(tempDir, 'test-agent-skills');
      const srcDir = path.join(REPO_ROOT, 'software-design-patterns');

      const installResult = installSingleSkill({
        skillName: 'software-design-patterns',
        srcDir,
        destDir,
        useSymlink: false,
        dryRun: false
      });

      assert.equal(installResult.success, true);
      assert.equal(installResult.mode, 'copy');
      assert.ok(fs.existsSync(path.join(destDir, 'software-design-patterns', 'SKILL.md')));

      // Test removal
      const removed = removeSingleSkill('software-design-patterns', destDir);
      assert.equal(removed, true);
      assert.equal(fs.existsSync(path.join(destDir, 'software-design-patterns')), false);
    });

    it('should install a skill via symlink mode', () => {
      const destDir = path.join(tempDir, 'symlink-agent-skills');
      const srcDir = path.join(REPO_ROOT, 'software-design-patterns');

      const installResult = installSingleSkill({
        skillName: 'software-design-patterns',
        srcDir,
        destDir,
        useSymlink: true,
        dryRun: false
      });

      assert.equal(installResult.success, true);
      assert.equal(installResult.mode, 'symlink');
      assert.ok(fs.existsSync(path.join(destDir, 'software-design-patterns', 'SKILL.md')));
    });
  });

  describe('Doctor & Health Diagnostic', () => {
    it('should report healthy state for repository', () => {
      const report = runDoctor({ repoRoot: REPO_ROOT, cwd: tempDir });
      assert.equal(report.healthy, true);
      assert.equal(report.issues.length, 0);
      assert.ok(report.skills.length >= 2);
      assert.ok(report.agents.length >= 5);
    });
  });
});
