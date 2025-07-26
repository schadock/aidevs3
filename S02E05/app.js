import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

import { OpenAIService } from '../helpers/OpenAIService.ts';
import { fetchAndSaveArticles } from './fetchArticles.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });
const openaiService = new OpenAIService();

const questions = [
  {'01': 'jakiego owocu użyto podczas pierwszej próby transmisji materii w czasie?'},
  {'02': 'Na rynku którego miasta wykonano testową fotografię użytą podczas testu przesyłania multimediów?'},
  {'03': 'Co Bomba chciał znaleźć w Grudziądzu?'},
  {'04': 'Co Rafał pozostawił resztki jakiego dania?'},
  {'05': 'Od czego pochodzą litery BNW w nazwie nowego modelu językowego?'}
];

const ARTICLES_FILE = path.join(__dirname, 'articles.json');
const ANSWERS_FILE = path.join(__dirname, 'answers.json');
const FULL_FILE = path.join(__dirname, 'full.json');
const FINAL_ANSWERS_FILE = path.join(__dirname, 'finall-answers.json');

// Array of article IDs to process
const SELECTED_ARTICLE_IDS = [3,4,5,6];

async function processArticles() {
  try {
    console.log('Processing articles...');
    const allRawArticles = JSON.parse(await fs.readFile(ARTICLES_FILE, 'utf-8'));
    const rawArticles = allRawArticles
    // const rawArticles = allRawArticles.filter(article => SELECTED_ARTICLE_IDS.includes(article.id));
    // console.log(`Processing ${rawArticles.length} articles (IDs: ${SELECTED_ARTICLE_IDS.join(', ')})`);
    const processedArticles = [];

    for (const article of rawArticles) {
      console.time(`Processing article ID ${article.id}`);
      console.log(`Processing article ID ${article.id}: "${article.title}"`);

      try {
        const answers = await extractInformation(article);
        console.log(article.id, answers);
        processedArticles.push({
          id: article.id,
          answers: answers
        });
        console.timeEnd(`Processing article ID ${article.id}`);
      } catch (error) {
        console.error(`Error processing article ID ${article.id}:`, error);
      }
    }

    // Save processed articles to answers.json
    await fs.writeFile(ANSWERS_FILE, JSON.stringify(processedArticles, null, 2), 'utf-8');
    console.log(`Processed articles saved to ${ANSWERS_FILE}`);

    return processedArticles;

  } catch (error) {
    console.error('Error processing articles:', error);
    throw error;
  }
}

/**
 * Extracts information from the provided article text.
 *
 * @param {number} id - The ID of the article
 * @param {string} title - The title of the article
 * @param {string} text - The input text from which to extract information
 * @returns {Promise<string>} The extracted information as a string
 */
async function extractInformation(article) {
    const { id, title, text } = article;
    const timerLabel = `Extraction for article ID ${id} finished in`;
    console.log(`Extracting information for article ID ${id}...`);
    console.time(timerLabel);

    const extractionMessage = {
      content: `
        Find the answer to the questions.
        The key information are in the article.
        Use only information from the text and title!
        Write answer in POLISH language.

        <questions>
        ${questions.map(q => {
          const [index, question] = Object.entries(q)[0];
          return `${index}. ${question}`;
        }).join('\n      ')}
        </questions>
      `,
      role: 'system'
    };

    const userMessage = {
      content: `Title:  "${title}" Text: ${text}`,
      role: 'user'
    };

    // console.log(extractionMessage);
    // console.log(userMessage);
    // return

    const response = await openaiService.completion({
      messages: [extractionMessage, userMessage],
      model: 'gpt-4.1',
      stream: false
    });

    console.timeEnd(timerLabel);
    return response.choices[0].message.content || '';
}

/**
 * Analyzes all answers from answers.json using OpenAI
 *
 * @returns {Promise<string>} The analysis result from OpenAI
 */
async function analyzeAnswers() {
  try {
    console.log('Loading answers from answers.json...');
    const answersData = JSON.parse(await fs.readFile(FULL_FILE, 'utf-8'));

    console.log(`Loaded ${answersData.length} answer sets`);
    console.log(answersData);

    // Format all answers into a readable structure
    // const formattedAnswers = answersData.map(item => {
    //   return `Article ID ${item.id}:\n${item.answers}`;
    // }).join('\n\n---\n\n');

    const systemMessage = {
      // content: `przeanalizuj odpowiedzi i zidentyfikuj kluczowe informacje i sformuj odpowiedzi na pytania:
      content: `W tekście znajdują się odpowiedzi na pytania.
      Zidentyfikuj kluczowe informacje i sformuj odpowiedzi na pytania.
      Odpowiedzi są w formacie JSON.
      Wygeneruj krótkie, jednozdaniowe odpowiedzi na pytania.
      Wszystkie odpowiedzi zwróć w tagach <answer> ... </answer>
      Odpowiedzi są w formacie JSON.
      ${questions.map(q => {
          const [index, question] = Object.entries(q)[0];
          return `${index}. ${question}`;
        }).join('\n      ')} `,
      role: 'system'
    };

    const userMessage = {
      // content: `Here are all the answers from the processed articles:\n\n${formattedAnswers}`,
      content: answersData.content,
      role: 'user'
    };

    console.log('Sending answers to OpenAI for analysis...');
    console.time('OpenAI analysis completed in');

    const response = await openaiService.completion({
      messages: [systemMessage, userMessage],
      model: 'gpt-4.1',
      stream: false
    });

    console.timeEnd('OpenAI analysis completed in');

    const analysisResult = response.choices[0].message.content || '';
    console.log('Full AI Response:', analysisResult);

    // Extract content from <answer> tags
    const answerMatch = analysisResult.match(/<answer>(.*?)<\/answer>/s);
    if (answerMatch && answerMatch[1]) {
      const answerContent = answerMatch[1].trim();
      console.log('Extracted answer content:', answerContent);
      
      try {
        // Try to parse as JSON
        const jsonAnswer = JSON.parse(answerContent);
        console.log('Parsed JSON answer:', jsonAnswer);
        return jsonAnswer;
      } catch (error) {
        console.log('Answer content is not valid JSON, returning as string');

      // Save final answers to JSON file
        await fs.writeFile(FINAL_ANSWERS_FILE, JSON.stringify(answerContent, null, 2), 'utf-8');
        console.log(`Final answers saved to ${FINAL_ANSWERS_FILE}`);
        return answerContent;
      }
    } else {
      console.log('No <answer> tags found in response');
      return analysisResult;
    }

  } catch (error) {
    console.error('Error analyzing answers:', error);
    throw error;
  }
}

/**
 * Creates full.json file by merging articles.json content
 * Format: title, article, title, article, etc.
 *
 * @returns {Promise<void>}
 */
async function createFullJson() {
  try {
    console.log('Creating full.json from articles.json...');
    console.time('Creating full.json completed in');
    
    // Read articles.json
    const articlesData = JSON.parse(await fs.readFile(ARTICLES_FILE, 'utf-8'));
    console.log(`Loaded ${articlesData.length} articles`);
    
    // Create merged content: title, article, title, article, etc.
    const mergedContent = articlesData.map(article => {
      return `${article.title}\n${article.text}`;
    }).join('\n');
    
    // Save to full.json
    const fullData = {
      content: mergedContent,
      totalArticles: articlesData.length,
      createdAt: new Date().toISOString()
    };
    
    await fs.writeFile(FULL_FILE, JSON.stringify(fullData, null, 2), 'utf-8');
    console.log(`Full content saved to ${FULL_FILE}`);
    console.timeEnd('Creating full.json completed in');
    
    return fullData;
    
  } catch (error) {
    console.error('Error creating full.json:', error);
    throw error;
  }
}

async function sendReport(taskType, anwser) {
  // Prepare the payload
  const payload = {
    task: taskType,
    apikey: process.env.CENTRALA_KEY,
    answer: anwser
  };

  // Send to the API
  const response = await fetch('https://c3ntrala.ag3nts.org/report', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(payload)
  });

  const responseData = await response.json();
  console.log('Response:', responseData);

  if (responseData.code === 0 && responseData.message) {
    const match = responseData.message.match(/FLG:{{FLG:(.*?)}}/);
    if (match && match[1]) {
      console.log('Extracted FLG value:', match[1]);
    }
  }
}


// Main execution
async function main() {
  try {
    // await fetchAndSaveArticles();
    // await processArticles();
    // let answer = await analyzeAnswers();
    let answer = JSON.parse(await fs.readFile(FINAL_ANSWERS_FILE, 'utf-8'));

    console.log(answer);
    await sendReport('arxiv', answer);
    console.log('All articles have been processed successfully!');
  } catch (error) {
    console.error('Error in main execution:', error);
    process.exit(1);
  }
}

main();