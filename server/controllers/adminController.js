const db = require('../config/db');

// 모든 사용자 조회
exports.getUsers = async (req, res) => {
    try {
        const users = await db.query("SELECT id, username, role, created_at FROM users ORDER BY created_at DESC");
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: '사용자 조회 중 오류 발생' });
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

// 과목 추가
exports.addSubject = async (req, res) => {
    const { name } = req.body;
    try {
        await db.query("INSERT INTO subjects (name) VALUES (?)", [name]);
        res.status(201).json({ message: '과목 추가 성공' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: '이미 존재하는 과목입니다.' });
        }
        res.status(500).json({ error: '과목 추가 중 오류 발생' });
    }
};

// 과목 삭제
exports.deleteSubject = async (req, res) => {
    const { id } = req.params;
    try {
        await db.query("DELETE FROM subjects WHERE id = ?", [id]);
        res.json({ message: '과목 삭제 성공' });
    } catch (err) {
        res.status(500).json({ error: '과목 삭제 중 오류 발생' });
    }
};
