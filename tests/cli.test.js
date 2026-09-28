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
import { executeUpdate, hashDirectory, isEphemeralPath } from '../src/updater.js';

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

    it('should refuse to install a skill onto itself to prevent self-deletion', () => {
      const srcDir = path.join(REPO_ROOT, 'software-design-patterns');
      const destDir = REPO_ROOT; // targetPath would be REPO_ROOT/software-design-patterns === srcDir

      const result = installSingleSkill({
        skillName: 'software-design-patterns',
        srcDir,
        destDir,
        useSymlink: true,
        dryRun: false
      });

      assert.equal(result.success, false);
      assert.match(result.error, /Refusing to install skill onto itself/);
    });

    it('should be idempotent and recognize already-linked skills', () => {
      const destDir = path.join(tempDir, 'idempotent-agent-skills');
      const srcDir = path.join(REPO_ROOT, 'software-design-patterns');

      const first = installSingleSkill({
        skillName: 'software-design-patterns',
        srcDir,
        destDir,
        useSymlink: true
      });
      assert.equal(first.success, true);

      const second = installSingleSkill({
        skillName: 'software-design-patterns',
        srcDir,
        destDir,
        useSymlink: true
      });
      assert.equal(second.success, true);
      assert.equal(second.alreadyInstalled, true);
    });

    it('should safely overwrite broken symlinks', () => {
      const destDir = path.join(tempDir, 'broken-link-skills');
      const targetPath = path.join(destDir, 'software-design-patterns');
      fs.mkdirSync(destDir, { recursive: true });
      fs.symlinkSync('/nonexistent/path/for/test', targetPath, 'dir');

      assert.equal(fs.existsSync(targetPath), false);
      assert.equal(fs.lstatSync(targetPath).isSymbolicLink(), true);

      const res = installSingleSkill({
        skillName: 'software-design-patterns',
        srcDir: path.join(REPO_ROOT, 'software-design-patterns'),
        destDir,
        useSymlink: true
      });

      assert.equal(res.success, true);
      assert.equal(fs.existsSync(path.join(targetPath, 'SKILL.md')), true);
    });

    it('should handle comma-separated skills and target all with deduplication', async () => {
      const result = await executeInstall({
        repoRoot: REPO_ROOT,
        skills: ['project-memory,software-design-patterns'],
        targets: ['all'],
        scope: 'project',
        method: 'symlink',
        dryRun: false,
        cwd: tempDir
      });

      assert.equal(result.scope, 'project');
      assert.ok(result.totalInstalled > 0);
      assert.ok(fs.existsSync(path.join(tempDir, '.agents', 'skills', 'project-memory', 'SKILL.md')));
      assert.ok(fs.existsSync(path.join(tempDir, '.agents', 'skills', 'software-design-patterns', 'SKILL.md')));
    });

    it('should create relative symlinks when both paths are inside cwd', () => {
      const projectRoot = path.join(tempDir, 'rel-project');
      const fakeSrc = path.join(projectRoot, 'skills-src', 'my-skill');
      const fakeDest = path.join(projectRoot, '.agents', 'skills');
      fs.mkdirSync(fakeSrc, { recursive: true });
      fs.writeFileSync(path.join(fakeSrc, 'SKILL.md'), 'test');

      const res = installSingleSkill({
        skillName: 'my-skill',
        srcDir: fakeSrc,
        destDir: fakeDest,
        useSymlink: true,
        cwd: projectRoot
      });

      assert.equal(res.success, true);
      if (process.platform !== 'win32') {
        const link = fs.readlinkSync(res.targetPath);
        assert.ok(!path.isAbsolute(link), `Expected relative link, got: ${link}`);
      }
    });
  });

  describe('Update Engine', () => {
    const makeProject = (name) => {
      const cwd = path.join(tempDir, name);
      fs.mkdirSync(cwd, { recursive: true });
      return cwd;
    };

    it('should replace an outdated copy, keep a backup, and never touch project data', async () => {
      const cwd = makeProject('update-copy');
      await executeInstall({ repoRoot: REPO_ROOT, skills: ['software-design-patterns'], targets: ['universal'], scope: 'project', method: 'copy', cwd });
      const installed = path.join(cwd, '.agents', 'skills', 'software-design-patterns');
      fs.writeFileSync(path.join(installed, 'SKILL.md'), '---\nname: software-design-patterns\ndescription: legacy version of the skill\nversion: 0.9.0\n---\nold');
      fs.writeFileSync(path.join(installed, 'stale.md'), 'removed upstream');
      fs.mkdirSync(path.join(cwd, '.memory'));
      fs.writeFileSync(path.join(cwd, '.memory', 'index.md'), 'user data');

      const dry = executeUpdate({ repoRoot: REPO_ROOT, scope: 'project', cwd, dryRun: true });
      assert.equal(dry.results.find(r => r.skill === 'software-design-patterns').status, 'would-update');
      assert.ok(fs.existsSync(path.join(installed, 'stale.md')), 'dry-run must not write');

      const report = executeUpdate({ repoRoot: REPO_ROOT, scope: 'project', cwd });
      const r = report.results.find(x => x.skill === 'software-design-patterns');
      assert.equal(r.status, 'updated');
      assert.equal(r.fromVersion, '0.9.0');
      assert.equal(hashDirectory(installed), hashDirectory(path.join(REPO_ROOT, 'software-design-patterns')));
      assert.equal(fs.existsSync(path.join(installed, 'stale.md')), false);
      assert.ok(fs.existsSync(path.join(r.backedUp, 'stale.md')), 'backup keeps old files');
      assert.ok(!r.backedUp.startsWith(path.join(cwd, '.agents', 'skills') + path.sep), 'backup lives outside skills dir');
      assert.equal(fs.readFileSync(path.join(cwd, '.memory', 'index.md'), 'utf8'), 'user data');

      const again = executeUpdate({ repoRoot: REPO_ROOT, scope: 'project', cwd });
      assert.equal(again.updated, 0);
    });

    it('should convert a broken symlink into a persistent copy', () => {
      const cwd = makeProject('update-broken-link');
      const dest = path.join(cwd, '.agents', 'skills');
      fs.mkdirSync(dest, { recursive: true });
      fs.symlinkSync('/nonexistent/_npx/abc/software-design-patterns', path.join(dest, 'software-design-patterns'), 'dir');

      const report = executeUpdate({ repoRoot: REPO_ROOT, scope: 'project', cwd });
      const r = report.results.find(x => x.skill === 'software-design-patterns');
      assert.equal(r.status, 'updated');
      assert.equal(r.mode, 'copy');
      assert.ok(fs.existsSync(path.join(dest, 'software-design-patterns', 'SKILL.md')));
    });

    it('should leave symlinks to a user-owned clone alone', () => {
      const cwd = makeProject('update-own-clone');
      const clone = path.join(tempDir, 'my-clone', 'software-design-patterns');
      fs.mkdirSync(clone, { recursive: true });
      fs.writeFileSync(path.join(clone, 'SKILL.md'), '---\nname: software-design-patterns\ndescription: user clone of the skill\nversion: 1.0.0\n---\n');
      const dest = path.join(cwd, '.agents', 'skills');
      fs.mkdirSync(dest, { recursive: true });
      fs.symlinkSync(clone, path.join(dest, 'software-design-patterns'), 'dir');

      const r = executeUpdate({ repoRoot: REPO_ROOT, scope: 'project', cwd }).results[0];
      assert.equal(r.status, 'linked');
      assert.equal(fs.lstatSync(path.join(dest, 'software-design-patterns')).isSymbolicLink(), true);
    });

    it('should detect package-runner cache paths as ephemeral', () => {
      assert.equal(isEphemeralPath('/Users/x/.npm/_npx/123/node_modules/pkg/'), true);
      assert.equal(isEphemeralPath('/Users/x/code/AgentSkills/'), false);
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
