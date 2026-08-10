import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

/**
 * Strict schema for SKILL.md frontmatter complying with
 * AgentSkills, skills.sh, and Anthropic/Google skill specifications.
 */
export const SkillFrontmatterSchema = z.object({
  name: z.string().min(2, 'Skill name must be at least 2 characters'),
  description: z.string().min(10, 'Skill description must be at least 10 characters for agent context'),
  version: z.string().optional().default('1.0.0'),
  author: z.string().optional(),
  license: z.string().optional().default('MIT'),
  tags: z.union([z.array(z.string()), z.string()]).optional().transform(val => {
    if (!val) return [];
    if (typeof val === 'string') return val.split(',').map(t => t.trim());
    return val;
  }),
  metadata: z.record(z.any()).optional(),
  compatibility: z.array(z.string()).optional()
});

/**
 * Extracts YAML frontmatter and markdown body from raw file contents.
 * @param {string} fileContent
 * @returns {{ frontmatterRaw: string | null, body: string }}
 */
export function extractFrontmatter(fileContent) {
  const normalized = fileContent.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

  if (match) {
    return { frontmatterRaw: match[1], body: match[2].trim() };
  }

  return { frontmatterRaw: null, body: normalized.trim() };
}

/**
 * Parses and validates a SKILL.md file at a given directory.
 * @param {string} skillDir Directory containing SKILL.md
 * @returns {object | null}
 */
export function parseSkillDirectory(skillDir) {
  const skillFile = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillFile)) return null;

  try {
    const rawContent = fs.readFileSync(skillFile, 'utf8');
    const { frontmatterRaw, body } = extractFrontmatter(rawContent);

    let parsed = {};
    if (frontmatterRaw) {
      parsed = parseYaml(frontmatterRaw) || {};
    }

    // Default name to folder name if omitted
    if (!parsed.name) {
      parsed.name = path.basename(skillDir);
    }

    // Fallback description from first paragraph of body if omitted
    if (!parsed.description && body) {
      const firstLine = body.split('\n').find(line => line.trim() && !line.startsWith('#'));
      parsed.description = firstLine ? firstLine.trim().slice(0, 160) : 'Custom AI agent skill';
    }

    const validationResult = SkillFrontmatterSchema.safeParse(parsed);

    return {
      id: parsed.name,
      name: parsed.name,
      description: parsed.description || 'No description provided',
      version: parsed.version || '1.0.0',
      author: parsed.author || 'Community',
      license: parsed.license || 'MIT',
      tags: parsed.tags || [],
      skillDir,
      skillFile,
      isValid: validationResult.success,
      errors: validationResult.success ? [] : validationResult.error.errors,
      bodyExcerpt: body.slice(0, 300)
    };
  } catch (err) {
    return {
      id: path.basename(skillDir),
      name: path.basename(skillDir),
      description: 'Failed to parse SKILL.md',
      version: '0.0.0',
      skillDir,
      skillFile,
      isValid: false,
      errors: [{ message: err.message }],
      bodyExcerpt: ''
    };
  }
}

/**
 * Scans the repository root for all available skills.
 * @param {string} repoRoot
 * @returns {Array<ReturnType<typeof parseSkillDirectory>>}
 */
export function discoverSkills(repoRoot) {
  const ignoredDirs = new Set(['.git', '.github', '.agents', '.memory', 'node_modules', 'bin', 'src', 'tests', 'dist']);
  const results = [];

  if (!fs.existsSync(repoRoot)) return results;

  const entries = fs.readdirSync(repoRoot, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && !ignoredDirs.has(entry.name) && !entry.name.startsWith('.')) {
      const fullPath = path.join(repoRoot, entry.name);
      
      // Check if this directory itself has a SKILL.md
      if (fs.existsSync(path.join(fullPath, 'SKILL.md'))) {
        const skill = parseSkillDirectory(fullPath);
        if (skill) results.push(skill);
      } else {
        // Also check one-level subdirectories (e.g. skills/<skill-name>/SKILL.md or project-memory/skills/<name>/SKILL.md)
        try {
          const subEntries = fs.readdirSync(fullPath, { withFileTypes: true });
          for (const sub of subEntries) {
            if (sub.isDirectory() && !ignoredDirs.has(sub.name)) {
              const subPath = path.join(fullPath, sub.name);
              if (fs.existsSync(path.join(subPath, 'SKILL.md'))) {
                const subSkill = parseSkillDirectory(subPath);
                if (subSkill) results.push(subSkill);
              }
            }
          }
        } catch (_) {}
      }
    }
  }

  // Deduplicate by ID / directory
  const uniqueMap = new Map();
  for (const item of results) {
    if (!uniqueMap.has(item.id)) {
      uniqueMap.set(item.id, item);
    }
  }

  return Array.from(uniqueMap.values());
}
