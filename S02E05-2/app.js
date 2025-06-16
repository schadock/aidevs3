import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


dotenv.config({ path: path.join(__dirname, '../.env') });


const articleUrl = 'https://c3ntrala.ag3nts.org/dane/arxiv-draft.html';

async function fetchAndSaveArticle() {
  try {
    // Fetch the article
    const response = await fetch(articleUrl);
    const html = await response.text();

    // Parse HTML with cheerio
    const $ = cheerio.load(html);

    const articles = [];
    const baseUrl = new URL('.', articleUrl).toString();

    $('h2').each((i, h2) => {
      const title = $(h2).text().trim();
      let text = '';
      const media = [];

      let currentElement = $(h2).next();

      while (currentElement.length > 0 && !currentElement.is('h2')) {
        if (currentElement.is('p') || currentElement.is('div')) {
          text += currentElement.text().trim() + ' ';
        } else if (currentElement.is('figure')) {
          const imgSrc = currentElement.find('img').attr('src');
          const figcaption = currentElement.find('figcaption').text().trim();
          if (imgSrc) {
            media.push({
              type: 'image',
              url: new URL(imgSrc, baseUrl).toString(),
              caption: figcaption || null,
            });
          }
        } else if (currentElement.is('audio')) {
          const audioSrc = currentElement.find('source').attr('src');
          if (audioSrc) {
            media.push({
              type: 'audio',
              url: new URL(audioSrc, baseUrl).toString(),
            });
          }
        }
        currentElement = currentElement.next();
      }

      articles.push({
        id: i + 1,
        title: title,
        text: text.trim(),
        media,
      });
    });

    const outputPath = path.join(__dirname, 'article.json');
    await fs.writeFile(outputPath, JSON.stringify(articles, null, 2));

    console.log('Article processed and saved to article.json');
  } catch (error) {
    console.error('Error processing article:', error);
  }
}

// Execute the function
fetchAndSaveArticle();