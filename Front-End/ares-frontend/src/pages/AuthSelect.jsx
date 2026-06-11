import React from 'react';
import { useNavigate } from 'react-router-dom';
import './AuthSelect.css';

function AuthSelect() {
  const navigate = useNavigate();

  return (
    <main className="auth_select_container">
      <section className="auth_select_card">
        <h1 className="auth_select_title">ARES</h1>
        <p className="auth_select_subtitle">로봇 통합 관제 시스템에 접속합니다.</p>
        
        <div className="select_group">
          <button 
            className="select_btn auth_login_btn" 
            onClick={() => navigate('/login')}
          >
            로그인
          </button>
          
          <div className="divider">
            <span>또는</span>
          </div>

          <button 
            className="select_btn auth_signup_btn" 
            onClick={() => navigate('/signup')}
          >
            회원가입
          </button>
        </div>
        
        <p className="footer_info">A-RES v1.0.0 | 2026 Graduation Project</p>
      </section>
    </main>
  );
}

export default AuthSelect;