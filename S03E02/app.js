import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

import { OpenAIService } from '../helpers/OpenAIService.ts';
import { WeaponReportService } from './WeaponReportService.ts';
import { sendReport } from '../helpers/ReportService.ts';

const taskName = 'wektory';
const weaponTests = "../data-from-c3ntral/archive/weapons_tests/do-not-share";

// Index weapon reports into Qdrant
async function indexWeaponReports() {
  try {
    const openAIService = new OpenAIService();
    const weaponReportService = new WeaponReportService(openAIService);

    console.log('Starting weapon reports indexing process...');

    // Test connection first
    const isConnected = await weaponReportService.testConnection();
    if (!isConnected) {
      console.error('❌ Cannot index reports - Qdrant connection failed!');
      return false;
    }

    // Index the weapon reports
    await weaponReportService.indexWeaponReports(weaponTests);

    console.log('✅ Weapon reports indexing completed!');
    return true;
  } catch (error) {
    console.error('Error indexing weapon reports:', error);
    return false;
  }
}

// Search for stolen weapon prototype report
async function searchForStolenWeaponPrototype() {
  try {
    const openAIService = new OpenAIService();
    const weaponReportService = new WeaponReportService(openAIService);

    console.log('🔍 Starting search for stolen weapon prototype report...');

    // Test connection first
    const isConnected = await weaponReportService.testConnection();
    if (!isConnected) {
      console.error('❌ Cannot search - Qdrant connection failed!');
      return false;
    }

    // Search for the stolen weapon prototype
    const result = await weaponReportService.searchForStolenWeaponPrototype();

    if (result) {
      console.log('\n📋 SEARCH RESULTS:');
      console.log('='.repeat(50));
      console.log(`📁 Formatted Filename: ${result}`);
      console.log('='.repeat(50));

      return result;
    } else {
      console.log('❌ No relevant report found');
      return null;
    }
  } catch (error) {
    console.error('Error searching for stolen weapon prototype:', error);
    return null;
  }
}

await indexWeaponReports();

// Run the search
const answer = await searchForStolenWeaponPrototype();
await sendReport(taskName, answer);