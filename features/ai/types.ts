export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiProvider {
  name: 'cloud' | 'local';
  isAvailable(): Promise<boolean>;
  generate(messages: ChatMessage[]): Promise<string>;
}
