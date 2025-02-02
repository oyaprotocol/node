// Need to set up a test database to run these tests, instead of using the main database

import { expect } from 'chai';
import request from 'supertest';
import { app } from '../src/index'; // Import your Express app
// import { pool } from '../src/index'; // Import your database connection

// Setup the test environment
before(async () => {
  // Create tables for testing
  await pool.query(`
    CREATE TABLE IF NOT EXISTS blocks (
      id SERIAL PRIMARY KEY,
      block JSONB NOT NULL,
      nonce INT NOT NULL,
      timestamp TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS balances (
      id SERIAL PRIMARY KEY,
      vault TEXT NOT NULL,
      token TEXT NOT NULL,
      balance NUMERIC NOT NULL,
      timestamp TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cids (
      id SERIAL PRIMARY KEY,
      cid TEXT NOT NULL,
      nonce INT NOT NULL,
      timestamp TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nonces (
      id SERIAL PRIMARY KEY,
      vault TEXT NOT NULL,
      nonce INT NOT NULL,
      timestamp TIMESTAMPTZ DEFAULT NOW()
    )
  `);
});

// Clean up the test environment
after(async () => {
  // Drop tables after testing
  await pool.query('DROP TABLE IF EXISTS blocks');
  await pool.query('DROP TABLE IF EXISTS balances');
  await pool.query('DROP TABLE IF EXISTS cids');
  await pool.query('DROP TABLE IF EXISTS nonces');
});

describe('API Tests', () => {

  describe('POST /block', () => {
    it('should save a block', async () => {
      const res = await request(app)
        .post('/block')
        .send({
          block: { some: 'data' },
          nonce: 1
        });
      expect(res.status).to.equal(201);
      expect(res.body).to.have.property('block');
      expect(res.body).to.have.property('nonce', 1);
    });

    it('should return 400 for invalid data', async () => {
      const res = await request(app)
        .post('/block')
        .send({
          block: null,
          nonce: 'invalid'
        });
      expect(res.status).to.equal(400);
    });
  });

  describe('GET /block/:nonce', () => {
    it('should get a block by nonce', async () => {
      await pool.query('INSERT INTO blocks (block, nonce) VALUES ($1, $2)', [JSON.stringify({ some: 'data' }), 1]);

      const res = await request(app)
        .get('/block/1')
        .send();
      expect(res.status).to.equal(200);
      expect(res.body).to.be.an('array');
      expect(res.body[0]).to.have.property('block');
      expect(res.body[0]).to.have.property('nonce', 1);
    });

    it('should return 404 for non-existing block', async () => {
      const res = await request(app)
        .get('/block/999')
        .send();
      expect(res.status).to.equal(404);
    });
  });

  describe('GET /block', () => {
    it('should get all blocks', async () => {
      const res = await request(app)
        .get('/block')
        .send();
      expect(res.status).to.equal(200);
      expect(res.body).to.be.an('array');
    });
  });

  describe('POST /cid', () => {
    it('should save a CID', async () => {
      const res = await request(app)
        .post('/cid')
        .send({
          cid: 'somecid',
          nonce: 1
        });
      expect(res.status).to.equal(201);
      expect(res.body).to.have.property('cid', 'somecid');
      expect(res.body).to.have.property('nonce', 1);
    });
  });

  describe('GET /cid/:nonce', () => {
    it('should get CIDs by nonce', async () => {
      await pool.query('INSERT INTO cids (cid, nonce) VALUES ($1, $2)', ['somecid', 1]);

      const res = await request(app)
        .get('/cid/1')
        .send();
      expect(res.status).to.equal(200);
      expect(res.body).to.be.an('array');
      expect(res.body[0]).to.have.property('cid', 'somecid');
      expect(res.body[0]).to.have.property('nonce', 1);
    });

    it('should return 404 for non-existing CIDs', async () => {
      const res = await request(app)
        .get('/cid/999')
        .send();
      expect(res.status).to.equal(404);
    });
  });

  describe('GET /balance/:vault', () => {
    it('should get balances for an vault', async () => {
      await pool.query('INSERT INTO balances (vault, token, balance) VALUES ($1, $2, $3)', ['vault1', 'token1', 100]);

      const res = await request(app)
        .get('/balance/vault1')
        .send();
      expect(res.status).to.equal(200);
      expect(res.body).to.be.an('array');
      expect(res.body[0]).to.have.property('vault', 'vault1');
      expect(res.body[0]).to.have.property('token', 'token1');
      expect(res.body[0]).to.have.property('balance', '100'); // balance is returned as a string from numeric type
    });
  });

  describe('GET /balance/:vault/:token', () => {
    it('should get balance for an vault and token', async () => {
      await pool.query('INSERT INTO balances (vault, token, balance) VALUES ($1, $2, $3)', ['vault1', 'token1', 100]);

      const res = await request(app)
        .get('/balance/vault1/token1')
        .send();
      expect(res.status).to.equal(200);
      expect(res.body).to.be.an('array');
      expect(res.body[0]).to.have.property('vault', 'vault1');
      expect(res.body[0]).to.have.property('token', 'token1');
      expect(res.body[0]).to.have.property('balance', '100'); // balance is returned as a string from numeric type
    });

    it('should return 404 for non-existing balance', async () => {
      const res = await request(app)
        .get('/balance/vault1/nonexistenttoken')
        .send();
      expect(res.status).to.equal(404);
    });
  });

  describe('POST /balance', () => {
    it('should update balance for an vault and token', async () => {
      const res = await request(app)
        .post('/balance')
        .send({
          vault: 'vault1',
          token: 'token1',
          balance: 200
        });
      expect(res.status).to.equal(201);
      expect(res.body).to.have.property('vault', 'vault1');
      expect(res.body).to.have.property('token', 'token1');
      expect(res.body).to.have.property('balance', '200'); // balance is returned as a string from numeric type
    });
  });

  describe('GET /nonce/:vault', () => {
    it('should get nonce for an vault', async () => {
      await pool.query('INSERT INTO nonces (vault, nonce) VALUES ($1, $2)', ['vault1', 1]);

      const res = await request(app)
        .get('/nonce/vault1')
        .send();
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('nonce', 1);
    });

    it('should return 404 for non-existing nonce', async () => {
      const res = await request(app)
        .get('/nonce/nonexistentvault')
        .send();
      expect(res.status).to.equal(404);
    });
  });

  describe('POST /nonce', () => {
    it('should set nonce for an vault', async () => {
      const res = await request(app)
        .post('/nonce')
        .send({
          vault: 'vault1',
          nonce: 2
        });
      expect(res.status).to.equal(201);
      expect(res.body).to.have.property('vault', 'vault1');
      expect(res.body).to.have.property('nonce', 2);
    });
  });

});
