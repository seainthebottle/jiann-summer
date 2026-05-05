const appState = {
    user: null,
    currentPage: 'auth',

    async init() {
        this.bindEvents();
        this.initTheme();

        // 자동 로그인 확인
        if (api.getToken()) {
            try {
                this.user = await api.verify();
                this.onLoginSuccess();
            } catch (err) {
                api.removeToken();
                this.showPage('auth');
            }
        } else {
            this.showPage('auth');
        }
    },

    bindEvents() {
        // 로그인 폼
        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = e.target.username.value;
            const password = e.target.password.value;
            try {
                this.user = await api.login(username, password);
                this.onLoginSuccess();
            } catch (err) {
                alert(`Failed to login for ${username} : ${err.message}`);
            }
        });

        // 네비게이션
        document.querySelectorAll('nav a[data-page]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.showPage(e.currentTarget.dataset.page);
            });
        });

        // 로그아웃
        document.getElementById('logout-btn').addEventListener('click', () => {
            if (confirm('정말 로그아웃 하시겠습니까?')) {
                api.removeToken();
                this.user = null;
                location.reload();
            }
        });



        // 테마 토글
        document.getElementById('theme-toggle').addEventListener('click', () => this.toggleTheme());

        // 과목 추가 (관리자)
        document.getElementById('add-subject-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('new-subject-name').value;
            const color = document.getElementById('new-subject-color').value;
            try {
                await api.adminAddSubject(name, color);
                document.getElementById('new-subject-name').value = '';
                this.loadAdminData();
                this.loadSubjects(); // 일반 대시보드 과목 목록도 갱신
            } catch (err) {
                alert(err.message);
            }
        });

        // 사용자 추가 (관리자)
        document.getElementById('add-user-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('new-username').value;
            const password = document.getElementById('new-password').value;
            const role = document.getElementById('new-role').value;
            try {
                await api.adminAddUser(username, password, role);
                document.getElementById('new-username').value = '';
                document.getElementById('new-password').value = '';
                document.getElementById('new-role').value = 'user';
                this.loadAdminData();
            } catch (err) {
                alert(err.message);
            }
        });

        // 통계 페이지 사용자 선택 (관리자 전용)
        const userSelect = document.getElementById('admin-user-select');
        if (userSelect) {
            userSelect.addEventListener('change', () => {
                localStorage.setItem('saved_stats_user_id', userSelect.value);
                this.loadStats();
            });
        }

        // 통계 페이지 날짜 및 과목 필터
        const dateSelect = document.getElementById('stats-date-select');
        const subjectSelect = document.getElementById('stats-subject-select');
        
        const saveDateAndLoad = () => {
            localStorage.setItem('saved_stats_date', dateSelect.value);
            this.loadStats();
        };

        dateSelect.addEventListener('change', saveDateAndLoad);
        dateSelect.addEventListener('input', saveDateAndLoad);
        subjectSelect.addEventListener('change', () => {
            localStorage.setItem('saved_stats_subject_id', subjectSelect.value);
            this.loadStats();
        });

        // 홈 화면 과목 선택 기억
        const homeSubjectSelect = document.getElementById('subject-select');
        homeSubjectSelect.addEventListener('change', () => {
            localStorage.setItem('saved_home_subject_id', homeSubjectSelect.value);
            this.updateHomeSubjectTime();
            this.updateStudyButtonState();
        });
    },

    onLoginSuccess() {
        document.getElementById('navbar').classList.remove('hidden');
        if (this.user.role === 'admin') {
            document.getElementById('admin-link').classList.remove('hidden');
        }
        
        // 마지막으로 보던 페이지로 복원 (기본값은 대시보드, auth 페이지인 경우 대시보드로)
        let targetPage = localStorage.getItem('saved_current_page') || 'dashboard';
        if (targetPage === 'auth') targetPage = 'dashboard';
        
        this.showPage(targetPage);
        this.loadSubjects();
        this.checkActiveSession();
        
        // 통계 기준일 기본값을 오늘로 설정 (또는 저장된 값 복원)
        const savedDate = localStorage.getItem('saved_stats_date');
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('stats-date-select').value = savedDate || today;
        
        window.timer.init();
    },

    showPage(pageId) {
        this.currentPage = pageId;
        localStorage.setItem('saved_current_page', pageId);
        
        // 모든 섹션 숨기기
        document.querySelectorAll('main > section').forEach(sec => sec.classList.add('hidden'));
        // 대상 섹션 보이기
        document.getElementById(`${pageId}-page`).classList.remove('hidden');

        // 페이지별 데이터 로드
        if (pageId === 'stats') {
            if (this.user.role === 'admin') {
                document.getElementById('admin-user-select-container').classList.remove('hidden');
                this.loadAdminUserSelect();
            } else {
                document.getElementById('admin-user-select-container').classList.add('hidden');
                this.loadStats();
            }
        }
        if (pageId === 'admin') this.loadAdminData();
    },

    async loadSubjects() {
        const subjects = await api.getSubjects();
        const select = document.getElementById('subject-select');
        const statsSelect = document.getElementById('stats-subject-select');
        
        select.innerHTML = '<option value="">과목을 선택하세요</option>';
        statsSelect.innerHTML = '<option value="">모든 과목</option>';
        
        subjects.forEach(sub => {
            const opt = document.createElement('option');
            opt.value = sub.id;
            opt.textContent = sub.name;
            select.appendChild(opt);
            
            const statsOpt = document.createElement('option');
            statsOpt.value = sub.id;
            statsOpt.textContent = sub.name;
            statsSelect.appendChild(statsOpt);
        });
        
        // 이전에 선택했던 통계 과목 복원
        const savedStatsSubjectId = localStorage.getItem('saved_stats_subject_id');
        if (savedStatsSubjectId) {
            statsSelect.value = savedStatsSubjectId;
        }

        // 홈 화면 과목 선택 복원
        const savedHomeSubjectId = localStorage.getItem('saved_home_subject_id');
        if (savedHomeSubjectId) {
            select.value = savedHomeSubjectId;
        }
        
        this.updateHomeSubjectTime();
        this.updateStudyButtonState();
    },

    async checkActiveSession() {
        const { active } = await api.getStatus();
        if (active) {
            // 셀렉트 박스에서 해당 과목 선택 상태로 변경
            document.getElementById('subject-select').value = active.subject_id;
            await this.updateHomeSubjectTime(); // 비동기 대기 추가
            window.timer.start(active.start_time);
        } else {
            await this.updateHomeSubjectTime();
        }
    },

    async loadStats() {
        // 관리자가 명시적으로 사용자를 선택하지 않았을 경우, 현재 드롭다운의 값을 사용하거나 기본값(본인) 사용
        const userId = this.user.role === 'admin' ? document.getElementById('admin-user-select').value : null;
        const date = document.getElementById('stats-date-select').value;
        const subjectId = document.getElementById('stats-subject-select').value;
        
        const stats = await api.getStats(userId, date, subjectId);

        // 시간 포맷 헬퍼 (초 -> 시분초)
        const format = (sec) => {
            const h = Math.floor(sec / 3600);
            const m = Math.floor((sec % 3600) / 60);
            return `${h}시간 ${m}분`;
        };

        document.getElementById('stat-daily').textContent = format(stats.dailyTotal);
        document.getElementById('stat-weekly').textContent = format(stats.weeklyTotal);
        document.getElementById('stat-monthly').textContent = format(stats.monthlyTotal);
        document.getElementById('stat-weekly-avg').textContent = format(stats.weeklyAvg);
        document.getElementById('stat-monthly-avg').textContent = format(stats.monthlyAvg);

        window.charts.renderDailyPie(stats.sessions, date);
    },

    async loadAdminUserSelect() {
        const users = await api.adminGetUsers();
        const select = document.getElementById('admin-user-select');
        const currentValue = select.value;
        
        select.innerHTML = '';
        users.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = `${u.username} (${u.role})`;
            if (u.id === this.user.id) {
                opt.textContent += ' (나)';
            }
            select.appendChild(opt);
        });

        // 이전에 선택된 값이 있었다면 유지, 없으면 localStorage 확인, 그것도 없으면 현재 로그인한 관리자 본인 선택
        const savedUserId = localStorage.getItem('saved_stats_user_id');
        if (currentValue && Array.from(select.options).some(opt => opt.value === currentValue)) {
            select.value = currentValue;
        } else if (savedUserId && Array.from(select.options).some(opt => opt.value === savedUserId)) {
            select.value = savedUserId;
        } else {
            select.value = this.user.id;
        }
        
        this.loadStats(select.value);
    },

    async loadAdminData() {
        const users = await api.adminGetUsers();
        const userList = document.getElementById('admin-user-list');
        userList.innerHTML = '';
        users.forEach(u => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span>${u.username} (${u.role})</span>
                ${u.id !== this.user.id ? `<button class="delete-btn" onclick="appState.deleteUser(${u.id})">삭제</button>` : ''}
            `;
            userList.appendChild(li);
        });

        const subjects = await api.getSubjects();
        const subList = document.getElementById('admin-subject-list');
        subList.innerHTML = '';
        subjects.forEach(s => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div style="display: flex; gap: 10px; align-items: center; width: 100%;">
                    <input type="color" id="subj-color-${s.id}" value="${s.color || '#339af0'}" style="padding: 0; width: 30px; height: 30px;">
                    <input type="text" id="subj-name-${s.id}" value="${s.name}" style="flex: 1; padding: 5px; margin-bottom: 0;">
                    <button class="btn-small" onclick="appState.updateSubject(${s.id})" style="padding: 5px 10px;">수정</button>
                    <button class="delete-btn" onclick="appState.deleteSubject(${s.id})" style="padding: 5px 10px;">삭제</button>
                </div>
            `;
            subList.appendChild(li);
        });
    },

    async updateSubject(id) {
        const name = document.getElementById(`subj-name-${id}`).value;
        const color = document.getElementById(`subj-color-${id}`).value;
        if (!name) return alert('과목 이름을 입력하세요.');
        try {
            await api.adminUpdateSubject(id, name, color);
            alert('과목이 수정되었습니다.');
            this.loadAdminData();
            this.loadSubjects();
        } catch (err) {
            alert(err.message);
        }
    },

    async deleteUser(id) {
        if (!confirm('정말 삭제하시겠습니까?')) return;
        try {
            await api.adminDeleteUser(id);
            this.loadAdminData();
        } catch (err) {
            alert(err.message);
        }
    },

    async deleteSubject(id) {
        if (!confirm('정말 삭제하시겠습니까?')) return;
        try {
            await api.adminDeleteSubject(id);
            this.loadAdminData();
            this.loadSubjects();
        } catch (err) {
            alert(err.message);
        }
    },

    formatSeconds(sec) {
        const totalSeconds = Math.floor(sec);
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        return `${h}시간 ${m}분 ${s}초`;
    },

    async updateHomeSubjectTime() {
        const subjectSelect = document.getElementById('subject-select');
        const subjectId = subjectSelect.value;
        const todayDisplay = document.getElementById('today-total-time');
        const subjectTodayDisplay = document.getElementById('today-subject-time');
        const subjectCard = document.getElementById('today-subject-card');
        const subjectLabel = document.getElementById('today-subject-label');
        
        try {
            // 1. 오늘 총 공부 시간 로드
            const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
            const totalStats = await api.getStats(null, today, null);
            // Number()를 사용하여 문자열 결합 방지
            const totalTime = Number(totalStats.dailyTotal) || 0;
            todayDisplay.textContent = this.formatSeconds(totalTime);
            if (window.timer) window.timer.initialTodayTotalTime = totalTime;

            if (!subjectId) {
                subjectCard.classList.add('hidden');
                if (window.timer) window.timer.initialSubjectTodayTime = 0;
                return;
            }

            // 2. 해당 과목의 오늘 공부 시간 로드
            const subjectStats = await api.getStats(null, today, subjectId);
            const subjectTime = Number(subjectStats.dailyTotal) || 0;
            
            const subjectName = subjectSelect.options[subjectSelect.selectedIndex].text;
            subjectLabel.textContent = `오늘 ${subjectName} 공부`;
            subjectTodayDisplay.textContent = this.formatSeconds(subjectTime);
            subjectCard.classList.remove('hidden');
            
            // 타이머에서도 사용할 수 있도록 저장
            if (window.timer) window.timer.initialSubjectTodayTime = subjectTime;
        } catch (err) {
            console.error('시간 로드 실패:', err);
        }
    },



    updateStudyButtonState() {
        const select = document.getElementById('subject-select');
        const btn = document.getElementById('study-toggle-btn');
        
        // 공부 중일 때는 상태를 변경하지 않음 (timer.js에서 관리)
        if (btn.classList.contains('btn-stop')) return;

        const subjectId = select.value;
        const subjectName = select.options[select.selectedIndex]?.text || '';

        if (subjectId) {
            btn.disabled = false;
            btn.textContent = `${subjectName} 공부 시작`;
        } else {
            btn.disabled = true;
            btn.textContent = '과목을 선택하세요';
        }
    },

    initTheme() {
        const theme = localStorage.getItem('theme') || 'light';
        document.body.className = `${theme}-theme`;
    },

    toggleTheme() {
        const current = document.body.classList.contains('light-theme') ? 'light' : 'dark';
        const next = current === 'light' ? 'dark' : 'light';
        document.body.className = `${next}-theme`;
        localStorage.setItem('theme', next);
    }
};

window.appState = appState;
appState.init();


