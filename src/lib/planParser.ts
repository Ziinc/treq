import { PlanSection } from '../types/planning';

/**
 * Strips ANSI escape sequences from terminal output
 * Essential for reliable pattern matching in terminal output
 */
const stripAnsiCodes = (text: string): string => {
  // Remove ANSI escape sequences (colors, cursor movement, etc.)
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
};

/**
 * Detects if a line is a box drawing boundary
 * Matches lines with repeated box drawing characters (─, ╌, ═, -, =)
 */
const isBoxBoundary = (line: string): boolean => {
  const trimmed = line.trim();
  if (trimmed.length < 10) return false;
  
  // Match lines that are mostly box drawing characters
  return /^[─╌═\-=]{10,}$/.test(trimmed);
};

/**
 * Detects the plan type from a section header
 */
export const detectPlanType = (header: string): PlanSection['type'] => {
  const normalized = header.toLowerCase().trim();
  
  if (normalized.includes('implementation plan')) {
    return 'implementation_plan';
  } else if (normalized.includes('task')) {
    return 'tasks';
  } else if (normalized.includes('suggestion')) {
    return 'suggestions';
  } else if (normalized.includes('plan')) {
    return 'plan';
  }
  
  return 'plan';
};

/**
 * Extracts Claude Code formatted plans from terminal output
 * Detects plans bounded by box drawing characters with "Here is Claude's plan:" header
 */
export const extractClaudeCodePlans = (output: string): PlanSection[] => {
  // Strip ANSI codes first for reliable pattern matching
  const cleanOutput = stripAnsiCodes(output);
  const lines = cleanOutput.split('\n');
  
  const plans: PlanSection[] = [];
  let inPlan = false;
  let planLines: string[] = [];
  let planStartIndex = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Detect plan header with multiple variants
    const isPlanHeader = 
      trimmed.includes("Here is Claude's plan:") ||
      trimmed.includes("Here is my plan:") ||
      trimmed.includes("Here's my plan:") ||
      trimmed.includes("Implementation Plan:");
    
    if (isPlanHeader && !inPlan) {
      // Look ahead for box boundary to confirm this is a real plan
      if (i + 1 < lines.length && isBoxBoundary(lines[i + 1])) {
        inPlan = true;
        planStartIndex = i;
        planLines = [];
        i++; // Skip the box boundary line
        continue;
      }
    }
    
    // Detect end of plan (closing box boundary)
    if (inPlan && isBoxBoundary(trimmed)) {
      if (planLines.length > 0) {
        const plan = parseClaudeCodePlan(planLines, planStartIndex);
        if (plan) {
          plans.push(plan);
        }
      }
      inPlan = false;
      planLines = [];
      planStartIndex = -1;
      continue;
    }
    
    // Collect plan content
    if (inPlan) {
      planLines.push(line);
    }
  }
  
  // Process incomplete plan (user might still be viewing it)
  if (inPlan && planLines.length > 5) {
    const plan = parseClaudeCodePlan(planLines, planStartIndex);
    if (plan) {
      plans.push(plan);
    }
  }
  
  return plans;
};

/**
 * Parses a single Claude Code plan from collected lines
 * Handles structured format with sections like "Plan:", "Changes Required", etc.
 */
const parseClaudeCodePlan = (lines: string[], planStartIndex: number): PlanSection | null => {
  if (lines.length === 0) return null;
  
  let title = '';
  let scope = '';
  const steps: string[] = [];
  const sections: { [key: string]: string[] } = {};
  let currentSection = '';
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines
    if (!trimmed) continue;
    
    // Detect section headers (ending with colon)
    if (trimmed.match(/^[A-Z][A-Za-z\s]+:$/)) {
      currentSection = trimmed.slice(0, -1); // Remove colon
      sections[currentSection] = [];
      
      // Use first section as title if no "Plan:" section exists
      if (!title && currentSection !== 'Scope') {
        title = currentSection;
      }
      continue;
    }
    
    // Extract title from "Plan:" line (format: "Plan: Title")
    if (trimmed.startsWith('Plan:') && !title) {
      title = trimmed.substring(5).trim() || 'Implementation Plan';
      continue;
    }
    
    // Extract scope
    if (trimmed.startsWith('Scope:')) {
      scope = trimmed.substring(6).trim();
      continue;
    }
    
    // Add content to current section
    if (currentSection && sections[currentSection] !== undefined) {
      sections[currentSection].push(trimmed);
    }
  }
  
  // Extract steps from all sections
  for (const [sectionName, sectionLines] of Object.entries(sections)) {
    for (const line of sectionLines) {
      // Match numbered items (1., 2., etc.)
      const numberedMatch = line.match(/^(\d+)\.\s+(.+)$/);
      if (numberedMatch) {
        steps.push(`**${sectionName}**: ${numberedMatch[2]}`);
        continue;
      }
      
      // Match bullet items (-, •, *)
      const bulletMatch = line.match(/^[-•*]\s+(.+)$/);
      if (bulletMatch) {
        steps.push(`${bulletMatch[1]}`);
        continue;
      }
      
      // Include non-empty descriptive lines as steps
      if (line.length > 10 && !line.endsWith(':')) {
        steps.push(line);
      }
    }
  }
  
  // Fallback: if no structured sections found, extract from raw content
  if (steps.length === 0) {
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length < 5) continue;
      
      // Skip section headers
      if (trimmed.match(/^[A-Z][A-Za-z\s]+:$/)) continue;
      
      steps.push(trimmed);
    }
  }
  
  // Use first meaningful line as title if still not set
  if (!title) {
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && trimmed.length > 5 && !trimmed.endsWith(':')) {
        title = trimmed;
        break;
      }
    }
  }
  
  if (!title) title = 'Implementation Plan';
  if (steps.length === 0) return null;
  
  const rawMarkdown = lines.join('\n');
  
  return {
    id: `claude-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: 'implementation_plan',
    title,
    steps,
    rawText: rawMarkdown,
    rawMarkdown,
    scope: scope || undefined,
    timestamp: new Date(),
  };
};

/**
 * Parses plan steps from content, extracting bullets, numbered lists, and task checkboxes
 */
export const parsePlanSteps = (content: string): string[] => {
  const steps: string[] = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines
    if (!trimmed) continue;
    
    // Match task lists: - [ ] or - [x]
    const taskMatch = trimmed.match(/^[-*]\s+\[[ x]\]\s+(.+)$/);
    if (taskMatch) {
      steps.push(taskMatch[1].trim());
      continue;
    }
    
    // Match bullet points: - or *
    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      steps.push(bulletMatch[1].trim());
      continue;
    }
    
    // Match numbered lists: 1. or 1)
    const numberedMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (numberedMatch) {
      steps.push(numberedMatch[1].trim());
      continue;
    }
    
    // If it's a non-empty line that doesn't match patterns, include it as a step
    if (trimmed && !trimmed.startsWith('#')) {
      steps.push(trimmed);
    }
  }
  
  return steps;
};

/**
 * Extracts plan sections from terminal output
 * Supports both legacy format and Claude Code format
 * Uses a state machine to track current section and build sections incrementally
 */
export const extractPlanSections = (output: string): PlanSection[] => {
  // First try to extract Claude Code formatted plans
  const claudePlans = extractClaudeCodePlans(output);
  if (claudePlans.length > 0) {
    return claudePlans;
  }
  
  // Fall back to legacy format parsing
  const sections: PlanSection[] = [];
  const lines = output.split('\n');
  
  let currentSection: Partial<PlanSection> | null = null;
  let currentContent: string[] = [];
  
  // Regex to detect section headers
  const sectionHeaderRegex = /^(#{1,3}\s+)?(Plan|Implementation Plan|Tasks|Suggestions):\s*(.*)$/i;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(sectionHeaderRegex);
    
    if (match) {
      // Save previous section if exists
      if (currentSection) {
        const content = currentContent.join('\n').trim();
        if (content) {
          currentSection.steps = parsePlanSteps(content);
          currentSection.rawText = content;
          currentSection.rawMarkdown = content;
          if (currentSection.steps.length > 0) {
            sections.push(currentSection as PlanSection);
          }
        }
      }
      
      // Start new section
      const headerType = match[2];
      const title = match[3] || headerType;
      currentSection = {
        id: `${Date.now()}-${sections.length}`,
        type: detectPlanType(headerType),
        title: title.trim(),
        timestamp: new Date(),
      };
      currentContent = [];
    } else if (currentSection) {
      // Add line to current section content
      currentContent.push(line);
    }
  }
  
  // Don't forget the last section
  if (currentSection) {
    const content = currentContent.join('\n').trim();
    if (content) {
      currentSection.steps = parsePlanSteps(content);
      currentSection.rawText = content;
      currentSection.rawMarkdown = content;
      if (currentSection.steps.length > 0) {
        sections.push(currentSection as PlanSection);
      }
    }
  }
  
  return sections;
};

/**
 * Debounced parser to avoid excessive re-parsing
 * Returns a debounced version of extractPlanSections
 * Default 1000ms delay allows Claude Code to finish streaming plan completely
 */
export const createDebouncedParser = (delay: number = 1000) => {
  let timeoutId: NodeJS.Timeout;
  
  return (output: string, callback: (sections: PlanSection[]) => void) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      const sections = extractPlanSections(output);
      callback(sections);
    }, delay);
  };
};

