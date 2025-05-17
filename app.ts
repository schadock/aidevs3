import express from 'express';
import fetch from 'node-fetch';
import { askQuestionToModel } from './askOpenAI';
import dotenv from 'dotenv';

dotenv.config();

const targetUrl = 'https://xyz.ag3nts.org/';
const app = express();
const port = 3000;

app.get('/run', async (req: express.Request, res: express.Response) => {
  try {
    const response = await fetch(targetUrl);
    const data = await response.text();
    const questionMatch = data.match(/<p id="human-question">Question:<br \/>(.*?)<\/p>/);
    if (questionMatch && questionMatch[1]) {
      const question = questionMatch[1].trim();
      console.log('Question:', question);
      const request = {
        instruction: "answer the question in shortest way possible. only year", 
        input: question
      }
      const answer = await askQuestionToModel(request.instruction, request.input);
      console.log('Answer:', answer);

      // Prepare POST request data
      const postData = new URLSearchParams();
      postData.append('username', 'tester');
      postData.append('password', '574e112a');
      postData.append('answer', answer);

      // Send POST request
      const postResponse = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: postData.toString(),
      });

      if (postResponse.ok) {
        const secretPageHtml = await postResponse.text();
        console.log('POST request successful, processing HTML response.');
        // console.log(secretPageHtml);

        // Extract NAZWAFLAGI from secretPageUrl
        const flagMatch = secretPageHtml.match(/\{\{FLG:(.*?)\}\}/);
        const flag = flagMatch ? flagMatch[1] : 'Flag not found';
        console.log('Extracted FLAG:', flag);

        // Extract URL from HTML response
        const urlMatch = secretPageHtml.match(/<a href="(.*?)">/);
        const relativeUrl = urlMatch ? urlMatch[1] : null;
        const secretPageUrl = relativeUrl ? new URL(relativeUrl, targetUrl).href : 'URL not found';
        console.log('secretPageUrl', secretPageUrl);

        // Visit the secretPageUrl
        const visitResponse = await fetch(secretPageUrl);
        if (visitResponse.ok) {
          const visitData = await visitResponse.text();
          console.log('Visited secret page successfully:')
          // console.log(visitData);
        } else {
          console.log('Failed to visit secret page');
        }

        // res.send(flag);
        res.send(secretPageHtml);
      } else {
        console.log('POST request failed');
        res.status(500).send('Failed to retrieve secret page URL');
      }
    } else {
      console.log('Question not found');
      res.status(404).send('Question not found');
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Error asking question to model');
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
}); 