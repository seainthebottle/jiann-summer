const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

router.use(authMiddleware, adminMiddleware); // 모든 관리자 API는 인증 및 관리자 권한 필요

router.get('/users', adminController.getUsers);
router.post('/users', adminController.addUser);
router.delete('/users/:id', adminController.deleteUser);

// 과목 관리 (관리자가 특정 사용자의 과목을 지정해 관리)
router.get('/subjects', adminController.getSubjectsByUser);
router.post('/subjects', adminController.addSubjectForUser);
router.put('/subjects/:id', adminController.adminUpdateSubject);
router.delete('/subjects/:id', adminController.adminDeleteSubject);

module.exports = router;
