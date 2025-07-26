import OpenAI, { toFile } from "openai";
import type { ChatCompletionMessageParam, ChatCompletion, ChatCompletionChunk } from "openai/resources/chat/completions";
import { createByModelName } from '@microsoft/tiktokenizer';
import type { CreateEmbeddingResponse } from 'openai/resources/embeddings';

interface JinaEmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  model: string;
  object: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export class OpenAIService {
  private openai: OpenAI;
  private tokenizers: Map<string, Awaited<ReturnType<typeof createByModelName>>> = new Map();
  private readonly IM_START = "<|im_start|>";
  private readonly IM_END = "<|im_end|>";
  private readonly IM_SEP = "<|im_sep|>";

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    this.openai = new OpenAI({ apiKey });
  }

  private async getTokenizer(modelName: string) {
    if (!this.tokenizers.has(modelName)) {
      const specialTokens: ReadonlyMap<string, number> = new Map([
        [this.IM_START, 100264],
        [this.IM_END, 100265],
        [this.IM_SEP, 100266],
      ]);
      const tokenizer = await createByModelName(modelName, specialTokens);
      this.tokenizers.set(modelName, tokenizer);
    }
    return this.tokenizers.get(modelName)!;
  }

  async countTokens(messages: ChatCompletionMessageParam[], model: string = 'gpt-4o'): Promise<number> {
    const tokenizer = await this.getTokenizer(model);

    let formattedContent = '';
    messages.forEach((message) => {
      formattedContent += `${this.IM_START}${message.role}${this.IM_SEP}${message.content || ''}${this.IM_END}`;
    });
    formattedContent += `${this.IM_START}assistant${this.IM_SEP}`;

    const tokens = tokenizer.encode(formattedContent, [this.IM_START, this.IM_END, this.IM_SEP]);
    return tokens.length;
  }

  async completion(config: {
    messages: ChatCompletionMessageParam[],
    model?: string,
    stream?: boolean,
    temperature?: number,
    jsonMode?: boolean,
    maxTokens?: number
  }): Promise<OpenAI.Chat.Completions.ChatCompletion | AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
    const { messages, model = "o1-mini", stream = false, jsonMode = false, maxTokens = 14000, temperature = 0 } = config;
    try {
      const completionOptions: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
        messages,
        model,
        stream,
        temperature,
        max_tokens: maxTokens,
        response_format: jsonMode ? { type: "json_object" } : { type: "text" }
      };

      const chatCompletion = await this.openai.chat.completions.create(completionOptions);

      if (stream) {
        return chatCompletion as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
      } else {
        return chatCompletion as OpenAI.Chat.Completions.ChatCompletion;
      }
    } catch (error) {
      console.error("Error in OpenAI completion:", error);
      throw error;
    }
  }

  isStreamResponse(response: ChatCompletion | AsyncIterable<ChatCompletionChunk>): response is AsyncIterable<ChatCompletionChunk> {
    return Symbol.asyncIterator in response;
  }

  parseJsonResponse<IResponseFormat>(response: ChatCompletion): IResponseFormat | { error: string, result: boolean } {
    try {
      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('Invalid response structure');
      }
      const parsedContent = JSON.parse(content);
      return parsedContent;
    } catch (error) {
      console.error('Error parsing JSON response:', error);
      return { error: 'Failed to process response', result: false };
    }
  }

  async createEmbedding(text: string): Promise<number[]> {
    try {
      const response: CreateEmbeddingResponse = await this.openai.embeddings.create({
        model: "text-embedding-3-large",
        input: text,
      });
      return response.data?.[0]?.embedding ?? [];
    } catch (error) {
      console.error("Error creating embedding:", error);
      throw error;
    }
  }

  async createJinaEmbedding(text: string): Promise<number[]> {
    const jinaApiKey = process.env.JINA_API_KEY;
    if (!jinaApiKey) {
      throw new Error('JINA_API_KEY environment variable is required');
    }

    try {
      const response = await fetch('https://api.jina.ai/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jinaApiKey}` // TODO NIE JESTEM PEWIEN CZY TO BEDZIE DZIAŁAĆ
        },
        body: JSON.stringify({
          model: 'jina-embeddings-v3',
          task: 'text-matching',
          dimensions: 1024,
          late_chunking: false,
          embedding_type: 'float',
          input: [text]
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json() as JinaEmbeddingResponse;

      if (!data.data || data.data.length === 0) {
        throw new Error('Invalid response format from Jina API');
      }

      const firstEmbedding = data.data[0];
      if (!firstEmbedding || !firstEmbedding.embedding) {
        throw new Error('Invalid embedding data from Jina API');
      }

      return firstEmbedding.embedding;
    } catch (error) {
      console.error("Error creating Jina embedding:", error);
      throw error;
    }
  }

  async speak(text: string) {
    const response = await this.openai.audio.speech.create({
      model: 'tts-1',
      voice: 'alloy',
      input: text,
    });

    console.log("Response:", response.body);
    const stream = response.body;
    return stream;
  }

  async transcribe(audioBuffer: Buffer): Promise<string> {
    console.log("Transcribing audio...");

    const transcription = await this.openai.audio.transcriptions.create({
      file: await toFile(audioBuffer, 'speech.m4a', { type: 'audio/mp4' }),
      language: 'pl',
      model: 'whisper-1',
  });
    return transcription.text;
  }

}