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
        let baseDate = (date && date.trim()) || null;
        const targetDateStr = baseDate ? baseDate : new Date().toLocaleDateString('en-CA');
        const rangeStart = `${targetDateStr} 00:00:00`;
        const rangeEnd = `${targetDateStr} 23:59:59`;
        
        console.log(`[Stats Debug] TargetDate: '${targetDateStr}', Range: '${rangeStart}' ~ '${rangeEnd}', SubjectId: ${subjectId || 'All'}`);

        // 1. 선택일 시간대별 공부 분포 (24시간 파이 차트용)
        let sessionsQuery = `
            SELECT s.start_time, IF(s.end_time IS NULL, NOW(), s.end_time) as actual_end, 
                   sub.name as subject_name, sub.color,
                   (s.end_time IS NULL) as is_active
            FROM study_sessions s
            LEFT JOIN subjects sub ON s.subject_id = sub.id
            WHERE s.user_id = ? 
              AND s.start_time <= CAST(? AS DATETIME) 
              AND IFNULL(s.end_time, NOW()) >= CAST(? AS DATETIME)
        `;
        let sessionsParams = [user_id, rangeEnd, rangeStart];
        if (subjectId && subjectId !== 'null' && subjectId !== '') {
            sessionsQuery += ` AND s.subject_id = ?`;
            sessionsParams.push(subjectId);
        }
        
        const rawSessions = await db.query(sessionsQuery, sessionsParams);
        console.log(`[Stats Debug] rawSessions found: ${rawSessions.length}`);
        
        let dayStart = new Date(rangeStart);
        let dayEnd = new Date(rangeEnd);
        
        let manualDailyTotal = 0;
        const sessions = [];
        rawSessions.forEach((session, idx) => {
            let start = new Date(session.start_time);
            let end = new Date(session.actual_end);
            
            if (start < dayStart) start = dayStart;
            if (end > dayEnd) end = dayEnd;
            if (start >= end) return;
            
            const duration = Math.floor((end - start) / 1000);
            manualDailyTotal += duration;

            console.log(`[Stats Debug] Session ${idx}: ${session.subject_name}, Start: ${start.toISOString()}, End: ${end.toISOString()}, Duration: ${duration}s, Active: ${session.is_active}`);
            
            sessions.push({
                subject_name: session.subject_name,
                color: session.color || '#339af0',
                start: start.toISOString(),
                end: end.toISOString(),
                is_active: !!session.is_active
            });
        });
        console.log(`[Stats Debug] Manual JS Daily Total: ${manualDailyTotal}s`);

        // 2. 일간, 주간, 월간 총합 (범위 내 시간만 정밀 계산)
        // range_start와 range_end 사이의 시간만 추출하는 표현식
        // rStart와 rEnd는 SQL 문법에 맞는 형태(예: '?' 또는 'DATE_SUB(...)')여야 함
        const getRangeDuration = (startCol, endCol, rStart, rEnd) => {
            const actualEnd = `IFNULL(${endCol}, NOW())`;
            // CAST를 사용하여 데이터 타입 명시
            const startVal = rStart.includes('?') ? `CAST(${rStart} AS DATETIME)` : rStart;
            const endVal = rEnd.includes('?') ? `CAST(${rEnd} AS DATETIME)` : rEnd;
            return `GREATEST(0, TIMESTAMPDIFF(SECOND, GREATEST(${startCol}, ${startVal}), LEAST(${actualEnd}, ${endVal})))`;
        };

        // 일간 합계 (선택한 날짜의 00:00:00 ~ 23:59:59)
        let dailyQuery = `
            SELECT COALESCE(SUM(${getRangeDuration('s.start_time', 's.end_time', '?', '?')}), 0) as total 
            FROM study_sessions s 
            WHERE s.user_id = ? 
              AND s.start_time <= CAST(? AS DATETIME) 
              AND IFNULL(s.end_time, NOW()) >= CAST(? AS DATETIME)
        `;
        let dailyParams = [rangeStart, rangeEnd, user_id, rangeEnd, rangeStart];
        if (subjectId && subjectId !== 'null' && subjectId !== '') {
            dailyQuery += " AND s.subject_id = ?";
            dailyParams.push(subjectId);
        }
        const dailyTotalResult = await db.query(dailyQuery, dailyParams);
        let sqlDailyTotal = Number(dailyTotalResult[0].total) || 0;
        console.log(`[Stats Debug] Daily Query Total: ${sqlDailyTotal} seconds`);

        // SQL 결과가 0인데 JS 계산 결과가 있다면 JS 결과를 우선 사용 (보험용)
        const finalDailyTotal = (sqlDailyTotal === 0 && manualDailyTotal > 0) ? manualDailyTotal : sqlDailyTotal;
        
        // 주간 합계 (최근 7일)
        const weeklyStart = baseDate ? `DATE_SUB(?, INTERVAL 6 DAY)` : "DATE_SUB(CURDATE(), INTERVAL 6 DAY)";
        const weeklyEnd = rangeEnd;
        let weeklyQuery = `
            SELECT COALESCE(SUM(${getRangeDuration('s.start_time', 's.end_time', weeklyStart, '?')}), 0) as total 
            FROM study_sessions s 
            WHERE s.user_id = ? 
              AND s.start_time <= ? 
              AND IFNULL(s.end_time, NOW()) >= ${weeklyStart}
        `;
        let weeklyParams = [];
        if (baseDate) weeklyParams.push(rangeStart); // getRangeDuration용 weeklyStart(?)
        weeklyParams.push(weeklyEnd); // getRangeDuration용 weeklyEnd(?)
        weeklyParams.push(user_id);
        weeklyParams.push(weeklyEnd); // WHERE s.start_time <= ?
        if (baseDate) weeklyParams.push(rangeStart); // WHERE ... >= DATE_SUB(?, ...)

        if (subjectId) {
            weeklyQuery += " AND s.subject_id = ?";
            weeklyParams.push(subjectId);
        }
        const weeklyTotalResult = await db.query(weeklyQuery, weeklyParams);

        // 월간 합계 (최근 30일)
        const monthlyStart = baseDate ? `DATE_SUB(?, INTERVAL 29 DAY)` : "DATE_SUB(CURDATE(), INTERVAL 29 DAY)";
        const monthlyEnd = rangeEnd;
        let monthlyQuery = `
            SELECT COALESCE(SUM(${getRangeDuration('s.start_time', 's.end_time', monthlyStart, '?')}), 0) as total 
            FROM study_sessions s 
            WHERE s.user_id = ? 
              AND s.start_time <= ? 
              AND IFNULL(s.end_time, NOW()) >= ${monthlyStart}
        `;
        let monthlyParams = [];
        if (baseDate) monthlyParams.push(rangeStart);
        monthlyParams.push(monthlyEnd);
        monthlyParams.push(user_id);
        monthlyParams.push(monthlyEnd);
        if (baseDate) monthlyParams.push(rangeStart);

        if (subjectId) {
            monthlyQuery += " AND s.subject_id = ?";
            monthlyParams.push(subjectId);
        }
        const monthlyTotalResult = await db.query(monthlyQuery, monthlyParams);

        // 3. 전체 누적 합계 (모든 시간)
        let totalQuery = `
            SELECT COALESCE(SUM(IFNULL(s.duration_seconds, TIMESTAMPDIFF(SECOND, s.start_time, NOW()))), 0) as total 
            FROM study_sessions s 
            WHERE s.user_id = ?
        `;
        let totalParams = [user_id];
        if (subjectId) {
            totalQuery += " AND s.subject_id = ?";
            totalParams.push(subjectId);
        }
        const totalTotalResult = await db.query(totalQuery, totalParams);

        const responseData = {
            sessions,
            dailyTotal: finalDailyTotal,
            weeklyTotal: weeklyTotalResult[0].total,
            monthlyTotal: monthlyTotalResult[0].total,
            weeklyAvg: weeklyTotalResult[0].total / 7,
            monthlyAvg: monthlyTotalResult[0].total / 30,
            cumulativeTotal: totalTotalResult[0].total,
            debug: {
                targetDate: targetDateStr,
                range: { start: rangeStart, end: rangeEnd },
                manualDailyTotal,
                sqlDailyTotal: sqlDailyTotal,
                finalDailyTotal: finalDailyTotal,
                sessionCount: sessions.length,
                rawSessions: sessions
            }
        };

        console.log(`[Stats Debug] Final Response sent with debug info`);
        res.json(responseData);
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
