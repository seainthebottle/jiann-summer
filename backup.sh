#!/bin/bash
# jiann-summer 백업 스크립트
# 사용법: ./backup.sh [백업 저장 경로]  (기본값: 프로젝트 상위/backup)
# 실행 위치: 프로젝트 디렉토리 외부 어디서든 가능

set -euo pipefail

# ─────────────────── 설정 ───────────────────
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"           # 이 스크립트가 있는 프로젝트 루트
BACKUP_ROOT="${1:-$(dirname "$PROJECT_DIR")/backup}"   # 인자로 경로 지정 가능

# .env 파일에서 DB 접속 정보 파싱
ENV_FILE="$PROJECT_DIR/server/.env"
if [[ ! -f "$ENV_FILE" ]]; then
    echo "[ERROR] .env 파일을 찾을 수 없습니다: $ENV_FILE" >&2
    exit 1
fi

DB_HOST=$(grep '^DB_HOST=' "$ENV_FILE" | cut -d= -f2- | tr -d '"'"'" | tr -d '[:space:]')
DB_USER=$(grep '^DB_USER=' "$ENV_FILE" | cut -d= -f2- | tr -d '"'"'" | tr -d '[:space:]')
DB_PASSWORD=$(grep '^DB_PASSWORD=' "$ENV_FILE" | cut -d= -f2- | tr -d '"'"'")
DB_NAME=$(grep '^DB_NAME=' "$ENV_FILE" | cut -d= -f2- | tr -d '"'"'" | tr -d '[:space:]')

# ─────────────────── 경로 준비 ───────────────────
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
BACKUP_DIR="$BACKUP_ROOT/summer-${TIMESTAMP}"

mkdir -p "$BACKUP_DIR"
echo "[INFO] 백업 경로: $BACKUP_DIR"

# ─────────────────── 1. DB 덤프 ───────────────────
echo "[INFO] DB 덤프 시작: $DB_NAME"
DB_DUMP="$BACKUP_DIR/summer-${TIMESTAMP}.sql"

if [[ -n "$DB_PASSWORD" ]]; then
    mysqldump -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" \
        --single-transaction --routines --triggers \
        "$DB_NAME" > "$DB_DUMP"
else
    mysqldump -h "$DB_HOST" -u "$DB_USER" \
        --single-transaction --routines --triggers \
        "$DB_NAME" > "$DB_DUMP"
fi
echo "[INFO] DB 덤프 완료: $(du -sh "$DB_DUMP" | cut -f1)"

# ─────────────────── 2. 프로젝트 파일 아카이브 ───────────────────
echo "[INFO] 프로젝트 파일 압축 시작"
PROJECT_ARCHIVE="$BACKUP_DIR/summer-${TIMESTAMP}.tar.gz"

# node_modules, .git, backup 디렉토리 제외
tar -czf "$PROJECT_ARCHIVE" \
    --exclude='*/node_modules' \
    --exclude='*/.git' \
    --exclude="$(basename "$PROJECT_DIR")/backup" \
    -C "$(dirname "$PROJECT_DIR")" \
    "$(basename "$PROJECT_DIR")"

echo "[INFO] 프로젝트 압축 완료: $(du -sh "$PROJECT_ARCHIVE" | cut -f1)"

# ─────────────────── 3. 완료 요약 ───────────────────
echo ""
echo "=========================================="
echo " Backup complete"
echo "=========================================="
echo " Location : $BACKUP_DIR"
echo " DB dump  : $(basename "$DB_DUMP")"
echo " Archive  : $(basename "$PROJECT_ARCHIVE")"
echo " Total    : $(du -sh "$BACKUP_DIR" | cut -f1)"
echo "=========================================="
