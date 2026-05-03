const db = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

exports.register = async (req, res) => {
    const { username, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query(
            "INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')",
            [username, hashedPassword]
        );
        res.status(201).json({ message: '회원가입 성공' });
    } catch (err) {
        console.error('Register Error:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: '이미 존재하는 아이디입니다.' });
        }
        res.status(500).json({ error: '서버 오류 발생' });
    }
};

exports.login = async (req, res) => {
    const { username, password } = req.body;
    try {
        const users = await db.query("SELECT * FROM users WHERE username = ?", [username]);
        if (users.length === 0) {
            return res.status(401).json({ error: '존재하지 않는 아이디입니다.' });
        }

        const user = users[0];
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ error: '비밀번호가 일치하지 않습니다.' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: { id: user.id, username: user.username, role: user.role }
        });
    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ error: '서버 오류 발생' });
    }
};

exports.verifyToken = (req, res) => {
    // 미들웨어에서 이미 검증됨
    res.json({ user: req.user });
};
