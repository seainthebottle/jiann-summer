const mariadb = require('mariadb');
require('dotenv').config();

// MariaDB 커넥션 풀 설정
const pool = mariadb.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'study_db',
    connectionLimit: 5
});

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
