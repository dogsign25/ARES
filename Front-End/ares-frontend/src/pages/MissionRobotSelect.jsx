import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './MissionRobotSelect.css';
import { useMissions } from '../context/MissionContext';

function MissionRobotSelect({ setSelection }) {
  const navigate = useNavigate();
  const { 
    missions, 
    availableRobots, 
    assignOperatorAndRobot, 
    fetchMissions, 
    fetchAvailableRobots 
  } = useMissions();

  const currentOperator = localStorage.getItem("username") || "현장 운영자";

  const getSessionValue = (key) => {
    const val = sessionStorage.getItem(key);
    if (!val || val === "undefined") return null;
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  };

  const [localSelection, setLocalSelection] = useState(() => {
    const saved = getSessionValue('temp_select_step');
    return saved ? saved : { missionId: null, zoneId: null, robotId: null };
  });

  const [step, setStep] = useState(() => {
    const saved = getSessionValue('temp_select_step');
    if (saved?.missionId && saved?.zoneId && !saved?.robotId) return 3;
    if (saved?.missionId && !saved?.zoneId) return 2;
    return 1;
  });

  useEffect(() => {
    fetchMissions();
    fetchAvailableRobots();

    const interval = setInterval(() => {
      fetchMissions();
      fetchAvailableRobots();
    }, 5000); 

    return () => clearInterval(interval); 
  }, []);

  // 💡 step 이동 및 스토리지 저장 로직 통합 정돈
  useEffect(() => {
    sessionStorage.setItem('temp_select_step', JSON.stringify(localSelection));
  }, [localSelection]);

  const selectedMission = missions.find(m => {
    return localSelection.missionId && Number(m.id) === Number(localSelection.missionId);
  });

  const selectHandler = async (key, value) => {
    const currentSaved = getSessionValue('temp_select_step') || localSelection;
    const updated = { ...currentSaved, [key]: value };
    
    setLocalSelection(updated);

    if (key === 'missionId') {
      setStep(2);
    } else if (key === 'zoneId') {
      setStep(3);
    } else {
      // 💡 3단계: 로봇 선택 완료 시점
      if (!updated.zoneId) {
        alert("선택된 구역 정보가 올바르지 않습니다. 구역 선택 단계로 돌아갑니다.");
        setStep(2);
        return;
      }

      // Context 및 전역 상태 저장
      if (setSelection) setSelection(updated);
      sessionStorage.setItem("current_selection", JSON.stringify(updated));

      // 백엔드 API 통신
      if (assignOperatorAndRobot) {
        try {
          await assignOperatorAndRobot(updated.zoneId, currentOperator, value);        
          await Promise.all([fetchMissions(), fetchAvailableRobots()]);
        } catch (error) {
          console.error("배정 API 호출 실패:", error);
          alert("서버 통신 중 오류가 발생했습니다.");
          return;
        }
      }

      sessionStorage.removeItem('temp_select_step');
      alert("미션, 구역 및 투입 로봇 배정이 완료되었습니다!");
      navigate('/');
    }
  };

  const busyRobotIds = missions
    .flatMap(m => m.zones || [])
    .filter(z => z.robotId !== null && z.robotId !== undefined)
    .map(z => String(z.robotId));

    console.log(localStorage.getItem("username"));
  return (
    <div className="select_container">
      <div className="step_indicator">
        <span className={step === 1 ? 'active' : ''}>1. 미션 설정</span>
        <span className="arrow">→</span>
        <span className={step === 2 ? 'active' : ''}>2. 구역 선택</span>
        <span className="arrow">→</span>
        <span className={step === 3 ? 'active' : ''}>3. 로봇 선택</span>
      </div>

      {step === 1 && (
        <section className="mission_section">
          <h2 className="section_title">현장 미션 선택</h2>
          <p className="section_subtitle">상황을 확인하고 지원할 현장을 선택하세요.</p>
          <div className="card_grid">
            {missions.map((m) => {
              const isCompleted = m.status === "COMPLETED";
              return (
                <div 
                  key={`m-${m.id}`}
                  className="item_card mission_card" 
                  onClick={() => !isCompleted && selectHandler('missionId', m.id)}>
                  <span className="mission_tag">Mission</span>
                  <h3 className="card_title">{m.description} {isCompleted && "(종료된 미션)"}</h3>
                  <span className="action_label">
                    {isCompleted ? "선택불가" : "선택하기"}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="zone_section">
          <h2 className="section_title">담당 구역 선택</h2>
          <p className="section_subtitle">선택한 미션 현장에서 본인이 진입할 세부 구역을 선택하세요.</p>
          <div className="card_grid">
            {selectedMission && selectedMission.zones && selectedMission.zones.map((z) => {
              const isTaken = z.operator !== null && z.operator !== undefined && z.operator !== ""
              || z.status === 'COMPLETED';

              return (
                <div
                  key={`z-${z.id}`}
                  className={`item_card zone_card ${isTaken ? 'disabled_card' : ''}`}
                  onClick={() => !isTaken && selectHandler('zoneId', z.id)}
                >
                  <span className='zone_tag'>Zone</span>
                  <h3 className='card_title'>{z.zoneName}</h3>
                  <span className='action_label'>
                    {z.status === 'COMPLETED' ? '탐색 완료' :
                    isTaken ? `배정 불가 (${z.operator})` : '선택하기'}
                  </span>
                </div>
              );
            })}
          </div>
          <button className="back_btn" onClick={() => {
            setLocalSelection({ missionId: null, zoneId: null, robotId: null });
            setStep(1);
          }}>이전 단계로</button>
        </section>
      )}

      {step === 3 && (
        <section className="robot_section">
          <h2 className="section_title">투입 로봇 선택</h2>
          <p className="section_subtitle">현장에 투입 가능한 ARES 로봇을 선택하세요.</p>
          <div className="card_grid">
            {availableRobots.map((r) => {
              const isRobotBusy = busyRobotIds.includes(String(r.robot_key));
              const isOffline = r.status === '오프라인';
              const canNotSelect = isRobotBusy || isOffline;

              return (
                <div 
                  key={`r-${r.id}`} 
                  className={`item_card robot_card ${canNotSelect ? 'disabled_card' : ''}`} 
                  onClick={() => !canNotSelect && selectHandler('robotId', r.robot_key)}
                >
                  <div className="robot_icon">🤖</div>
                  <h3 className="card_title">{r.robot_key}</h3>
                  <p className="robot_status" style={{ color: r.status === '온라인' ? '#10b981' : '#ef4444' }}>
                    {r.status} {isRobotBusy && "(임무 중)"}
                  </p>
                </div>
              );
            })}
          </div>
          <button className="back_btn" onClick={() => {
            setLocalSelection(prev => ({ ...prev, zoneId: null, robotId: null }));
            setStep(2);
          }}>이전 단계로</button>
        </section>
      )}
    </div>
  );
}

export default MissionRobotSelect;
