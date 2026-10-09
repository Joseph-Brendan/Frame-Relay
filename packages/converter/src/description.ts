import { AccessibilitySpec, UsageGuideline } from '@frame-relay/schema';
import { ConverterWarning, createWarning } from './warnings.js';

export interface ParseDescriptionResult {
  description: string;
  usage: UsageGuideline;
  accessibility?: AccessibilitySpec;
  warnings: ConverterWarning[];
}

const KNOWN_PREFIX_REGEX = /^(do|don'?t|do not|role|a11y|accessibility)\s*:/i;

/**
 * Parses structured text documentation from a Figma component description.
 */
export function parseDescription(
  rawText: string | undefined,
  componentName: string,
): ParseDescriptionResult {
  const warnings: ConverterWarning[] = [];
  let description = '';
  const doGuidelines: string[] = [];
  const dontGuidelines: string[] = [];
  let role: string | undefined;
  const a11yNotes: string[] = [];

  const lines = (rawText || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  for (const line of lines) {
    const doMatch = line.match(/^do\s*:\s*(.*)$/i);
    if (doMatch) {
      if (doMatch[1].trim()) doGuidelines.push(doMatch[1].trim());
      continue;
    }

    const dontMatch = line.match(/^(?:don'?t|do not)\s*:\s*(.*)$/i);
    if (dontMatch) {
      if (dontMatch[1].trim()) dontGuidelines.push(dontMatch[1].trim());
      continue;
    }

    const roleMatch = line.match(/^role\s*:\s*(.*)$/i);
    if (roleMatch) {
      if (roleMatch[1].trim()) role = roleMatch[1].trim();
      continue;
    }

    const a11yMatch = line.match(/^(?:a11y|accessibility)\s*:\s*(.*)$/i);
    if (a11yMatch) {
      if (a11yMatch[1].trim()) a11yNotes.push(a11yMatch[1].trim());
      continue;
    }

    if (!description && !KNOWN_PREFIX_REGEX.test(line)) {
      description = line;
    }
  }

  if (!description) {
    warnings.push(
      createWarning('MISSING_DESCRIPTION', {
        component: componentName,
        layerPath: '',
        details: 'Component has no description in Figma',
        fix: 'Add a single-sentence purpose line to the component description',
      }),
    );
    description = `${componentName} component`;
  }

  if (doGuidelines.length === 0 && dontGuidelines.length === 0) {
    warnings.push(
      createWarning('MISSING_USAGE', {
        component: componentName,
        layerPath: '',
        details: "Component description does not include Do: or Don't: usage rules",
        fix: "Add Do: and Don't: lines in the Figma component description",
      }),
    );
  }

  const usage: UsageGuideline = {
    do: doGuidelines,
    dont: dontGuidelines,
  };

  let accessibility: AccessibilitySpec | undefined;
  if (role || a11yNotes.length > 0) {
    accessibility = {};
    if (role) accessibility.role = role;
    if (a11yNotes.length > 0) accessibility.notes = a11yNotes;
  }

  return {
    description,
    usage,
    accessibility,
    warnings,
  };
}
