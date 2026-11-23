const { Router } = require('express');
const { listAll } = require('../controllers/itemController');
const { requireAdmin } = require('../middleware/auth');

const router = Router();

router.use(requireAdmin);
router.get('/items', listAll);

module.exports = router;
