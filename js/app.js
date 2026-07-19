const appState = {
    user: null,
    currentPage: 'auth',
    version: 'v16',
    initialized: false,

    async init() {
        if (this.initialized) return;
        this.initialized = true;
        
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

        // 로그아웃 모달 제어
        const logoutBtn = document.getElementById('logout-btn');
        const logoutModal = document.getElementById('logout-modal');
        const confirmBtn = document.getElementById('modal-confirm-btn');
        const cancelBtn = document.getElementById('modal-cancel-btn');

        if (logoutBtn && logoutModal) {
            logoutBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                logoutModal.classList.add('active');
            };

            cancelBtn.onclick = () => {
                logoutModal.classList.remove('active');
            };

            confirmBtn.onclick = () => {
                api.removeToken();
                this.user = null;
                location.reload();
            };

            // 모달 바깥 클릭 시 닫기
            logoutModal.onclick = (e) => {
                if (e.target === logoutModal) {
                    logoutModal.classList.remove('active');
                }
            };
        }



        // 테마 토글
        document.getElementById('theme-toggle').addEventListener('click', () => this.toggleTheme());

        // 과목 추가 (모든 사용자)
        document.getElementById('add-subject-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('new-subject-name').value;
            const color = document.getElementById('new-subject-color').value;
            try {
                await api.addSubject(name, color);
                document.getElementById('new-subject-name').value = '';
                this.loadSubjectsPage();
                this.loadSubjects(); // 대시보드 과목 드롭다운도 갱신
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

        // 관리자 과목 추가
        document.getElementById('admin-add-subject-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const userId = document.getElementById('admin-subject-user-select').value;
            const name = document.getElementById('admin-new-subject-name').value;
            const color = document.getElementById('admin-new-subject-color').value;
            if (!userId) return alert('사용자를 선택하세요.');
            try {
                await api.adminAddSubject(userId, name, color);
                document.getElementById('admin-new-subject-name').value = '';
                this.loadAdminSubjects();
            } catch (err) {
                alert(err.message);
            }
        });

        // 관리자 과목 사용자 선택
        document.getElementById('admin-subject-user-select').addEventListener('change', () => {
            this.loadAdminSubjects();
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

        // 계획 예상 시간 슬라이더 - 숫자 입력 동기화 (실시간 연동 및 검증)
        const planSlider = document.getElementById('plan-time-slider');
        const planNumber = document.getElementById('plan-time-number');
        if (planSlider && planNumber) {
            // 슬라이더를 움직일 때 숫자 입력창의 값을 실시간으로 동기화합니다.
            planSlider.addEventListener('input', () => {
                planNumber.value = planSlider.value;
            });
            
            // 숫자 입력창에 값을 타이핑할 때 실시간으로 슬라이더에 반영합니다.
            planNumber.addEventListener('input', () => {
                const rawVal = planNumber.value;
                if (rawVal === '') return; // 입력값을 지워 빈 칸인 상태에서는 보정 처리를 하지 않아 자연스러운 타이핑을 유도합니다.
                
                let val = parseInt(rawVal);
                if (isNaN(val)) return;

                // 최대 60분까지로 제한하므로 60을 초과하면 즉시 60으로 제한합니다.
                if (val > 60) {
                    val = 60;
                    planNumber.value = val;
                }
                
                // 1분 미만(예: 0)일 때 즉시 1로 보정해버리면 '15'를 치기 위해 '1'을 입력할 때 방해가 되므로,
                // 유효 범위(1~60) 내의 정상적인 숫자인 경우에만 슬라이더의 위치를 실시간으로 맞춥니다.
                if (val >= 1 && val <= 60) {
                    planSlider.value = val;
                }
            });

            // 숫자 입력창에서 포커스를 잃거나 값 변경이 완료되었을 때 최종 유효성 검사를 수행합니다.
            planNumber.addEventListener('change', () => {
                let val = parseInt(planNumber.value);
                // 입력값이 숫자가 아니거나 1 미만일 경우 최솟값인 1로 설정합니다.
                if (isNaN(val) || val < 1) {
                    val = 1;
                } else if (val > 60) {
                    // 60분을 초과하는 경우 최댓값인 60으로 설정합니다.
                    val = 60;
                }
                planNumber.value = val;
                planSlider.value = val;
            });
        }

        // 계획 추가 폼 서브밋
        const addPlanForm = document.getElementById('add-plan-form');
        if (addPlanForm) {
            addPlanForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const subjectId = homeSubjectSelect.value;
                const title = document.getElementById('plan-title').value;
                const estimatedMinutes = parseInt(planNumber.value) || 30;

                if (!subjectId) {
                    alert('과목을 먼저 선택해주세요.');
                    return;
                }

                try {
                    await api.createPlan(subjectId, title, estimatedMinutes);
                    document.getElementById('plan-title').value = '';
                    this.loadPlans();
                } catch (err) {
                    alert(err.message);
                }
            });
        }
    },


    onLoginSuccess() {
        document.getElementById('navbar').classList.remove('hidden');
        // 과목 관리는 모든 로그인 사용자에게 공개
        document.getElementById('subjects-link').classList.remove('hidden');
        if (this.user.role === 'admin') {
            document.getElementById('admin-link').classList.remove('hidden');
        }
        
        // 마지막으로 보던 페이지로 복원 (기본값은 대시보드, auth 페이지인 경우 대시보드로)
        let targetPage = localStorage.getItem('saved_current_page') || 'dashboard';
        if (targetPage === 'auth') targetPage = 'dashboard';
        
        this.showPage(targetPage);
        this.loadSubjects();
        this.loadPlans(); // 계획 목록 로드 추가
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
        if (pageId === 'subjects') this.loadSubjectsPage();
        if (pageId === 'admin') this.loadAdminData();
    },

    statsUpdateTimer: null,

    startStatsUpdateTimer() {
        this.stopStatsUpdateTimer();
        
        // 1초마다 UI 업데이트 (현재 공부 중인 경우 시간 누적 표시)
        this.statsUpdateTimer = setInterval(() => {
            if (this.currentPage === 'stats') {
                this.updateStatsUI();
            }
        }, 1000);

        // 1분마다 서버 데이터 새로고침 (정기 동기화)
        this.statsSyncTimer = setInterval(() => {
            if (this.currentPage === 'stats') {
                this.loadStats();
            }
        }, 60000);
    },

    stopStatsUpdateTimer() {
        if (this.statsUpdateTimer) {
            clearInterval(this.statsUpdateTimer);
            this.statsUpdateTimer = null;
        }
        if (this.statsSyncTimer) {
            clearInterval(this.statsSyncTimer);
            this.statsSyncTimer = null;
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
            // 과목 선택 시 버튼 색상 동적 변경을 위해 옵션 엘리먼트에 색상 정보를 데이터셋으로 주입합니다.
            opt.dataset.color = sub.color || '#339af0';
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
            window.timer.start(active.start_time, active.plan_id, active.subject_id); // activeSubjectId 연동
            await this.updateHomeSubjectTime();
        } else {
            await this.updateHomeSubjectTime();
        }
    },


    async loadStats() {
        // 관리자가 명시적으로 사용자를 선택하지 않았을 경우, 현재 드롭다운의 값을 사용하거나 기본값(본인) 사용
        const userId = this.user.role === 'admin' ? document.getElementById('admin-user-select').value : null;
        let localDate = document.getElementById('stats-date-select').value;
        const subjectId = document.getElementById('stats-subject-select').value;
        
        // 통계 페이지를 방문하지 않아 날짜 필드가 비어있는 경우 안전 장치를 적용합니다.
        if (!localDate) {
            this.updateStatsDateIfExpired();
            localDate = document.getElementById('stats-date-select').value || this.getTodayDate();
        }
        
        // 로컬 날짜의 시작과 끝을 ISO(UTC) 문자열로 변환
        const startDate = new Date(`${localDate}T00:00:00`).toISOString();
        const endDate = new Date(`${localDate}T23:59:59.999`).toISOString();
        
        const stats = await api.getStats(userId, startDate, endDate, subjectId);

        // 실시간 업데이트를 위해 데이터 저장
        this.lastStats = stats;
        this.lastStatsTimestamp = Date.now();
        this.lastStatsDate = localDate;

        this.updateStatsUI();
        this.renderWeekdayIndicator(localDate);

        window.charts.renderDailyPie(stats.sessions, localDate);

        // 날짜 네비게이션 버튼 상태 업데이트
        this.updateDateNavButtons();
    },

    renderWeekdayIndicator(localDateStr) {
        const container = document.getElementById('weekday-indicator');
        if (!container) return;

        // 로컬 날짜 문자열을 로컬 시간 기준으로 파싱하여 요일 계산
        const date = new Date(`${localDateStr}T00:00:00`);
        const selectedDay = date.getDay(); // 0=일, 1=월, ..., 6=토
        const labels = ['일', '월', '화', '수', '목', '금', '토'];

        container.innerHTML = '';
        // 선택일 기준으로 해당 주 일요일의 날짜 계산
        const weekSunday = new Date(`${localDateStr}T00:00:00`);
        weekSunday.setDate(weekSunday.getDate() - selectedDay);

        const todayStr = this.getTodayDate();

        labels.forEach((label, idx) => {
            const isSelected = idx === selectedDay;

            // 이 요일 박스가 가리키는 실제 날짜
            const targetDate = new Date(weekSunday);
            targetDate.setDate(weekSunday.getDate() + idx);
            const year = targetDate.getFullYear();
            const month = String(targetDate.getMonth() + 1).padStart(2, '0');
            const day = String(targetDate.getDate()).padStart(2, '0');
            const targetDateStr = `${year}-${month}-${day}`;
            const isFuture = targetDateStr > todayStr;
            const isToday = targetDateStr === todayStr;

            // 날짜 숫자 스타일: 오늘이면 굵게, 요일별 색 유지
            const dateFontWeight = isToday ? '700' : '400';
            const dateColor = idx === 0
                ? (isToday ? '#ffa8a8' : '#fa5252')
                : idx === 6
                ? (isToday ? '#a5d8ff' : '#4dabf7')
                : isToday ? 'var(--text-color)' : 'var(--text-secondary)';

            const box = document.createElement('div');
            box.style.cssText = `
                width: 32px; height: 32px;
                display: flex; align-items: center; justify-content: center;
                border-radius: 6px;
                font-size: 0.82rem; font-weight: 400;
                background: ${isSelected ? (idx === 0 ? '#fa5252' : idx === 6 ? '#4dabf7' : 'var(--primary-color)') : 'rgba(0,0,0,0.04)'};
                color: ${isSelected ? '#fff' : (idx === 0 ? '#fa5252' : idx === 6 ? '#4dabf7' : 'var(--text-secondary)')};
                border: 1px solid ${isSelected ? 'transparent' : 'var(--border-color, #dee2e6)'};
                opacity: ${isFuture ? '0.3' : '1'};
                cursor: ${isFuture ? 'default' : 'pointer'};
                transition: background 0.2s, opacity 0.2s;
            `;
            box.innerHTML = `
                <div style="position: absolute; top: -13px; left: 50%; transform: translate(-50%, -50%); width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.62rem; font-weight: ${dateFontWeight}; color: ${dateColor};">${targetDate.getDate()}</div>
                ${label}
            `;
            box.style.position = 'relative';

            if (!isFuture && !isSelected) {
                box.addEventListener('click', () => {
                    const dateInput = document.getElementById('stats-date-select');
                    dateInput.value = targetDateStr;
                    localStorage.setItem('saved_stats_date', targetDateStr);
                    localStorage.setItem('last_stats_date_change', Date.now());
                    this.loadStats();
                });
            }

            container.appendChild(box);
        });
    },

    updateStatsUI() {
        if (!this.lastStats) return;

        const stats = this.lastStats;
        const now = Date.now();
        const elapsed = (now - this.lastStatsTimestamp) / 1000;

        // 오늘 날짜를 보고 있고, 진행 중인 세션이 있는 경우에만 실시간 가산
        const isToday = this.lastStatsDate === this.getTodayDate();
        const activeSession = stats.sessions.find(s => s.is_active);
        const diff = (isToday && activeSession) ? elapsed : 0;

        // 시간 요약 업데이트
        document.getElementById('stat-daily').textContent = this.formatSeconds(Number(stats.dailyTotal) + diff);
        document.getElementById('stat-weekly').textContent = this.formatSeconds(Number(stats.weeklyTotal) + diff);
        document.getElementById('stat-monthly').textContent = this.formatSeconds(Number(stats.monthlyTotal) + diff);
        document.getElementById('stat-weekly-avg').textContent = this.formatSeconds((Number(stats.weeklyTotal) + diff) / 7);
        document.getElementById('stat-monthly-avg').textContent = this.formatSeconds((Number(stats.monthlyTotal) + diff) / 30);

        // 과목별 범례 생성/업데이트
        this.renderSubjectLegend(stats.sessions, diff, stats.subjectWeeklyAvgs || {}, stats.subjectMonthlyAvgs || {});
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

    renderSubjectLegend(sessions, activeDiff = 0, subjectWeeklyAvgs = {}, subjectMonthlyAvgs = {}) {
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
                    color: s.color,
                    is_active: false
                };
            }
            const duration = (new Date(s.end) - new Date(s.start)) / 1000;
            summary[s.subject_name].time += duration;
            if (s.is_active) summary[s.subject_name].is_active = true;
        });

        // 당일 sessions + 주간/월간 평균에 있는 과목을 모두 합산하여 표시
        const allNames = new Set([
            ...Object.keys(summary),
            ...Object.keys(subjectWeeklyAvgs),
            ...Object.keys(subjectMonthlyAvgs)
        ]);

        allNames.forEach(name => {
            const data = summary[name];
            const weeklyData = subjectWeeklyAvgs[name];
            const monthlyData = subjectMonthlyAvgs[name];

            // 색상: 당일 세션 > 주간 데이터 > 월간 데이터 > 기본값
            const color = (data && data.color) || (weeklyData && weeklyData.color) || (monthlyData && monthlyData.color) || '#339af0';
            const isActive = data ? data.is_active : false;
            const dailyTime = data ? data.time : 0;
            const displayTime = isActive ? dailyTime + activeDiff : dailyTime;

            const weeklyAvg = (weeklyData ? weeklyData.avg : 0) + (isActive ? activeDiff / 7 : 0);
            const monthlyAvg = (monthlyData ? monthlyData.avg : 0) + (isActive ? activeDiff / 30 : 0);

            const item = document.createElement('div');
            item.className = 'legend-item';
            item.style.marginBottom = '10px';
            item.style.padding = '8px 10px';
            item.style.borderRadius = '6px';
            item.style.background = 'rgba(0,0,0,0.02)';

            item.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 12px; height: 12px; border-radius: 50%; background-color: ${color}; flex-shrink: 0;"></div>
                        <span style="font-weight: 500; font-size: 0.95rem;">${name}${isActive ? ' (공부 중)' : ''}</span>
                    </div>
                    <span style="font-weight: 600; color: ${displayTime > 0 ? 'var(--primary-color)' : 'var(--text-secondary)'};">${this.formatSeconds(displayTime)}</span>
                </div>
                <div style="display: flex; flex-direction: column; gap: 2px; margin-top: 4px; padding-left: 22px; font-size: 0.78rem; color: var(--text-secondary);">
                    <span>주간 일평균: <strong>${this.formatSeconds(weeklyAvg)}</strong></span>
                    <span>월간 일평균: <strong>${this.formatSeconds(monthlyAvg)}</strong></span>
                </div>
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

        // 과목 관리 사용자 드롭다운 동기화
        const subjectUserSelect = document.getElementById('admin-subject-user-select');
        const currentVal = subjectUserSelect.value;
        subjectUserSelect.innerHTML = '';
        users.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = `${u.username} (${u.role})`;
            subjectUserSelect.appendChild(opt);
        });
        // 기존 선택값 유지, 없으면 첫 번째 사용자
        if (currentVal && Array.from(subjectUserSelect.options).some(o => o.value === currentVal)) {
            subjectUserSelect.value = currentVal;
        }
        this.loadAdminSubjects();
    },

    // 관리자 - 선택된 사용자의 과목 목록 로드
    async loadAdminSubjects() {
        const userId = document.getElementById('admin-subject-user-select').value;
        if (!userId) return;
        const subjects = await api.adminGetSubjects(userId);
        const subList = document.getElementById('admin-subject-list');
        subList.innerHTML = '';

        if (subjects.length === 0) {
            subList.innerHTML = '<li style="color: var(--text-secondary); padding: 10px 0;">등록된 과목이 없습니다.</li>';
            return;
        }

        subjects.forEach(s => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div style="display: flex; gap: 10px; align-items: center; width: 100%;">
                    <input type="color" id="admin-subj-color-${s.id}" value="${s.color || '#339af0'}" style="padding: 0; width: 30px; height: 30px;">
                    <input type="text" id="admin-subj-name-${s.id}" value="${s.name}" style="flex: 1; padding: 5px; margin-bottom: 0;">
                    <button class="btn-small" onclick="appState.adminUpdateSubject(${s.id})" style="padding: 5px 10px;">수정</button>
                    <button class="delete-btn" onclick="appState.adminDeleteSubject(${s.id})" style="padding: 5px 10px;">삭제</button>
                </div>
            `;
            subList.appendChild(li);
        });
    },

    async adminUpdateSubject(id) {
        const name = document.getElementById(`admin-subj-name-${id}`).value;
        const color = document.getElementById(`admin-subj-color-${id}`).value;
        if (!name) return alert('과목 이름을 입력하세요.');
        try {
            await api.adminUpdateSubject(id, name, color);
            alert('과목이 수정되었습니다.');
            this.loadAdminSubjects();
        } catch (err) {
            alert(err.message);
        }
    },

    async adminDeleteSubject(id) {
        if (!confirm('정말 삭제하시겠습니까?')) return;
        try {
            await api.adminDeleteSubject(id);
            this.loadAdminSubjects();
        } catch (err) {
            alert(err.message);
        }
    },

    // 과목 관리 페이지 로드 (모든 사용자)
    async loadSubjectsPage() {
        const subjects = await api.getSubjects();
        const subList = document.getElementById('subject-manage-list');
        subList.innerHTML = '';

        if (subjects.length === 0) {
            subList.innerHTML = '<li style="color: var(--text-secondary); padding: 10px 0;">등록된 과목이 없습니다. 위에서 추가해 주세요.</li>';
            return;
        }

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
            await api.updateSubject(id, name, color);
            alert('과목이 수정되었습니다.');
            this.loadSubjectsPage();
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
            await api.deleteSubject(id);
            this.loadSubjectsPage();
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

            const todayStats = await api.getStats(null, startUTC, endUTC, null);

            let totalTime = Number(todayStats.dailyTotal) || 0;
            
            // 현재 공부 중인 경우, 서버에서 받아온 '오늘 총합'에는 이미 현재 세션의 시간이 포함되어 있음.
            // timer.js에서 totalTime + diff를 수행하므로, 중복 방지를 위해 diff를 빼서 순수 '이전 세션들의 합'을 구함.
            const isRunning = window.timer && window.timer.isRunning();
            const currentDiff = isRunning ? window.timer.getCurrentDiff() : 0;
            
            const baseTotalTime = Math.max(0, totalTime - currentDiff);
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
            
            // 선택된 과목(subjectId)이 현재 실행 중인 세션의 과목(activeSubjectId)과 동일한 경우에만 currentDiff 차감 적용
            const activeSubjectId = window.timer ? window.timer.activeSubjectId : null;
            const isMatchingSubject = isRunning && String(subjectId) === String(activeSubjectId);
            const baseSubjectTime = isMatchingSubject ? Math.max(0, subjectTime - currentDiff) : subjectTime;
            
            const subjectName = subjectSelect.options[subjectSelect.selectedIndex].text;
            subjectLabel.textContent = `오늘 ${subjectName} 공부`;
            subjectTodayDisplay.textContent = this.formatSeconds(baseSubjectTime + (isMatchingSubject ? currentDiff : 0));
            subjectCard.classList.remove('hidden');
            
            // 타이머 실시간 업데이트 기준 시간으로 차감된 baseSubjectTime 저장
            if (window.timer) window.timer.initialSubjectTodayTime = baseSubjectTime;
        } catch (err) {
            console.error('시간 로드 실패:', err);
        }
    },

    updateStudyButtonState() {
        const select = document.getElementById('subject-select');
        const btn = document.getElementById('study-toggle-btn');
        const planBtn = document.getElementById('add-plan-btn');
        
        // 공부 중일 때는 상태를 변경하지 않음 (timer.js에서 관리)
        if (btn.classList.contains('btn-stop')) return;

        const subjectId = select.value;
        const selectedOption = select.options[select.selectedIndex];
        const subjectName = selectedOption?.text || '';
        const subjectColor = selectedOption?.dataset.color || '';

        if (subjectId) {
            btn.disabled = false;
            btn.textContent = `${subjectName} 공부 시작`;
            // 선택된 과목의 고유 색상을 버튼의 CSS 변수(--subject-color)로 주입합니다.
            btn.style.setProperty('--subject-color', subjectColor);
            
            if (planBtn) {
                planBtn.disabled = false;
                planBtn.textContent = `"${subjectName}" 과목으로 계획 추가`;
                // 선택된 과목의 고유 색상을 계획 추가 버튼의 CSS 변수(--subject-color)로 주입합니다.
                planBtn.style.setProperty('--subject-color', subjectColor);
            }
        } else {
            btn.disabled = true;
            btn.textContent = '과목을 선택하세요';
            // 선택 해제 시 적용했던 CSS 변수를 삭제하여 기본 테마 스타일로 복구시킵니다.
            btn.style.removeProperty('--subject-color');
            
            if (planBtn) {
                planBtn.disabled = true;
                planBtn.textContent = '과목을 선택해주세요';
                // 선택 해제 시 계획 추가 버튼에 적용했던 CSS 변수를 삭제합니다.
                planBtn.style.removeProperty('--subject-color');
            }
        }
    },

    // 계획 목록 로드 및 렌더링
    async loadPlans() {
        const plansList = document.getElementById('plans-list');
        const emptyMsg = document.getElementById('plans-empty-msg');
        if (!plansList) return;

        try {
            // 로컬 오늘 날짜 기준 00:00:00 ~ 23:59:59.999 의 범위를 구해 ISO(UTC) 시간으로 전달합니다.
            const todayLocal = this.getTodayDate();
            const startDate = new Date(`${todayLocal}T00:00:00`).toISOString();
            const endDate = new Date(`${todayLocal}T23:59:59.999`).toISOString();

            const plans = await api.getPlans(startDate, endDate);
            plansList.innerHTML = '';

            if (!plans || plans.length === 0) {
                if (emptyMsg) emptyMsg.classList.remove('hidden');
                return;
            }

            if (emptyMsg) emptyMsg.classList.add('hidden');

            const currentActivePlanId = window.timer ? window.timer.activePlanId : null;
            const isRunning = window.timer ? window.timer.isRunning() : false;

            plans.forEach(plan => {
                const li = document.createElement('li');
                const isRunningThis = isRunning && currentActivePlanId === plan.id;
                
                li.className = `plan-card status-${plan.status}${isRunningThis ? ' running' : ''}`;
                li.id = `plan-card-${plan.id}`;
                li.dataset.completedSeconds = plan.completed_seconds;
                li.dataset.estimatedMinutes = plan.estimated_minutes;
                li.style.borderLeft = `6px solid ${plan.subject_color || '#339af0'}`;

                // 진행 상황 계산 (남은 시간 및 초과 시간 위주의 프로그레스 바 연산)
                const estSec = plan.estimated_minutes * 60;
                const curSec = plan.completed_seconds;
                
                let progressPercent = 0;
                let progressBarColor = plan.subject_color || '#339af0';

                // 남은 공부 시간 위주로 프로그레스 바를 갱신합니다.
                if (curSec < estSec) {
                    // 목표 달성 전: 남은 공부 시간 비율 (공부할수록 100%에서 0%로 감소)
                    progressPercent = estSec > 0 ? ((estSec - curSec) / estSec) * 100 : 0;
                } else {
                    // 목표 달성 후 (초과): 초과한 공부 시간 비율 (0%에서 100%로 다시 증가, 최대 100% 캡)
                    progressPercent = estSec > 0 ? Math.min(((curSec - estSec) / estSec) * 100, 100) : 100;
                    progressBarColor = 'var(--danger-color)'; // 초과되었을 때 빨간색 경고 컬러 적용
                }

                // 남은 시간 혹은 초과 시간의 초기 HTML을 구성합니다.
                let remainingHtml = '';
                if (curSec < estSec) {
                    remainingHtml = `<div class="time-remaining-wrapper status-remaining">남은 시간: <span class="time-remaining">${this.formatMinutesSeconds(estSec - curSec)}</span></div>`;
                } else {
                    remainingHtml = `<div class="time-remaining-wrapper status-over"><span class="time-remaining">${this.formatMinutesSeconds(curSec - estSec)} 초과</span></div>`;
                }

                // 버튼 구성
                let actionButtons = '';
                if (isRunningThis) {
                    actionButtons = `<button class="btn-plan-action btn-plan-stop" onclick="appState.stopPlan()">정지</button>`;
                } else {
                    if (plan.status === 'done') {
                        // 완료된 계획은 '완료됨' 표시와 함께 완료 취소 버튼을 노출합니다.
                        actionButtons = `
                            <span style="font-size: 0.8rem; font-weight: 700; color: var(--success-color); padding: 6px 0; margin-right: 8px;">완료됨</span>
                            <button class="btn-plan-action btn-plan-undone" onclick="appState.undonePlan(${plan.id})">완료 취소</button>
                        `;
                    } else {
                        actionButtons = `
                            <button class="btn-plan-action btn-plan-start" onclick="appState.startPlan(${plan.id}, ${plan.subject_id})">시작</button>
                            <button class="btn-plan-action btn-plan-done" onclick="appState.donePlan(${plan.id})">완료</button>
                        `;
                    }
                }

                // 삭제 버튼은 삭제가 가능한 경우(현재 공부 중이지 않고 공부 기록이 0초인 경우)에만 렌더링합니다.
                const isDeletable = !isRunningThis && plan.completed_seconds === 0;
                const deleteButtonHtml = isDeletable 
                    ? `<button class="btn-plan-action btn-plan-delete" onclick="appState.deletePlan(${plan.id})">삭제</button>` 
                    : '';

                // 시작 시각 및 완료 시각 포맷팅 (로컬 시간 기준)
                let startedTimeText = '-';
                if (plan.started_at) {
                    const sDate = new Date(plan.started_at);
                    startedTimeText = `${String(sDate.getHours()).padStart(2, '0')}:${String(sDate.getMinutes()).padStart(2, '0')}`;
                }

                let completedTimeText = '-';
                if (plan.completed_at) {
                    const cDate = new Date(plan.completed_at);
                    completedTimeText = `${String(cDate.getHours()).padStart(2, '0')}:${String(cDate.getMinutes()).padStart(2, '0')}`;
                } else if (plan.status === 'in_progress' || isRunningThis) {
                    completedTimeText = '공부 중';
                }

                // 누적 소요 시간 계산
                let durationText = '';
                if (plan.completed_seconds > 0) {
                    durationText = ` (${this.formatMinutesSeconds(plan.completed_seconds)})`;
                }

                const timeRangeHtml = `
                    <div class="plan-time-range" style="font-size: 0.76rem; color: var(--text-secondary); display: flex; gap: 8px; margin-right: auto; align-items: center;">
                        <div>시작: <strong style="color: var(--text-color);">${startedTimeText}</strong></div>
                        <div>완료: <strong style="color: var(--text-color);">${completedTimeText}</strong>${durationText}</div>
                    </div>
                `;

                li.innerHTML = `
                    <div class="plan-card-header">
                        <div class="plan-title-wrapper">
                            <span class="plan-subject-badge" style="background-color: ${plan.subject_color || '#339af0'}">${plan.subject_name}</span>
                            <div class="plan-title">${plan.title}</div>
                        </div>
                    </div>
                    
                    <div class="plan-progress-container">
                        <!-- 목표 마커를 제거하고 바의 채워짐이 남은/초과 비율을 정밀 지시하도록 단순화합니다. -->
                        <div class="plan-progress-bar" style="width: ${progressPercent}%; background-color: ${progressBarColor}"></div>
                    </div>
                    
                    <div class="plan-time-info">
                        <div>진행: <span class="time-current">${this.formatMinutesSeconds(curSec)}</span></div>
                        <div>목표: <span>${plan.estimated_minutes}분</span></div>
                        ${remainingHtml}
                    </div>
                    
                    <div class="plan-actions" style="align-items: center;">
                        ${timeRangeHtml}
                        ${actionButtons}
                        ${deleteButtonHtml}
                    </div>
                `;
                plansList.appendChild(li);
            });
        } catch (err) {
            console.error('계획 로드 실패:', err);
        }
    },

    // 초를 분:초 문자열로 포맷팅
    formatMinutesSeconds(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}분 ${s}초`;
    },

    // 계획 시작
    async startPlan(planId, subjectId) {
        if (window.timer && window.timer.isRunning()) {
            if (window.timer.activePlanId === planId) return;
            if (!confirm('현재 진행 중인 공부 세션을 종료하고 이 계획을 시작하시겠습니까?')) {
                return;
            }
            try {
                await api.stopSession();
                window.timer.stop();
            } catch (err) {
                alert('진행 중인 세션 종료 실패: ' + err.message);
                return;
            }
        }

        try {
            await api.startSession(subjectId, planId);
            document.getElementById('subject-select').value = subjectId;
            window.timer.start(new Date(), planId, subjectId);
            await this.updateHomeSubjectTime();
            await this.loadPlans();
        } catch (err) {
            alert(err.message);
        }
    },

    // 계획 정지
    async stopPlan() {
        try {
            await api.stopSession();
            if (window.timer) window.timer.stop();
            await this.loadPlans();
            await this.loadStats();
        } catch (err) {
            alert(err.message);
        }
    },

    // 계획 완료 처리
    async donePlan(planId) {
        try {
            await api.donePlan(planId);
            await this.loadPlans();
        } catch (err) {
            alert(err.message);
        }
    },

    // 계획 완료 취소 처리 (상태를 진행 상황에 맞춰 복원)
    async undonePlan(planId) {
        try {
            await api.undonePlan(planId);
            await this.loadPlans();
        } catch (err) {
            alert(err.message);
        }
    },

    // 계획 삭제
    async deletePlan(planId) {
        if (!confirm('이 계획을 삭제하시겠습니까?')) return;
        try {
            await api.deletePlan(planId);
            await this.loadPlans();
        } catch (err) {
            alert(err.message);
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
                navigator.serviceWorker.register('sw.js')
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

            // 서비스 워커가 업데이트되었을 때 콘솔에만 알림 (무한 루프 방지)
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                console.log('[SW] Controller changed. New version available.');
            });
        }
    }
};

window.appState = appState;
appState.init();


