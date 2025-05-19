import type OpenAI from 'openai';
import { OpenAIService } from './OpenAIService';
import { hackRobotPrompt } from './prompts';
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import fetch from 'node-fetch';

const baseUrl = 'https://xyz.ag3nts.org/verify';

interface RobotResponse {
  text?: string;
  msgID?: string;
  error?: string;
}

export class ChatWithRobot {

  private openaiService: OpenAIService;
  private baseUrl: string;

  constructor() {
    this.baseUrl = baseUrl;
    this.openaiService = new OpenAIService();
  }

  async conversation(): Promise<boolean> {
    const authResponse = await this.sendMessage("READY");
    console.log('authResponse', authResponse);
        
    const systemPrompt: ChatCompletionMessageParam = {
      role: "system",
      content: hackRobotPrompt
    };

    const robotPrompt: ChatCompletionMessageParam = {
      role: "assistant",
      content: authResponse.text
    };
    const responseOpenai = await this.openaiService.completion([systemPrompt, robotPrompt], 'gpt-4.1-nano', false) as OpenAI.Chat.Completions.ChatCompletion;
    const content = responseOpenai.choices[0]?.message?.content;
    console.log('content: ', content);
    
    const response = await this.sendMessage(content || "", Number(authResponse.msgID));
    console.log(response);

    if (response.text && response.text.includes('FLG:')) {
      const flagMatch = response.text.match(/FLG:(.*?)}}/);
      if (flagMatch) {
        console.log('Found flag:', flagMatch[1]);
        console.log(' - - Mission Completed - - ');
        return true;
      }
    }
    return false;
  }

  private async sendMessage(text: string, msgID: number = 0): Promise<RobotResponse> {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text,
          msgID
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json() as RobotResponse;
      return data;
    } catch (error) {
      console.error('Error sending message:', error);
      return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  }

}

// Example usage:
// const robot = new ChatWithRobot();
// robot.authenticate().then(response => console.log('Auth response:', response)); 