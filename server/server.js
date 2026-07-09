const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const db = require('./config/db');
const bcrypt = require('bcrypt');
const readline = require('readline');
require('dotenv').config();

const path = require('path');
const app = express();
const PORT = process.env.PORT || 3020;

// 미들웨어 설정
// 미들웨어 설정
app.use((req, res, next) => {
    console.log(`>>> [${new Date().toLocaleString()}] ${req.method} ${req.url} (Original: ${req.originalUrl})`);
    next();
});
app.use(cors());
app.use(bodyParser.json());

// 라우터 임포트
const authRoutes = require('./routes/auth');
const studyRoutes = require('./routes/study');
const adminRoutes = require('./routes/admin');

// API 라우트 등록 (정적 파일보다 먼저 등록하여 경로 겹침 방지)
// 프록시 환경에서 /summer/api/... 처럼 들어오는 경우 /api/... 로 경로 보정
app.use((req, res, next) => {
    if (req.url.includes('/api/')) {
        const apiIndex = req.url.indexOf('/api/');
        if (apiIndex > 0) {
            console.log(`[Path Fix] ${req.url} -> ${req.url.substring(apiIndex)}`);
            req.url = req.url.substring(apiIndex);
        }
    }
    next();
});

app.use('/api/auth', authRoutes);
app.use('/api/study', studyRoutes);
app.use('/api/admin', adminRoutes);

// API 404 핸들러 (API 요청 실패 시 JSON 반환)
app.get('/api/test', (req, res) => {
    console.log(`[API Test] Reachable!`);
    res.json({ status: 'ok', message: 'Server is reachable' });
});

app.use('/api', (req, res) => {
    console.log(`[API 404] ${req.method} ${req.url}`);
    res.status(404).json({ error: 'API 경로를 찾을 수 없습니다.' });
});

// 정적 파일 설정
// 1. 특정 폴더 우선 제공
app.use('/css', express.static(path.join(__dirname, '../css')));
app.use('/js', express.static(path.join(__dirname, '../js')));
app.use('/assets', express.static(path.join(__dirname, '../assets')));

// 2. 루트 디렉토리의 파일들 (sw.js, index.html 등) 제공
app.get('/sw.js', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, '../sw.js'));
});
app.use(express.static(path.join(__dirname, '../')));

// 메인 페이지 (index.html) 제공
app.get('/', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.sendFile(path.join(__dirname, '../index.html'));
});

// /index.html 요청에 대한 대응
app.get('/index.html', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
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

// DB 자동 마이그레이션 실행 함수 (원격 서버 자동 반영용)
async function runMigrations() {
    try {
        console.log('--- DB 자동 마이그레이션 검사 시작 ---');
        
        // 1. plans 테이블 생성
        await db.query(`
            CREATE TABLE IF NOT EXISTS plans (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                subject_id INT NOT NULL,
                title VARCHAR(255) NOT NULL,
                estimated_minutes INT NOT NULL,
                completed_seconds INT DEFAULT 0,
                status VARCHAR(20) DEFAULT 'todo',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('[Migration] plans 테이블 정상 존재 여부 검사 완료.');

        // 2. study_sessions 테이블에 plan_id 컬럼 추가 시도
        try {
            await db.query("ALTER TABLE study_sessions ADD COLUMN plan_id INT DEFAULT NULL");
            console.log('[Migration] study_sessions 테이블에 plan_id 컬럼이 성공적으로 추가되었습니다.');
        } catch (err) {
            // 컬럼이 이미 존재하는 경우(ER_DUP_FIELDNAME: 1060)는 정상적인 상태이므로 에러 처리 없이 넘어갑니다.
            if (err.code === 'ER_DUP_FIELDNAME' || err.errno === 1060) {
                console.log('[Migration] study_sessions 테이블에 plan_id 컬럼이 이미 존재합니다.');
            } else {
                throw err;
            }
        }
        console.log('--- DB 자동 마이그레이션 검사 완료 ---');
    } catch (err) {
        console.error('[Migration Error] 마이그레이션 실행 중 실패:', err.message);
    }
}

// 서버 시작
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Server is running on port ${PORT} (Available for remote access)`);
    await runMigrations(); // 서버 실행 시 마이그레이션 자동 검증 및 테이블/컬럼 보정
    await checkAdmin();
});
