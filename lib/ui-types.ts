import type { Conversation, ImageTask, Message, Project } from '@/lib/repositories';

export type ConversationView = Conversation & { messages?: Message[]; imageTasks?: ImageTask[] };
