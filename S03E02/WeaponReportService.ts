import { QdrantClient } from '@qdrant/js-client-rest';
import { v4 as uuidv4 } from 'uuid';
import { OpenAIService } from '../helpers/OpenAIService.ts';
import fs from 'fs/promises';
import path from 'path';

export class WeaponReportService {
  private client: QdrantClient;
  private openAIService: OpenAIService;

  constructor(openAIService: OpenAIService) {
    this.client = new QdrantClient({
      url: process.env.QDRANT_URL,
      apiKey: process.env.QDRANT_API_KEY,
    });
    this.openAIService = openAIService;
  }

  async ensureCollection(name: string) {
    const collections = await this.client.getCollections();
    const collectionExists = collections.collections.some(c => c.name === name);

    if (collectionExists) {
      console.log(`Deleting existing collection: ${name}`);
      await this.client.deleteCollection(name);
    }

    console.log(`Creating collection: ${name}`);
    await this.client.createCollection(name, {
      vectors: { size: 3072, distance: "Cosine" }
    });
  }

  async addPoints(collectionName: string, points: Array<{
    id?: string,
    text: string,
    metadata?: Record<string, any>
  }>) {
    console.log(`Processing ${points.length} points...`);

    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      if (!point) continue;
      try {
        const embedding = await this.openAIService.createEmbedding(point.text);

        console.log(`Generated embedding for ${point.id}: ${embedding.length} dimensions`);

        const pointToUpsert = {
          id: point.id || uuidv4(),
          vector: embedding,
          payload: {
            text: point.text,
            ...point.metadata
          }
        };

        console.log(`Adding point ${i + 1}/${points.length}: ${point.id}`);
        await this.client.upsert(collectionName, {
          wait: true,
          points: [pointToUpsert]
        });
        console.log(`✅ Successfully added point: ${point.id}`);

      } catch (error) {
        console.error(`❌ Error adding point ${point.id}:`, error);
        if (error && typeof error === 'object' && 'data' in error) {
          console.error('Error details:', JSON.stringify(error.data, null, 2));
        }
        throw error;
      }
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      // Test basic connection by getting collections
      await this.client.getCollections();

      // Test API key by attempting to create a temporary collection
      // This will fail with 401 if the API key is incorrect
      const testCollectionName = `test_connection_${Date.now()}`;
      await this.client.createCollection(testCollectionName, {
        vectors: { size: 1024, distance: "Cosine" }
      });

      // Clean up the test collection
      await this.client.deleteCollection(testCollectionName);

      return true;
    } catch (error) {
      console.error('Qdrant connection test failed:', error);
      return false;
    }
  }

  async indexWeaponReports(reportsDirectory: string): Promise<void> {
    try {
      console.log('Starting weapon reports indexing...');

      // Ensure the weapons collection exists
      await this.ensureCollection('weapons');

      // Read all .txt files from the directory
      const files = await fs.readdir(reportsDirectory);
      const txtFiles = files.filter(file => file.endsWith('.txt'));

      console.log(`Found ${txtFiles.length} weapon report files to index`);

      const reports = [];

      for (const filename of txtFiles) {
        try {
          // Extract date from filename (format: YYYY_MM_DD.txt)
          const dateMatch = filename.match(/^(\d{4})_(\d{2})_(\d{2})\.txt$/);
          if (!dateMatch) {
            console.warn(`Skipping file ${filename} - invalid date format`);
            continue;
          }

          const [, year, month, day] = dateMatch;
          const reportDate = `${year}-${month}-${day}`;

          // Read file content
          const filePath = path.join(reportsDirectory, filename);
          const content = await fs.readFile(filePath, 'utf-8');

          // Create report object
          const report = {
            id: uuidv4(),
            text: content,
            metadata: {
              report_date: reportDate,
              filename: filename,
              type: 'weapon_report'
            }
          };

          reports.push(report);
          console.log(`Processed: ${filename} (${reportDate})`);

        } catch (error) {
          console.error(`Error processing file ${filename}:`, error);
        }
      }

      if (reports.length > 0) {
        console.log(`Adding ${reports.length} reports to weapons collection...`);
        await this.addPoints('weapons', reports);
        console.log('✅ Weapon reports indexing completed successfully!');
      } else {
        console.log('No valid reports found to index');
      }

    } catch (error) {
      console.error('Error indexing weapon reports:', error);
      throw error;
    }
  }

  async searchForStolenWeaponPrototype(): Promise<string | null> {
    try {
      console.log('🔍 Searching for stolen weapon prototype report...');

      const question = "W raporcie, z którego dnia znajduje się wzmianka o kradzieży prototypu broni?";
      console.log(`Question: "${question}"`);

      // Generate embedding for the question
      const questionEmbedding = await this.openAIService.createEmbedding(question);
      console.log(`Generated question embedding: ${questionEmbedding.length} dimensions`);

      // Search the weapons collection
      const searchResults = await this.client.search('weapons', {
        vector: questionEmbedding,
        limit: 1,
        with_payload: true
      });

      if (searchResults.length === 0) {
        console.log('❌ No relevant reports found');
        return null;
      }

      const bestMatch = searchResults[0];
      if (!bestMatch || !bestMatch.payload) {
        console.log('❌ Invalid search result structure');
        return null;
      }

      console.log(`✅ Found best match with score: ${bestMatch.score}`);

      // Extract filename and format it
      const originalFilename = bestMatch.payload.filename as string;
      const formattedFilename = originalFilename
        .replace(/_/g, '-')  // Replace underscores with hyphens
        .replace(/\.txt$/, ''); // Remove .txt extension

      console.log(`📁 Original filename: ${originalFilename}`);
      console.log(`📁 Formatted filename: ${formattedFilename}`);

      return formattedFilename;

    } catch (error) {
      console.error('Error searching for stolen weapon prototype:', error);
      throw error;
    }
  }
}