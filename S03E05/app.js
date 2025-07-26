import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

import { OpenAIService } from '../helpers/OpenAIService.ts';
import { sendReport } from '../helpers/ReportService.ts';

const openaiService = new OpenAIService();
const taskName = 'loop';