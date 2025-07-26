import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

export async function sendReport(taskType: string, answer: string) {
  // Prepare the payload
  const payload = {
    task: taskType,
    apikey: process.env.CENTRALA_KEY,
    answer: answer
  };

  // Send to the API
  const response = await fetch('https://c3ntrala.ag3nts.org/report', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(payload)
  });

  const responseData = await response.json() as any;

  if (responseData.code === 0 && responseData.message) {
    const match = responseData.message.match(/{{FLG:(.*?)}}/);
    if (match && match[1]) {
      console.log('Extracted FLG value:');
      console.log(match[1]);
    }
  } else {
    console.log('Response:', responseData);
  }
}