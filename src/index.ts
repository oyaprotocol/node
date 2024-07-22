import express from 'express';
import { json } from 'body-parser';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { bundleRouter, cidRouter, balanceRouter } from './routes';

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
app.use('/bundle', bundleRouter);
app.use('/cid', cidRouter);
app.use('/balance', balanceRouter);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
