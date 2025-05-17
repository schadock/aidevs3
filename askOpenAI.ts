import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const client = new OpenAI();

export async function askQuestionToModel(instruction: string, input: string): Promise<string> {
  try {

    const response = await client.responses.create({
      model: "gpt-4.1-nano",
      instructions: instruction,
      input: input
    });
    return response.output_text;

  } catch (error) {
    console.error('Error asking question to model:', error);
    throw error;
  }
} 