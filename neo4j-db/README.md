# Neo4j Database Setup

This directory contains the Docker Compose configuration for running Neo4j graph database.

## Quick Start

1. **Start Neo4j:**
   ```bash
   docker-compose up -d
   ```

2. **Check status:**
   ```bash
   docker-compose ps
   ```

3. **View logs:**
   ```bash
   docker-compose logs -f
   ```

4. **Stop Neo4j:**
   ```bash
   docker-compose down
   ```

## Endpoints

- **Browser UI:** http://localhost:7474
- **Bolt Protocol:** bolt://localhost:7687
- **HTTP API:** http://localhost:7474/db/data

## Default Credentials

- **Username:** neo4j
- **Password:** password

**Important:** You'll be prompted to change the password on first login.

## Health Check

The service includes a health check endpoint. You can verify Neo4j is running:

```bash
curl http://localhost:7474/browser/
```

## Data Persistence

Data is persisted in the following directories:
- `./neo4j_data` - Database files
- `./neo4j_logs` - Log files
- `./neo4j_import` - Import directory for CSV files
- `./neo4j_plugins` - Custom plugins

These directories are automatically created when you first run the container and are excluded from version control.

## Configuration

The current configuration includes:
- Port 7474 for HTTP/Browser interface
- Port 7687 for Bolt protocol
- APOC plugin enabled
- File import/export enabled
- Memory configuration optimized for development
- Health checks every 30 seconds
- Automatic restart unless stopped

## Memory Settings

- **Heap Initial Size:** 512MB
- **Heap Max Size:** 2GB
- **Page Cache Size:** 1GB

## Useful Commands

- **Reset data (⚠️  destructive):**
  ```bash
  docker-compose down -v
  rm -rf neo4j_data neo4j_logs neo4j_import neo4j_plugins
  ```

- **Update to latest image:**
  ```bash
  docker-compose pull
  docker-compose up -d
  ```

- **Access Neo4j Cypher Shell:**
  ```bash
  docker exec -it neo4j cypher-shell -u neo4j -p password
  ```

- **Import CSV files:**
  Place CSV files in the `neo4j_import` directory and use Cypher commands like:
  ```cypher
  LOAD CSV FROM 'file:///your-file.csv' AS row
  ```

## APOC Plugin

The APOC (Awesome Procedures On Cypher) plugin is included and provides additional procedures and functions for:
- Data import/export
- Graph algorithms
- Text processing
- Date/time utilities
- And much more

## Troubleshooting

- **Port already in use:** Change the port mappings in `docker-compose.yml`
- **Memory issues:** Adjust the memory settings in the environment variables
- **Permission issues:** Ensure the volume directories have proper permissions 