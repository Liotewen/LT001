import { REASONING_EFFORTS } from '@/lib/constants';

export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export function normalizeTitle(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '新对话';
  return Array.from(trimmed).slice(0, 40).join('');
}

export function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === 'string' && REASONING_EFFORTS.includes(value as ReasoningEffort);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown, maxLength = 20_000): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}
