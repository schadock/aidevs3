import { QdrantClient } from '@qdrant/js-client-rest';
import { v4 as uuidv4 } from 'uuid';
import { OpenAIService } from './OpenAIService.ts';


export class VectorService {
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

  async initializeCollectionWithData(name: string, points: Array<{
    id?: string,
    text: string,
    metadata?: Record<string, any>
  }>) {
    const collections = await this.client.getCollections();
    if (!collections.collections.some(c => c.name === name)) {
      await this.ensureCollection(name);
      await this.addPoints(name, points);
    }
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

  async performSearch(collectionName: string, query: string, filter: Record<string, any> = {}, limit: number = 5) {
    const queryEmbedding = await this.openAIService.createJinaEmbedding(query);
    return this.client.search(collectionName, {
      vector: queryEmbedding,
      limit,
      with_payload: true,
      filter
    });
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


}