const db = require('./config/db');

async function run() {
    try {
        console.log('Starting DB migration for Plans feature...');


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
        console.log('Table "plans" created or already exists.');

        // 2. study_sessions 테이블에 plan_id 컬럼 추가
        try {
            await db.query("ALTER TABLE study_sessions ADD COLUMN plan_id INT DEFAULT NULL");
            console.log('Column "plan_id" added to "study_sessions".');
        } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log('Column "plan_id" already exists in "study_sessions".');
            } else {
                throw err;
            }
        }

        console.log('DB migration completed successfully.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        process.exit();
    }
}

run();
