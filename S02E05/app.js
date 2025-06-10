import dotenv from 'dotenv';
import path from 'path';
import { downloadArticle } from './downloader.js';

dotenv.config({ path: path.join(__dirname, '../.env') });

const articleUrl = 'https://c3ntrala.ag3nts.org/dane/arxiv-draft.html';

await downloadArticle(articleUrl);