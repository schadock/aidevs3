import * as fs from 'fs';
import * as path from 'path';
import type OpenAI from 'openai';
import { OpenAIService } from './OpenAIService';
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
// Create a single instance that can be reused
// const openaiService = new OpenAIService();

interface TestData {
    question: string;
    answer: number;
    test?: {
        q: string;
        a: string;
    };
}

interface RoboConfig {
    apikey: string;
    description: string;
    copyright: string;
    'test-data': TestData[];
}

function answerQuestion(test: { q: string; a: string }): boolean {
    // Convert both strings to lowercase for case-insensitive comparison
    const question = test.q.toLowerCase().trim();
    
    // const responseOpenai = await openaiService.completion([systemPrompt, robotPrompt], 'gpt-4.1-nano', false) as OpenAI.Chat.Completions.ChatCompletion;

    // For now, just do a direct comparison
    // This can be expanded based on specific question-answer matching requirements
    return true;
}

export function fixRoboConfig(): void {
    try {
        // Read the input JSON file
        const inputPath = path.join(__dirname, 'data-S01E03.json');
        const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8')) as RoboConfig;

        // Array to store questions with test field
        const testQuestions: { index: number; question: string }[] = [];

        // Process each test data entry
        data['test-data'].forEach((item, index) => {
            // If item has a test field, collect it
            if (item.test) {
                testQuestions.push({
                    index,
                    question: item.test.q
                });
                return;
            }

            // Process math operation in question
            const mathExpression = item.question;
            const parts = mathExpression.split(' ');
            
            if (parts.length === 3 && parts[1] === '+') {
                const num1 = parseInt(parts[0] as string);
                const num2 = parseInt(parts[2] as string);
                if (!isNaN(num1) && !isNaN(num2)) {
                    item.answer = num1 + num2;
                }
            }
        });

        // Log collected test questions
        console.log(`Found ${testQuestions.length} questions with test field:`);
        testQuestions.forEach(({ index, question }) => {
            console.log(`Question #${index}: ${question}`);
        });

        // Save the processed data to data-report.json
        const outputPath = path.join(__dirname, 'data-report.json');
        fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
        
        console.log('Data processing completed. Results saved to data-report.json');
    } catch (error) {
        console.error('Error processing the data:', error);
        throw error;
    }
}

// Run the function
fixRoboConfig(); 