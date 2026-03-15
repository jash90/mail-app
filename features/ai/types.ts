export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiProvider {
  name: 'cloud' | 'local';
  generate(messages: ChatMessage[]): Promise<string>;
}
