export interface DesignChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;       // ISO 8601
  images?: string[];       // base64 data URLs (user messages only)
}

export interface DesignMetadata {
  id: string;
  name: string;
  createdAt: string;       // ISO 8601
  updatedAt: string;       // ISO 8601
  prompts: string[];       // Prompt history (legacy, kept for compat)
  dependencies: string[];  // Extra npm package names (beyond shared)
  files: string[];         // Relative source file paths
  chatHistory: DesignChatMessage[];
}

export interface DesignSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  promptCount: number;
}

export interface DesignDetail extends DesignMetadata {
  fileContents: Record<string, string>;  // path -> content (src/ files only)
}

export interface CreateDesignRequest {
  name: string;
  prompt?: string;
  initialCode?: string;
}

export interface UpdateFileRequest {
  path: string;
  content: string;
}

export interface PackageInfo {
  name: string;
  version: string;
  isBase: boolean; // true if from _shared, false if design-specific
}

export interface InstallResult {
  success: boolean;
  package: string;
  version?: string;
  error?: string;
  duration?: number;
}

export interface InstallPackageRequest {
  name: string;
  version?: string;
}

export interface GenerateRequest {
  prompt: string;
  designId?: string;
  mode?: 'quick' | 'full';
  images?: string[]; // base64 data URLs for vision
}

export interface QuickGenerateResponse {
  code: string;
  explanation: string;
}

export interface FullGenerateResponse {
  designId: string;
  files: Array<{ path: string; content: string }>;
  dependencies: string[];
  explanation: string;
}
