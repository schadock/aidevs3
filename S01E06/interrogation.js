import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import AdmZip from 'adm-zip';
import { OpenAIService } from './OpenAIService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to log with timestamp
function logMsg(message) {
    const now = new Date();
    // const timestamp = now.toISOString();
    console.log(`${message}`);
}

// Initialize dotenv with the root directory path
dotenv.config({ path: path.join(__dirname, '../.env') });

const testimoniesFilePath = path.join(__dirname, 'testimonies.json');

// Check if CENTRALA_KEY is set
if (!process.env.CENTRALA_KEY) {
    throw new Error('CENTRALA_KEY environment variable is not set');
}

const fileName = 'przesluchania.zip';
const url = `https://c3ntrala.ag3nts.org/dane/${fileName}`;
const outputPath = path.join(__dirname, fileName);

const openaiService = new OpenAIService();


async function transcribe(audioBuffer) {
    if (!audioBuffer) {
        logMsg('No audio buffer provided for transcription.');
        return null; // Or throw an error, depending on desired error handling
    }
    try {
        // Pass the file buffer to the transcription service
        const transcription = await openaiService.transcribe(audioBuffer);
        return transcription;
    } catch (error) {
        logMsg(`Transcription error: ${error}`);
        throw error; // Re-throw to be handled by the caller
    }
}


async function downloadAndSaveFile() {
  try {
      // Ensure the directory exists
      const directory = path.dirname(outputPath);
      if (!fs.existsSync(directory)) {
          fs.mkdirSync(directory, { recursive: true });
      }

      // If the file already exists, read and return its content
      if (fs.existsSync(outputPath)) {
          logMsg('File already exists, reading content from disk.');
          const extractedPath = path.join(__dirname, 'extracted');
          if (!fs.existsSync(extractedPath)) {
            await unpackZipFile(); // Unpack if extracted directory doesn't exist
          }
          return extractedPath;
      }

      // Download the file
      const response = await fetch(url);
      if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Get the binary content from the response
      const buffer = await response.arrayBuffer();
      
      // Save the file as binary
      fs.writeFileSync(outputPath, Buffer.from(buffer));
      
      logMsg('File downloaded and saved successfully!');

      // Unpack the ZIP file right after downloading
      const extractedPath = await unpackZipFile();
      
      return extractedPath;
  } catch (error) {
      logMsg(`Error: ${error.message}`);
      throw error;
  }
}

async function unpackZipFile() {
    try {
        // Check if the zip file exists
        if (!fs.existsSync(outputPath)) {
            throw new Error('ZIP file does not exist. Please download it first.');
        }

        // Create an instance of AdmZip
        const zip = new AdmZip(outputPath);

        // Create an extraction directory
        const extractPath = path.join(__dirname, 'extracted');
        if (!fs.existsSync(extractPath)) {
            fs.mkdirSync(extractPath, { recursive: true });
        }

        // Extract the zip file
        const startTimeUnpack = performance.now();
        zip.extractAllTo(extractPath, true);
        const endTimeUnpack = performance.now();
        logMsg(`Successfully extracted to ${extractPath}`);
        logMsg(`Unpack execution time: ${(endTimeUnpack - startTimeUnpack).toFixed(2)} ms`);

        // Log the list of unpacked files
        logMsg('Unpacked files:');
        zip.getEntries().forEach(entry => {
            logMsg(`- ${entry.entryName}`);
        });

        // Return the path to the extracted files
        return extractPath;
    } catch (error) {
        logMsg(`Error unpacking ZIP file: ${error.message}`);
        throw error;
    }
}


async function prepareAudioFiles() {
    const startTimeDownload = performance.now();
    const extractedPath = await downloadAndSaveFile();
    const endTimeDownload = performance.now();
    logMsg(`downloadAndSaveFile execution time: ${(endTimeDownload - startTimeDownload).toFixed(2)} ms`);

    const files = fs.readdirSync(extractedPath);
    logMsg(`Files in extracted directory: ${files}`);

    const audioFiles = files.filter(file => file.endsWith('.m4a'));
    logMsg(`Audio files found: ${audioFiles}`);
    return { extractedPath, audioFiles };
}

async function transcribeAudioFiles(extractedPath, audioFiles) {
    let testimonies = [];
    if (fs.existsSync(testimoniesFilePath)) {
        try {
            const data = fs.readFileSync(testimoniesFilePath, 'utf8');
            testimonies = JSON.parse(data);
            logMsg('Loaded existing testimonies from testimonies.json');
        } catch (parseError) {
            logMsg(`Error parsing testimonies.json: ${parseError}`);
            // If parsing fails, we might want to start with an empty array or handle differently
        }
    }

    for (const audioFile of audioFiles) {
        const existingTranscription = testimonies.find(t => t.fileName === audioFile);
        if (existingTranscription) {
            logMsg(`Skipping transcription for ${audioFile}, already exists.`);
            logMsg(`Existing transcription for ${audioFile}: ${existingTranscription.text}`);
            continue;
        }

        const audioFilePath = path.join(extractedPath, audioFile);
        const audioBuffer = fs.readFileSync(audioFilePath);

        const startTimeTranscription = performance.now();
        logMsg(`Transcribing ${audioFile}...`);
        const transcription = await transcribe(audioBuffer);
        const endTimeTranscription = performance.now();

        if (transcription) {
            logMsg(`Transcription for ${audioFile} completed in ${(endTimeTranscription - startTimeTranscription).toFixed(2)} ms.`);
            const messages = [{ role: "user", content: transcription }];
            const tokenCount = await openaiService.countTokens(messages, 'gpt-4o');
            logMsg(`Token count for transcription: ${tokenCount}`);

            testimonies.push({
                fileName: audioFile,
                text: transcription,
                tokenCount: tokenCount
            });
            fs.writeFileSync(testimoniesFilePath, JSON.stringify(testimonies, null, 2));
            logMsg(`Saved transcription for ${audioFile} to testimonies.json.`);
        }
    }
}

async function getStreetFromTestimonies(testimonies) {
    // System prompt can be adjusted by the user if needed.
    const systemPrompt = { role: "system", content: `
Twoim zadaniem jest **ustalić, na jakiej ulicy znajduje się instytut uczelni, w którym pracuje profesor Andrzej Maj**. Zwróć uwagę, że chodzi konkretnie o **ulicę instytutu**, a nie główną siedzibę uczelni.

Otrzymasz pełen tekst transkrypcji nagrań — potraktuj go jako kontekst do analizy. Przeczytaj go dokładnie i krok po kroku **wyciągaj pośrednie wnioski**, myśląc na głos. Zwracaj szczególną uwagę na:
- nazwy wydziałów, instytutów, jednostek organizacyjnych,
- nazwy sal, laboratoriów, numerów budynków,
- wszystkie wskazówki geograficzne (ulice, przystanki, dzielnice, punkty orientacyjne).

Pamiętaj:
- **Nie znasz profesora Andrzeja Maja**, więc całą wiedzę o nim i jego miejscu pracy musisz wyciągnąć wyłącznie z transkrypcji i **własnej wiedzy o uczelniach w Polsce**.
- Niektóre nagrania mogą być **chaotyczne lub wprowadzać w błąd** — analizuj je ostrożnie, filtruj niespójności, nie zakładaj, że każde zdanie jest prawdziwe.
- Jeśli transkrypcje nie dają jasnej odpowiedzi, użyj swojej wiedzy o strukturze i lokalizacji instytutów uczelni w Polsce, by wyciągnąć najbardziej prawdopodobny wniosek.

Na końcu, po przeprowadzeniu całej analizy, zwróć **tylko i wyłącznie nazwę ulicy** w formacie:
<ulica>nazwa ulicy</ulica>

⚠️ Nie dodawaj komentarzy ani wyjaśnień.
⚠️ Nie pisz słowa "ulica" wewnątrz tagów.
      `
    };

    const streetNames = [];
    if (!testimonies || testimonies.length === 0) {
        logMsg("No testimonies provided to extract street names from.");
        return streetNames;
    }

    // let onlyOne = [testimonies[0]];
    for (const testimony of testimonies) {
        if (testimony.text && testimony.text.trim() !== "") {
            const userMessage = {
                role: "user", 
                content: testimony.text // Input text from the testimony
            };

            logMsg(`Attempting to extract street name from testimony in ${testimony.fileName}...`);
            try {
                // Using 'gpt-4.1-nano' as per the user's provided snippet
                const responseOpenai = await openaiService.completion({
                    messages: [systemPrompt, userMessage],
                    // model: 'gpt-4.1-nano',
                    model: 'gpt-4o',
                    stream: false
                });

                if (responseOpenai && responseOpenai.choices && responseOpenai.choices.length > 0 && responseOpenai.choices[0].message && responseOpenai.choices[0].message.content) {
                    const extractedStreet = responseOpenai.choices[0].message.content.trim();
                    const streetMatch = extractedStreet.match(/<ulica>(.*?)<\/ulica>/);
                    const finalStreet = streetMatch && streetMatch[1] ? streetMatch[1].trim() : "Not found or malformed";
                    logMsg(`Extracted street for ${testimony.fileName}: ${finalStreet}`);
                    streetNames.push({ fileName: testimony.fileName, street: finalStreet });
                } else {
                    logMsg(`No street name found or malformed response for ${testimony.fileName}.`);
                    streetNames.push({ fileName: testimony.fileName, street: "Error or not found" });
                }
            } catch (error) {
                logMsg(`Error extracting street name for ${testimony.fileName}: ${error.message}`);
                streetNames.push({ fileName: testimony.fileName, street: `Error: ${error.message}` });
            }
        } else {
            logMsg(`Skipping ${testimony.fileName} as it has no text or empty text.`);
            streetNames.push({ fileName: testimony.fileName, street: "No text to process" });
        }
    }
    return streetNames;
}

async function processInterrogation() {
    try {
        const { extractedPath, audioFiles } = await prepareAudioFiles();
        await transcribeAudioFiles(extractedPath, audioFiles);

        // Load testimonies after transcription to get all data
        let testimonies = [];
        if (fs.existsSync(testimoniesFilePath)) {
            try {
                const data = fs.readFileSync(testimoniesFilePath, 'utf8');
                testimonies = JSON.parse(data);
                logMsg('Loaded testimonies for street extraction.');
            } catch (parseError) {
                logMsg(`Error parsing testimonies.json before street extraction: ${parseError.message}`);
                throw parseError; // Re-throw error to stop processing if testimonies can't be read
            }
        } else {
            logMsg("testimonies.json not found. Cannot extract street names.");
            return; // Exit if the testimonies file doesn't exist
        }

        if (testimonies.length > 0) {
            logMsg("Starting street name extraction...");
            const extractedStreets = await getStreetFromTestimonies(testimonies);
            logMsg("Street extraction process completed.");
            logMsg("Extracted Streets:");
            extractedStreets.forEach(item => {
                logMsg(`- File: ${item.fileName}, Street: ${item.street}`);
            });

            if (extractedStreets.length > 0) {
                for (const item of extractedStreets) {
                    const finalStreet = item.street;
                    logMsg(`Sending final street to API: ${finalStreet}`);
                    await sendStreet(finalStreet);
                }
            } else {
                logMsg("No street extracted to send to API.");
            }
        } else {
            logMsg("No testimonies available to extract street names from.");
        }

    } catch (error) {
        logMsg(`Error in processInterrogation: ${error.message}`);
        throw error;
    }
}

async function sendStreet(street) {
    // Prepare the payload
    const payload = {
        task: "mp3",
        apikey: process.env.CENTRALA_KEY,
        answer: street
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
}

// Execute the main function
await processInterrogation(); 