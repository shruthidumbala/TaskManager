// database/db.js - PostgreSQL connection pool
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'taskmanager',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'root',
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000, // Increased timeout for better error handling
});

// Test connection
pool.on('connect', () => {
  console.log('PostgreSQL client connected');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  // Don't exit the process, just log the error
  // This allows the app to continue running and handle errors gracefully
});

// Handle pool errors
pool.on('acquire', () => {
  // Client acquired from pool
});

pool.on('remove', () => {
  // Client removed from pool
});

module.exports = pool;


