const appState = {
    user: null,
    currentPage: 'auth',
    version: 'v4',

    async init() {
        console.log(`App Initialized - Version: ${this.version}`);
        this.bindEvents();
        this.initTheme();
        this.registerServiceWorker();

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
            // 사용자가 직접 날짜를 변경한 시간을 기록 (5분 유지 로직용)
            localStorage.setItem('last_stats_date_change', Date.now());
            this.loadStats();
        };

        dateSelect.addEventListener('change', saveDateAndLoad);
        dateSelect.addEventListener('input', saveDateAndLoad);
        subjectSelect.addEventListener('change', () => {
            localStorage.setItem('saved_stats_subject_id', subjectSelect.value);
            this.loadStats();
        });

        // 통계 페이지 날짜 네비게이션 버튼
        document.getElementById('stats-prev-date').addEventListener('click', () => this.changeStatsDate(-1));
        document.getElementById('stats-next-date').addEventListener('click', () => this.changeStatsDate(1));

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
        
        window.timer.init();
    },

    getTodayDate() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    },

    updateStatsDateIfExpired() {
        const lastChange = localStorage.getItem('last_stats_date_change');
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;
        const dateInput = document.getElementById('stats-date-select');
        const today = this.getTodayDate();

        if (!lastChange || (now - parseInt(lastChange) > fiveMinutes)) {
            // 5분이 지났거나 변경 기록이 없으면 오늘로 설정
            if (dateInput) {
                dateInput.value = today;
                localStorage.setItem('saved_stats_date', today);
            }
        } else {
            // 5분 이내라면 저장된 값 유지
            const savedDate = localStorage.getItem('saved_stats_date');
            if (dateInput && savedDate) {
                dateInput.value = savedDate;
            } else if (dateInput) {
                dateInput.value = today;
            }
        }
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
            // 통계 페이지로 전환될 때 날짜 로직 적용
            this.updateStatsDateIfExpired();

            if (this.user.role === 'admin') {
                document.getElementById('admin-user-select-container').classList.remove('hidden');
                this.loadAdminUserSelect();
            } else {
                document.getElementById('admin-user-select-container').classList.add('hidden');
                this.loadStats();
            }
            this.startStatsUpdateTimer();
        } else {
            this.stopStatsUpdateTimer();
        }
        if (pageId === 'admin') this.loadAdminData();
    },

    statsUpdateTimer: null,

    startStatsUpdateTimer() {
        this.stopStatsUpdateTimer();
        
        const now = new Date();
        // 다음 0초까지의 지연 시간 계산 (ms)
        const delay = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
        
        this.statsUpdateTimer = setTimeout(() => {
            if (this.currentPage === 'stats') {
                this.loadStats();
                this.startStatsUpdateTimer(); // 다음 1분 뒤 재실행
            }
        }, delay);
    },

    stopStatsUpdateTimer() {
        if (this.statsUpdateTimer) {
            clearTimeout(this.statsUpdateTimer);
            this.statsUpdateTimer = null;
        }
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
        const localDate = document.getElementById('stats-date-select').value;
        const subjectId = document.getElementById('stats-subject-select').value;
        
        // 로컬 날짜의 시작과 끝을 ISO(UTC) 문자열로 변환
        const startDate = new Date(`${localDate}T00:00:00`).toISOString();
        const endDate = new Date(`${localDate}T23:59:59.999`).toISOString();
        
        const stats = await api.getStats(userId, startDate, endDate, subjectId);

        
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

        window.charts.renderDailyPie(stats.sessions, localDate);

        // 과목별 범례 생성
        this.renderSubjectLegend(stats.sessions);

        // 날짜 네비게이션 버튼 상태 업데이트
        this.updateDateNavButtons();
    },

    changeStatsDate(days) {
        const dateInput = document.getElementById('stats-date-select');
        if (!dateInput.value) return;

        const currentDate = new Date(dateInput.value);
        currentDate.setDate(currentDate.getDate() + days);
        
        const todayStr = this.getTodayDate();
        const today = new Date(todayStr);
        
        // 미래 날짜 방지
        if (currentDate > today) return;
        
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getDate()).padStart(2, '0');
        const newDateStr = `${year}-${month}-${day}`;
        
        dateInput.value = newDateStr;
        
        // 저장 및 로드 로직 실행 (bindEvents의 change 핸들러와 동일한 동작)
        localStorage.setItem('saved_stats_date', newDateStr);
        localStorage.setItem('last_stats_date_change', Date.now());
        this.loadStats();
    },

    updateDateNavButtons() {
        const dateInput = document.getElementById('stats-date-select');
        const nextBtn = document.getElementById('stats-next-date');
        if (!dateInput || !nextBtn) return;
        
        const selectedDate = dateInput.value;
        const today = this.getTodayDate();
        
        nextBtn.disabled = (selectedDate >= today);
    },

    renderSubjectLegend(sessions) {
        const legendContainer = document.getElementById('subject-stats-legend');
        if (!legendContainer) return;
        legendContainer.innerHTML = '';

        if (!sessions || sessions.length === 0) {
            legendContainer.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.9rem;">기록된 데이터가 없습니다.</p>';
            return;
        }

        // 과목별로 시간 합산
        const summary = {};
        sessions.forEach(s => {
            if (!summary[s.subject_name]) {
                summary[s.subject_name] = {
                    time: 0,
                    color: s.color
                };
            }
            const duration = (new Date(s.end) - new Date(s.start)) / 1000;
            summary[s.subject_name].time += duration;
        });

        Object.entries(summary).forEach(([name, data]) => {
            const item = document.createElement('div');
            item.className = 'legend-item';
            item.style.display = 'flex';
            item.style.alignItems = 'center';
            item.style.justifyContent = 'space-between';
            item.style.marginBottom = '10px';
            item.style.padding = '8px';
            item.style.borderRadius = '6px';
            item.style.background = 'rgba(0,0,0,0.02)';

            item.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 12px; height: 12px; border-radius: 50%; background-color: ${data.color};"></div>
                    <span style="font-weight: 500; font-size: 0.95rem;">${name}</span>
                </div>
                <span style="font-weight: 600; color: var(--primary-color);">${this.formatSeconds(data.time)}</span>
            `;
            legendContainer.appendChild(item);
        });
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
            const todayLocal = this.getTodayDate();
            const startUTC = new Date(`${todayLocal}T00:00:00`).toISOString();
            const endUTC = new Date(`${todayLocal}T23:59:59.999`).toISOString();

            const totalStats = await api.getStats(null, startUTC, endUTC, null);

            let totalTime = Number(totalStats.dailyTotal) || 0;
            
            // 현재 공부 중인 경우, 서버에서 받아온 '오늘 총합'에는 이미 현재 세션의 시간이 포함되어 있음.
            // timer.js에서 totalTime + diff를 수행하므로, 중복 방지를 위해 diff를 빼서 순수 '이전 세션들의 합'을 구함.
            const isRunning = window.timer && window.timer.isRunning();
            const currentDiff = isRunning ? window.timer.getCurrentDiff() : 0;
            
            const baseTotalTime = totalTime - currentDiff;
            todayDisplay.textContent = this.formatSeconds(baseTotalTime + currentDiff);
            if (window.timer) window.timer.initialTodayTotalTime = baseTotalTime;

            if (!subjectId) {
                subjectCard.classList.add('hidden');
                if (window.timer) window.timer.initialSubjectTodayTime = 0;
                return;
            }

            // 2. 해당 과목의 오늘 공부 시간 로드
            const subjectStats = await api.getStats(null, startUTC, endUTC, subjectId);

            let subjectTime = Number(subjectStats.dailyTotal) || 0;
            const baseSubjectTime = subjectTime - currentDiff;
            
            const subjectName = subjectSelect.options[subjectSelect.selectedIndex].text;
            subjectLabel.textContent = `오늘 ${subjectName} 공부`;
            subjectTodayDisplay.textContent = this.formatSeconds(baseSubjectTime + currentDiff);
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
    },

    /**
     * 서비스 워커 등록 및 업데이트 관리
     */
    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js')
                    .then(registration => {
                        console.log('SW registered: ', registration);

                        // 주기적으로 업데이트 확인 (예: 30분마다)
                        setInterval(() => {
                            registration.update();
                        }, 1000 * 60 * 30);

                        // 앱이 포그라운드로 올 때마다 업데이트 확인 (iOS Safari PWA 대응)
                        document.addEventListener('visibilitychange', () => {
                            if (document.visibilityState === 'visible') {
                                registration.update();
                            }
                        });

                        // 업데이트 확인
                        registration.addEventListener('updatefound', () => {
                            const newWorker = registration.installing;
                            newWorker.addEventListener('statechange', () => {
                                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                    // 새로운 서비스 워커가 설치되었고 제어 중인 이전 워커가 있는 경우 (업데이트)
                                    console.log('New content is available; please refresh.');
                                    // 자동으로 새로고침하여 적용 (사용자가 원할 때 수동으로 하게 할 수도 있음)
                                    // 여기서는 "새 버전으로 갱신되도록 해줘"라는 요청에 따라 자동 새로고침 유도
                                }
                            });
                        });
                    })
                    .catch(registrationError => {
                        console.log('SW registration failed: ', registrationError);
                    });
            });

            // 서비스 워커가 업데이트되어 제어권이 변경되었을 때 페이지 새로고침
            let refreshing = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (!refreshing) {
                    refreshing = true;
                    console.log('Controller changed, reloading page...');
                    window.location.reload();
                }
            });
        }
    }
};

window.appState = appState;
appState.init();


