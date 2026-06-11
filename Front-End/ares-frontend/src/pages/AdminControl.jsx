import React, { useEffect, useState, useRef } from 'react';
import './AdminControl.css';
import { useMissions } from '../context/MissionContext';
import { API_URL } from '../config';

function AdminControl({ imageSrc }) {
  const { missions } = useMissions();
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());
  const [sensorData, setSensorData] = useState(null);
  
  // 드롭다운 선택을 위한 상태 관리
  const [selectedMissionId, setSelectedMissionId] = useState('');
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const videoWrapperRef = useRef(null);

  // 시계 타이머
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 전체화면 상태 감지 훅
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // 1. 진행중인 미션만 필터링
  const activeMissions = missions ? missions.filter(m => m.status === "IN_PROGRESS") : [];

  // 2. 선택된 미션 객체 찾기
  const currentMission = activeMissions.find(m => m.id === Number(selectedMissionId) || m.id === selectedMissionId);

  // 3. 선택된 미션 내에서 '관리자가 진입해 있는 활성 구역'만 필터링
  const activeZones = currentMission ? currentMission.zones.filter(z => z.operator !== null) : [];

  // 4. 선택된 구역 객체 찾기
const currentZone = activeZones.find(z => z.id === Number(selectedZoneId) || z.id === selectedZoneId);

  useEffect(() => {
    if (!currentZone?.robotId) {
      setSensorData(null);
      return;
    }

    const token = localStorage.getItem("token");
    const loadLatestSensor = async () => {
      try {
        const response = await fetch(`${API_URL}/sensors/latest/${encodeURIComponent(currentZone.robotId)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (response.status === 204) {
          setSensorData(null);
          return;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        setSensorData(await response.json());
      } catch (error) {
        console.error("관제 센서 조회 실패:", error);
      }
    };

    loadLatestSensor();
    const interval = setInterval(loadLatestSensor, 1000);
    return () => clearInterval(interval);
  }, [currentZone?.robotId]);

  // 미션이 변경되면 선택되어 있던 구역 초기화
  const handleMissionChange = (e) => {
    setSelectedMissionId(e.target.value);
    setSelectedZoneId('');
  };

  // 전체화면 토글 기능
  const toggleFullscreen = () => {
    if (!videoWrapperRef.current) return;
    if (!document.fullscreenElement) {
      videoWrapperRef.current.requestFullscreen().catch(err => {
        alert(`전체화면 변환 실패: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  return (
    <div className="admin_control_container">
      <div className="admin_header_panel">
        <div className="header_left">
          <h2>종합 관제 대시보드</h2>
          <p className="live_indicator_badge">미션 및 구역을 지정 후 실시간으로 모니터링하세요.</p>
        </div>
        <div className="header_right">
          <div className="stat_counter_box clock_box">
            <span>SYSTEM TIME</span>
            <strong className="digital_clock">{currentTime}</strong>
          </div>
        </div>
      </div>

      <div className="admin_workspace">
        
        <div className="admin_control_side_panel">
          <div className="selector_group_box">
            <h3>관제 대상 필터링</h3>
            
            <div className="select_field">
              <label>진행 중인 미션 선택</label>
              <select value={selectedMissionId} onChange={handleMissionChange}>
                <option value=""> 미션을 선택하세요 </option>
                {activeMissions.map(m => (
                  <option key={m.id} value={m.id}>{m.sido} {m.sigungu} {m.dong}</option>
                ))}
              </select>
            </div>

            <div className="select_field">
              <label>관리자 진입 구역 선택 ({activeZones.length}개 활성)</label>
              <select 
                value={selectedZoneId} 
                onChange={(e) => setSelectedZoneId(e.target.value)}
                disabled={!selectedMissionId}
              >
                <option value=""> 관제 구역을 선택하세요 </option>
                {activeZones.map(z => (
                  <option key={z.id} value={z.id}>{z.zoneName} [{z.operator} 관리자]</option>
                ))}
              </select>
            </div>
          </div>

          {currentZone ? (
            <div className="target_meta_telemetry">
              <h3>현장 실시간 데이터</h3>
              <div className="meta_info_row">
                <span>담당 관리자</span>
                <strong>{currentZone.operator} 관리자</strong>
              </div>
	              <div className="meta_info_row">
	                <span>현재 온도</span>
	                <strong>{sensorData?.temperature != null ? `${sensorData.temperature.toFixed(1)}°C` : "-"}</strong>
	              </div>
	              <div className="meta_info_row">
	                <span>가스 환경</span>
	                <strong className={(sensorData?.gas?.level || 0) > 50 ? "status_danger" : "status_safe"}>
                    {sensorData?.gas?.level == null ? "-" : (sensorData.gas.level > 50 ? "위험" : "정상")}
                  </strong>
	              </div>
	              <div className="meta_info_row">
	                <span>통신 상태</span>
	                <strong className={sensorData ? "status_safe" : "status_danger"}>
                    {sensorData ? "ONLINE" : "NO DATA"}
                  </strong>
	              </div>
            </div>
          ) : (
            <div className="side_panel_placeholder">
              미션과 구역을 선택하시면 실시간 원격 진단 스탯 데이터 가이드가 이곳에 출력됩니다.
            </div>
          )}
        </div>

        <div className="admin_stream_main_view">
          {currentZone ? (
            <div className="detail_video_wrapper" ref={videoWrapperRef}>
              <div className="feed_video_overlay">
                <div className="overlay_left">
                  <span className="card_rec_dot">● LIVE</span>
                  <span className="zone_location_tag">{currentMission?.sido} {currentMission?.sigungu} {currentMission?.dong} ➔ {currentZone.zoneName}</span>
                </div>
                <span className="card_resolution">{isFullscreen ? "FHD" : "HD"}</span>
              </div>
              
	              <div className="mock_video_frame display_large">
                  {imageSrc ? (
                    <img
                      src={imageSrc}
                      alt="ARES remote stream"
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  ) : (
	                  <>
	                    <div className="sonar_wave"></div>
	                    <h3 className="mock_feed_text">실시간 원격 관제 비디오 스트리밍 대기중</h3>
                    </>
                  )}
	              </div>

              <div className="video_control_bar">
                <button className="fullscreen_trigger_btn" onClick={toggleFullscreen}>
                  {isFullscreen ? (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7" /></svg>
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="admin_viewer_empty_state">
              <div className="radar_scan_circle"></div>
              <h3>실시간 분석 대상 피드가 지정되지 않았습니다.</h3>
              <p>좌측 컨트롤 패널에서 관제 모니터링할 미션과 구역 노드를 차례로 선택해 주십시오.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

export default AdminControl;
