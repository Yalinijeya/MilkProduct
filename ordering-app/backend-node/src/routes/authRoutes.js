const { Router } = require('express');
const { login } = require('../controllers/authController');
const { rateLimit } = require('../middleware/rateLimit');

const router = Router();

// Max 10 login attempts per IP per 15 minutes
router.post('/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), login);

module.exports = router;
