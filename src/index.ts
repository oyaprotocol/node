import express from 'express';
import { json } from 'body-parser';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { blockRouter, cidRouter, balanceRouter, vaultNonceRouter } from './routes';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(json());

// Database connection
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Routes
app.use('/block', blockRouter);
app.use('/cid', cidRouter);
app.use('/balance', balanceRouter);
app.use('/nonce', vaultNonceRouter);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

export { app };