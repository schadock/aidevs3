import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { OpenAIService } from './OpenAIService.js';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import e from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize dotenv with the root directory path
dotenv.config({ path: path.join(__dirname, '../.env') });

// Check if CENTRALA_KEY is set
if (!process.env.CENTRALA_KEY) {
    throw new Error('CENTRALA_KEY environment variable is not set');
}

const openaiService = new OpenAIService();

const url = `https://c3ntrala.ag3nts.org/data/${process.env.CENTRALA_KEY}/cenzura.txt`;
const outputPath = path.join(__dirname, 'data-S01E05.txt');


async function downloadAndSaveFile() {
  try {
      // Ensure the directory exists
      const directory = path.dirname(outputPath);
      if (!fs.existsSync(directory)) {
          fs.mkdirSync(directory, { recursive: true });
      }

      // Download the file
      const response = await fetch(url);
      if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Get the text content from the response
      const content = await response.text();

      // Save the file
      fs.writeFileSync(outputPath, content);
      
      console.log('File downloaded and saved successfully!');
      return content;
  } catch (error) {
      console.error('Error:', error.message);
      throw error;
  }
}


async function censorText(text) {
  const systemPrompt = {
    role: "system",
    content: `
    
    Twoje zadanie to anonimzacja tekstu
    <rules>
    - Imię i nazwisko -> "CENZURA CENZURA"
    - Wiek (np. "3 lata" -> "CENZURA lata").
    - Wiek (np. "15 lat" -> "CENZURA lat").
    - Miasto (np. "Wrocław" -> "CENZURA").
    - zastąp **cały** adres z numerem domu np. "ul. Szeroka 18" -> "ul. CENZURA"
    - usuń numery
    - Zachowaj oryginalny format tekstu (kropki, przecinki, spacje).
    - Nie usuwaj żadnego tekstu i nie dodawaj nic od siebie
    </rules>
    `
  };

  const data = {
    role: "assistant",
    content: text
  };

  const responseOpenai = await openaiService.completion([systemPrompt, data], 'gpt-4.1-nano', false);
  const responses = responseOpenai.choices[0]?.message?.content || '';
    
  return responses;
}


async function processAndSendCensoredText() {
    try {
        // Download and get the content
        const startTimeDownload = performance.now();
        const originalText = await downloadAndSaveFile();
        const endTimeDownload = performance.now();
        console.log(`downloadAndSaveFile execution time: ${(endTimeDownload - startTimeDownload).toFixed(2)} ms`);
        
        // Censor the text
        const startTimeCensor = performance.now();
        const censoredText = await censorText(originalText);
        const endTimeCensor = performance.now();
        console.log(`censorText execution time: ${(endTimeCensor - startTimeCensor).toFixed(2)} ms`);
        
        console.log('Original text:', originalText);
        console.log('Censored text:', censoredText);
        
        // Prepare the payload
        const payload = {
            task: "CENZURA",
            apikey: process.env.CENTRALA_KEY,
            answer: censoredText
        };
        
        console.log(payload);

        // Send to the API
        const response = await fetch('https://c3ntrala.ag3nts.org/report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8'
            },
            body: JSON.stringify(payload)
        });

        // Log the response data
        const responseData = await response.json();
        if (responseData.message ) console.log('Response:', responseData.message);
        else console.log('Response:', responseData);
        
    } catch (error) {
        console.error('Error:', error.message);
        throw error;
    }
}

// Execute the main function
await processAndSendCensoredText(); 