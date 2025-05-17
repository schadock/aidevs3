import { askQuestionToModel } from './askOpenAI';

(async () => {
  try {
    const question = 'What is the capital of France?';
    const answer = await askQuestionToModel(question);
    console.log('Answer:', answer);
  } catch (error) {
    console.error('Error:', error);
  }
})(); 