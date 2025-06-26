import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';

// You'll need to import your OpenAI service here
import { OpenAIService } from './OpenAIService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });
const openaiService = new OpenAIService();

const articleUrl = 'https://c3ntrala.ag3nts.org/dane/arxiv-draft.html';
const ARTICLES_FILE = path.join(__dirname, 'articles.json');

const previewImageSystemMessage = {
  role: 'system',
  content: 'You are an AI assistant that describes images concisely. Focus on the main elements and overall composition. Always return your response in valid JSON format with "name" and "preview" properties.'
};

// Function to download image and convert to base64
async function downloadImageAsBase64(imageUrl, imageName) {
  try {
    console.log(`  Downloading image: ${imageName}`);
    const response = await fetch(imageUrl);

    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }

    const buffer = await response.buffer();
    const base64 = buffer.toString('base64');

    return {
      name: imageName,
      base64: base64,
      url: imageUrl
    };
  } catch (error) {
    console.error(`  Error downloading image ${imageName}:`, error);
    return null;
  }
}

// Function to get AI description of image
async function previewImage(image, figcaption) {
  try {
    const userMessage = {
      role: 'user',
      content: [
        {
          type: "image_url",
          image_url: { url: `data:image/jpeg;base64,${image.base64}` }
        },
        {
          type: "text",
          text: `Describe the image ${image.name} concisely.
            Focus on the main elements and overall composition.
            Return the result in JSON format with only 'name' and 'preview' properties.
            ${figcaption ? `Caption: ${figcaption}` : ''}
            Return description in Polish language.
          `
        }
      ]
    };

    const response = await openaiService.completion({
      messages: [previewImageSystemMessage, userMessage],
      model: 'gpt-4o'
    });

    let content = response.choices[0].message.content || '{}';

    // Remove markdown code blocks if present
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    try {
      const result = JSON.parse(content);
      return { name: result.name || image.name, preview: result.preview || '' };
    } catch (parseError) {
      console.error(`  JSON parse error for content: ${content.substring(0, 100)}...`);
      return { name: image.name, preview: 'Image description unavailable - parse error' };
    }
  } catch (error) {
    console.error(`  Error processing image with AI:`, error);
    return { name: image.name, preview: 'Image description unavailable' };
  }
}

// Function to download and transcribe audio
async function downloadAndTranscribeAudio(audioUrl, audioName) {
  try {
    console.log(`  Downloading audio: ${audioName}`);
    const response = await fetch(audioUrl);

    if (!response.ok) {
      throw new Error(`Failed to download audio: ${response.status} ${response.statusText}`);
    }

    const audioBuffer = await response.buffer();

    console.log(`  Transcribing ${audioName}...`);
    const startTime = performance.now();
    const transcription = await openaiService.transcribe(audioBuffer, audioName);
    const endTime = performance.now();

    if (transcription) {
      console.log(`  ✓ Transcription completed in ${(endTime - startTime).toFixed(2)} ms`);
      return transcription;
    }
    return null;
  } catch (error) {
    console.error(`  Error processing audio ${audioName}:`, error);
    return null;
  }
}

export async function fetchAndSaveArticles() {
  try {
    console.log('Fetching and parsing articles...');
    const response = await fetch(articleUrl);
    const html = await response.text();

    const $ = cheerio.load(html);
    const articles = [];
    const baseUrl = new URL('.', articleUrl).toString();

    const h2s = $('h2').get();
    for (const [i, h2] of h2s.entries()) {
      const articleId = i + 1;
      console.log(`Parsing article ID ${articleId}...`);

      const title = $(h2).text().trim();
      let text = '';
      const media = [];
      let imageCounter = 1;
      let audioCounter = 1;

      let currentElement = $(h2).next();

      while (currentElement.length > 0 && !currentElement.is('h2')) {
        if (currentElement.is('p') || currentElement.is('div')) {
          text += currentElement.text().trim() + ' ';
        } else if (currentElement.is('figure')) {
          const imgSrc = currentElement.find('img').attr('src');
          const figcaption = currentElement.find('figcaption').text().trim();
          if (imgSrc) {
            const imageUrl = new URL(imgSrc, baseUrl).toString();
            const imageName = `article_${articleId}_image_${imageCounter}`;

            console.log(`  Processing image ${imageCounter} in article ${articleId}...`);

            // Download and process image
            const imageData = await downloadImageAsBase64(imageUrl, imageName);
            if (imageData) {
              const description = await previewImage(imageData, figcaption);

              // Add image description to text with caption
              let imageText = `[Image ${imageCounter}: ${description.preview}`;
              if (figcaption) {
                imageText += ` Caption: ${figcaption}`;
              }
              imageText += '] ';
              text += imageText;

              console.log(`    ✓ Image processed: ${description.preview.substring(0, 50)}...`);
            } else {
              // Fallback if image processing fails
              let imageText = `[Image ${imageCounter}`;
              if (figcaption) {
                imageText += `: ${figcaption}`;
              }
              imageText += '] ';
              text += imageText;
            }

            // Still keep media record for reference
            media.push({
              type: 'image',
              url: imageUrl,
              caption: figcaption || null,
              name: imageName,
              processed: imageData ? true : false
            });

            imageCounter++;
          }
        } else if (currentElement.is('audio')) {
          const audioSrc = currentElement.find('source').attr('src');
          if (audioSrc) {
            const audioUrl = new URL(audioSrc, baseUrl).toString();
            const audioName = `article_${articleId}_audio_${audioCounter}`;

            console.log(`  Processing audio ${audioCounter} in article ${articleId}...`);

            // Download and transcribe audio
            const transcription = await downloadAndTranscribeAudio(audioUrl, audioName);
            if (transcription) {
              // Add transcription to text
              const audioText = `[Audio ${audioCounter}: ${transcription}] `;
              text += audioText;

              console.log(`    ✓ Audio transcribed: ${transcription.substring(0, 50)}...`);
            } else {
              // Fallback if audio processing fails
              const audioText = `[Audio ${audioCounter}: Transcription unavailable] `;
              text += audioText;
            }

            // Still keep media record for reference
            media.push({
              type: 'audio',
              url: audioUrl,
              name: audioName,
              transcription: transcription || null,
              processed: transcription ? true : false
            });

            audioCounter++;
          }
        }
        currentElement = currentElement.next();
      }

      articles.push({
        id: articleId,
        title: title,
        text: text.trim(),
        media
      });
    }

    await fs.writeFile(ARTICLES_FILE, JSON.stringify(articles, null, 2));
    console.log('Raw articles saved to articles.json');
    return articles;
  } catch (error) {
    console.error('Error fetching and parsing articles:', error);
    throw error;
  }
}