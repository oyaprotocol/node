// Need to set up a test database to run these tests, instead of using the main database

import { expect } from 'chai';
import request from 'supertest';
import { app } from '../src/index'; // Import your Express app
// import { pool } from '../src/index'; // Import your database connection

// Setup the test environment
before(async () => {
  // Create tables for testing
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bundles (
      id SERIAL PRIMARY KEY,
      bundle JSONB NOT NULL,
      nonce INT NOT NULL,
      timestamp TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS balances (
      id SERIAL PRIMARY KEY,
      account TEXT NOT NULL,
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
      account TEXT NOT NULL,
      nonce INT NOT NULL,
      timestamp TIMESTAMPTZ DEFAULT NOW()
    )
  `);
});

// Clean up the test environment
after(async () => {
  // Drop tables after testing
  await pool.query('DROP TABLE IF EXISTS bundles');
  await pool.query('DROP TABLE IF EXISTS balances');
  await pool.query('DROP TABLE IF EXISTS cids');
  await pool.query('DROP TABLE IF EXISTS nonces');
});

describe('API Tests', () => {

  describe('POST /bundle', () => {
    it('should save a bundle', async () => {
      const res = await request(app)
        .post('/bundle')
        .send({
          bundle: { some: 'data' },
          nonce: 1
        });
      expect(res.status).to.equal(201);
      expect(res.body).to.have.property('bundle');
      expect(res.body).to.have.property('nonce', 1);
    });

    it('should return 400 for invalid data', async () => {
      const res = await request(app)
        .post('/bundle')
        .send({
          bundle: null,
          nonce: 'invalid'
        });
      expect(res.status).to.equal(400);
    });
  });

  describe('GET /bundle/:nonce', () => {
    it('should get a bundle by nonce', async () => {
      await pool.query('INSERT INTO bundles (bundle, nonce) VALUES ($1, $2)', [JSON.stringify({ some: 'data' }), 1]);

      const res = await request(app)
        .get('/bundle/1')
        .send();
      expect(res.status).to.equal(200);
      expect(res.body).to.be.an('array');
      expect(res.body[0]).to.have.property('bundle');
      expect(res.body[0]).to.have.property('nonce', 1);
    });

    it('should return 404 for non-existing bundle', async () => {
      const res = await request(app)
        .get('/bundle/999')
        .send();
      expect(res.status).to.equal(404);
    });
  });

  describe('GET /bundle', () => {
    it('should get all bundles', async () => {
      const res = await request(app)
        .get('/bundle')
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

  describe('GET /balance/:account', () => {
    it('should get balances for an account', async () => {
      await pool.query('INSERT INTO balances (account, token, balance) VALUES ($1, $2, $3)', ['account1', 'token1', 100]);

      const res = await request(app)
        .get('/balance/account1')
        .send();
      expect(res.status).to.equal(200);
      expect(res.body).to.be.an('array');
      expect(res.body[0]).to.have.property('account', 'account1');
      expect(res.body[0]).to.have.property('token', 'token1');
      expect(res.body[0]).to.have.property('balance', '100'); // balance is returned as a string from numeric type
    });
  });

  describe('GET /balance/:account/:token', () => {
    it('should get balance for an account and token', async () => {
      await pool.query('INSERT INTO balances (account, token, balance) VALUES ($1, $2, $3)', ['account1', 'token1', 100]);

      const res = await request(app)
        .get('/balance/account1/token1')
        .send();
      expect(res.status).to.equal(200);
      expect(res.body).to.be.an('array');
      expect(res.body[0]).to.have.property('account', 'account1');
      expect(res.body[0]).to.have.property('token', 'token1');
      expect(res.body[0]).to.have.property('balance', '100'); // balance is returned as a string from numeric type
    });

    it('should return 404 for non-existing balance', async () => {
      const res = await request(app)
        .get('/balance/account1/nonexistenttoken')
        .send();
      expect(res.status).to.equal(404);
    });
  });

  describe('POST /balance', () => {
    it('should update balance for an account and token', async () => {
      const res = await request(app)
        .post('/balance')
        .send({
          account: 'account1',
          token: 'token1',
          balance: 200
        });
      expect(res.status).to.equal(201);
      expect(res.body).to.have.property('account', 'account1');
      expect(res.body).to.have.property('token', 'token1');
      expect(res.body).to.have.property('balance', '200'); // balance is returned as a string from numeric type
    });
  });

  describe('GET /nonce/:account', () => {
    it('should get nonce for an account', async () => {
      await pool.query('INSERT INTO nonces (account, nonce) VALUES ($1, $2)', ['account1', 1]);

      const res = await request(app)
        .get('/nonce/account1')
        .send();
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('nonce', 1);
    });

    it('should return 404 for non-existing nonce', async () => {
      const res = await request(app)
        .get('/nonce/nonexistentaccount')
        .send();
      expect(res.status).to.equal(404);
    });
  });

  describe('POST /nonce', () => {
    it('should set nonce for an account', async () => {
      const res = await request(app)
        .post('/nonce')
        .send({
          account: 'account1',
          nonce: 2
        });
      expect(res.status).to.equal(201);
      expect(res.body).to.have.property('account', 'account1');
      expect(res.body).to.have.property('nonce', 2);
    });
  });

});
