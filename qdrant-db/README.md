# Qdrant Database Setup

This directory contains the Docker Compose configuration for running Qdrant vector database.

## Quick Start

1. **Start Qdrant:**
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

4. **Stop Qdrant:**
   ```bash
   docker-compose down
   ```

## Endpoints

- **HTTP API:** http://localhost:6333
- **gRPC API:** http://localhost:6334
- **Web UI:** http://localhost:6333/dashboard

## Health Check

The service includes a health check endpoint. You can verify Qdrant is running:

```bash
curl http://localhost:6333/health
```

## Data Persistence

Data is persisted in the `./qdrant_storage` directory. This directory is automatically created when you first run the container and is excluded from version control.

## Configuration

The current configuration includes:
- Port 6333 for HTTP API
- Port 6334 for gRPC API
- INFO level logging
- Health checks every 30 seconds
- Automatic restart unless stopped

## Useful Commands

- **Reset data (⚠️  destructive):**
  ```bash
  docker-compose down -v
  rm -rf qdrant_storage
  ```

- **Update to latest image:**
  ```bash
  docker-compose pull
  docker-compose up -d
  ``` 