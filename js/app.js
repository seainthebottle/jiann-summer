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
                alert(err.message);
            }
        });

        // 네비게이션
        document.querySelectorAll('nav a[data-page]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.showPage(e.target.dataset.page);
            });
        });

        // 로그아웃
        document.getElementById('logout-btn').addEventListener('click', () => {
            api.removeToken();
            this.user = null;
            location.reload();
        });

        // 앱 설치 버튼
        const installBtn = document.getElementById('install-btn');
        if (installBtn) {
            installBtn.addEventListener('click', async () => {
                if (!deferredPrompt) return;
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') {
                    installBtn.classList.add('hidden');
                }
                deferredPrompt = null;
            });
        }

        // 테마 토글
        document.getElementById('theme-toggle').addEventListener('click', () => this.toggleTheme());

        // 과목 추가 (관리자)
        document.getElementById('add-subject-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('new-subject-name').value;
            try {
                await api.adminAddSubject(name);
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
    },

    onLoginSuccess() {
        document.getElementById('navbar').classList.remove('hidden');
        if (this.user.role === 'admin') {
            document.getElementById('admin-link').classList.remove('hidden');
        }
        this.showPage('dashboard');
        this.loadSubjects();
        this.checkActiveSession();
        window.timer.init();
    },

    showPage(pageId) {
        this.currentPage = pageId;
        // 모든 섹션 숨기기
        document.querySelectorAll('main > section').forEach(sec => sec.classList.add('hidden'));
        // 대상 섹션 보이기
        document.getElementById(`${pageId}-page`).classList.remove('hidden');

        // 페이지별 데이터 로드
        if (pageId === 'stats') this.loadStats();
        if (pageId === 'admin') this.loadAdminData();
    },

    async loadSubjects() {
        const subjects = await api.getSubjects();
        const select = document.getElementById('subject-select');
        select.innerHTML = '<option value="">과목을 선택하세요</option>';
        subjects.forEach(sub => {
            const opt = document.createElement('option');
            opt.value = sub.id;
            opt.textContent = sub.name;
            select.appendChild(opt);
        });
    },

    async checkActiveSession() {
        const { active } = await api.getStatus();
        if (active) {
            // 셀렉트 박스에서 해당 과목 선택 상태로 변경
            document.getElementById('subject-select').value = active.subject_id;
            window.timer.start(active.start_time);
        }
    },

    async loadStats() {
        const stats = await api.getStats();

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

        window.charts.renderDailyPie(stats.dailyPie);
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
                <span>${s.name}</span>
                <button class="delete-btn" onclick="appState.deleteSubject(${s.id})">삭제</button>
            `;
            subList.appendChild(li);
        });
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

// PWA 설치 로직
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    // 브라우저 기본 설치 프롬프트 방지
    e.preventDefault();
    // 이벤트 보관
    deferredPrompt = e;
    
    // 모바일 기기이거나 화면 너비가 768px 이하인지 확인 (개발자 도구 테스트용)
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
    
    if (isMobile) {
        const installBtn = document.getElementById('install-btn');
        if (installBtn) {
            installBtn.classList.remove('hidden');
        }
    }
});

window.addEventListener('appinstalled', () => {
    const installBtn = document.getElementById('install-btn');
    if (installBtn) {
        installBtn.classList.add('hidden');
    }
    deferredPrompt = null;
    console.log('PWA가 성공적으로 설치되었습니다.');
});
