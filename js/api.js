const API_URL = '/api';

const api = {
    // 로컬 스토리지에 토큰 저장
    setToken(token) {
        localStorage.setItem('study_token', token);
    },

    getToken() {
        return localStorage.getItem('study_token');
    },

    removeToken() {
        localStorage.removeItem('study_token');
    },

    // 공통 요청 함수
    async request(path, options = {}) {
        const token = this.getToken();
        const headers = {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...options.headers
        };

        const response = await fetch(`${API_URL}${path}`, {
            ...options,
            headers
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '요청 실패');
        }
        return data;
    },

    // 인증 관련
    async login(username, password) {
        const data = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        this.setToken(data.token);
        return data.user;
    },

    async register(username, password) {
        return await this.request('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
    },

    async verify() {
        return await this.request('/auth/verify');
    },

    // 공부 관련
    async getSubjects() {
        return await this.request('/study/subjects');
    },

    async startSession(subjectId) {
        return await this.request('/study/start', {
            method: 'POST',
            body: JSON.stringify({ subject_id: subjectId })
        });
    },

    async stopSession() {
        return await this.request('/study/stop', {
            method: 'POST'
        });
    },

    async getStatus() {
        return await this.request('/study/status');
    },

    async getStats() {
        return await this.request('/study/stats');
    },

    // 관리자 관련
    async adminGetUsers() {
        return await this.request('/admin/users');
    },

    async adminAddUser(username, password, role) {
        return await this.request('/admin/users', {
            method: 'POST',
            body: JSON.stringify({ username, password, role })
        });
    },

    async adminDeleteUser(userId) {
        return await this.request('/admin/users/' + userId, {
            method: 'DELETE'
        });
    },

    async adminAddSubject(name) {
        return await this.request('/admin/subjects', {
            method: 'POST',
            body: JSON.stringify({ name })
        });
    },

    async adminDeleteSubject(subjectId) {
        return await this.request('/admin/subjects/' + subjectId, {
            method: 'DELETE'
        });
    }
};
