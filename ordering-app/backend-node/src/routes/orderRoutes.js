const { Router } = require('express');
const ctrl = require('../controllers/orderController');
const { requireAdmin } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');

const router = Router();

// Public: place an order (light rate limit to deter spam)
router.post('/', rateLimit({ windowMs: 60 * 1000, max: 10 }), ctrl.createOrder);

// Admin
router.get('/', requireAdmin, ctrl.listOrders);
router.patch('/:id/status', requireAdmin, ctrl.updateOrderStatus);

module.exports = router;
