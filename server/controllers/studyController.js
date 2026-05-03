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
        
        // 진행 시간 계산 (초)
        const diffCheck = await db.query("SELECT TIMESTAMPDIFF(SECOND, start_time, NOW()) as diff FROM study_sessions WHERE id = ?", [session.id]);
        const diffSeconds = diffCheck[0].diff;

        if (diffSeconds <= 60) {
            // 1분 이하인 경우 세션 삭제
            await db.query("DELETE FROM study_sessions WHERE id = ?", [session.id]);
            return res.json({ message: '공부 시간이 1분 이하여서 기록되지 않았습니다.' });
        }

        await db.query(
            `UPDATE study_sessions 
             SET end_time = NOW(), 
                 duration_seconds = ?
             WHERE id = ?`,
            [diffSeconds, session.id]
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
    let user_id = req.user.id;
    const { targetUserId, date, subjectId } = req.query;

    // 관리자이면서 targetUserId가 제공된 경우 해당 사용자의 통계 조회
    if (req.user.role === 'admin' && targetUserId) {
        user_id = targetUserId;
    }

    try {
        let baseDate = date || null;
        
        // 1. 선택일 시간대별 공부 분포 (24시간 파이 차트용)
        let sessionsQuery = `
            SELECT s.start_time, IF(s.end_time IS NULL, NOW(), s.end_time) as actual_end, sub.name as subject_name, sub.color
            FROM study_sessions s
            LEFT JOIN subjects sub ON s.subject_id = sub.id
            WHERE s.user_id = ? AND IF(s.end_time IS NULL, TIMESTAMPDIFF(SECOND, s.start_time, NOW()), s.duration_seconds) > 60
        `;
        let sessionsParams = [user_id];
        if (baseDate) {
            sessionsQuery += ` AND DATE(s.start_time) <= ? AND DATE(IF(s.end_time IS NULL, NOW(), s.end_time)) >= ?`;
            sessionsParams.push(baseDate, baseDate);
        } else {
            sessionsQuery += ` AND DATE(s.start_time) <= CURDATE() AND DATE(IF(s.end_time IS NULL, NOW(), s.end_time)) >= CURDATE()`;
        }
        if (subjectId) {
            sessionsQuery += ` AND s.subject_id = ?`;
            sessionsParams.push(subjectId);
        }
        
        const rawSessions = await db.query(sessionsQuery, sessionsParams);
        
        // 날짜 범위를 00:00:00 ~ 23:59:59로 제한한 세션 목록 생성
        let targetDateStr = baseDate ? baseDate : new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
        let dayStart = new Date(targetDateStr + 'T00:00:00');
        let dayEnd = new Date(targetDateStr + 'T23:59:59.999');
        
        const sessions = [];
        rawSessions.forEach(session => {
            let start = new Date(session.start_time);
            let end = new Date(session.actual_end);
            
            if (start < dayStart) start = dayStart;
            if (end > dayEnd) end = dayEnd;
            if (start >= end) return;
            
            sessions.push({
                subject_name: session.subject_name,
                color: session.color || '#339af0',
                start: start.toISOString(),
                end: end.toISOString()
            });
        });

        // 2. 일간, 주간, 월간 총합 및 평균 (완료된 세션만 합산하여 클라이언트 타이머와 이중 계산 방지)
        let dailyQuery = "SELECT COALESCE(SUM(s.duration_seconds), 0) as total FROM study_sessions s WHERE s.user_id = ? AND s.duration_seconds > 60";
        let dailyParams = [user_id];
        if (baseDate) {
            dailyQuery += " AND DATE(s.start_time) = ?";
            dailyParams.push(baseDate);
        } else {
            dailyQuery += " AND DATE(s.start_time) = CURDATE()";
        }
        if (subjectId) {
            dailyQuery += " AND s.subject_id = ?";
            dailyParams.push(subjectId);
        }
        const dailyTotalResult = await db.query(dailyQuery, dailyParams);
        
        // 주간 합계
        let weeklyQuery = "SELECT COALESCE(SUM(s.duration_seconds), 0) as total FROM study_sessions s WHERE s.user_id = ? AND s.duration_seconds > 60";
        let weeklyParams = [user_id];
        if (baseDate) {
            weeklyQuery += " AND DATE(s.start_time) > DATE_SUB(?, INTERVAL 7 DAY) AND DATE(s.start_time) <= ?";
            weeklyParams.push(baseDate, baseDate);
        } else {
            weeklyQuery += " AND start_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)";
        }
        if (subjectId) {
            weeklyQuery += " AND s.subject_id = ?";
            weeklyParams.push(subjectId);
        }
        const weeklyTotalResult = await db.query(weeklyQuery, weeklyParams);

        // 월간 합계
        let monthlyQuery = "SELECT COALESCE(SUM(s.duration_seconds), 0) as total FROM study_sessions s WHERE s.user_id = ? AND s.duration_seconds > 60";
        let monthlyParams = [user_id];
        if (baseDate) {
            monthlyQuery += " AND DATE(s.start_time) > DATE_SUB(?, INTERVAL 30 DAY) AND DATE(s.start_time) <= ?";
            monthlyParams.push(baseDate, baseDate);
        } else {
            monthlyQuery += " AND start_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)";
        }
        if (subjectId) {
            monthlyQuery += " AND s.subject_id = ?";
            monthlyParams.push(subjectId);
        }
        const monthlyTotalResult = await db.query(monthlyQuery, monthlyParams);

        // 3. 전체 누적 합계 (완료된 세션만)
        let totalQuery = "SELECT COALESCE(SUM(s.duration_seconds), 0) as total FROM study_sessions s WHERE s.user_id = ? AND s.duration_seconds > 60";
        let totalParams = [user_id];
        if (subjectId) {
            totalQuery += " AND s.subject_id = ?";
            totalParams.push(subjectId);
        }
        const totalTotalResult = await db.query(totalQuery, totalParams);

        res.json({
            sessions,
            dailyTotal: dailyTotalResult[0].total,
            weeklyTotal: weeklyTotalResult[0].total,
            monthlyTotal: monthlyTotalResult[0].total,
            weeklyAvg: dailyTotalResult[0].total / 7,
            monthlyAvg: dailyTotalResult[0].total / 30,
            cumulativeTotal: totalTotalResult[0].total
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
