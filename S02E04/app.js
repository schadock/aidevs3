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
    const messages = [{ role: "user", content: transcription }];
    const tokenCount = await openaiService.countTokens(messages, 'gpt-4o');
    logMsg(`Token count for transcription: ${tokenCount}`);

    logMsg(`Saved transcription for ${fileName} to testimonies.json.`);
    return transcription;
  }
  return null;
}

async function reviewFiles() {
  try {
    const entries = await fs.readdir(archivePath, { withFileTypes: true });

    let pngFiles = entries.filter(entry => entry.name.endsWith('.png')).slice(0, 1);
    let mp3Files = entries.filter(entry => entry.name.endsWith('.mp3')).slice(0, 1);

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

      // Check if the file already exists in filesContent.json by name
      const existingContent = existingFilesContent.find(item => item.name === entry.name);
      if (existingContent) {
        logMsg(`Skipping already processed file: ${entry.name}`);
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
              return { name: entry.name, content: pngContent };
            case '.mp3':
              const mp3Content = await readMp3File(entryPath);
              if (mp3Content) {
                logMsg(`Processed MP3 file: ${entry.name}`);
                return { name: entry.name, content: mp3Content };
              }
              return null;
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

  } catch (err) {
    console.error("Error during file review:", err);
  }
}

async function extractInformation(title, text, extractionType, description) {
  const extractionMessage = {
    content: `Extract ${extractionType}: ${description} from user message under the context of "${title}". 
        Transform the content into clear, structured yet simple bullet points without formatting except links and images. 

        Format link like so: - name: brief description with images and links if the original message contains them.
        
        Keep full accuracy of the original message.`,
    role: 'system'
  };

  const userMessage = {
    content: `Here's the articles you need to extract information from: ${text}`,
    role: 'user'
  };

  const response = await openaiService.completion([extractionMessage, userMessage], 'gpt-4o', false);
  return response.choices[0].message.content || '';
}

// Call the function to start the review
reviewFiles();
