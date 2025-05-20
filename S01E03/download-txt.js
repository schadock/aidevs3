import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
console.log(__filename);
const __dirname = path.dirname(__filename);

// Initialize dotenv with the root directory path
dotenv.config({ path: path.join(__dirname, '../.env') });

// Check if CENTRALA_KEY is set
if (!process.env.CENTRALA_KEY) {
    throw new Error('CENTRALA_KEY environment variable is not set');
}

const url = `https://c3ntrala.ag3nts.org/data/${process.env.CENTRALA_KEY}/json.txt`;
const outputPath = path.join(__dirname, 'json.txt');

async function downloadAndSaveFile() {
    try {
        // Check if file exists
        const fileExists = fs.existsSync(outputPath);
        if (fileExists) {
            console.log('File already exists, skipping download.');
            return;
        }

        // Ensure the directory exists
        const directory = path.dirname(outputPath);
        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory, { recursive: true });
        }

        // Download the file
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.text();
        
        // Write the file
        fs.writeFileSync(outputPath, data);
        console.log('File downloaded and saved successfully!');
    } catch (error) {
        console.error('Error:', error.message);
        throw error;
    }
}

// Execute the download function
await downloadAndSaveFile(); 