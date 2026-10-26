export const CHAT_MODEL = 'gpt-6.1-sol';
export const IMAGE_MODEL = 'gpt-image-2.5';
export const IMAGE_SIZES = ['1024x1024', '1280x720', '720x1280'] as const;
export const REASONING_EFFORTS = ['low', 'medium', 'high'] as const;
export const SESSION_COOKIE = 'lt_session';
export type ImageSize = (typeof IMAGE_SIZES)[number];
