import { describe, expect, it } from 'vitest';
import { normalizeTitle, isReasoningEffort } from '@/lib/validation';

describe('input validation', () => {
  it('normalizes whitespace and truncates generated conversation titles', () => {
    expect(normalizeTitle('  帮我  规划周末  ')).toBe('帮我  规划周末');
    expect(normalizeTitle('甲'.repeat(50))).toHaveLength(40);
  });

  it('accepts only supported reasoning depths', () => {
    expect(isReasoningEffort('high')).toBe(true);
    expect(isReasoningEffort('xhigh')).toBe(false);
  });
});
