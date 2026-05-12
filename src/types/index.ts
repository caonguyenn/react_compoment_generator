export interface Design {
  id: string;
  name: string;
  code: string;
  prompt: string;
  explanation: string;
  createdAt: number;
  updatedAt: number;
}

export interface GenerationRequest {
  prompt: string;
  currentCode?: string;
}

export interface GenerationResponse {
  code: string;
  explanation: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  images?: string[]; // base64 data URLs
}

// Re-export design types
export type {
  DesignMetadata,
  DesignSummary,
  DesignDetail,
  CreateDesignRequest,
  UpdateFileRequest,
  PackageInfo,
  InstallResult,
  InstallPackageRequest,
  GenerateRequest,
  QuickGenerateResponse,
  FullGenerateResponse,
} from './design';
