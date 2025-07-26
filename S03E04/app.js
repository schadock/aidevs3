import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

import { OpenAIService } from '../helpers/OpenAIService.ts';
import { sendReport } from '../helpers/ReportService.ts';

const openaiService = new OpenAIService();
const taskName = 'loop';

// Import barbara.txt as variable
const barbaraData = await fs.readFile(path.join(__dirname, '../data-from-c3ntral/barbara.txt'), 'utf-8');

// Normalize text function - remove Polish characters and convert to uppercase
function normalizeText(text) {
  return text
    .toUpperCase()
    .replace(/Ą/g, 'A')
    .replace(/Ć/g, 'C')
    .replace(/Ę/g, 'E')
    .replace(/Ł/g, 'L')
    .replace(/Ń/g, 'N')
    .replace(/Ó/g, 'O')
    .replace(/Ś/g, 'S')
    .replace(/Ź/g, 'Z')
    .replace(/Ż/g, 'Z');
}

// Extract names and cities from barbaraData
async function extractNamesAndCities() {
  const prompt = `
Wyodrębnij z poniższego tekstu wszystkie wspomniane imiona osób i nazwy miast.
Zwróć odpowiedź w formacie JSON z dwoma tablicami: "names" i "cities".

Wymagania:
- Imiona powinny być w mianowniku, BEZ POLSKICH ZNAKÓW
- Nazwy miast bez polskich znaków, pisane wielkimi literami (np. BARBARA, ALEKSANDER, KRAKOW, GDANSK)
- Usuń duplikaty
- Zwróć tylko imiona osób (nie nazwiska)
- wszystko toUpperCase

Tekst do analizy:
${barbaraData}
`;

  try {
    const response = await openaiService.completion({
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      model: 'gpt-4o-mini',
      jsonMode: true,
      temperature: 0
    });

    if (openaiService.isStreamResponse(response)) {
      throw new Error('Unexpected stream response');
    }

    const result = openaiService.parseJsonResponse(response);

    if ('error' in result) {
      throw new Error(result.error);
    }

    const { names, cities } = result;

    const normalizedNames = names.map(normalizeText);
    const normalizedCities = cities.map(normalizeText);

    // Save to JSON files
    await fs.writeFile(
      path.join(__dirname, 'names.json'),
      JSON.stringify(normalizedNames, null, 2),
      'utf-8'
    );

    await fs.writeFile(
      path.join(__dirname, 'places.json'),
      JSON.stringify(normalizedCities, null, 2),
      'utf-8'
    );

    console.log('Names extracted:', normalizedNames);
    console.log('Cities extracted:', normalizedCities);
    console.log('Files saved: names.json and places.json');

  } catch (error) {
    console.error('Error extracting names and cities:', error);
  }
}


// Generic API querying function
async function queryApi(queue, taskType, apiEndpoint, processedSet) {
  try {
    console.log(`Starting with ${taskType}:`, queue);

    const results = [];
    const allPlaces = new Set();
    const allNames = new Set();

    // Add initial items to sets
    queue.forEach(item => {
      if (taskType === 'places') {
        allPlaces.add(item);
      } else if (taskType === 'people') {
        allNames.add(item);
      }
    });

    while (queue.length > 0) {
      const item = queue.shift();

      if (processedSet.has(item)) continue;

      processedSet.add(item);
      console.log(`Processing ${taskType}: ${item}`);

      const data = {
        task: taskType,
        apikey: process.env.CENTRALA_KEY,
        query: item
      }

      // Query the API
      const apiResponse = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify(data)
      });

      if (!apiResponse.ok) {
        console.error(`API error for ${item}: ${apiResponse.status}`);
        continue;
      }

      const responseData = await apiResponse.json();

      let responseMessage;
      // If response code is 0, return only the message
      if (responseData.code === 0) {
        responseMessage = responseData.message;
        console.log(`API response for ${item}:`, responseMessage);
        results.push({
          query: item,
          response: responseMessage
        });
      } else {
        responseMessage = responseData;
        console.log(`Warning: API response for ${item}:`, responseData);
        results.push({
          query: item,
          response: responseData
        });
      }

      // Extract names and URLs from plain text response
      if (responseMessage && typeof responseMessage === 'string') {
        // Skip if response is restricted data
        if (responseMessage === '[**RESTRICTED DATA**]') {
          console.log('Skipping restricted data response');
          continue;
        }

        // Check if response starts with http (URL)
        if (responseMessage.startsWith('http')) {
          allUrls.add(responseMessage);
          console.log(`🔗 Found URL: ${responseMessage}`);
          continue; // Skip name extraction for URL responses
        }

        console.log('Extracting names from text response...');
        const names = responseMessage.split(' ').filter(name => name.trim().length > 0);

        for (const name of names) {
          const normalizedName = normalizeText(name);

          // If we're querying places, add names to names queue
          // If we're querying names, add names to places queue
          if (taskType === 'places') {
            if (!allNames.has(normalizedName)) {
              allNames.add(normalizedName);
              allUniqueNames.add(normalizedName);
              namesQueue.push(normalizedName);
              console.log(`Added new name to global names queue: ${normalizedName}`);
            }
          } else if (taskType === 'people') {
            if (!allPlaces.has(normalizedName)) {
              allPlaces.add(normalizedName);
              allUniquePlaces.add(normalizedName);
              placesQueue.push(normalizedName);
              console.log(`Added new place to global places queue: ${normalizedName}`);
            }
          }
        }
      }
    }

    return results;
  } catch (error) {
    console.error(`Error in ${taskType} API querying:`, error);
  }
}

// Process names
async function processNames() {
  try {
    const processedNames = new Set();

    return await queryApi(namesQueue, 'people', 'https://c3ntrala.ag3nts.org/people', processedNames);
  } catch (error) {
    console.error('Error processing names:', error);
  }
}

// Process places
async function processPlaces() {
  try {
    const processedPlaces = new Set();

    return await queryApi(placesQueue, 'places', 'https://c3ntrala.ag3nts.org/places', processedPlaces);
  } catch (error) {
    console.error('Error processing places:', error);
  }
}

// Global queues
let namesQueue = [];
let placesQueue = [];

// Global results storage
let allUniqueNames = new Set();
let allUniquePlaces = new Set();
let allUrls = new Set();

// Function to save results to JSON file
async function saveResults() {
  const results = {
    names: Array.from(allUniqueNames),
    places: Array.from(allUniquePlaces),
    urls: Array.from(allUrls),
    timestamp: new Date().toISOString()
  };

  await fs.writeFile(
    path.join(__dirname, 'results.json'),
    JSON.stringify(results, null, 2),
    'utf-8'
  );

  console.log('\n=== RESULTS SAVED ===');
  console.log('Unique names found:', allUniqueNames.size);
  console.log('Unique places found:', allUniquePlaces.size);
  console.log('URLs found:', allUrls.size);
  console.log('Results saved to results.json');
}

// Function to query URLs and download PNG files
async function queryUrlsAndDownloadPng() {
  console.log('\n=== QUERYING URLS AND DOWNLOADING PNG FILES ===');

  for (const url of allUrls) {
    console.log(`Querying URL: ${url}`);

    try {
      const response = await fetch(url);

      if (!response.ok) {
        console.error(`❌ Failed to fetch ${url}: ${response.status}`);
        continue;
      }

      const contentType = response.headers.get('content-type');
      console.log(`Content-Type: ${contentType}`);

      // Check if it's a PNG file
      if (contentType && contentType.includes('image/png')) {
        console.log(`🖼️  PNG detected: ${url}`);

        // Download the PNG file
        const buffer = await response.arrayBuffer();
        const fileName = `downloaded_${Date.now()}.png`;
        const filePath = path.join(__dirname, fileName);

        await fs.writeFile(filePath, Buffer.from(buffer));
        console.log(`✅ PNG downloaded: ${fileName}`);
      } else {
        console.log(`📄 Not a PNG file: ${url}`);

        // If it's text, try to extract more URLs
        if (contentType && contentType.includes('text')) {
          const text = await response.text();
          console.log(`📝 Text content: ${text.substring(0, 100)}...`);

          // Extract URLs from text content
          const urlRegex = /https?:\/\/[^\s]+/g;
          const foundUrls = text.match(urlRegex);

          if (foundUrls) {
            for (const foundUrl of foundUrls) {
              if (!allUrls.has(foundUrl)) {
                allUrls.add(foundUrl);
                console.log(`🔗 New URL found: ${foundUrl}`);
              }
            }
          }
        }
      }

    } catch (error) {
      console.error(`❌ Error processing ${url}:`, error.message);
    }
  }

  console.log(`\n=== URL PROCESSING COMPLETE ===`);
  console.log(`Total URLs processed: ${allUrls.size}`);
}

// Iterative API querying functionality
async function iterativeApiQuerying() {
  try {
    // Load initial data
    const namesData = await fs.readFile(path.join(__dirname, 'names.json'), 'utf-8');
    const placesData = await fs.readFile(path.join(__dirname, 'places.json'), 'utf-8');

    namesQueue = JSON.parse(namesData);
    placesQueue = JSON.parse(placesData);

    // Initialize global results with initial data
    namesQueue.forEach(name => allUniqueNames.add(name));
    placesQueue.forEach(place => allUniquePlaces.add(place));

    console.log('Initial names queue:', namesQueue);
    console.log('Initial places queue:', placesQueue);
    console.log('Initial unique names:', allUniqueNames.size);
    console.log('Initial unique places:', allUniquePlaces.size);

    let iteration = 0;
    const maxIterations = 10; // Prevent infinite loops

    while ((namesQueue.length > 0 || placesQueue.length > 0) && iteration < maxIterations) {
      iteration++;
      console.log(`\n=== Iteration ${iteration} ===`);

      // Process names queue
      if (namesQueue.length > 0) {
        console.log('Processing names queue...');
        await processNames();
      }

      // Process places queue
      if (placesQueue.length > 0) {
        console.log('Processing places queue...');
        await processPlaces();
      }

      // Save results after each iteration
      await saveResults();

      console.log(`After iteration ${iteration}:`);
      console.log('Names queue length:', namesQueue.length);
      console.log('Places queue length:', placesQueue.length);
      console.log('Total unique names:', allUniqueNames.size);
      console.log('Total unique places:', allUniquePlaces.size);
    }

    console.log('\n=== Final Results ===');
    console.log('Final unique names:', Array.from(allUniqueNames));
    console.log('Final unique places:', Array.from(allUniquePlaces));
    console.log('URLs found:', Array.from(allUrls));
    console.log('Total unique names found:', allUniqueNames.size);
    console.log('Total unique places found:', allUniquePlaces.size);
    console.log('Total URLs found:', allUrls.size);

  } catch (error) {
    console.error('Error in iterative API querying:', error);
  }
}


// await extractNamesAndCities();
// Execute the iterative API querying
await iterativeApiQuerying();

// Query URLs and download PNG files
// await queryUrlsAndDownloadPng();

// Send report for each unique place
console.log('\n=== SENDING REPORTS ===');
for (const place of allUniquePlaces) {
  console.log(`Sending report for place: ${place}`);
  try {
    await sendReport(taskName, place);
    console.log(`✅ Report sent successfully for: ${place}`);
  } catch (error) {
    console.error(`❌ Failed to send report for ${place}:`, error);
  }
}

console.log(`\n=== ALL REPORTS SENT ===`);
console.log(`Total places reported: ${allUniquePlaces.size}`);