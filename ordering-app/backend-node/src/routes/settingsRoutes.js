const { Router } = require('express');
const { getSettings, updateSettings } = require('../controllers/settingsController');
const { requireAdmin } = require('../middleware/auth');

const router = Router();

router.get('/', getSettings);                   // public
router.put('/', requireAdmin, updateSettings);  // admin

module.exports = router;
