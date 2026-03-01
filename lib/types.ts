// Shared types used across pages and components

export interface Application {
  id: string;
  displayName: string;
  iconUrl: string | null;
  colorIndex: number | null;
}

export interface Session {
  id: string;
  appId: string;
  title: string | null;
  messageCount: number;
  starred: number;
  createdAt: number;
  updatedAt: number;
}

export interface SessionWithPreview extends Session {
  preview: string | null;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

export interface SearchResult {
  sessionId: string;
  sessionTitle: string | null;
  appId: string;
  messageId: string;
  role: 'user' | 'assistant';
  snippet: string;
  score: number;
  createdAt: number;
  sessionCreatedAt: number;
  sessionMessageCount: number;
  sessionUpdatedAt: number;
}

export interface Stats {
  totalConversations: number;
  totalMessages: number;
  appsUsed: number;
  appIds: string[];
  avgMessagesPerChat: number;
  weekConversations: number;
  weekMessages: number;
}

export interface UserProfile {
  id: string;
  username: string;
  avatarUrl: string | null;
}

export interface Token {
  id: string;
  name: string;
  lastUsedAt: number | null;
  createdAt: number;
  revokedAt: number | null;
}
