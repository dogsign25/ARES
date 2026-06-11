import { useEffect, useState } from 'react';
import PatientList from '../components/PatientList';
import './Status.css';
import { API_URL } from '../config';

function Status (){
  const [patient, setPatient] = useState([]);

  useEffect(()=>{
    const token = localStorage.getItem("token");
    const loadSurvivors = async () => {
      try {
        const response = await fetch(`${API_URL}/survivors`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        setPatient(data.map((item, index) => ({
          id: item.id,
          name: `부상자 ${index + 1}`,
          lat: item.posX ?? "-",
          lng: item.posY ?? "-",
          status: item.survivalRate >= 0.7 ? "위급" : item.survivalRate >= 0.4 ? "주의" : "양호",
          details: `생존 확률 ${Math.round((item.survivalRate || 0) * 100)}%`
        })));
      } catch (error) {
        console.error("생존자 현황 조회 실패:", error);
      }
    };

    loadSurvivors();
    const interval = setInterval(loadSurvivors, 5000);
    return () => clearInterval(interval);
  },[]);
  
  return (
    <div className="status_container">
      <div className="status_header">
        <h2>부상자 현황 및 실시간 위치</h2>
        <p>로봇이 탐색한 구역 내 부상자 좌표와 상태를 확인합니다.</p> 
      </div>
      
      <div className="status_content">
       
        <div className="map_section">
          <div className="map_canvas">
            <div className="map_info_tag">부상자 현황</div>
            <iframe
              title="status-map"
              src="https://maps.google.com/maps?q=37.5665,126.9780&z=16&output=embed"
              style={{ width: '100%', height: '100%', border: 'none' }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>

        
        <div className="list_section">
          <div className="card_header">
            <h3>부상자 명단</h3>
            <span className="count_badge">총 {patient.length}</span>
          </div>
          <div className="victim_scroll">
            <PatientList patient={patient} />
          </div>
        </div>
      </div>
      
    </div>
  );
};

export default Status;
