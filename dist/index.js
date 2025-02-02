"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = exports.pool = void 0;
const express_1 = __importDefault(require("express"));
const body_parser_1 = require("body-parser");
const dotenv_1 = __importDefault(require("dotenv"));
const pg_1 = require("pg");
const routes_1 = require("./routes");
dotenv_1.default.config();
const app = (0, express_1.default)();
exports.app = app;
const port = process.env.PORT || 3000;
app.use((0, body_parser_1.json)());
// Database connection
exports.pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});
// Routes
app.use('/block', routes_1.blockRouter);
app.use('/cid', routes_1.cidRouter);
app.use('/balance', routes_1.balanceRouter);
app.use('/nonce', routes_1.vaultNonceRouter);
// This endpoint receives an intention (with signature and from) and passes it to the block proposer logic.
app.post('/intention', async (req, res) => {
    try {
        const { intention, signature, from } = req.body;
        if (!intention || !signature || !from) {
            throw new Error('Missing required fields');
        }
        console.log('Received signed intention:', intention, signature, from);
        const response = await handleIntention(intention, signature, from);
        res.status(200).json(response);
    }
    catch (error) {
        console.error('Error handling intention:', error);
        res.status(500).json({ error: error.message });
    }
});
// Every 10 seconds, try to publish a new block if there are cached intentions.
setInterval(async () => {
    try {
        await createAndPublishBlock();
    }
    catch (error) {
        console.error('Error creating and publishing block:', error);
    }
}, 10 * 1000);
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
