const db = require('../config/db');
const bcrypt = require('bcrypt');

// 특정 사용자의 과목 목록 조회
exports.getSubjectsByUser = async (req, res) => {
    const { userId } = req.query;
    if (!userId) {
        return res.status(400).json({ error: 'userId가 필요합니다.' });
    }
    try {
        const subjects = await db.query(
            "SELECT * FROM subjects WHERE user_id = ? ORDER BY name ASC",
            [userId]
        );
        res.json(subjects);
    } catch (err) {
        res.status(500).json({ error: '과목 조회 중 오류 발생' });
    }
};

// 특정 사용자에게 과목 추가
exports.addSubjectForUser = async (req, res) => {
    const { userId, name, color } = req.body;
    if (!userId) {
        return res.status(400).json({ error: 'userId가 필요합니다.' });
    }
    if (!name || !name.trim()) {
        return res.status(400).json({ error: '과목 이름을 입력하세요.' });
    }
    try {
        const subjectColor = color || '#339af0';
        await db.query(
            "INSERT INTO subjects (user_id, name, color) VALUES (?, ?, ?)",
            [userId, name.trim(), subjectColor]
        );
        res.status(201).json({ message: '과목 추가 성공' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: '이미 존재하는 과목 이름입니다.' });
        }
        res.status(500).json({ error: '과목 추가 중 오류 발생' });
    }
};

// 과목 수정 (관리자 권한 - user_id 제한 없음)
exports.adminUpdateSubject = async (req, res) => {
    const { id } = req.params;
    const { name, color } = req.body;
    if (!name || !name.trim()) {
        return res.status(400).json({ error: '과목 이름을 입력하세요.' });
    }
    try {
        const result = await db.query(
            "UPDATE subjects SET name = ?, color = ? WHERE id = ?",
            [name.trim(), color, id]
        );
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

// 과목 삭제 (관리자 권한 - user_id 제한 없음)
exports.adminDeleteSubject = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query(
            "DELETE FROM subjects WHERE id = ?",
            [id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: '과목을 찾을 수 없습니다.' });
        }
        res.json({ message: '과목 삭제 성공' });
    } catch (err) {
        res.status(500).json({ error: '과목 삭제 중 오류 발생' });
    }
};

// 모든 사용자 조회
exports.getUsers = async (req, res) => {
    try {
        const users = await db.query("SELECT id, username, role, created_at FROM users ORDER BY created_at DESC");
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: '사용자 조회 중 오류 발생' });
    }
};

// 사용자 추가
exports.addUser = async (req, res) => {
    const { username, password, role } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const userRole = role || 'user';
        await db.query(
            "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
            [username, hashedPassword, userRole]
        );
        res.status(201).json({ message: '사용자 추가 성공' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: '이미 존재하는 아이디입니다.' });
        }
        res.status(500).json({ error: '사용자 추가 중 오류 발생' });
    }
};

// 사용자 삭제
exports.deleteUser = async (req, res) => {
    const { id } = req.params;
    try {
        // 관리자 본인 삭제 방지
        if (parseInt(id) === req.user.id) {
            return res.status(400).json({ error: '본인 계정은 삭제할 수 없습니다.' });
        }
        await db.query("DELETE FROM users WHERE id = ?", [id]);
        res.json({ message: '사용자 삭제 성공' });
    } catch (err) {
        res.status(500).json({ error: '사용자 삭제 중 오류 발생' });
    }
};

