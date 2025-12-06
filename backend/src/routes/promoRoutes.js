const express = require('express');
const {
    validatePromo,
    applyPromo,
    getPromos
} = require('../controllers/promoController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.get('/', getPromos);
router.post('/validate', protect, validatePromo);
router.post('/apply', protect, applyPromo);

module.exports = router;

