let timerInterval;
let startTime;

const timer = {
    display: document.getElementById('timer-display'),
    toggleBtn: document.getElementById('study-toggle-btn'),
    subjectSelect: document.getElementById('subject-select'),
    activeInfo: document.getElementById('active-session-info'),
    currentSubjectName: document.getElementById('current-subject-name'),

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
        this.toggleBtn.textContent = '공부 종료';
        this.toggleBtn.classList.replace('btn-start', 'btn-stop');
        this.subjectSelect.disabled = true;
        this.activeInfo.classList.remove('hidden');
        this.currentSubjectName.textContent = this.subjectSelect.options[this.subjectSelect.selectedIndex]?.text || '';

        clearInterval(timerInterval);
        timerInterval = setInterval(() => this.updateDisplay(), 1000);
        this.updateDisplay();
    },

    stop() {
        clearInterval(timerInterval);
        this.toggleBtn.textContent = '공부 시작';
        this.toggleBtn.classList.replace('btn-stop', 'btn-start');
        this.subjectSelect.disabled = false;
        this.activeInfo.classList.add('hidden');
        this.display.textContent = '00:00:00';
    },

    updateDisplay() {
        const now = new Date();
        const diff = Math.floor((now - startTime) / 1000);
        
        const hours = String(Math.floor(diff / 3600)).padStart(2, '0');
        const minutes = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
        const seconds = String(diff % 60).padStart(2, '0');
        
        this.display.textContent = `${hours}:${minutes}:${seconds}`;
    }
};

window.timer = timer;
