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

    start(time) {
        startTime = new Date(time);
        const subjectName = this.subjectSelect.options[this.subjectSelect.selectedIndex]?.text || '';
        this.toggleBtn.textContent = `${subjectName} 공부 종료`;
        this.toggleBtn.classList.replace('btn-start', 'btn-stop');
        this.subjectSelect.disabled = true;

        clearInterval(timerInterval);
        timerInterval = setInterval(() => this.updateDisplay(), 1000);
        this.updateDisplay();
    },

    stop() {
        clearInterval(timerInterval);
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

    updateDisplay() {
        const diff = this.getCurrentDiff();
        
        const hours = String(Math.floor(diff / 3600)).padStart(2, '0');
        const minutes = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
        const seconds = String(diff % 60).padStart(2, '0');
        
        this.display.textContent = `${hours}:${minutes}:${seconds}`;

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
        if (this.initialSubjectTodayTime !== undefined) {
            const total = this.initialSubjectTodayTime + diff;
            const subjectTodayDisplay = document.getElementById('today-subject-time');
            if (subjectTodayDisplay) {
                subjectTodayDisplay.textContent = window.appState.formatSeconds(total);
            }
        }
    }
};

window.timer = timer;
