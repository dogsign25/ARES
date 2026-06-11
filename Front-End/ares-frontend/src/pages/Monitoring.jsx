import React, { useState, useEffect, useRef } from 'react';
import './Monitoring.css';
import SockJs from 'sockjs-client';
import { Client } from '@stomp/stompjs';
import RobotController from '../components/RobotController';
import { useNavigate } from 'react-router-dom';
import { useMissions } from '../context/MissionContext';
import { API_URL, BACKEND_URL } from '../config';

function Monitoring({ isLive, startStream, stopStream, selection, resetSelection, imageSrc }) {
  const navigate = useNavigate();
  const [isImgError, setIsImgError] = useState(false);
  const [isStreamConnected, setIsStreamConnected] = useState(false);
  const [retryId, setRetryId] = useState(0);
  const streamUrl = `${imageSrc}${imageSrc.includes('?') ? '&' : '?'}retry=${retryId}`;
  const cameraConnected = isLive && isStreamConnected;

  const [isFull, setIsFull] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());
  const [sensorConnected, setSensorConnected] = useState(false);
  const [lastSensorAt, setLastSensorAt] = useState(null);
  const [sensorConnectionError, setSensorConnectionError] = useState('');
  const [lastSensorRobotId, setLastSensorRobotId] = useState('');
  const lastMessageKeyRef = useRef('');

  const [sensorData, setSensorData] = useState({
    temperature: 0, 
    sound: 0,
    gasLevel: 0,
    battery: 0
  });

  const {missions} = useMissions();

  const applySensorData = (data) => {
    const receivedRobotId = String(data.robotId || '').trim();
    setLastSensorAt(new Date());
    setLastSensorRobotId(receivedRobotId);
    setSensorData((prev)=>({
      ...prev,
      temperature: data.temperature ?? prev.temperature,
      humidity: data.humidity ?? prev.humidity,
      gasLevel: data.gas?.level ?? prev.gasLevel,
      posX: data.position?.posX ?? prev.posX,
      posY: data.position?.posY ?? prev.posY,
      heading: data.position?.heading ?? prev.heading,
      frontDistance: data.frontDistance ?? prev.frontDistance
    }));
  };

  const currentMission = missions.find(m => m.id === selection.missionId || m.id === Number(selection.missionId));
  const currentZone = currentMission?.zones?.find(z => Number(z.id) === Number(selection.zoneId));
  const [, setLogs] = useState(()=>{
      const logSave = localStorage.getItem("ares_logs");
      return logSave ? JSON.parse(logSave) : [];
    })

  const startCamera = () => {
    setIsImgError(false);
    setIsStreamConnected(false);
    setRetryId((current) => current + 1);
    startStream();
  };

  const retryCamera = () => {
    setIsImgError(false);
    setIsStreamConnected(false);
    setRetryId((current) => current + 1);
  };

  const stopCamera = () => {
    setIsStreamConnected(false);
    setIsImgError(false);
    stopStream();
  };

  // 시계 업데이트 및 ESC 키 감지
  useEffect(() => {
    // 1. 시계 타이머 설정
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);

    // 2. ESC 키 이벤트 핸들러
    const handleEsc = (event) => {
      if (event.key === 'Escape' || event.keyCode === 27) {
        setIsFull(false); 
      }
    };

    window.addEventListener('keydown', handleEsc);

    const robotId = String(selection?.robotId || 'robot-01').trim();
    const normalizedRobotId = robotId.toLowerCase();
    const topicPaths = [`/topic/sensors/${robotId}`, '/topic/sensors'];

    const handleSensorMessage = (message) => {
      try {
        const data = JSON.parse(message.body);
        console.log('WebSocket 센서 원본 수신:', data);

        const receivedRobotId = String(data.robotId || '').trim();
        if (receivedRobotId.toLowerCase() !== normalizedRobotId) {
          console.warn(`센서 robotId 불일치로 무시됨: 수신=${data.robotId}, 선택=${robotId}`);
          return;
        }

        const messageKey = `${receivedRobotId}:${data.timestamp || message.body}`;
        if (lastMessageKeyRef.current === messageKey) {
          return;
        }
        lastMessageKeyRef.current = messageKey;

        applySensorData(data);
      } catch (error) {
        setSensorConnectionError('센서 JSON 처리 실패');
        console.error('센서 WebSocket 메시지 처리 실패:', error, message.body);
      }
    };

    const stompClient = new Client({
      webSocketFactory: () => new SockJs(`${BACKEND_URL}/ws`),
      reconnectDelay: 5000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      debug: (message) => console.debug(`[STOMP] ${message}`),
      onConnect: (frame) => {
        setSensorConnected(true);
        setSensorConnectionError('');
        console.log(`STOMP 연결 성공: ${frame.command}, 선택 로봇: ${robotId}`);
        topicPaths.forEach((topicPath) => {
          stompClient.subscribe(topicPath, handleSensorMessage);
          console.log(`STOMP 센서 구독 완료: ${topicPath}`);
        });
      },
      onStompError: (frame) => {
        setSensorConnected(false);
        setSensorConnectionError(frame.headers.message || 'STOMP 오류');
        console.error('STOMP 서버 오류:', frame.headers, frame.body);
      },
      onWebSocketError: (error) => {
        setSensorConnected(false);
        setSensorConnectionError(`WebSocket 연결 실패: ${BACKEND_URL}/ws`);
        console.error(`WebSocket 연결 실패 (${BACKEND_URL}/ws):`, error);
      },
      onWebSocketClose: () => {
        setSensorConnected(false);
      },
    });

    stompClient.activate();

    return () => {
      clearInterval(timer);
      window.removeEventListener('keydown', handleEsc);
      void stompClient.deactivate();
    };
  }, [selection?.robotId]);

  useEffect(() => {
    const robotId = String(selection?.robotId || 'robot-01').trim();
    const token = localStorage.getItem('token');

    const fetchLatestSensor = async () => {
      try {
        const response = await fetch(`${API_URL}/sensors/latest/${encodeURIComponent(robotId)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (response.status === 204) return;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        applySensorData(data);
      } catch (error) {
        console.error('최신 센서값 조회 실패:', error);
      }
    };

    void fetchLatestSensor();
    const interval = setInterval(fetchLatestSensor, 1000);
    return () => clearInterval(interval);
  }, [selection?.robotId]);

  

  const toggleFullScreen = () => {
    setIsFull(!isFull);
  };

  

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
    <div className="monitoring_container">
      <RobotController robotId={selection?.robotId || 'robot-01'} />
      <div className="monitoring_wrapper">

        <div className="monitoring_status_header">
          <div className="status_info_left">
            <h2 className="unit_id_text">ROBOT : {selection?.robotId}</h2>
            <span className="mission_id_text"> 
              | MISSION : {currentMission ? currentMission.description : "미션 정보 없음"}
            </span>
            <span className="zone_id_text"> 
              | ZONE : {currentZone ? currentZone.zoneName : "구역 정보 없음"}
            </span>
          </div>
          {/* status_control_right 영역 교체 */}
            <div className="status_control_right">
              <button
                onClick={handleAbortZone}
                className="ctrl_btn ctrl_btn_pause"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="5" y="3" width="4" height="18" rx="1"/>
                  <rect x="15" y="3" width="4" height="18" rx="1"/>
                </svg>
                구역 탐색 중단
              </button>

              <button
                onClick={handleCompleteZone}
                className="ctrl_btn ctrl_btn_terminate"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                구역 탐색 종료
              </button>
            </div>
        </div>


        <div className="top_row">
          <div className={`video_main ${isFull ? 'fullscreen' : ''}`}>
            <div className="video_info_layer">
              <span className="rec_dot">{cameraConnected ? "REC ●" : "STANDBY ○"}</span>
              <span className="connection_status" style={{ color: cameraConnected ? '#48bb78' : '#ed8936' }}>
                ● {cameraConnected ? "연결됨 (HD)" : isLive ? "연결 중..." : "연결 끊김"}
              </span>
            </div>

            <div className="video_content" style={{ width: '100%', height: '100%', backgroundColor: '#000', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              {isLive ? (
                  !isImgError ? (
                    <img 
                      src={streamUrl} 
                      alt="Stream" 
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
                      onLoad={() => setIsStreamConnected(true)}
                      onError={() => {
                        setIsStreamConnected(false);
                        setIsImgError(true);
                      }}
                    />
                  ) : (
                    <div style={{ textAlign: 'center', color: '#a0aec0' }}>
                      <p style={{ color: '#fc8181', fontWeight: 'bold', marginBottom: '10px' }}>⚠️ 카메라 연결을 확인하세요</p>
                      <span style={{ fontSize: '12px' }}>{imageSrc}</span>
                      <br/>
                      <button onClick={retryCamera} style={{ marginTop: '15px', padding: '5px 12px', cursor: 'pointer' }}>다시 시도</button>
                    </div>
                  )
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ color: '#718096', marginBottom: '15px' }}>현장 카메라가 비활성화 상태입니다.</p>
                    <button onClick={startCamera} style={{ padding: '10px 25px', backgroundColor: '#3182ce', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
                      모니터링 시작
                    </button>
                  </div>
                )}
            </div>

            <div className="video_bottom_layer">
              <span className="timestamp">LIVE FEED | {currentTime}</span>
              
              <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                {isLive && (
                   <button onClick={stopCamera} style={{ background: '#fc8181', border: '1px solid #fc8181', color: '#ffffff', padding: '5px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                     카메라 연결종료
                   </button>
                )}
                <button className="expand_btn" onClick={toggleFullScreen} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  {isFull ? (
                    <> <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7" /></svg></>
                  ) : (
                    <> <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg></>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="sensor_card">
            <p className="section_label">Sensor Data</p>
            <h3>센서 데이터</h3>
            <div className="sensor_list">
              <div className="sensor_item">
                <span>온도</span>
                <strong>{(sensorData.temperature || 0).toFixed(1)}°C</strong>
              </div>
              <div className="sensor_item">
                <span>습도</span>
                <strong>{(sensorData.humidity || 0).toFixed(1)}%</strong>
              </div>
              <div className="sensor_item">
                <span>가스농도</span>
                <span className={(sensorData.gasLevel || 0) > 50 ? "text_red" : ""}>
                    {sensorData.gasLevel > 50 ? "위험" : "정상"} ({(sensorData.gasLevel || 0).toFixed(1)})
                </span>
              </div>
              <div className="sensor_item">
                <span>전방 거리</span>
                <strong>{sensorData.frontDistance ?? '-'} cm</strong>
              </div>
              <div className="battery_section">
                <div className="flex_between"><span>배터리</span><span>{sensorData.battery}%</span></div>
                <div className="progress_bar">
                  <div className="progress_fill" style={{
                    width: `${sensorData.battery}%`,
                    background: sensorData.battery < 20 ? '#fc8181' : '#48bb78'
                  }}></div>
                </div>
              </div>
            </div>

            <div className="system_status">
              <p className="section_label">시스템 상태</p>
              <div className="status_grid">
                <div className="status_tag"><span>모터</span><strong>정상</strong></div>
                <div className="status_tag"><span>센서</span><strong>정상</strong></div>
                <div className="status_tag">
                  <span>센서 통신</span>
                  <strong className={sensorConnected && lastSensorAt ? "text_green" : "text_red"}>
                    {sensorConnected && lastSensorAt ? "수신 중" : sensorConnected ? "연결됨" : "오프라인"}
                  </strong>
                </div>
                <div className="status_tag"><span>모터</span><strong>정상</strong></div>
              </div>
              {sensorConnectionError && (
                <p style={{ color: '#fc8181', fontSize: '11px', marginTop: '8px' }}>
                  {sensorConnectionError}
                </p>
              )}
              {lastSensorAt && (
                <p style={{ color: '#a0aec0', fontSize: '11px', marginTop: '8px' }}>
                  마지막 수신: {lastSensorRobotId} / {lastSensorAt.toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>
        </div>

        
        <div className="bottom_row">
          <div className="card">
            <p className="section_label">Robot control</p>
            <h4>로봇 조종</h4>
            <div className="controller_box">
              <button className="key">W</button>
              <div className="key_row">
                <button className="key">A</button>
                <button className="key">S</button>
                <button className="key">D</button>
              </div>
            </div>
          </div>

          <div className="card">
            <p className="section_label">Robot status</p>
            <h4>로봇 상태</h4>
            <div className="flex_between">
              
              <span className={isLive ? "active_badge" : "inactive_badge"}>
                ● {isLive ? "작동 중" : "대기 중"}
              </span>
            </div>
            <div className="info_list">
              <div className="info-item"><span>현재 위치</span><strong>{sensorData.posX}, {sensorData.posY}</strong></div>
              <div className="info-item"><span>이동 속도</span><strong>{isLive ? "0.8 m/s" : "0 m/s"}</strong></div>
              <div className="info-item"><span>탐색 모드</span><strong>수동 제어 (Flask)</strong></div>
            </div>
          </div>

          <div className="card">
            <p className="section_label">Mission log</p>
            <h4>임무 로그</h4>
            <div className="log_list">
              <div className={`log_entry ${isLive ? 'blue' : 'orange'}`}>
                <p>{isLive ? "실시간 영상 관제 활성화 (YOLOv8)" : "관제 연결 대기 중"}</p>
                <span>{currentTime}</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Monitoring;
