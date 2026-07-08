const mariadb = require('mariadb');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// MariaDB 커넥션 풀 설정
// timezone: '+00:00': 커넥션의 시간대를 UTC로 설정
// dateStrings: true: DATETIME 컬럼을 JS Date 객체로 자동 변환하지 않고 문자열로 반환
//   → 드라이버가 로컬 타임존으로 잘못 해석하는 것을 원천 차단
//   → parseUTCDate()에서 'Z'를 붙여 명시적으로 UTC 파싱함
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    database: process.env.DB_NAME || 'study_db',
    connectionLimit: 5,
    timezone: '+00:00',
    dateStrings: true
};

if (process.env.DB_PASSWORD !== undefined && process.env.DB_PASSWORD !== '') {
    dbConfig.password = process.env.DB_PASSWORD;
}

const pool = mariadb.createPool(dbConfig);



module.exports = {
    // 쿼리 실행 헬퍼 함수
    query: async (sql, params) => {
        let conn;
        try {
            conn = await pool.getConnection();
            const res = await conn.query(sql, params);
            return res;
        } catch (err) {
            console.error('Database Query Error:', err);
            throw err;
        } finally {
            if (conn) conn.end();
        }
    }
};
