let timerInterval;
let startTime;

const timer = {
    display: document.getElementById('timer-display'),
    toggleBtn: document.getElementById('study-toggle-btn'),
    pauseBtn: document.getElementById('study-pause-btn'),
    subjectSelect: document.getElementById('subject-select'),
    state: 'idle',
    accumulatedSeconds: 0,

    init() {
        this.toggleBtn.addEventListener('click', () => this.handleToggle());
        this.pauseBtn.addEventListener('click', () => this.handlePauseToggle());
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
                const result = await api.startSession(subjectId);
                this.start(result.segment_start_time, null, subjectId, '', result.accumulated_seconds || 0);
                if (window.appState) await window.appState.updateHomeSubjectTime();
            } catch (err) {
                alert(err.message);
            }
        } else {
            // 종료
            try {
                await api.stopSession();
                this.stop();
                // 종료 후 통계 및 계획 카드(버튼/상태 표시)를 최신 상태로 새로고침합니다.
                if (window.appState) {
                    window.appState.loadStats();
                    window.appState.loadPlans();
                }
            } catch (err) {
                alert(err.message);
            }
        }
    },

    async handlePauseToggle() {
        this.pauseBtn.disabled = true;
        try {
            if (this.state === 'running') {
                const result = await api.pauseSession();
                this.pause(result.accumulated_seconds || 0);
            } else if (this.state === 'paused') {
                const result = await api.resumeSession();
                this.resume(result.segment_start_time, result.accumulated_seconds || 0);
            }
            if (window.appState) {
                await window.appState.updateHomeSubjectTime();
                await window.appState.loadPlans();
                if (window.appState.currentPage === 'stats') await window.appState.loadStats();
            }
        } catch (err) {
            alert(err.message);
        } finally {
            this.pauseBtn.disabled = false;
        }
    },

    start(time, planId = null, subjectId = null, planTitle = '', accumulatedSeconds = 0) {
        startTime = new Date(time);
        this.accumulatedSeconds = Number(accumulatedSeconds) || 0;
        this.state = 'running';
        this.activePlanId = planId;
        
        // 전달된 subjectId가 있으면 셀렉트 박스 선택값을 업데이트합니다.
        if (subjectId && this.subjectSelect) {
            this.subjectSelect.value = subjectId;
        }
        // 현재 공부 진행 중인 과목 ID를 저장합니다.
        this.activeSubjectId = subjectId || (this.subjectSelect ? this.subjectSelect.value : null);
        const subjectName = (this.subjectSelect && this.subjectSelect.options[this.subjectSelect.selectedIndex]) 
            ? this.subjectSelect.options[this.subjectSelect.selectedIndex].text 
            : '';

        if (this.activePlanId) {
            // 계획 공부 실행 중일 때는 `'계획명' 중지` 형식으로 버튼 텍스트를 설정합니다.
            const displayPlanTitle = planTitle || subjectName;
            this.toggleBtn.textContent = `'${displayPlanTitle}' 중지`;
        } else {
            // 일반 과목 공부 실행 중일 때는 `${subjectName} 종료` 형식으로 설정합니다.
            this.toggleBtn.textContent = `${subjectName} 종료`;
        }
        // 버튼이 활성화되어 중지 동작이 가능하도록 disabled 상태를 해제합니다.
        this.toggleBtn.disabled = false;
        this.toggleBtn.classList.replace('btn-start', 'btn-stop');
        this.pauseBtn.classList.remove('hidden', 'is-resume');
        this.pauseBtn.textContent = '일시 정지';
        this.subjectSelect.disabled = true;

        clearInterval(timerInterval);
        timerInterval = setInterval(() => this.updateDisplay(), 1000);
        this.updateDisplay();
    },

    pause(accumulatedSeconds) {
        clearInterval(timerInterval);
        this.accumulatedSeconds = Number(accumulatedSeconds) || 0;
        startTime = null;
        this.state = 'paused';
        this.pauseBtn.classList.add('is-resume');
        this.pauseBtn.textContent = '재개';
        this.updateDisplay();
    },

    resume(time, accumulatedSeconds) {
        startTime = new Date(time);
        this.accumulatedSeconds = Number(accumulatedSeconds) || 0;
        this.state = 'running';
        this.pauseBtn.classList.remove('is-resume');
        this.pauseBtn.textContent = '일시 정지';
        clearInterval(timerInterval);
        timerInterval = setInterval(() => this.updateDisplay(), 1000);
        this.updateDisplay();
    },

    restorePaused(planId = null, subjectId = null, planTitle = '', accumulatedSeconds = 0) {
        this.start(new Date(), planId, subjectId, planTitle, accumulatedSeconds);
        this.pause(accumulatedSeconds);
    },

    stop() {
        clearInterval(timerInterval);
        this.activePlanId = null;
        this.activeSubjectId = null;
        this.accumulatedSeconds = 0;
        this.state = 'idle';
        startTime = null;
        this.toggleBtn.classList.replace('btn-stop', 'btn-start');
        this.pauseBtn.classList.add('hidden');
        this.pauseBtn.classList.remove('is-resume');
        this.subjectSelect.disabled = false;
        this.display.textContent = '00:00:00';
        if (window.appState) {
            window.appState.updateHomeSubjectTime();
            window.appState.updateStudyButtonState();
        }
    },

    isRunning() {
        return this.state === 'running';
    },

    isActive() {
        return this.state === 'running' || this.state === 'paused';
    },

    isPaused() {
        return this.state === 'paused';
    },

    getCurrentDiff() {
        if (!startTime) return 0;
        const now = new Date();
        return Math.floor((now - startTime) / 1000);
    },

    getElapsedSeconds() {
        return this.accumulatedSeconds + (this.isRunning() ? this.getCurrentDiff() : 0);
    },

    // 초를 분:초 형식으로 포맷팅 (계획용 헬퍼)
    formatMinutesSeconds(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}분 ${s}초`;
    },

    updateDisplay() {
        const diff = this.getCurrentDiff();
        const elapsed = this.getElapsedSeconds();
        
        const hours = String(Math.floor(elapsed / 3600)).padStart(2, '0');
        const minutes = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
        const seconds = String(elapsed % 60).padStart(2, '0');
        
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
