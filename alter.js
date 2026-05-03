const db = require('./server/config/db');

async function run() {
    try {
        await db.query("ALTER TABLE subjects ADD COLUMN color VARCHAR(7) DEFAULT '#339af0'");
        console.log('Column added successfully.');
    } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
            console.log('Column already exists.');
        } else {
            console.error(err);
        }
    } finally {
        process.exit();
    }
}

run();
