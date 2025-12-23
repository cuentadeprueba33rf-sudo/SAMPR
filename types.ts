
export type AppMode = 'pregunta' | 'academic';
export type AcademicGrade = 'universidad' | 'bachiller' | 'none';
export type UtilityMode = 'none' | 'search' | 'academic' | 'finance';
export type ThemeMode = 'dark' | 'light' | 'system';

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface MemoryItem {
  id: string;
  key: string;
  value: string;
  timestamp: number;
}

export interface Message {
  role: 'user' | 'sam';
  content: string;
  type: 'text' | 'image' | 'video';
  mediaUrl?: string;
  sources?: GroundingSource[];
  memoryUpdated?: boolean;
  isNew?: boolean; // Nueva propiedad para animaciones
}

export interface GenerationState {
  isGenerating: boolean;
  statusMessage?: string;
  progress?: number;
}
