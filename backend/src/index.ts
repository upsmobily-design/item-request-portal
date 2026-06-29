import 'reflect-metadata';

// Disable SSL unauthorized rejection globally for internal self-signed intranet certs (UAT)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import express from 'express';
import cors from 'cors';
import { AppDataSource } from './config/database';
import { seedRoutingConfigurations } from './utils/seeder';
import { startHourlyPublisher } from './utils/scheduler';
import apiRouter from './routes/api';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Main API routes
app.use('/api', apiRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Initialize DB, load XLSB taxonomy, and start listening
async function bootstrap() {
  try {
    // 1. Initialize Database
    console.log('[Bootstrap] Connecting to SQLite database...');
    await AppDataSource.initialize();
    console.log('[Bootstrap] Database connected and schema synchronized.');

    // Seed dynamic routing configs
    await seedRoutingConfigurations();

    // Start background automated hourly publisher
    startHourlyPublisher();

    // 4. Start Express server
    app.listen(PORT, () => {
      console.log(`====================================================`);
      console.log(`  Item Request Portal Backend is running on port ${PORT}`);
      console.log(`  Health Check: http://localhost:${PORT}/health`);
      console.log(`====================================================`);
    });
  } catch (err: any) {
    console.error('[Bootstrap] Fatal error during server startup:', err);
    process.exit(1);
  }
}

bootstrap();
// Trigger reload for Approve (Not Synced) route update
