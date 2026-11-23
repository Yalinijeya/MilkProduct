const { Router } = require('express');
const ctrl = require('../controllers/itemController');
const { requireAdmin } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

const router = Router();

router.get('/', ctrl.listAvailable);                                          // public
router.post('/', requireAdmin, upload.single('photo'), ctrl.createItem);      // admin
router.put('/:id', requireAdmin, upload.single('photo'), ctrl.updateItem);    // admin
router.delete('/:id', requireAdmin, ctrl.deleteItem);                         // admin

module.exports = router;
