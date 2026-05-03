const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const db = require('./config/db');
const bcrypt = require('bcrypt');
const readline = require('readline');
require('dotenv').config();

const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어 설정
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleString()}] ${req.method} ${req.url}`);
    next();
});
app.use(cors());
app.use(bodyParser.json());

// 라우터 임포트
const authRoutes = require('./routes/auth');
const studyRoutes = require('./routes/study');
const adminRoutes = require('./routes/admin');

// API 라우트 등록 (정적 파일보다 먼저 등록하여 경로 겹침 방지)
app.use('/api/auth', authRoutes);
app.use('/api/study', studyRoutes);
app.use('/api/admin', adminRoutes);

// API 404 핸들러 (API 요청 실패 시 JSON 반환)
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'API 경로를 찾을 수 없습니다.' });
});

// 정적 파일 설정 (루트 디렉토리의 자산들)
app.use('/css', express.static(path.join(__dirname, '../css')));
app.use('/js', express.static(path.join(__dirname, '../js')));

// 메인 페이지 (index.html) 제공
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
});

// 초기 관리자 계정 체크 및 생성 로직
async function checkAdmin() {
    try {
        const users = await db.query("SELECT * FROM users WHERE role = 'admin'");
        if (users.length === 0) {
            console.log('--- 관리자 계정이 존재하지 않습니다. 초기 설정을 시작합니다. ---');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            const ask = (query) => new Promise((resolve) => rl.question(query, resolve));

            const username = await ask('관리자 아이디를 입력하세요: ');
            const password = await ask('관리자 비밀번호를 입력하세요: ');
            
            const hashedPassword = await bcrypt.hash(password, 10);
            
            await db.query(
                "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
                [username, hashedPassword, 'admin']
            );
            
            console.log('관리자 계정이 성공적으로 등록되었습니다.');
            rl.close();
        }
    } catch (err) {
        console.error('관리자 계정 확인 중 오류 발생:', err.message);
        console.log('데이터베이스 연결 및 테이블 생성 여부를 확인해주세요.');
    }
}

// 서버 시작
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Server is running on port ${PORT} (Available for remote access)`);
    await checkAdmin();
});
