import React from 'react';
import './Footer.css';

const Footer = () => {
  return (
    <footer className="footer-container">
      <div className="footer-content">
        
        <div className="footer-brand">
         
          <div className="brand-logo">
            DMU
          </div>
        </div>

        <div className="footer-section">
          <h4>제작자</h4>
          <ul>
            <li>동양미래대학교</li>
            <li>김동진 / 이봉준</li>
            <li>홍다은 / 서지연</li>
          </ul>
        </div>

        <div className="footer-section">
          <h4>Tech Stack / Data</h4>
          <div className="tech-stack-lists">
            <ul>
              <li>React / Spring Boot</li>
              <li>MySQL / Raspberry Pi</li>
            </ul>
            <ul>
              <li>Arduino / YOLOv8</li>
              <li>WebSocket / MQTT</li>
            </ul>
          </div>
        </div>

      </div>

      <div className="footer-bottom">
        <p>© 2026 ARES Project. For educational purposes only.</p>
        <p>이 사이트는 학습용으로 제작되었으며 상업적 용도로 사용되지 않습니다.</p>
      </div>
    </footer>
  );
};

export default Footer;
