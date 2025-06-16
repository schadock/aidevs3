import dotenv from 'dotenv';
import path from 'path';
import { downloadArticle } from './downloader.js';
import { OpenAIService } from './OpenAIService.ts';
import fs from 'fs/promises';

dotenv.config({ path: path.join(__dirname, '../.env') });

const articleUrl = 'https://c3ntrala.ag3nts.org/dane/arxiv-draft.html';
const questionsUrl = `https://c3ntrala.ag3nts.org/data/${process.env.CENTRALA_KEY}/arxiv.txt`

const questions = [
  {'01': 'jakiego owocu użyto podczas pierwszej próby transmisji materii w czasie?'},
  {'02': 'Na rynku którego miasta wykonano testową fotografię użytą podczas testu przesyłania multimediów?'},
  {'03': 'Co Bomba chciał znaleźć w Grudziądzu?'},
  {'04': 'Resztki jakiego dania zostały pozostawione przez Rafała?'},
  {'05': 'Od czego pochodzą litery BNW w nazwie nowego modelu językowego?'}
];

const articlePath = path.join(__dirname, 'article.md');
const openaiService = new OpenAIService();

async function answerQuestions(question) {
  try {
    // Read the article content
    const articleContent = await fs.readFile(articlePath, 'utf-8');
    
    // Prepare the messages for OpenAI
    const messages = [
      {
        role: 'system',
        content: 'You are a helpful assistant that answers questions about an article. Answer only based on the information provided in the article. If the information is not in the article, say "Nie znaleziono odpowiedzi w tekście." Keep answers short and to the point.'
      },
      {
        role: 'user',
        content: `Article content: ${articleContent}\n\nQuestion: ${question}`
      }
    ];

    // Get completion from OpenAI
    const response = await openaiService.completion(messages, 'gpt-4o', false);
    
    // Extract and return the answer
    return response.choices[0].message.content || 'Nie znaleziono odpowiedzi w tekście.';
  } catch (error) {
    console.error('Error answering question:', error);
    return 'Wystąpił błąd podczas przetwarzania pytania.';
  }
}

// Process all questions
const extractionPromises = questions.map(questionObj => {
  const [key, question] = Object.entries(questionObj)[0];
  return answerQuestions(question).then(answer => ({
    key,
    answer
  }));
});

// Wait for all questions to be processed
const results = await Promise.all(extractionPromises);

// Format and log results
results.forEach(result => {
  console.log(`{"${result.key}":"${result.answer}"}`);
});

// Uncomment to download fresh article
// await downloadArticle(articleUrl);