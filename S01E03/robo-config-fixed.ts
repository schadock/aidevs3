import * as fs from 'fs';
import * as path from 'path';
import type OpenAI from 'openai';
import { OpenAIService } from './OpenAIService';
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Create a single instance that can be reused
const openaiService = new OpenAIService();

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

async function answerQuestion(questions: { index: number; question: string }[], data: RoboConfig): Promise<void> {
    const systemPrompt: ChatCompletionMessageParam = {
        role: "system",
        content: `Answer each question very briefly and concisely.`
    };

    const answers: ChatCompletionMessageParam = {
        role: "assistant",
        content: questions.map(q => q.question).join('\n')
    };

    const responseOpenai = await openaiService.completion([systemPrompt, answers], 'gpt-4.1-nano', false) as OpenAI.Chat.Completions.ChatCompletion;
    const responses = responseOpenai.choices[0]?.message?.content?.split('\n') || [];

    console.log('Questions:', questions);
    console.log('OpenAI Response:', responseOpenai.choices[0]?.message?.content);
    console.log('Parsed Responses:', responses);

    // Map responses back to the test data
    questions.forEach((q, idx) => {
        const testData = data['test-data'][q.index];
        if (responses[idx] && testData && testData.test) {
            console.log(`Mapping answer "${responses[idx]}" to question ${q.index}: "${q.question}"`);
            testData.test.a = responses[idx];
        }
    });
    console.log(questions);
}

export async function fixRoboConfig(): Promise<string> {
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

        await answerQuestion(testQuestions, data);

        // Save the processed data to data-report.json
        const outputPath = path.join(__dirname, 'data-report.json');
        fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
        
        console.log('Data processing completed. Results saved to data-report.json');

        // Structure the report data
        const reportData = {
            task: "JSON",
            apikey: process.env.CENTRALA_KEY,
            answer: {
                apikey: process.env.CENTRALA_KEY,
                description: data.description,
                copyright: data.copyright,
                "test-data": data["test-data"]
            }
        };

        // Send the data to the API
        const response = await fetch('https://c3ntrala.ag3nts.org/report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(reportData),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.text();
        console.log('API Response:', result);
        
        // Parse the response and return the message
        const jsonResult = JSON.parse(result);
        return jsonResult.message;

    } catch (error) {
        console.error('Error processing the data:', error);
        throw error;
    }
}

// Run the function
fixRoboConfig().then(message => {
    console.log('Final message:', message);
}); 