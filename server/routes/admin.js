const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

router.use(authMiddleware, adminMiddleware); // 모든 관리자 API는 인증 및 관리자 권한 필요

router.get('/users', adminController.getUsers);
router.delete('/users/:id', adminController.deleteUser);
router.post('/subjects', adminController.addSubject);
router.delete('/subjects/:id', adminController.deleteSubject);

module.exports = router;
