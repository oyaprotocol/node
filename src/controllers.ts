import { Request, Response } from 'express';
import { pool } from './index.js';

export const saveBundle = async (req: Request, res: Response) => {
  const { block, nonce } = req.body;

  console.log("Received bundle:", JSON.stringify(block, null, 2));
  console.log("Received nonce:", nonce);

  if (!block || typeof nonce !== 'number') {
    return res.status(400).json({ error: 'Invalid bundle data' });
  }

  try {
    const blockString = JSON.stringify(block);

    console.log("Stringified bundle for DB:", blockString);

    const result = await pool.query(
      'INSERT INTO bundles (bundle, nonce) VALUES ($1::jsonb, $2) RETURNING *',
      [blockString, nonce]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Database insertion error (bundle):", err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const getBundle = async (req: Request, res: Response) => {
  const { nonce } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM bundles WHERE nonce = $1 ORDER BY timestamp DESC',
      [parseInt(nonce)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bundle not found' });
    }

    res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const getAllBundles = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM bundles ORDER BY timestamp DESC');
    res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const getBalanceForAllTokens = async (req: Request, res: Response) => {
  const { vault } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM balances WHERE LOWER(vault) = LOWER($1) ORDER BY timestamp DESC',
      [vault]
    );
    console.log("Getting all token balances:", result.rows);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const getBalanceForOneToken = async (req: Request, res: Response) => {
  const { vault, token } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM balances WHERE LOWER(vault) = LOWER($1) AND LOWER(token) = LOWER($2) ORDER BY timestamp DESC',
      [vault, token]
    );
    console.log("Getting balance for one token:", result.rows);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Balance not found' });
    }

    res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const updateBalanceForOneToken = async (req: Request, res: Response) => {
  const { vault, token, balance } = req.body;

  try {
    const checkResult = await pool.query(
      'SELECT * FROM balances WHERE LOWER(vault) = LOWER($1) AND LOWER(token) = LOWER($2)',
      [vault, token]
    );

    if (checkResult.rows.length === 0) {
      const insertResult = await pool.query(
        'INSERT INTO balances (vault, token, balance) VALUES (LOWER($1), LOWER($2), $3) RETURNING *',
        [vault, token, balance]
      );
      console.log(`Inserted new balance: ${JSON.stringify(insertResult.rows[0])}`);
      return res.status(201).json(insertResult.rows[0]);
    } else {
      const updateResult = await pool.query(
        'UPDATE balances SET balance = $1, timestamp = CURRENT_TIMESTAMP WHERE LOWER(vault) = LOWER($2) AND LOWER(token) = LOWER($3) RETURNING *',
        [balance, vault, token]
      );
      console.log(`Updated existing balance: ${JSON.stringify(updateResult.rows[0])}`);
      return res.status(200).json(updateResult.rows[0]);
    }
  } catch (err) {
    console.error('Error updating balance:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const saveCID = async (req: Request, res: Response) => {
  const { cid, nonce } = req.body;

  try {
    const result = await pool.query(
      'INSERT INTO cids (cid, nonce) VALUES ($1, $2) RETURNING *',
      [cid, nonce]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const getCIDsByNonce = async (req: Request, res: Response) => {
  const { nonce } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM cids WHERE nonce = $1 ORDER BY timestamp DESC',
      [parseInt(nonce)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No CIDs found for the given nonce' });
    }

    res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Handle GET request to fetch nonce
export const getVaultNonce = async (req: Request, res: Response) => {
  const { vault } = req.params;
  try {
    const result = await pool.query(
      'SELECT nonce FROM nonces WHERE LOWER(vault) = LOWER($1)', 
      [vault]
    );
    console.log("Getting vault nonce:", result.rows);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Nonce not found' });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Handle POST request to set nonce
export const setVaultNonce = async (req: Request, res: Response) => {
  const { vault } = req.params;
  const { nonce } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO nonces (vault, nonce) 
       VALUES (LOWER($1), $2) 
       ON CONFLICT (LOWER(vault)) 
       DO UPDATE SET nonce = EXCLUDED.nonce 
       RETURNING *`,
      [vault, nonce]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

