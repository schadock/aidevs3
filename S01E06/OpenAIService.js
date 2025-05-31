import OpenAI from "openai";

export class OpenAIService {
  openai;

  constructor() {
    this.openai = new OpenAI();
  }

  async completion(
    messages,
    model = "gpt-4.1-nano",
    stream = false,
    jsonMode = false
  ) {
    try {
      const chatCompletion = await this.openai.chat.completions.create({
        messages,
        model,
        stream,
        response_format: jsonMode ? { type: "json_object" } : { type: "text" }
      });

      if (stream) {
        return chatCompletion;
      } else {
        return chatCompletion;
      }
    } catch (error) {
      console.error("Error in OpenAI completion:", error);
      throw error;
    }
  }
}