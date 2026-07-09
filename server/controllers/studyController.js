const db = require('../config/db');

// DB에서 반환된 DATETIME 값을 UTC 기준 Date 객체로 변환합니다.
// db.js의 timezone: '+00:00' 설정으로 드라이버는 DATETIME을 UTC Date로 반환합니다.
// 만약 드라이버 설정에 관계없이 문자열로 반환된 경우를 위해 방어 처리를 추가합니다.
const parseUTCDate = (datetimeVal) => {
    if (!datetimeVal) return null;
    // 이미 Date 객체이면 그대로 반환 (드라이버가 timezone: '+00:00'으로 정확히 변환했음)
    if (datetimeVal instanceof Date) {
        return datetimeVal;
    }
    // 문자열인 경우: ISO 형식('Z' 포함)이면 그대로, 아니면 'Z'를 붙여 UTC로 파싱
    const str = datetimeVal.toString();
    if (str.endsWith('Z')) {
        return new Date(str);
    }
    // 'YYYY-MM-DD HH:mm:ss' 형태 처리 (드라이버가 문자열 반환 시)
    return new Date(str.replace(' ', 'T') + 'Z');
};


// ISO 문자열을 MariaDB/MySQL DATETIME 형식('YYYY-MM-DD HH:mm:ss')으로 변환
const isoToSQLDateTime = (isoStr) => {
    const d = new Date(isoStr);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
};







// 공부 시작
exports.startSession = async (req, res) => {
    const { subject_id, plan_id } = req.body;
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
            "INSERT INTO study_sessions (user_id, subject_id, plan_id, start_time) VALUES (?, ?, ?, UTC_TIMESTAMP())",
            [user_id, subject_id, plan_id || null]
        );

        if (plan_id) {
            await db.query(
                "UPDATE plans SET status = 'in_progress' WHERE id = ? AND user_id = ?",
                [plan_id, user_id]
            );
        }

        res.json({ message: '공부 시작!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '공부 시작 서버 오류: ' + err.message });
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
        const diffCheck = await db.query("SELECT TIMESTAMPDIFF(SECOND, start_time, UTC_TIMESTAMP()) as diff FROM study_sessions WHERE id = ?", [session.id]);
        const diffSeconds = diffCheck[0].diff;

        if (diffSeconds <= 60) {
            // 1분 이하인 경우 세션 삭제
            await db.query("DELETE FROM study_sessions WHERE id = ?", [session.id]);
            
            // 계획이 연결되어 있었다면 상태 복원 검토
            if (session.plan_id) {
                const planRes = await db.query("SELECT * FROM plans WHERE id = ?", [session.plan_id]);
                if (planRes.length > 0) {
                    const plan = planRes[0];
                    const nextStatus = plan.completed_seconds >= plan.estimated_minutes * 60 ? 'done' : 'todo';
                    await db.query("UPDATE plans SET status = ? WHERE id = ?", [nextStatus, session.plan_id]);
                }
            }
            return res.json({ message: '공부 시간이 1분 이하여서 기록되지 않았습니다.' });
        }

        await db.query(
            `UPDATE study_sessions 
             SET end_time = UTC_TIMESTAMP(), 
                 duration_seconds = ?
             WHERE id = ?`,
            [diffSeconds, session.id]
        );

        // 계획 연동 처리
        if (session.plan_id) {
            // 진행 시간 누적
            await db.query(
                `UPDATE plans 
                 SET completed_seconds = completed_seconds + ? 
                 WHERE id = ? AND user_id = ?`,
                [diffSeconds, session.plan_id, user_id]
            );

            // 누적 시간이 예상 시간보다 크거나 같은지 확인하여 상태 업데이트
            const planRes = await db.query("SELECT * FROM plans WHERE id = ?", [session.plan_id]);
            if (planRes.length > 0) {
                const plan = planRes[0];
                const nextStatus = plan.completed_seconds >= plan.estimated_minutes * 60 ? 'done' : 'todo';
                await db.query("UPDATE plans SET status = ? WHERE id = ?", [nextStatus, session.plan_id]);
            }
        }

        res.json({ message: '공부 종료!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '공부 종료 서버 오류: ' + err.message });
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
        if (active.length > 0) {
            const session = active[0];
            // DB의 DATETIME(UTC)을 'Z'를 붙여 UTC로 정확히 파싱 후 ISO 스트링으로 응답
            session.start_time = parseUTCDate(session.start_time).toISOString();
            res.json({ active: session });
        } else {
            res.json({ active: null });
        }




    } catch (err) {
        res.status(500).json({ error: '서버 오류 발생' });
    }
};

// 통계 조회 (일간, 주간, 월간 등)
exports.getStats = async (req, res) => {
    let user_id = req.user.id;
    const { targetUserId, startDate, endDate, subjectId } = req.query;

    // 필수 파라미터 체크
    if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate와 endDate가 필요합니다.' });
    }

    // 관리자이면서 targetUserId가 제공된 경우 해당 사용자의 통계 조회
    if (req.user.role === 'admin' && targetUserId) {
        user_id = targetUserId;
    }

    try {
        const rangeStart = startDate;
        const rangeEnd = endDate;
        
        console.log(`[Stats Debug] UTC Range: '${rangeStart}' ~ '${rangeEnd}', SubjectId: ${subjectId || 'All'}`);



        // 1. 선택일 시간대별 공부 분포 (24시간 파이 차트용)
        let sessionsQuery = `
            SELECT s.start_time, IF(s.end_time IS NULL, UTC_TIMESTAMP(), s.end_time) as actual_end, 
                   sub.name as subject_name, sub.color,
                   (s.end_time IS NULL) as is_active
            FROM study_sessions s
            LEFT JOIN subjects sub ON s.subject_id = sub.id
            WHERE s.user_id = ? 
              AND s.start_time <= ? 
              AND IFNULL(s.end_time, UTC_TIMESTAMP()) >= ?
        `;
        // WHERE 절의 파라미터 바인딩에도 SQL 호환 포맷으로 변환
        const sqlRangeStart = isoToSQLDateTime(rangeStart);
        const sqlRangeEnd = isoToSQLDateTime(rangeEnd);
        let sessionsParams = [user_id, sqlRangeEnd, sqlRangeStart];



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
            // DB의 DATETIME(UTC)을 'Z'를 붙여 UTC 기준 Date 객체로 변환
            let start = parseUTCDate(session.start_time);
            let end = parseUTCDate(session.actual_end);

            
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
            // ISO 문자열을 MariaDB 호환 DATETIME 형식으로 변환하여 SQL에 삽입
            const sqlStart = isoToSQLDateTime(rStart);
            const sqlEnd = isoToSQLDateTime(rEnd);
            const actualEnd = `IFNULL(${endCol}, UTC_TIMESTAMP())`;
            return `GREATEST(0, TIMESTAMPDIFF(SECOND, GREATEST(${startCol}, '${sqlStart}'), LEAST(${actualEnd}, '${sqlEnd}')))`;
        };



        // 일간 합계 (선택한 날짜의 로컬 범위 -> UTC 범위)
        let dailyQuery = `
            SELECT COALESCE(SUM(${getRangeDuration('s.start_time', 's.end_time', rangeStart, rangeEnd)}), 0) as total 
            FROM study_sessions s 
            WHERE s.user_id = ? 
              AND s.start_time <= ? 
              AND IFNULL(s.end_time, UTC_TIMESTAMP()) >= ?
        `;

        let dailyParams = [user_id, sqlRangeEnd, sqlRangeStart];


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
        // 클라이언트에서 넘겨준 rangeStart(기준일 00:00 UTC)를 기준으로 6일 전 계산
        const weeklyStartDate = new Date(new Date(rangeStart).getTime() - 6 * 86400000);
        const weeklyStartUTC = weeklyStartDate.toISOString();
        const weeklyEndUTC = rangeEnd;
        // SQL 바인딩용 SQL 호환 포맷으로 변환
        const sqlWeeklyStart = isoToSQLDateTime(weeklyStartUTC);
        const sqlWeeklyEnd = isoToSQLDateTime(weeklyEndUTC);



        let weeklyQuery = `
            SELECT COALESCE(SUM(${getRangeDuration('s.start_time', 's.end_time', weeklyStartUTC, weeklyEndUTC)}), 0) as total 
            FROM study_sessions s 
            WHERE s.user_id = ? 
              AND s.start_time <= ? 
              AND IFNULL(s.end_time, UTC_TIMESTAMP()) >= ?
        `;
        let weeklyParams = [user_id, sqlWeeklyEnd, sqlWeeklyStart];



        if (subjectId) {
            weeklyQuery += " AND s.subject_id = ?";
            weeklyParams.push(subjectId);
        }
        const weeklyTotalResult = await db.query(weeklyQuery, weeklyParams);

        // 월간 합계 (최근 30일)
        const monthlyStartDate = new Date(new Date(rangeStart).getTime() - 29 * 86400000);
        const monthlyStartUTC = monthlyStartDate.toISOString();
        const monthlyEndUTC = rangeEnd;
        // SQL 바인딩용 SQL 호호 포맷으로 변환
        const sqlMonthlyStart = isoToSQLDateTime(monthlyStartUTC);
        const sqlMonthlyEnd = isoToSQLDateTime(monthlyEndUTC);



        let monthlyQuery = `
            SELECT COALESCE(SUM(${getRangeDuration('s.start_time', 's.end_time', monthlyStartUTC, monthlyEndUTC)}), 0) as total 
            FROM study_sessions s 
            WHERE s.user_id = ? 
              AND s.start_time <= ? 
              AND IFNULL(s.end_time, UTC_TIMESTAMP()) >= ?
        `;
        let monthlyParams = [user_id, sqlMonthlyEnd, sqlMonthlyStart];



        if (subjectId) {
            monthlyQuery += " AND s.subject_id = ?";
            monthlyParams.push(subjectId);
        }
        const monthlyTotalResult = await db.query(monthlyQuery, monthlyParams);

        // 과목별 주간 합계 (GROUP BY subject) — 색상 포함
        let subjectWeeklyQuery = `
            SELECT sub.name as subject_name, sub.color,
                   COALESCE(SUM(${getRangeDuration('s.start_time', 's.end_time', weeklyStartUTC, weeklyEndUTC)}), 0) as total
            FROM study_sessions s
            LEFT JOIN subjects sub ON s.subject_id = sub.id
            WHERE s.user_id = ?
              AND s.start_time <= ?
              AND IFNULL(s.end_time, UTC_TIMESTAMP()) >= ?
        `;
        let subjectWeeklyParams = [user_id, sqlWeeklyEnd, sqlWeeklyStart];
        if (subjectId && subjectId !== 'null' && subjectId !== '') {
            subjectWeeklyQuery += " AND s.subject_id = ?";
            subjectWeeklyParams.push(subjectId);
        }
        subjectWeeklyQuery += " GROUP BY s.subject_id, sub.name, sub.color";

        // 과목별 월간 합계 (GROUP BY subject) — 색상 포함
        let subjectMonthlyQuery = `
            SELECT sub.name as subject_name, sub.color,
                   COALESCE(SUM(${getRangeDuration('s.start_time', 's.end_time', monthlyStartUTC, monthlyEndUTC)}), 0) as total
            FROM study_sessions s
            LEFT JOIN subjects sub ON s.subject_id = sub.id
            WHERE s.user_id = ?
              AND s.start_time <= ?
              AND IFNULL(s.end_time, UTC_TIMESTAMP()) >= ?
        `;
        let subjectMonthlyParams = [user_id, sqlMonthlyEnd, sqlMonthlyStart];
        if (subjectId && subjectId !== 'null' && subjectId !== '') {
            subjectMonthlyQuery += " AND s.subject_id = ?";
            subjectMonthlyParams.push(subjectId);
        }
        subjectMonthlyQuery += " GROUP BY s.subject_id, sub.name, sub.color";

        const subjectWeeklyResult = await db.query(subjectWeeklyQuery, subjectWeeklyParams);
        const subjectMonthlyResult = await db.query(subjectMonthlyQuery, subjectMonthlyParams);

        // subject_name 키로 { avg, color } 객체 생성
        const subjectWeeklyAvgs = {};
        subjectWeeklyResult.forEach(row => {
            subjectWeeklyAvgs[row.subject_name] = { avg: Number(row.total) / 7, color: row.color };
        });
        const subjectMonthlyAvgs = {};
        subjectMonthlyResult.forEach(row => {
            subjectMonthlyAvgs[row.subject_name] = { avg: Number(row.total) / 30, color: row.color };
        });

        // 3. 전체 누적 합계 (모든 시간)
        let totalQuery = `
            SELECT COALESCE(SUM(IFNULL(s.duration_seconds, TIMESTAMPDIFF(SECOND, s.start_time, UTC_TIMESTAMP()))), 0) as total 
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
            subjectWeeklyAvgs,
            subjectMonthlyAvgs,
            cumulativeTotal: totalTotalResult[0].total,
            debug: {
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

// 과목 목록 조회 (로그인한 사용자 전용)
exports.getSubjects = async (req, res) => {
    try {
        const subjects = await db.query(
            "SELECT * FROM subjects WHERE user_id = ? ORDER BY name ASC",
            [req.user.id]
        );
        res.json(subjects);
    } catch (err) {
        res.status(500).json({ error: '과목 조회 중 오류 발생' });
    }
};

// 계획 목록 조회
exports.getPlans = async (req, res) => {
    const user_id = req.user.id;
    try {
        const plans = await db.query(
            `SELECT p.*, s.name as subject_name, s.color as subject_color 
             FROM plans p 
             JOIN subjects s ON p.subject_id = s.id 
             WHERE p.user_id = ? 
             ORDER BY p.created_at DESC`,
            [user_id]
        );
        res.json(plans);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '계획 조회 중 오류 발생' });
    }
};

// 계획 생성
exports.createPlan = async (req, res) => {
    const user_id = req.user.id;
    const { subject_id, title, estimated_minutes } = req.body;
    
    if (!subject_id || !title || !estimated_minutes) {
        return res.status(400).json({ error: '과목, 계획 내용, 예상 시간은 필수입니다.' });
    }
    
    try {
        await db.query(
            `INSERT INTO plans (user_id, subject_id, title, estimated_minutes, completed_seconds, status) 
             VALUES (?, ?, ?, ?, 0, 'todo')`,
            [user_id, subject_id, title, estimated_minutes]
        );
        res.json({ message: '계획이 생성되었습니다.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '계획 생성 중 오류 발생' });
    }
};

// 계획 완료 처리
exports.donePlan = async (req, res) => {
    const user_id = req.user.id;
    const { id } = req.params;
    try {
        await db.query(
            `UPDATE plans SET status = 'done' WHERE id = ? AND user_id = ?`,
            [id, user_id]
        );
        res.json({ message: '계획이 완료 처리되었습니다.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '계획 완료 처리 중 오류 발생' });
    }
};

// 계획 삭제
exports.deletePlan = async (req, res) => {
    const user_id = req.user.id;
    const { id } = req.params;
    try {
        await db.query(
            `DELETE FROM plans WHERE id = ? AND user_id = ?`,
            [id, user_id]
        );
        res.json({ message: '계획이 삭제되었습니다.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '계획 삭제 중 오류 발생' });
    }
};

// 계획 완료 취소 처리 (진행 시간에 따라 todo 또는 in_progress 상태로 복구)
exports.undonePlan = async (req, res) => {
    const user_id = req.user.id;
    const { id } = req.params;
    try {
        // 계획 정보를 조회하여 완료 시간을 되돌릴 상태(todo 또는 in_progress)를 결정합니다.
        const planRes = await db.query("SELECT completed_seconds FROM plans WHERE id = ? AND user_id = ?", [id, user_id]);
        if (planRes.length === 0) {
            return res.status(404).json({ error: '계획을 찾을 수 없습니다.' });
        }
        
        const completedSeconds = planRes[0].completed_seconds;
        const nextStatus = completedSeconds > 0 ? 'in_progress' : 'todo';

        await db.query(
            `UPDATE plans SET status = ? WHERE id = ? AND user_id = ?`,
            [nextStatus, id, user_id]
        );
        res.json({ message: '계획 완료 처리가 취소되었습니다.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '계획 완료 취소 중 오류 발생: ' + err.message });
    }
};

// 과목 추가 (로그인한 사용자 전용)
exports.addSubject = async (req, res) => {
    const { name, color } = req.body;
    const user_id = req.user.id;
    if (!name || !name.trim()) {
        return res.status(400).json({ error: '과목 이름을 입력하세요.' });
    }
    try {
        const subjectColor = color || '#339af0';
        await db.query(
            "INSERT INTO subjects (user_id, name, color) VALUES (?, ?, ?)",
            [user_id, name.trim(), subjectColor]
        );
        res.status(201).json({ message: '과목 추가 성공' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: '이미 존재하는 과목 이름입니다.' });
        }
        res.status(500).json({ error: '과목 추가 중 오류 발생' });
    }
};

// 과목 수정 (소유자만 가능)
exports.updateSubject = async (req, res) => {
    const { id } = req.params;
    const { name, color } = req.body;
    const user_id = req.user.id;
    if (!name || !name.trim()) {
        return res.status(400).json({ error: '과목 이름을 입력하세요.' });
    }
    try {
        const result = await db.query(
            "UPDATE subjects SET name = ?, color = ? WHERE id = ? AND user_id = ?",
            [name.trim(), color, id, user_id]
        );
        // affectedRows가 0이면 해당 과목이 없거나 다른 사용자 소유
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: '과목을 찾을 수 없습니다.' });
        }
        res.json({ message: '과목 수정 성공' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: '이미 존재하는 과목 이름입니다.' });
        }
        res.status(500).json({ error: '과목 수정 중 오류 발생' });
    }
};

// 과목 삭제 (소유자만 가능)
exports.deleteSubject = async (req, res) => {
    const { id } = req.params;
    const user_id = req.user.id;
    try {
        const result = await db.query(
            "DELETE FROM subjects WHERE id = ? AND user_id = ?",
            [id, user_id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: '과목을 찾을 수 없습니다.' });
        }
        res.json({ message: '과목 삭제 성공' });
    } catch (err) {
        res.status(500).json({ error: '과목 삭제 중 오류 발생' });
    }
};

