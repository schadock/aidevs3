import neo4j, { Driver, Session } from 'neo4j-driver';

async function testNeo4jConnection() {
  console.log('🔌 Testing Neo4j connection...');
  
  const driver: Driver = neo4j.driver(
    'bolt://localhost:7687',
    neo4j.auth.basic('neo4j', 'password')
  );

  try {
    const session: Session = driver.session();
    
    // Test basic connection
    const result = await session.run('RETURN "Hello from Neo4j!" as message');
    console.log('✅ Neo4j connection successful!');
    const record = result.records[0];
    if (record) {
      console.log('Message:', record.get('message'));
    }
    
    // Test database info
    const dbInfo = await session.run('CALL dbms.components() YIELD name, versions, edition');
    console.log('📊 Database components:');
    dbInfo.records.forEach(record => {
      console.log(`  - ${record.get('name')}: ${record.get('versions')[0]} (${record.get('edition')})`);
    });
    
    // Test APOC plugin
    try {
      const apocResult = await session.run('CALL apoc.util.sleep(100)');
      console.log('🔌 APOC plugin is available');
    } catch (error) {
      console.log('⚠️  APOC plugin not available (this is normal for first run)');
    }
    
    await session.close();
  } catch (error) {
    console.error('❌ Neo4j connection failed:', error);
  } finally {
    await driver.close();
  }
}

// Test HTTP endpoint
async function testHttpEndpoint() {
  console.log('\n🌐 Testing HTTP endpoint...');
  
  try {
    const response = await fetch('http://localhost:7474/browser/');
    if (response.ok) {
      console.log('✅ HTTP endpoint is accessible');
      console.log('📱 Browser UI available at: http://localhost:7474');
    } else {
      console.log('⚠️  HTTP endpoint returned status:', response.status);
    }
  } catch (error) {
    console.error('❌ HTTP endpoint test failed:', error);
  }
}

async function main() {
  console.log('🚀 Starting Neo4j connection tests...\n');
  
  await testNeo4jConnection();
  await testHttpEndpoint();
  
  console.log('\n✨ Tests completed!');
}

main().catch(console.error); 