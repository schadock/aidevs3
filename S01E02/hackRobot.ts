import { ChatWithRobot } from './chatWithRobot';

const robotChat = new ChatWithRobot();

async function mission() {
  console.log('Mission started...');
  try {
    await robotChat.conversation();
  } catch (error) {
    console.error('Error:', error);
  }
}

mission(); 