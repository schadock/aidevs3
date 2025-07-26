import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

import { OpenAIService } from '../helpers/OpenAIService.ts';

const openaiService = new OpenAIService();
const taskName = 'database';

/**
 * Sends a query to the database API.
 * @param {string} sqlQuery - The SQL query to execute.
 * @returns {Promise<any>} - The API response result.
 */
async function queryDatabase(sqlQuery) {
  console.log(JSON.stringify({
    task: 'database',
    apikey: process.env.CENTRALA_KEY,
    query: sqlQuery,
  }),);
  const response = await fetch('https://c3ntrala.ag3nts.org/apidb', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      task: 'database',
      apikey: process.env.CENTRALA_KEY,
      query: sqlQuery,
    }),
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/**
 * Discovers the database structure: fetches the list of tables and their definitions.
 * @returns {Promise<Object>} - An object with table names and their CREATE TABLE statements.
 */
async function discoverDatabaseStructure() {
  // Fetch the list of tables
  const tablesResult = await queryDatabase('SHOW TABLES;');
  console.log('SHOW TABLES result:', tablesResult);
  
  // Check if the response has the structure {reply: [...], error: "OK"}
  const tables = tablesResult.reply || tablesResult;
  console.log('Tables:', tables);
  
  // Extract table names from the response
  const tableNames = Array.isArray(tables)
    ? tables.map(row => Object.values(row)[0])
    : [];
  
  console.log('Table names:', tableNames);

  const structure = {};
  for (const table of tableNames) {
    console.log(`Fetching structure for table: ${table}`);
    const createResult = await queryDatabase(`SHOW CREATE TABLE ${table};`);
    console.log(`SHOW CREATE TABLE ${table} result:`, createResult);
    
    // Check if the response has the structure {reply: [...], error: "OK"}
    const createData = createResult.reply || createResult;
    
    if (Array.isArray(createData) && createData.length > 0) {
      const createTableSQL = createData[0]['Create Table'] || Object.values(createData[0])[1];
      structure[table] = createTableSQL;
      console.log(`Table structure for ${table}:`, createTableSQL);
    }
  }
  return structure;
}

/**
 * Generates an SQL query using LLM based on table schemas.
 * @param {Object} databaseStructure - The database structure with table schemas.
 * @returns {Promise<string>} - The generated SQL query.
 */
async function generateSQLQuery(databaseStructure) {
  const schemasText = Object.entries(databaseStructure)
    .map(([tableName, schema]) => `Table ${tableName}:\n${schema}`)
    .join('\n\n');

  const prompt = `Based on the following database table schemas, write an SQL query that returns the DC_ID of active datacenters whose managers (from the users table) are inactive.\n\nTable schemas:\n${schemasText}\n\nRules:\n- An active datacenter is one where is_active = 1 in the datacenters table\n- An inactive manager is one where is_active = 0 in the users table\n- The datacenter manager is the manager field in the datacenters table, which refers to the id in the users table\n\nReturn ONLY the raw SQL query text, without any additional descriptions, explanations, or formatting.`;

  const messages = [{ role: 'user', content: prompt }];
  const response = await openaiService.completion({
    messages,
    model: "gpt-4",
    temperature: 0,
    maxTokens: 1024
  });
  return response.choices[0].message.content || '';
}

/**
 * Sends the answer to centrala.
 * @param {Array} dcIds - Array of datacenter IDs.
 * @returns {Promise<any>} - The response from centrala.
 */
async function sendAnswerToCentrala(dcIds) {
  const response = await fetch('https://c3ntrala.ag3nts.org/report', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      task: taskName,
      apikey: process.env.CENTRALA_KEY,
      answer: dcIds,
    }),
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

// --- Invocation at the end of the file ---

(async () => {
  try {
    const structure = await discoverDatabaseStructure();
    console.log('Database structure:', structure);
    
    const sqlQuery = await generateSQLQuery(structure);
    console.log('Generated SQL query:', sqlQuery);
    
    // Execute the generated query
    const result = await queryDatabase(sqlQuery);
    console.log('Query result:', result);
    
    // Extract DC_ID from the result and convert to an array of numbers
    const dcIds = result.reply.map(row => parseInt(row.dc_id));
    console.log('DC_IDs to send:', dcIds);
    
    // Send the answer to centrala
    const centralaResponse = await sendAnswerToCentrala(dcIds);
    console.log('Response from centrala:', centralaResponse);
  } catch (err) {
    console.error('Error:', err);
  }
})();