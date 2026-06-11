import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Main.css';
import PatientList from '../components/PatientList';
import { useMissions } from '../context/MissionContext';
import { API_URL } from '../config';

function Main({ isLive, imageSrc, selection, user, resetSelection }) {
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());

  const { missions } = useMissions();

  const currentMission = missions.find(m => m.id === selection.missionId || m.id === Number(selection.missionId));
  const currentZone = currentMission?.zones?.find(z => z.id === selection.zoneId || z.id === Number(selection.zoneId));

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(timer);

    
  }, []);


  const [patient, setPatient] = useState([]);

  const [logs, setLogs] = useState(()=>{
    const logSave = localStorage.getItem("ares_logs");
    return logSave ? JSON.parse(logSave) : [];
  })

  useEffect(()=>{
    localStorage.setItem('ares_logs', JSON.stringify(logs));
  },[logs]);

  const totalCount = patient.length;
  const emergencyCount = patient.filter(p => p.status === "위급").length;
  const cautionCount = patient.filter(p => p.status === "주의").length;
  const normalCount = patient.filter(p => p.status == "양호").length;

  useEffect(()=>{
    if (!selection?.missionId) return;

    const token = localStorage.getItem("token");
    const loadSurvivors = async () => {
      try {
        const response = await fetch(`${API_URL}/survivors/mission/${selection.missionId}`, {
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
        console.error("생존자 목록 조회 실패:", error);
      }
    };

    loadSurvivors();
    const interval = setInterval(loadSurvivors, 5000);
    return () => clearInterval(interval);
  },[selection?.missionId]);
  
  const handleAbortZone = async () => {
    if (!selection?.zoneId) {
      alert("선택된 구역 정보가 없습니다.");
      return;
    }

    if (!window.confirm("현재 구역 탐색을 중단하시겠습니까?\n(로봇 해제 후 다시 선택 및 재개가 가능합니다.)")) {
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_URL}/missions/zones/${selection.zoneId}/abort`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
         }
      });

      if (response.ok) {
        alert("구역 탐색이 중단되었습니다.");
        setLogs(prev => [{
          id: Date.now(),
          message: `${currentZone?.zoneName || '구역'} 탐색 중단 처리됨`,
          time: new Date().toLocaleString(),
          type: "orange"
        }, ...prev].slice(0,5));
        resetSelection();
        navigate('/select'); 
      } else {
        const errorText = await response.text();
        alert(`중단 처리 실패: ${errorText}`);
      }
    } catch (error) {
      console.error("API 호출 중 에러 발생:", error);
      alert("서버와 통신 중 오류가 발생했습니다.");
    }
  };

  const handleCompleteZone = async () => {
    if (!selection?.zoneId) {
      alert("선택된 구역 정보가 없습니다.");
      return;
    }

    if (!window.confirm("현재 구역 탐색을 최종 종료하시겠습니까?\n(종료 후 이 구역은 다시 탐색할 수 없습니다.)")) {
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_URL}/missions/zones/${selection.zoneId}/complete`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
         }
      });

      if (response.ok) {
        alert("구역 탐색이 완료되어 종료되었습니다.");
        setLogs(prev => [{
          id: Date.now(),
          message: `${currentZone?.zoneName || '구역'} 탐색 최종 종료`,
          time: new Date().toLocaleString(),
          type: "green"
        }, ...prev].slice(0,5));
        resetSelection();
        navigate('/select');
      } else {
        const errorText = await response.text();
        alert(`종료 처리 실패: ${errorText}`);
      }
    } catch (error) {
      console.error("API 호출 중 에러 발생:", error);
      alert("서버와 통신 중 오류가 발생했습니다.");
    }
  };
  

 

  return (
    <main className="main_container">
      <div className="main_wrap">
        
        {/* 미션 배너 */}
        <div className="mission_info_banner">
          <div className="mission_meta">
            <span className="mission_label">CURRENT MISSION</span>
            <h1 className="mission_title">
              {currentMission ? currentMission.description : "미션 정보 없음"}
            </h1>
          </div>
          <div className="mission_stats">
            <div className="info_item">
              <span className="info_label">OPERATOR</span>
              <span className="info_value">{user}</span>
            </div>
            <div className="info_item">
              <span className="info_label">ASSIGNED ZONE</span>
              <span className="info_value text_green" style={{ color: '#22c55e', fontWeight: '700' }}>
                {currentZone ? currentZone.zoneName : "구역 정보 없음"}
              </span>
            </div>
            <div className="info_item">
              <span className="info_label">ROBOT ID</span>
              <span className="info_value text_blue">{selection.robotId}</span>
            </div>
            <div className="info_item">
              <span className="info_label">SYSTEM TIME</span>
              <span className="info_value">{currentTime}</span>
            </div>
          </div>
          <div className="mission_btn_group">
            <button className="mission_btn mission_btn_pause" onClick={handleAbortZone}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                <rect x="5" y="3" width="4" height="18" rx="1"/>
                <rect x="15" y="3" width="4" height="18" rx="1"/>
              </svg>
              구역 탐색 중단
            </button>
            <button className="mission_btn mission_btn_end" onClick={handleCompleteZone}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              구역 탐색 종료
            </button>
          </div>
          
        </div>
       
        <div className="layout_grid top_section">
          <div className="sideba_area">
            <div className="stats_summary">
              <div className="stat_card">
                <span className="label">Total 전체</span>
                <span className="value">{totalCount}</span>
              </div>
              <div className="stat_card">
                <span className="label">Emergency 위급</span>
                <span className="value text_red">{emergencyCount}</span>
              </div>
              <div className="stat_card">
                <span className="label">Caution 주의</span>
                <span className="value text_orange">{cautionCount}</span>
              </div>
              <div className="stat_card">
                <span className="label">Normal 양호</span>
                <span className="value text_green">{normalCount}</span>
              </div>
            </div>
            
            <div className="box_card distribution_panel">
              <p className="label">State distribution 상태 분포</p>
              <div className="ratio_item">
                <span><i className="dot bg_red"></i> 위급</span> 
                <strong>{totalCount > 0 ?((emergencyCount/totalCount)*100).toFixed(1) : 0}%</strong>
              </div>
              <div className="ratio_item">
                <span><i className="dot bg_orange"></i> 주의</span> 
                <strong>{totalCount > 0 ?((cautionCount/totalCount)*100).toFixed(1) : 0}%</strong>
              </div>
              <div className="ratio_item">
                <span><i className="dot bg_green"></i> 양호</span> 
                <strong>{totalCount > 0 ?((normalCount/totalCount)*100).toFixed(1) : 0}%</strong>
              </div>
            </div>
          </div>

          <div className="box_card map_panel">
              <iframe
                title="tactical-map"
                src="https://maps.google.com/maps?q=37.5665,126.9780&z=16&output=embed"
                className="map_iframe"
                allowFullScreen
                loading="lazy"
              />
          </div>
        </div>  

        
        <div className="layout_grid mid_section">
          <div className="box_card stream_area">
            <Link to="/monitoring" className="stream_header_link">
              <div className="stream_header">
                <span className="link_text">실시간 모니터링 바로가기 〉</span>
                <span className={`status_text ${isLive ? "active" : "standby"}`}>
                  ● {isLive ? "연결됨 (YOLOv8 Active)" : "카메라 연결 대기 중"}
                </span>
              </div>
            </Link>
            <div className="stream_display">
              {isLive ? (
                <img src={imageSrc} alt="ARES Stream" className="live_feed" />
              ) : (
                <span className="placeholder_text">관제 페이지에서 모니터링을 시작해주세요.</span>
              )}
            </div>
          </div>

          <div className="box_card list_area">
            <h3 className="section_title">인명파악 현황</h3>
            <div className="victim_scroll">
              <PatientList patient={patient} />
            </div>
            
          </div>
        </div>

        
        <div className="box_card log_area">
          <h3 className="section_title">최근 상황 로그</h3>
          <div className="log_list">
            {logs.length > 0 ? logs.map(log => (
              <div key={log.id} className="log_row">
                <span><i className={ `dot bg_${log.type}`}></i>{log.message}</span>
                <span className='log_time'>{log.time}</span>
              </div>
            )) : (
              <div className="log_row">
                <span><i className='dot bg_blue'></i>
                  {isLive ? "서버 연결됨" : "로봇 연결 대기중"}
                </span>
                <span className='log_time'>{currentTime}</span>
              </div>
            )}
            
          </div>
        </div>

      </div>
    </main>
  );
}

export default Main;
