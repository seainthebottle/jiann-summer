let timerInterval;
let startTime;

const timer = {
    display: document.getElementById('timer-display'),
    toggleBtn: document.getElementById('study-toggle-btn'),
    subjectSelect: document.getElementById('subject-select'),

    init() {
        this.toggleBtn.addEventListener('click', () => this.handleToggle());
    },

    async handleToggle() {
        if (this.toggleBtn.classList.contains('btn-start')) {
            // 시작
            const subjectId = this.subjectSelect.value;
            if (!subjectId) {
                alert('과목을 선택해주세요.');
                return;
            }
            try {
                await api.startSession(subjectId);
                if (window.appState) await window.appState.updateHomeSubjectTime();
                this.start(new Date());
            } catch (err) {
                alert(err.message);
            }
        } else {
            // 종료
            try {
                await api.stopSession();
                this.stop();
                // 종료 후 통계 업데이트를 위해 앱 상태 새로고침 유도 가능
                if (window.appState) window.appState.loadStats();
            } catch (err) {
                alert(err.message);
            }
        }
    },

    start(time, planId = null, subjectId = null) {
        startTime = new Date(time);
        this.activePlanId = planId;
        // 현재 공부 진행 중인 과목 ID를 저장합니다.
        this.activeSubjectId = subjectId || (this.subjectSelect ? this.subjectSelect.value : null);
        const subjectName = this.subjectSelect.options[this.subjectSelect.selectedIndex]?.text || '';
        
        if (this.activePlanId) {
            this.toggleBtn.textContent = `계획 공부 종료`;
        } else {
            this.toggleBtn.textContent = `${subjectName} 공부 종료`;
        }
        this.toggleBtn.classList.replace('btn-start', 'btn-stop');
        this.subjectSelect.disabled = true;

        clearInterval(timerInterval);
        timerInterval = setInterval(() => this.updateDisplay(), 1000);
        this.updateDisplay();
    },

    stop() {
        clearInterval(timerInterval);
        this.activePlanId = null;
        this.activeSubjectId = null;
        this.toggleBtn.classList.replace('btn-stop', 'btn-start');
        this.subjectSelect.disabled = false;
        this.display.textContent = '00:00:00';
        if (window.appState) {
            window.appState.updateHomeSubjectTime();
            window.appState.updateStudyButtonState();
        }
    },

    isRunning() {
        return this.toggleBtn.classList.contains('btn-stop');
    },

    getCurrentDiff() {
        if (!startTime) return 0;
        const now = new Date();
        return Math.floor((now - startTime) / 1000);
    },

    // 초를 분:초 형식으로 포맷팅 (계획용 헬퍼)
    formatMinutesSeconds(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}분 ${s}초`;
    },

    updateDisplay() {
        const diff = this.getCurrentDiff();
        
        const hours = String(Math.floor(diff / 3600)).padStart(2, '0');
        const minutes = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
        const seconds = String(diff % 60).padStart(2, '0');
        
        this.display.textContent = `${hours}:${minutes}:${seconds}`;

        // 3. 실시간으로 현재 진행 중인 계획 카드 갱신
        if (this.activePlanId) {
            const card = document.getElementById(`plan-card-${this.activePlanId}`);
            if (card) {
                const baseCompleted = parseInt(card.dataset.completedSeconds) || 0;
                const estimated = (parseInt(card.dataset.estimatedMinutes) || 0) * 60;
                const totalCompleted = baseCompleted + diff;

                // 시간 텍스트 업데이트
                const timeText = card.querySelector('.time-current');
                if (timeText) {
                    timeText.textContent = this.formatMinutesSeconds(totalCompleted);
                }

                // 남은 시간 혹은 초과 시간을 실시간으로 연산하여 엘리먼트 텍스트 및 스타일 클래스를 갱신합니다.
                const remainingWrapper = card.querySelector('.time-remaining-wrapper');
                if (remainingWrapper) {
                    if (totalCompleted < estimated) {
                        const diffSec = estimated - totalCompleted;
                        remainingWrapper.innerHTML = `남은 시간: <span class="time-remaining">${this.formatMinutesSeconds(diffSec)}</span>`;
                        remainingWrapper.className = 'time-remaining-wrapper status-remaining';
                    } else {
                        const diffSec = totalCompleted - estimated;
                        remainingWrapper.innerHTML = `<span class="time-remaining">${this.formatMinutesSeconds(diffSec)} 초과</span>`;
                        remainingWrapper.className = 'time-remaining-wrapper status-over';
                    }
                }

                // 진행률 바 갱신 (남은 시간 및 초과 시간 위주의 실시간 수식 적용)
                let progressPercent = 0;
                let progressBarColor = '#339af0';

                // 과목 고유 배지의 배경색으로부터 과목 색상을 추출해 기본 바 색상으로 지정합니다.
                const subjectBadge = card.querySelector('.plan-subject-badge');
                if (subjectBadge) {
                    progressBarColor = subjectBadge.style.backgroundColor;
                }

                if (totalCompleted < estimated) {
                    // 목표 달성 전: 남은 공부 시간 비율 (공부할수록 100%에서 0%로 감소)
                    progressPercent = estimated > 0 ? ((estimated - totalCompleted) / estimated) * 100 : 0;
                } else {
                    // 목표 달성 후 (초과): 초과한 공부 시간 비율 (0%에서 100%로 다시 증가, 최대 100% 캡)
                    progressPercent = estimated > 0 ? Math.min(((totalCompleted - estimated) / estimated) * 100, 100) : 100;
                    progressBarColor = 'var(--danger-color)'; // 초과되었을 때 빨간색 경고 컬러 적용
                }

                const progressBar = card.querySelector('.plan-progress-bar');
                if (progressBar) {
                    progressBar.style.width = `${progressPercent}%`;
                    progressBar.style.backgroundColor = progressBarColor;
                }
            }
        }

        if (!window.appState) return;

        // 1. 오늘 총 공부 시간 실시간 업데이트
        if (this.initialTodayTotalTime !== undefined) {
            const total = this.initialTodayTotalTime + diff;
            const todayDisplay = document.getElementById('today-total-time');
            if (todayDisplay) {
                todayDisplay.textContent = window.appState.formatSeconds(total);
            }
        }

        // 2. 오늘 과목 공부 시간 실시간 업데이트
        // 선택된 과목과 현재 공부 중인 과목이 일치할 때만 실시간 diff 가산 적용
        if (this.initialSubjectTodayTime !== undefined) {
            const currentSelectedSubjectId = this.subjectSelect ? this.subjectSelect.value : null;
            const isMatchingSubject = this.isRunning() && String(currentSelectedSubjectId) === String(this.activeSubjectId);
            const total = this.initialSubjectTodayTime + (isMatchingSubject ? diff : 0);
            const subjectTodayDisplay = document.getElementById('today-subject-time');
            if (subjectTodayDisplay) {
                subjectTodayDisplay.textContent = window.appState.formatSeconds(total);
            }
        }
    }
};

window.timer = timer;

