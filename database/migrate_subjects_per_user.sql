-- 과목 테이블을 전체 공유 → 사용자별 전용으로 마이그레이션
-- 실행: mysql -u root -p study_db < database/migrate_subjects_per_user.sql

USE study_db;

-- 1. 기존 과목 및 세션 사용 쌍 백업
CREATE TEMPORARY TABLE tmp_orig AS
    SELECT id, name, color FROM subjects;

CREATE TEMPORARY TABLE tmp_pairs AS
    SELECT DISTINCT user_id, subject_id FROM study_sessions;

-- 2. user_id 컬럼 추가
ALTER TABLE subjects ADD COLUMN user_id INT NULL AFTER id;

-- 2-b. 기존 name 단독 UNIQUE 인덱스 제거 (INSERT 전에 해야 중복 오류 방지)
ALTER TABLE subjects DROP INDEX name;

-- 3. 사용자별 과목 복사본 삽입
--    (세션에서 실제 사용된 (user_id, subject_id) 쌍에 대해 각 사용자의 전용 과목 행 생성)
INSERT INTO subjects (user_id, name, color)
    SELECT p.user_id, o.name, o.color
    FROM tmp_pairs p
    JOIN tmp_orig o ON o.id = p.subject_id;

-- 4. 기존 세션의 subject_id를 새로 생성된 사용자별 과목 ID로 업데이트
UPDATE study_sessions ss
JOIN tmp_pairs p ON ss.user_id = p.user_id AND ss.subject_id = p.subject_id
JOIN tmp_orig o ON o.id = p.subject_id
JOIN subjects ns ON ns.user_id = p.user_id AND ns.name = o.name
SET ss.subject_id = ns.id;

-- 5. 세션에서 한 번도 사용되지 않은 기존 과목은 첫 번째 관리자 계정에 할당
INSERT INTO subjects (user_id, name, color)
    SELECT (SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1), o.name, o.color
    FROM tmp_orig o
    WHERE o.id NOT IN (SELECT DISTINCT subject_id FROM tmp_pairs);

-- 6. 원본(공유) 과목 행 삭제 (user_id = NULL인 것들)
DELETE FROM subjects WHERE user_id IS NULL;

-- 7. user_id를 NOT NULL로 변경
ALTER TABLE subjects MODIFY COLUMN user_id INT NOT NULL;

-- 8. (user_id, name) 복합 UNIQUE 인덱스 추가 (DROP은 2-b에서 이미 처리)
ALTER TABLE subjects ADD UNIQUE KEY uq_user_subject (user_id, name);

-- 9. 임시 테이블 정리
DROP TEMPORARY TABLE IF EXISTS tmp_orig;
DROP TEMPORARY TABLE IF EXISTS tmp_pairs;

SELECT 'Migration complete: subjects are now per-user.' AS result;
