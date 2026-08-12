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







const getOpenGroup = async (userId) => {
    const groups = await db.query(
        `SELECT * FROM study_session_groups
         WHERE user_id = ? AND status IN ('running', 'paused')
         ORDER BY id DESC LIMIT 1`,
        [userId]
    );
    return groups[0] || null;
};

const getGroupAccumulatedSeconds = async (groupId) => {
    const rows = await db.query(
        `SELECT COALESCE(SUM(
            CASE WHEN end_time IS NULL
                 THEN TIMESTAMPDIFF(SECOND, start_time, UTC_TIMESTAMP())
                 ELSE duration_seconds END
        ), 0) AS total
         FROM study_sessions WHERE session_group_id = ?`,
        [groupId]
    );
    return Number(rows[0].total) || 0;
};

const updatePlanAfterFinalStop = async (group, totalSeconds, remove = false) => {
    if (!group.plan_id) return;
    if (remove && totalSeconds > 0) {
        await db.query(
            `UPDATE plans SET completed_seconds = GREATEST(0, completed_seconds - ?)
             WHERE id = ? AND user_id = ?`,
            [totalSeconds, group.plan_id, group.user_id]
        );
    }
    const plans = await db.query(
        'SELECT completed_seconds, estimated_minutes FROM plans WHERE id = ? AND user_id = ?',
        [group.plan_id, group.user_id]
    );
    if (plans.length > 0) {
        const status = plans[0].completed_seconds >= plans[0].estimated_minutes * 60 ? 'done' : 'todo';
        await db.query('UPDATE plans SET status = ? WHERE id = ? AND user_id = ?', [status, group.plan_id, group.user_id]);
    }
};

// 공부 시작
exports.startSession = async (req, res) => {
    const { subject_id, plan_id } = req.body;
    const user_id = req.user.id;
    try {
        const subjects = await db.query('SELECT id FROM subjects WHERE id = ? AND user_id = ?', [subject_id, user_id]);
        if (subjects.length === 0) {
            return res.status(404).json({ error: '선택한 과목을 찾을 수 없습니다.' });
        }
        if (plan_id) {
            const plans = await db.query(
                'SELECT id FROM plans WHERE id = ? AND user_id = ? AND subject_id = ?',
                [plan_id, user_id, subject_id]
            );
            if (plans.length === 0) {
                return res.status(404).json({ error: '선택한 과목에 해당하는 계획을 찾을 수 없습니다.' });
            }
        }
        // 새 방식의 실행 중/일시 정지 그룹과 과거 방식의 열린 세션을 모두 확인합니다.
        const openGroup = await getOpenGroup(user_id);
        const active = await db.query(
            "SELECT * FROM study_sessions WHERE user_id = ? AND end_time IS NULL",
            [user_id]
        );
        if (openGroup || active.length > 0) {
            return res.status(400).json({ error: '이미 진행 중인 공부 세션이 있습니다.' });
        }

        const groupResult = await db.query(
            `INSERT INTO study_session_groups
             (user_id, subject_id, plan_id, status, started_at)
             VALUES (?, ?, ?, 'running', UTC_TIMESTAMP())`,
            [user_id, subject_id, plan_id || null]
        );
        const groupId = Number(groupResult.insertId);

        await db.query(
            `INSERT INTO study_sessions
             (user_id, subject_id, plan_id, session_group_id, start_time)
             VALUES (?, ?, ?, ?, UTC_TIMESTAMP())`,
            [user_id, subject_id, plan_id || null, groupId]
        );

        if (plan_id) {
            await db.query(
                "UPDATE plans SET status = 'in_progress' WHERE id = ? AND user_id = ?",
                [plan_id, user_id]
            );
        }

        const started = await db.query('SELECT started_at FROM study_session_groups WHERE id = ?', [groupId]);
        res.json({
            message: '공부 시작!',
            state: 'running',
            session_group_id: groupId,
            accumulated_seconds: 0,
            segment_start_time: parseUTCDate(started[0].started_at).toISOString()
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '공부 시작 서버 오류: ' + err.message });
    }
};

// 공부 일시 정지
exports.pauseSession = async (req, res) => {
    const user_id = req.user.id;
    try {
        const group = await getOpenGroup(user_id);
        if (!group || group.status !== 'running') {
            return res.status(400).json({ error: '진행 중인 공부 세션이 없습니다.' });
        }
        const active = await db.query(
            `SELECT * FROM study_sessions
             WHERE user_id = ? AND session_group_id = ? AND end_time IS NULL
             ORDER BY id DESC LIMIT 1`,
            [user_id, group.id]
        );
        if (active.length === 0) {
            return res.status(409).json({ error: '진행 중인 공부 구간을 찾을 수 없습니다.' });
        }
        const diff = await db.query(
            'SELECT GREATEST(0, TIMESTAMPDIFF(SECOND, start_time, UTC_TIMESTAMP())) AS diff FROM study_sessions WHERE id = ?',
            [active[0].id]
        );
        const segmentSeconds = Number(diff[0].diff) || 0;
        await db.query(
            'UPDATE study_sessions SET end_time = UTC_TIMESTAMP(), duration_seconds = ? WHERE id = ? AND end_time IS NULL',
            [segmentSeconds, active[0].id]
        );
        await db.query("UPDATE study_session_groups SET status = 'paused' WHERE id = ? AND user_id = ? AND status = 'running'", [group.id, user_id]);
        if (group.plan_id && segmentSeconds > 0) {
            await db.query(
                'UPDATE plans SET completed_seconds = completed_seconds + ? WHERE id = ? AND user_id = ?',
                [segmentSeconds, group.plan_id, user_id]
            );
        }
        const total = await getGroupAccumulatedSeconds(group.id);
        res.json({ message: '공부를 일시 정지했습니다.', state: 'paused', accumulated_seconds: total });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '공부 일시 정지 서버 오류: ' + err.message });
    }
};

// 공부 재개
exports.resumeSession = async (req, res) => {
    const user_id = req.user.id;
    try {
        const group = await getOpenGroup(user_id);
        if (!group || group.status !== 'paused') {
            return res.status(400).json({ error: '일시 정지된 공부 세션이 없습니다.' });
        }
        const accumulated = await getGroupAccumulatedSeconds(group.id);
        await db.query(
            `INSERT INTO study_sessions
             (user_id, subject_id, plan_id, session_group_id, start_time)
             VALUES (?, ?, ?, ?, UTC_TIMESTAMP())`,
            [user_id, group.subject_id, group.plan_id, group.id]
        );
        await db.query("UPDATE study_session_groups SET status = 'running' WHERE id = ? AND user_id = ? AND status = 'paused'", [group.id, user_id]);
        if (group.plan_id) {
            await db.query("UPDATE plans SET status = 'in_progress' WHERE id = ? AND user_id = ?", [group.plan_id, user_id]);
        }
        const active = await db.query(
            'SELECT start_time FROM study_sessions WHERE session_group_id = ? AND end_time IS NULL ORDER BY id DESC LIMIT 1',
            [group.id]
        );
        res.json({
            message: '공부를 재개했습니다.',
            state: 'running',
            accumulated_seconds: accumulated,
            segment_start_time: parseUTCDate(active[0].start_time).toISOString()
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '공부 재개 서버 오류: ' + err.message });
    }
};


// 공부 종료
exports.stopSession = async (req, res) => {
    const user_id = req.user.id;
    try {
        const group = await getOpenGroup(user_id);
        if (group) {
            if (group.status === 'running') {
                const active = await db.query(
                    `SELECT id FROM study_sessions
                     WHERE user_id = ? AND session_group_id = ? AND end_time IS NULL
                     ORDER BY id DESC LIMIT 1`,
                    [user_id, group.id]
                );
                if (active.length === 0) {
                    return res.status(409).json({ error: '진행 중인 공부 구간을 찾을 수 없습니다.' });
                }
                const diff = await db.query(
                    'SELECT GREATEST(0, TIMESTAMPDIFF(SECOND, start_time, UTC_TIMESTAMP())) AS diff FROM study_sessions WHERE id = ?',
                    [active[0].id]
                );
                const segmentSeconds = Number(diff[0].diff) || 0;
                await db.query(
                    'UPDATE study_sessions SET end_time = UTC_TIMESTAMP(), duration_seconds = ? WHERE id = ? AND end_time IS NULL',
                    [segmentSeconds, active[0].id]
                );
                if (group.plan_id && segmentSeconds > 0) {
                    await db.query(
                        'UPDATE plans SET completed_seconds = completed_seconds + ? WHERE id = ? AND user_id = ?',
                        [segmentSeconds, group.plan_id, user_id]
                    );
                }
            }

            const totalSeconds = await getGroupAccumulatedSeconds(group.id);
            if (totalSeconds <= 60) {
                await db.query('DELETE FROM study_sessions WHERE session_group_id = ? AND user_id = ?', [group.id, user_id]);
                await updatePlanAfterFinalStop(group, totalSeconds, true);
                await db.query('DELETE FROM study_session_groups WHERE id = ? AND user_id = ?', [group.id, user_id]);
                return res.json({ message: '공부 시간이 1분 이하여서 기록되지 않았습니다.', state: 'idle', duration_seconds: 0 });
            }

            await db.query(
                "UPDATE study_session_groups SET status = 'ended', ended_at = UTC_TIMESTAMP() WHERE id = ? AND user_id = ?",
                [group.id, user_id]
            );
            await updatePlanAfterFinalStop(group, totalSeconds, false);
            return res.json({ message: '공부 종료!', state: 'idle', duration_seconds: totalSeconds });
        }

        // 그룹 도입 전 생성된 열린 세션을 위한 기존 호환 처리
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

            // 누적 시간이 목표 시간보다 크거나 같은지 확인하여 상태 업데이트
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
        const groupRows = await db.query(
            `SELECT g.*, sub.name AS subject_name, p.title AS plan_title,
                    active.start_time AS segment_start_time,
                    COALESCE((SELECT SUM(s.duration_seconds) FROM study_sessions s
                              WHERE s.session_group_id = g.id AND s.end_time IS NOT NULL), 0) AS accumulated_seconds
             FROM study_session_groups g
             JOIN subjects sub ON g.subject_id = sub.id
             LEFT JOIN plans p ON g.plan_id = p.id
             LEFT JOIN study_sessions active
               ON active.session_group_id = g.id AND active.end_time IS NULL
             WHERE g.user_id = ? AND g.status IN ('running', 'paused')
             ORDER BY g.id DESC LIMIT 1`,
            [user_id]
        );
        if (groupRows.length > 0) {
            const group = groupRows[0];
            return res.json({
                state: group.status,
                active: {
                    session_group_id: group.id,
                    subject_id: group.subject_id,
                    subject_name: group.subject_name,
                    plan_id: group.plan_id,
                    plan_title: group.plan_title,
                    accumulated_seconds: Number(group.accumulated_seconds) || 0,
                    start_time: group.segment_start_time ? parseUTCDate(group.segment_start_time).toISOString() : null,
                    started_at: parseUTCDate(group.started_at).toISOString()
                }
            });
        }
        const active = await db.query(
            `SELECT s.*, sub.name as subject_name, p.title as plan_title
             FROM study_sessions s
             JOIN subjects sub ON s.subject_id = sub.id
             LEFT JOIN plans p ON s.plan_id = p.id
             WHERE s.user_id = ? AND s.end_time IS NULL`,
            [user_id]
        );
        if (active.length > 0) {
            const session = active[0];
            // DB의 DATETIME(UTC)을 'Z'를 붙여 UTC로 정확히 파싱 후 ISO 스트링으로 응답
            session.start_time = parseUTCDate(session.start_time).toISOString();
            res.json({ state: 'running', active: session });
        } else {
            res.json({ state: 'idle', active: null });
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
        // 각 공부 세션이 계획과 연동되어 있다면 계획 제목(plan_title)도 함께 조회합니다.
        let sessionsQuery = `
            SELECT s.start_time, IF(s.end_time IS NULL, UTC_TIMESTAMP(), s.end_time) as actual_end, 
                   sub.name as subject_name, sub.color,
                   (s.end_time IS NULL) as is_active,
                   p.title as plan_title
            FROM study_sessions s
            LEFT JOIN subjects sub ON s.subject_id = sub.id
            LEFT JOIN plans p ON s.plan_id = p.id
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

            console.log(`[Stats Debug] Session ${idx}: ${session.subject_name}, Start: ${start.toISOString()}, End: ${end.toISOString()}, Duration: ${duration}s, Active: ${session.is_active}, PlanTitle: ${session.plan_title}`);

            sessions.push({
                subject_name: session.subject_name,
                color: session.color || '#339af0',
                start: start.toISOString(),
                end: end.toISOString(),
                is_active: !!session.is_active,
                plan_title: session.plan_title || null
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

        let countQuery = `
            SELECT COUNT(DISTINCT COALESCE(CAST(s.session_group_id AS CHAR), CONCAT('legacy-', s.id))) AS study_count,
                   COUNT(*) AS segment_count
            FROM study_sessions s
            WHERE s.user_id = ?
              AND s.start_time <= ?
              AND IFNULL(s.end_time, UTC_TIMESTAMP()) >= ?
        `;
        const countParams = [user_id, sqlRangeEnd, sqlRangeStart];
        if (subjectId && subjectId !== 'null' && subjectId !== '') {
            countQuery += ' AND s.subject_id = ?';
            countParams.push(subjectId);
        }
        const countResult = await db.query(countQuery, countParams);

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
            SELECT COALESCE(SUM(CASE WHEN s.end_time IS NULL
                                THEN TIMESTAMPDIFF(SECOND, s.start_time, UTC_TIMESTAMP())
                                ELSE s.duration_seconds END), 0) as total
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
            studyCount: Number(countResult[0].study_count) || 0,
            segmentCount: Number(countResult[0].segment_count) || 0,
            debug: {
                range: { start: rangeStart, end: rangeEnd },
                manualDailyTotal,

                sqlDailyTotal: sqlDailyTotal,
                finalDailyTotal: finalDailyTotal,
                sessionCount: Number(countResult[0].study_count) || 0,
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
    const { startDate, endDate } = req.query; // 클라이언트에서 전달한 날짜 범위 (UTC ISO 스트링)
    try {
        let query = `
            SELECT p.*, s.name as subject_name, s.color as subject_color,
                   (SELECT MIN(start_time) FROM study_sessions WHERE plan_id = p.id) as started_at,
                   (SELECT MAX(end_time) FROM study_sessions WHERE plan_id = p.id) as completed_at
            FROM plans p 
            JOIN subjects s ON p.subject_id = s.id 
            WHERE p.user_id = ?
        `;
        const params = [user_id];

        // startDate와 endDate가 있는 경우 당일(오늘) 생성된 계획만 필터링합니다.
        if (startDate && endDate) {
            query += ` AND p.created_at >= ? AND p.created_at <= ?`;
            params.push(isoToSQLDateTime(startDate), isoToSQLDateTime(endDate));
        }

        query += ` ORDER BY p.created_at DESC`;

        const plans = await db.query(query, params);

        // 시간 데이터(DATETIME)를 클라이언트 시간 처리 원칙에 맞게 ISO 8601형식으로 변환합니다.
        const formattedPlans = plans.map(p => {
            return {
                ...p,
                started_at: p.started_at ? parseUTCDate(p.started_at).toISOString() : null,
                completed_at: p.completed_at ? parseUTCDate(p.completed_at).toISOString() : null
            };
        });

        res.json(formattedPlans);
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
        return res.status(400).json({ error: '과목, 계획 내용, 목표 시간은 필수입니다.' });
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

// 계획 수정 (진행 중이 아닐 때만 목표 시간과 계획 내용 수정 가능)
exports.updatePlan = async (req, res) => {
    const user_id = req.user.id;
    const { id } = req.params;
    const { title, estimated_minutes } = req.body;

    if (!title || !title.trim() || !estimated_minutes || estimated_minutes <= 0) {
        return res.status(400).json({ error: '계획 내용과 목표 시간을 올바르게 입력하세요.' });
    }

    try {
        const planResult = await db.query(
            "SELECT status, completed_seconds FROM plans WHERE id = ? AND user_id = ?",
            [id, user_id]
        );
        if (planResult.length === 0) {
            return res.status(404).json({ error: '계획을 찾을 수 없습니다.' });
        }

        const plan = planResult[0];

        // 현재 진행 중인 계획은 수정할 수 없습니다.
        if (plan.status === 'in_progress') {
            return res.status(400).json({ error: '진행 중인 계획은 수정할 수 없습니다.' });
        }

        // 목표 시간은 지금까지 진행된 시간(completed_seconds)보다 짧게 설정할 수 없습니다.
        const minMinutes = Math.ceil(plan.completed_seconds / 60);
        if (estimated_minutes < minMinutes) {
            return res.status(400).json({ error: `목표 시간은 지금까지 진행된 시간(${minMinutes}분)보다 짧게 설정할 수 없습니다.` });
        }

        // 진행된 시간 대비 새 목표 시간에 맞춰 상태를 재계산합니다.
        const nextStatus = plan.completed_seconds >= estimated_minutes * 60 ? 'done' : 'todo';

        await db.query(
            `UPDATE plans SET title = ?, estimated_minutes = ?, status = ? WHERE id = ? AND user_id = ?`,
            [title.trim(), estimated_minutes, nextStatus, id, user_id]
        );
        res.json({ message: '계획이 수정되었습니다.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '계획 수정 중 오류 발생' });
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
        // 1. 해당 계획이 존재하는지 및 이미 누적 기록(completed_seconds)이 존재하여 진행이 되었는지 검사합니다.
        const planResult = await db.query(
            "SELECT completed_seconds FROM plans WHERE id = ? AND user_id = ?",
            [id, user_id]
        );
        if (planResult.length === 0) {
            return res.status(404).json({ error: '계획을 찾을 수 없습니다.' });
        }

        const plan = planResult[0];

        // 누적 기록된 시간이 0초를 초과하는 경우 삭제할 수 없습니다.
        if (plan.completed_seconds > 0) {
            return res.status(400).json({ error: '진행 기록이 존재하는 계획은 삭제할 수 없습니다.' });
        }

        // 2. study_sessions 테이블에 해당 계획과 연동된 세션 기록(현재 공부 중이거나 완료된 세션)이 존재하는지 검사합니다.
        const sessionResult = await db.query(
            "SELECT id FROM study_sessions WHERE plan_id = ? AND user_id = ? LIMIT 1",
            [id, user_id]
        );
        if (sessionResult.length > 0) {
            return res.status(400).json({ error: '이미 시작되었거나 기록이 존재하는 계획은 삭제할 수 없습니다.' });
        }

        // 3. 검증을 모두 통과하면 계획을 데이터베이스에서 삭제합니다.
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
