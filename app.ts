import express from 'express';
import fetch from 'node-fetch';

const app = express();
const port = 3000;

app.get('/run', async (req: express.Request, res: express.Response) => {
  try {
    const response = await fetch('https://xyz.ag3nts.org/');
    const data = await response.text();
    const questionMatch = data.match(/<p id="human-question">Question:<br \/>(.*?)<\/p>/);
    if (questionMatch && questionMatch[1]) {
      const question = questionMatch[1].trim();
      console.log('Question:', question);
      res.send(question);
    } else {
      console.log('Question not found');
      res.status(404).send('Question not found');
    }
  } catch (error) {
    res.status(500).send('Error fetching the page');
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
}); 