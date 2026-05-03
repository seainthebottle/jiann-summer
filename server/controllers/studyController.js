const db = require('../config/db');

// 공부 시작
exports.startSession = async (req, res) => {
    const { subject_id } = req.body;
    const user_id = req.user.id;
    try {
        // 이미 진행 중인 세션이 있는지 확인
        const active = await db.query(
            "SELECT * FROM study_sessions WHERE user_id = ? AND end_time IS NULL",
            [user_id]
        );
        if (active.length > 0) {
            return res.status(400).json({ error: '이미 진행 중인 공부 세션이 있습니다.' });
        }

        await db.query(
            "INSERT INTO study_sessions (user_id, subject_id, start_time) VALUES (?, ?, NOW())",
            [user_id, subject_id]
        );
        res.json({ message: '공부 시작!' });
    } catch (err) {
        res.status(500).json({ error: '서버 오류 발생' });
    }
};

// 공부 종료
exports.stopSession = async (req, res) => {
    const user_id = req.user.id;
    try {
        const active = await db.query(
            "SELECT * FROM study_sessions WHERE user_id = ? AND end_time IS NULL ORDER BY start_time DESC LIMIT 1",
            [user_id]
        );
        if (active.length === 0) {
            return res.status(400).json({ error: '진행 중인 공부 세션이 없습니다.' });
        }

        const session = active[0];
        await db.query(
            `UPDATE study_sessions 
             SET end_time = NOW(), 
                 duration_seconds = TIMESTAMPDIFF(SECOND, start_time, NOW()) 
             WHERE id = ?`,
            [session.id]
        );
        res.json({ message: '공부 종료!' });
    } catch (err) {
        res.status(500).json({ error: '서버 오류 발생' });
    }
};

// 현재 상태 조회 (진행 중인 세션 확인)
exports.getStatus = async (req, res) => {
    const user_id = req.user.id;
    try {
        const active = await db.query(
            `SELECT s.*, sub.name as subject_name 
             FROM study_sessions s 
             JOIN subjects sub ON s.subject_id = sub.id 
             WHERE s.user_id = ? AND s.end_time IS NULL`,
            [user_id]
        );
        res.json({ active: active.length > 0 ? active[0] : null });
    } catch (err) {
        res.status(500).json({ error: '서버 오류 발생' });
    }
};

// 통계 조회 (일간, 주간, 월간 등)
exports.getStats = async (req, res) => {
    const user_id = req.user.id;
    try {
        // 1. 일간 과목별 통계 (파이 차트용)
        const dailyPie = await db.query(
            `SELECT sub.name, SUM(s.duration_seconds) as total_seconds
             FROM study_sessions s
             JOIN subjects sub ON s.subject_id = sub.id
             WHERE s.user_id = ? AND DATE(s.start_time) = CURDATE() AND s.end_time IS NOT NULL
             GROUP BY sub.id`,
            [user_id]
        );

        // 2. 일간, 주간, 월간 총합 및 평균
        // 일간 합계
        const dailyTotal = await db.query(
            "SELECT SUM(duration_seconds) as total FROM study_sessions WHERE user_id = ? AND DATE(start_time) = CURDATE()",
            [user_id]
        );
        
        // 주간 합계 (최근 7일)
        const weeklyTotal = await db.query(
            "SELECT SUM(duration_seconds) as total FROM study_sessions WHERE user_id = ? AND start_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)",
            [user_id]
        );

        // 월간 합계 (최근 30일)
        const monthlyTotal = await db.query(
            "SELECT SUM(duration_seconds) as total FROM study_sessions WHERE user_id = ? AND start_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)",
            [user_id]
        );

        res.json({
            dailyPie,
            dailyTotal: dailyTotal[0].total || 0,
            weeklyTotal: weeklyTotal[0].total || 0,
            monthlyTotal: monthlyTotal[0].total || 0,
            weeklyAvg: (weeklyTotal[0].total || 0) / 7,
            monthlyAvg: (monthlyTotal[0].total || 0) / 30
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '통계 조회 중 오류 발생' });
    }
};

// 과목 목록 조회
exports.getSubjects = async (req, res) => {
    try {
        const subjects = await db.query("SELECT * FROM subjects ORDER BY name ASC");
        res.json(subjects);
    } catch (err) {
        res.status(500).json({ error: '과목 조회 중 오류 발생' });
    }
};
