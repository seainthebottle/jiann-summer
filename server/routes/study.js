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

module.exports = router;
