/**
 * Template variable substitution for prompt files.
 *
 * Replaces {{VARIABLE_NAME}} placeholders in prompt templates
 * with extractor output. Simple line-based replacement: if a
 * template line contains only a {{VAR}} placeholder (with optional
 * whitespace), the entire line is replaced with the variable value.
 * Inline placeholders within a line are replaced in-place.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExtractedInputs, PromptPaths } from './types.ts';

const PLACEHOLDER_RE = /\{\{(\w+)\}\}/g;
const SOLO_PLACEHOLDER_RE = /^\s*\{\{(\w+)\}\}\s*$/;

/**
 * Read and expand a prompt template file.
 */
export function expandTemplate(
  instrumentDir: string,
  templatePath: string,
  inputs: ExtractedInputs,
): string {
  const fullPath = join(instrumentDir, templatePath);
  let content: string;
  try {
    content = readFileSync(fullPath, 'utf-8');
  } catch {
    throw new Error(`Cannot read prompt template: ${fullPath}`);
  }

  return expandString(content, inputs);
}

/**
 * Expand {{VARIABLE}} placeholders in a string.
 *
 * Lines that consist entirely of a placeholder are replaced wholesale
 * with the variable value (preserving multi-line extractor output).
 * Placeholders embedded within other text are replaced inline.
 * Unknown variables are left as empty strings.
 */
export function expandString(template: string, inputs: ExtractedInputs): string {
  const lines = template.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    const soloMatch = SOLO_PLACEHOLDER_RE.exec(line);
    if (soloMatch) {
      // Entire line is a placeholder — replace with full value
      const varName = soloMatch[1];
      result.push(inputs[varName] ?? '');
    } else {
      // Inline replacement
      result.push(line.replace(PLACEHOLDER_RE, (_, varName: string) => inputs[varName] ?? ''));
    }
  }

  return result.join('\n');
}

/**
 * Load and expand both prompts for an instrument run.
 */
export function assemblePrompts(
  instrumentDir: string,
  prompts: PromptPaths,
  inputs: ExtractedInputs,
): { systemPrompt: string; userMessage: string } {
  const systemPrompt = expandTemplate(instrumentDir, prompts.system, inputs);
  const userMessage = expandTemplate(instrumentDir, prompts.user, inputs);
  return { systemPrompt, userMessage };
}
