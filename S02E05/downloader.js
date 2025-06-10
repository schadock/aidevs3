import TurndownService from 'turndown';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import path from 'path';
import { OpenAIService } from './OpenAIService.ts';
import fs from 'fs/promises';

dotenv.config({ path: path.join(__dirname, '../.env') });
const openaiService = new OpenAIService();

const CACHE_FILE = 'transcripts_cache.json';
let transcriptsCache = {};

const logMsg = console.log; // Helper function for logging

async function loadTranscriptsCache() {
  try {
    const data = await fs.readFile(CACHE_FILE, 'utf8');
    transcriptsCache = JSON.parse(data);
    console.log('Transcripts cache loaded.');
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('Transcripts cache file not found, initializing empty cache.');
      transcriptsCache = {};
    } else {
      console.error('Error loading transcripts cache:', error);
    }
  }
}

async function saveTranscriptsCache() {
  try {
    await fs.writeFile(CACHE_FILE, JSON.stringify(transcriptsCache, null, 2), 'utf8');
    console.log('Transcripts cache saved.');
  } catch (error) {
    console.error('Error saving transcripts cache:', error);
  }
}

const cacheLoadedPromise = loadTranscriptsCache();

async function describeImage(imageUrl) {
  console.log(`Describing image: ${imageUrl}`);
  // Placeholder for actual image description logic
  // In a real application, this would involve calling a vision API.
  return `Description for ${imageUrl}`;
}

async function readPngFile(imageUrl, imageBuffer) {
  logMsg(`Analyzing PNG image from URL: ${imageUrl}`);
  await cacheLoadedPromise; // Ensure cache is loaded

  if (transcriptsCache[imageUrl]) {
    logMsg(`Returning cached OCR for ${imageUrl}`);
    return transcriptsCache[imageUrl];
  }

  const base64Image = Buffer.from(imageBuffer).toString('base64');

  const messages = [
    {
      role: "system",
      content: `You are a helpful image to text assistant.`
    },
    {
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${base64Image}`,
            detail: "high"
          }
        },
        {
          type: "text",
          text: "read the image and describe it"
        },
      ]
    }
  ];

  try {
    const chatCompletion = await openaiService.completion(messages, "gpt-4.1-mini", false, false, 1024);
    const text = chatCompletion.choices[0].message.content || '';
    logMsg(`Analysis for ${imageUrl} completed.`);

    transcriptsCache[imageUrl] = text;
    await saveTranscriptsCache();

    return text;
  } catch (error) {
    logMsg(`Error analyzing image ${imageUrl}: ${error}`);
    throw error;
  }
}

async function transcriptAudio(audioUrl) {
  console.log(`Transcribing audio: ${audioUrl}`);
  await cacheLoadedPromise;

  if (transcriptsCache[audioUrl]) {
    console.log(`Returning cached transcript for ${audioUrl}`);
    return transcriptsCache[audioUrl];
  }

  try {
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`HTTP error! status: ${audioResponse.status} when fetching ${audioUrl}`);
    }
    const audioBuffer = await audioResponse.arrayBuffer();
    // Pass the file buffer to the transcription service
    const transcript = await openaiService.transcribe(audioBuffer);

    transcriptsCache[audioUrl] = transcript;
    await saveTranscriptsCache();

    return transcript;
  } catch (error) {
    console.error(`Transcription error for ${audioUrl}:`, error);
    throw error; // Re-throw to be handled by the caller
  }
}

export async function downloadArticle(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const html = await response.text();

    const $ = cheerio.load(html);

    // Process images
    const imageProcessingPromises = [];
    $('img').each((i, el) => {
      const imageUrl = $(el).attr('src');
      if (imageUrl) {
        // Check if it's a local PNG file that needs OCR, now fetch and process
        if (imageUrl.startsWith('i/') && imageUrl.endsWith('.png')) {
          imageProcessingPromises.push((async () => {
            try {
              // console.log(`Original imageUrl: ${imageUrl}, Base URL: ${url}`); // Removed for debugging
              const absoluteImageUrl = new URL(imageUrl, url).href; // Construct absolute URL
              logMsg(`Fetching image from: ${absoluteImageUrl}`);
              const imageResponse = await fetch(absoluteImageUrl);
              if (!imageResponse.ok) {
                throw new Error(`HTTP error! status: ${imageResponse.status} when fetching ${absoluteImageUrl}`);
              }
              const imageBuffer = await imageResponse.arrayBuffer();
              const text = await readPngFile(absoluteImageUrl, imageBuffer);
              return { el, text, absoluteImageUrl };
            } catch (error) {
              console.warn(`Error processing image ${imageUrl}: ${error}. Falling back to image description.`);
              const description = await describeImage(imageUrl);
              return { el, description, imageUrl }; // Pass original imageUrl for fallback description
            }
          })());
        } else {
          imageProcessingPromises.push(describeImage(imageUrl).then(description => ({ el, description, imageUrl })));
        }
      }
    });

    const processedImages = await Promise.all(imageProcessingPromises);

    processedImages.forEach(({ el, text, description, absoluteImageUrl, imageUrl: originalImageUrl }) => {
      const displayFileName = absoluteImageUrl ? path.basename(absoluteImageUrl) : path.basename(originalImageUrl);
      if (text) {
        $(el).replaceWith(`<p>Image Description for ${displayFileName}: ${text}</p>`);
      } else if (description) {
        $(el).replaceWith(`<p>Image Description for ${path.basename(originalImageUrl)}: ${description}</p>`);
      }
    });

    const audioTranscriptionPromises = [];
    $('a[href$=".mp3"]').each((i, el) => {
      const audioUrl = $(el).attr('href');
      if (audioUrl) {
        const absoluteAudioUrl = new URL(audioUrl, url).href;
        audioTranscriptionPromises.push(transcriptAudio(absoluteAudioUrl).then(transcript => ({ el, transcript, absoluteAudioUrl })));
      }
    });

    const transcribedAudios = await Promise.all(audioTranscriptionPromises);

    transcribedAudios.forEach(({ el, transcript, absoluteAudioUrl }) => {
      console.log(`Processing audio: ${absoluteAudioUrl}`);
      // Replace the entire anchor tag with a paragraph of the transcript
      $(el).replaceWith(`<p>${path.basename(absoluteAudioUrl)} Transcript: ${transcript}</p>`);
    });

    const turndownService = new TurndownService();
    const markdown = turndownService.turndown($.html());

    await Bun.write('article.md', markdown);
    console.log('Article downloaded and converted to article.md');
  } catch (error) {
    console.error('Error:', error);
  }
}
