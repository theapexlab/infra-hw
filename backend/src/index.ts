// Register module aliases first before other imports
import './aliases';

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { initializeStorage } from './config/storage';
import { config } from './config/env';
import mediaRouter from './routes/mediaRoutes';
import commentRouter from './routes/commentRoutes';

// Create the main Hono app
const app = new Hono();

// Apply middleware
app.use('*', logger());

// Use a more permissive CORS configuration
app.use('*', cors({
  origin: '*', // Allow all origins
  allowHeaders: ['*'], // Allow all headers
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  exposeHeaders: ['Content-Length', 'Content-Type'],
  maxAge: 86400,
  credentials: true,
}));

// Add a middleware to log all requests
app.use('*', async (c, next) => {
  console.log(`[${new Date().toISOString()}] ${c.req.method} ${c.req.url}`);
  console.log('Headers:', c.req.header());
  await next();
});

// Health check routes
app.get('/', (c) => c.json({ status: 'ok', message: 'Media Sharing API is running' }));
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Mount routers
app.route('/api/media', mediaRouter);
app.route('/api/comments', commentRouter);

// Error handling
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

// Server startup
const PORT = config.server.port;

// Function to check if migrations have been run
const runMigrations = async () => {
  try {
    const knex = require('knex');
    const { knexConfig } = require('./config/knexConfig');
    const env = process.env.NODE_ENV || 'development';
    const db = knex(knexConfig[env]);
    
    // Check if knex_migrations table exists
    const hasTable = await db.schema.hasTable('knex_migrations');
    
    if (!hasTable) {
      console.log('Migrations have not been run yet, running now...');
      await db.migrate.latest();
      console.log('Migrations completed successfully');
    } else {
      // Check if there are pending migrations
      const [_, pendingMigrations] = await db.migrate.list();
      
      if (pendingMigrations.length > 0) {
        console.log(`Found ${pendingMigrations.length} pending migrations, running now...`);
        await db.migrate.latest();
        console.log('Migrations completed successfully');
      } else {
        console.log('Database schema is up to date');
      }
    }
    
    // Close the knex connection used for migrations
    await db.destroy();
    return true;
  } catch (error) {
    console.error('Error checking/running migrations:', error);
    throw error;
  }
};

const startServer = async () => {
  try {
    // Run database migrations if needed
    await runMigrations();
    
    // Initialize MinIO storage (create bucket if it doesn't exist)
    await initializeStorage();
    console.log('Storage initialized successfully');
    
    // Start the server
    serve({
      fetch: app.fetch,
      port: Number(PORT)
    });
    
    console.log(`Server is running on http://localhost:${PORT}`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();
