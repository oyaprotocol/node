import { Request, Response } from 'express';
import { pool } from './index';

export const saveBundle = async (req: Request, res: Response) => {
  const { intention, proof } = req.body;

  try {
    const result = await pool.query(
      'INSERT INTO bundles (intention, proof) VALUES ($1::jsonb, $2::jsonb) RETURNING *',
      [JSON.stringify(intention), JSON.stringify(proof)]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const getBundle = async (req: Request, res: Response) => {
  const { nonce } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM bundles WHERE (intention ->> \'nonce\')::int = $1',
      [parseInt(nonce)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bundle not found' });
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const getAllBundles = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM bundles');
    res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
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