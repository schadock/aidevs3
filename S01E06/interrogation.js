import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { OpenAIService } from './OpenAIService.js';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import e from 'express';
import AdmZip from 'adm-zip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize dotenv with the root directory path
dotenv.config({ path: path.join(__dirname, '../.env') });

// Check if CENTRALA_KEY is set
if (!process.env.CENTRALA_KEY) {
    throw new Error('CENTRALA_KEY environment variable is not set');
}

const openaiService = new OpenAIService();

const fileName = 'przesluchania.zip';
const url = `https://c3ntrala.ag3nts.org/dane/${fileName}`;
const outputPath = path.join(__dirname, fileName);


async function downloadAndSaveFile() {
  try {
      // Ensure the directory exists
      const directory = path.dirname(outputPath);
      if (!fs.existsSync(directory)) {
          fs.mkdirSync(directory, { recursive: true });
      }

      // If the file already exists, read and return its content
      if (fs.existsSync(outputPath)) {
          console.log('File already exists, reading content from disk.');
          return fs.readFileSync(outputPath);
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
      
      console.log('File downloaded and saved successfully!');

      // Unpack the ZIP file right after downloading
      await unpackZipFile();
      
      return buffer;
  } catch (error) {
      console.error('Error:', error.message);
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
        console.log(`Successfully extracted to ${extractPath}`);
        console.log(`Unpack execution time: ${(endTimeUnpack - startTimeUnpack).toFixed(2)} ms`);

        // Log the list of unpacked files
        console.log('Unpacked files:');
        zip.getEntries().forEach(entry => {
            console.log(`- ${entry.entryName}`);
        });

        // Return the path to the extracted files
        return extractPath;
    } catch (error) {
        console.error('Error unpacking ZIP file:', error.message);
        throw error;
    }
}

async function processAndSendCensoredText() {
    try {
        // Download and get the content
        const startTimeDownload = performance.now();
        const originalText = await downloadAndSaveFile();
        const endTimeDownload = performance.now();
        console.log(`downloadAndSaveFile execution time: ${(endTimeDownload - startTimeDownload).toFixed(2)} ms`);
        
    } catch (error) {
        console.error('Error:', error.message);
        throw error;
    }
}

// Execute the main function
await processAndSendCensoredText(); 