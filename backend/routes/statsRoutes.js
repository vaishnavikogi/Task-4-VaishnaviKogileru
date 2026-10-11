const express = require('express');
const statsController = require('../controllers/statsController');

const router = express.Router();

// Mounted at /api/stats in server.js
router.get('/', statsController.getStats); // GET /api/stats

module.exports = router;
