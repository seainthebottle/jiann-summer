# Study Time Manager (공부 시간 관리 매니저)

A modern, responsive web application to track and manage your study sessions. Monitor your progress by subject, visualize your data with charts, and stay motivated.

본 프로젝트는 과목별 공부 시간을 기록하고 관리할 수 있는 현대적인 웹 애플리케이션입니다. 반응형 디자인을 지원하며, 통계 차트를 통해 학습 현황을 한눈에 파악할 수 있습니다.

## 🚀 Features (주요 기능)

- **Study Session Tracking**: Start and stop timers for different subjects.
- **Subject Management**: Add and manage your study subjects.
- **Analytics & Reports**: View daily, weekly, and monthly study averages.
- **Interactive Charts**: Visualize study time distribution with dynamic pie charts.
- **Admin Dashboard**: Manage users and subjects from a secure dashboard.
- **Responsive Design**: Optimized for both desktop and mobile devices.
- **Dark/Light Mode**: Aesthetic themes for comfortable viewing.

## 🛠 Tech Stack (기술 스택)

- **Frontend**: Vanilla JavaScript, HTML5, CSS3 (Modern Responsive UI)
- **Backend**: Node.js, Express
- **Database**: MariaDB (No Foreign Key constraints for simplicity)
- **Authentication**: JWT (JSON Web Tokens), Bcrypt (Password Hashing)

## 📋 Prerequisites (필수 요구 사항)

- [Node.js](https://nodejs.org/) (v14 or higher)
- [MariaDB](https://mariadb.org/) or MySQL

## ⚙️ Installation & Setup (설치 및 설정)

### 1. Database Setup (데이터베이스 설정)

1. Access your MariaDB/MySQL instance.
2. Run the SQL commands in `database/schema.sql` to create the database and tables.

```bash
# Example command (CLI)
mysql -u root -p < database/schema.sql
```

### 2. Server Configuration (서버 설정)

1. Navigate to the `server` directory.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the `server` directory (you can copy `.env.example` if available or create a new one):
   ```env
   PORT=3000
   DB_HOST=localhost
   DB_USER=your_db_user
   DB_PASSWORD=your_db_password
   DB_NAME=study_db
   JWT_SECRET=your_secret_key
   ```

### 3. Running the Application (구동 방법)

1. Start the server:
   ```bash
   # Production mode
   npm start
   
   # Development mode (with nodemon)
   npm run dev
   ```
2. **Initial Admin Setup**: On the first run, the server will prompt you in the terminal to create an initial admin account. Follow the instructions in the console.
3. Open your browser and navigate to `http://localhost:3000`.

## 📂 Project Structure (프로젝트 구조)

- `index.html`: Main entry point (frontend)
- `/css`: Stylesheets
- `/js`: Frontend scripts
- `/server`: Node.js/Express backend
  - `/config`: Database connection configuration
  - `/controllers`: Request handling logic
  - `/routes`: API route definitions
  - `/middleware`: Authentication and other middlewares
- `/database`: Database schema and scripts

## 📄 License

This project is licensed under the [MIT License](LICENSE).
