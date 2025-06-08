import { OpenAIService } from './OpenAIService.ts';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });
  
const openaiService = new OpenAIService();
const archivePath = './archive';

function logMsg(message) {
  console.log(`[LOG] ${message}`);
}

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

async function readPngFile(filePath) {
  logMsg(`Analyzing PNG file: ${filePath}`);
  const fileData = await fs.readFile(filePath);
  const base64Image = fileData.toString('base64');

  const messages = [
    {
      role: "system",
      content: `You are a helpful OCR assistant.`
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
          text: "read the image with \"Repair Note\" and rewrite text from the image"
        },
      ]
    }
  ];

  try {
    const chatCompletion = await openaiService.completion(messages, "gpt-4.1-mini", false, false, 1024);
    logMsg(`Analysis for ${filePath} completed.`);
    return chatCompletion.choices[0].message.content || '';
  } catch (error) {
    logMsg(`Error analyzing image ${filePath}: ${error}`);
    throw error;
  }
}

async function analyzeTxtFile(filePath) {
  logMsg(`Analyzing TXT file: ${filePath}`);
  // Blank function to be implemented later for TXT analysis
  const content = await fs.readFile(filePath, 'utf8');
  return content;
}

async function readMp3File(filePath) {
  logMsg(`Analyzing MP3 file: ${filePath}`);

  const fileName = path.basename(filePath);

  const audioBuffer = await fs.readFile(filePath);

  const startTimeTranscription = performance.now();
  logMsg(`Transcribing ${fileName}...`);
  const transcription = await transcribe(audioBuffer);
  const endTimeTranscription = performance.now();

  if (transcription) {
    logMsg(`Transcription for ${fileName} completed in ${(endTimeTranscription - startTimeTranscription).toFixed(2)} ms.`);
    return transcription;
  }
  return null;
}

async function reviewFiles() {
  try {
    const entries = await fs.readdir(archivePath, { withFileTypes: true });

    let existingFilesContent = [];
    const outputPath = path.join(__dirname, 'filesContent.json');
    try {
      const fileData = await fs.readFile(outputPath, 'utf8');
      existingFilesContent = JSON.parse(fileData);
      logMsg("Loaded existing filesContent.json");
    } catch (error) {
      if (error.code === 'ENOENT') {
        logMsg("filesContent.json not found, starting with empty content.");
      } else {
        console.error("Error reading existing filesContent.json:", error);
      }
    }

    const filesContentPromises = entries.map(async (entry) => {
      const entryPath = path.join(archivePath, entry.name);

      // Check if the file already exists in filesContent.json by name and has a category
      const existingContent = existingFilesContent.find(item => item.name === entry.name);
      if (existingContent && existingContent.category) {
        logMsg(`Skipping already processed and categorized file: ${entry.name}`);
        return existingContent;
      }

      if (entry.isDirectory()) {
        if (entry.name === 'facts') {
          console.log(`Skipping directory: ${entryPath}`);
        }
        return null;
      } 
      
      if (entry.isFile()) {
        if (entry.name === 'weapons_tests.zip') {
          console.log(`Skipping file: ${entryPath}`);
          return null;
        }

        const ext = path.extname(entry.name).toLowerCase();
        try {
          switch (ext) {
            case '.png':
              const pngContent = await readPngFile(entryPath);
              logMsg(`Processed PNG file: ${entry.name}`);
              const pngCategory = await analyzeContent(entry.name, pngContent, null, null);
              return { name: entry.name, content: pngContent, category: pngCategory };
            case '.mp3':
              const mp3Content = await readMp3File(entryPath);
              if (mp3Content) {
                const mp3Category = await analyzeContent(entry.name, mp3Content, null, null);
                logMsg(`Processed MP3 file: ${entry.name}`);
                return { name: entry.name, content: mp3Content, category: mp3Category };
              }
              return null;
            case '.txt':
              const txtContent = await fs.readFile(entryPath, 'utf8');  
              const txtCategory = await analyzeContent(entry.name, txtContent, null, null);
              logMsg(`Processed txt file: ${entry.name}`);
              return { name: entry.name, content: txtContent, category: txtCategory };
            default:
              logMsg(`Skipping unsupported file type: ${entryPath}`);
              return null;
          }
        } catch (error) {
          logMsg(`Error processing file ${entry.name}: ${error}`);
          return null;
        }
      }
      return null;
    });

    const filesContent = (await Promise.all(filesContentPromises)).filter(Boolean);

    // Combine existing content with newly processed content, ensuring no duplicates by name
    const combinedFilesContent = [...existingFilesContent, ...filesContent.filter(newItem => 
      !existingFilesContent.some(existingItem => existingItem.name === newItem.name)
    )];

    await fs.writeFile(outputPath, JSON.stringify(combinedFilesContent, null, 2));
    logMsg("filesContent.json updated successfully.");

    const anwser = {
      people: [],
      hardware: []
    }

    // Analyze the content of filesContent.json
    for (const fileItem of combinedFilesContent) {
      if (fileItem.content) {
        let category;
        if (fileItem.category) {
          logMsg(`Using existing category for "${fileItem.name}": ${fileItem.category}`);
          category = fileItem.category;
        } else {
          logMsg(`Analyzing content from "${fileItem.name}" ...`);
          category = await analyzeContent(fileItem.name, fileItem.content, null, null);
          logMsg(`Analysis for ${fileItem.name}: ${category}`);
        }
        
        if (category === 'ludzie') {
          anwser.people.push(fileItem.name);
        } else if (category === 'hardware') {
          anwser.hardware.push(fileItem.name);
        }
      }
    }

    anwser.people.sort();
    anwser.hardware.sort();

    console.log("Final categorized files:", anwser);

    await sendReport(anwser);

  } catch (err) {
    console.error("Error during file review:", err);
  }
}

async function analyzeContent(title, text, extractionType, description) {
  const extractionMessage = {
    content: `Jesteś systemem analizy treści plików tekstowych (.txt).

      Twoim zadaniem jest:
      1. Przeczytaj zawartość tekstu i przypisz go do jednej z poniższych kategorii (lub odrzuć, jeśli nie pasuje do żadnej):

      — LUDZIE:
      Zawiera informacje o schwytanych osobach lub śladach ich obecności.
      Przykłady:
      - "Widziałem kogoś, kto uciekał w stronę wzgórza."
      - "Znaleziono zużytą szczoteczkę do zębów i ślady stóp."

      — HARDWARE:
      Zawiera opisy usterek sprzętowych (hardware), np. uszkodzonych robotów, czujników, mechanicznych elementów.
      Przykłady:
      - "Leżał tam zepsuty dron, z oderwanym ramieniem."
      - "Kamera obracała się w kółko, jakby miała uszkodzony przegub."

      — POMIŃ:
      - informacje o brygadzie
      - personalne rozmowy strażników
      - "Nie mogliśmy znaleźć nikogo"
      - Jeśli tekst nie zawiera nic na temat ludzi ani sprzętowych usterek – pomiń go. Nie twórz nowych kategorii. Return "skip".

      2. ZANIM zdecydujesz, pomyśl na głos.
      - Podaj krótkie uzasadnienie: dlaczego plik pasuje do danej kategorii (albo dlaczego nie pasuje do żadnej).
      - Następnie podaj wynik w formacie:
        - KATEGORIA: Ludzie
        - KATEGORIA: Hardware
        - KATEGORIA: Pomiń

      Zacznij od analizy zawartości.

      ODPOWIEDŹ ZWRÓĆ W TAGACH w lowercase: <category>KATEGORIA</category>
    `,
    role: 'system'
  };

  const userMessage = {
    role: 'user',
    content: text
  };

  const response = await openaiService.completion([extractionMessage, userMessage], 'gpt-4.1-mini', false);
  const fullContent = response.choices[0].message.content || '';
  
  const resultMatch = fullContent.match(/<category>(.*?)<\/category>/s);
  if (resultMatch && resultMatch[1]) {
    return resultMatch[1].trim();
  } else {
    return fullContent; // Return full content if tags are not found
  }
}

async function sendReport(anwser) {
  // Prepare the payload
  const payload = {
    task: "kategorie",
    apikey: process.env.CENTRALA_KEY,
    answer: {
      people: anwser.people,
      hardware: anwser.hardware
    }
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

// Call the function to start the review
reviewFiles();
