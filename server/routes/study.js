const express = require('express');
const router = express.Router();
const studyController = require('../controllers/studyController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware); // 모든 공부 관련 API는 인증 필요

router.post('/start', studyController.startSession);
router.post('/stop', studyController.stopSession);
router.get('/status', studyController.getStatus);
router.get('/stats', studyController.getStats);
router.get('/subjects', studyController.getSubjects);
router.post('/subjects', studyController.addSubject);
router.put('/subjects/:id', studyController.updateSubject);
router.delete('/subjects/:id', studyController.deleteSubject);

// 계획 관련 API
router.get('/plans', studyController.getPlans);
router.post('/plans', studyController.createPlan);
router.post('/plans/:id/done', studyController.donePlan);
router.post('/plans/:id/undone', studyController.undonePlan); // 계획 완료 취소 라우터
router.delete('/plans/:id', studyController.deletePlan);

module.exports = router;

