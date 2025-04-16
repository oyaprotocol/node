import { JSDOM } from 'jsdom';

if (typeof globalThis.CustomEvent === 'undefined') {
  const { window } = new JSDOM();
  globalThis.CustomEvent = window.CustomEvent;
  console.log("CustomEvent polyfill via jsdom applied.");
}

import express from 'express';
import bppkg from 'body-parser';
const { json } = bppkg;
import dotenv from 'dotenv';
import pgpkg from 'pg';
const { Pool } = pgpkg;
import { blockRouter, cidRouter, balanceRouter, vaultNonceRouter } from './routes.js';
import { handleIntention, createAndPublishBlock } from './proposer.js';
import { bearerAuth } from './auth.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(json());
// Global middleware: protect all POST endpoints with Bearer token authorization
app.use((req, res, next) => {
  if (req.method === 'POST') {
    return bearerAuth(req, res, next);
  }
  next();
});

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


// This endpoint receives an intention (with signature and from) and passes it to the proposer logic.
// Protected by Bearer token authorization.
app.post('/intention', bearerAuth, async (req, res) => {
  try {
    const { intention, signature, from } = req.body;
    if (!intention || !signature || !from) {
      throw new Error('Missing required fields');
    }
    console.log('Received signed intention:', intention, signature, from);
    const response = await handleIntention(intention, signature, from);
    res.status(200).json(response);
  } catch (error: any) {
    console.error('Error handling intention:', error);
    res.status(500).json({ error: error.message });
  }
});

// Every 10 seconds, try to publish a new block if there are cached intentions.
setInterval(async () => {
  try {
    await createAndPublishBlock();
  } catch (error) {
    console.error('Error creating and publishing block:', error);
  }
}, 10 * 1000);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

export { app };