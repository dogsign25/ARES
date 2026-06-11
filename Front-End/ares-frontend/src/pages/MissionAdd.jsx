import React, { useState } from 'react';
import './MissionAdd.css';
import { REGION_DATA } from '../context/RegionData';
import { useMissions } from '../context/MissionContext';

function MissionAdd() {
    const [missionText, setMissionText] = useState("");

    const [selectSido, setSelectSido] = useState("");
    const [selectGunGu, setSelectGunGu] = useState("");
    const [selectDong, setSelectDong] = useState("");
    const [selectedMissionId, setSelectedMissionId] = useState(null);
    const [selectedCompletedMission, setSelectedCompletedMission] = useState(null);
    const [activeTab, setActiveTab] = useState("ACTIVE");

    const { missions, addMission, deleteMission, addZoneToMission, deleteZoneFromMission, completeMission } = useMissions();

    const activeMissions = missions ? missions.filter(m => m.status !== "COMPLETED") : [];
    const completedMissions = missions ? missions.filter(m => m.status === "COMPLETED") : [];

    const sidoChangeHandler = (e) => {
        setSelectSido(e.target.value);
        setSelectGunGu("");
        setSelectDong("");
    };

    const gunguChangeHandler = (e) => {
        setSelectGunGu(e.target.value);
        setSelectDong("");
    };

    const addMissionHandler = async (e) => {
        e.preventDefault();

        if (!selectSido || !selectGunGu || !selectDong) {
            return alert("지역(시/도, 구/군, 동)을 모두 선택해주세요.");
        }
        if (!missionText.trim()) return alert("사고 종류 및 상세 내용을 입력해주세요.");
        
        const savedUserId = localStorage.getItem("userId");
        if (!savedUserId) {
            return alert("로그인 정보가 없습니다. 다시 로그인 해주세요.");
        }

        const missionData = {
            robotId: "", 
            userId: Number(savedUserId),
            sido: selectSido,
            sigungu: selectGunGu,
            dong: selectDong,
            description: missionText
        };

        try {
            await addMission(missionData);
            setMissionText("");
            setSelectSido("");
            setSelectGunGu("");
            setSelectDong("");
        } catch {
            // 입력값은 유지해 재로그인 후 다시 등록할 수 있게 합니다.
        }
    };

    const deleteMissionHandler = (id, e) => {
        e.stopPropagation();
        if (window.confirm("이 미션을 삭제하시겠습니까?")) {
            deleteMission(id);
            if (selectedMissionId === id) setSelectedMissionId(null);
        }
    };

    const completeMissionHandler = (id, e) => {
        e.stopPropagation();
        if (window.confirm("미션을 끝내시겠습니까?")) {
            completeMission(id);
        }
    };

    const addZoneHandler = (missionId, zoneName) => {
        if (!zoneName.trim()) return alert("구역 이름을 입력해주세요.");
        addZoneToMission(Number(missionId), zoneName);
    };

    const cardSelectHandler = (id) => {
        setSelectedMissionId(selectedMissionId === id ? null : id);
    };

    const deleteZoneHandler = (missionId, zoneId) => {
        if (window.confirm("이 구역을 삭제하시겠습니까?")) {
            deleteZoneFromMission(missionId, zoneId);
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return "";
        const date = new Date(dateString);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    };

    return (
        <div className="mission_container">
            <div className="mission_header">
                <h2>미션 등록 및 관리</h2>
                <p>새로운 미션을 할당하고 현재 진행 중인 미션을 확인하세요.</p>
            </div>

            <div className="mission_input_section">
                <form onSubmit={addMissionHandler} className="mission_form">
                    <div className="region_select_group">
                        <select value={selectSido} onChange={sidoChangeHandler} className='region_select'>
                            <option value="">시/도 선택</option>
                            {Object.keys(REGION_DATA).map(sido => (
                                <option key={sido} value={sido}>{sido}</option>
                            ))}
                        </select>
                        <select 
                            value={selectGunGu}
                            onChange={gunguChangeHandler}
                            disabled={!selectSido}
                            className='region_select'
                        >
                            <option value="">구/군 선택</option>
                            {selectSido && Object.keys(REGION_DATA[selectSido]).map(ungu => (
                                <option key={ungu} value={ungu}>{ungu}</option>
                            ))}
                        </select>
                        <select
                            value={selectDong}
                            onChange={(e) => setSelectDong(e.target.value)}
                            disabled={!selectGunGu}
                            className='region_select'
                        >
                            <option value="">동/읍/면 선택</option>
                            {selectGunGu && REGION_DATA[selectSido][selectGunGu].map(dong => (
                                <option key={dong} value={dong}>{dong}</option>
                            ))}
                        </select>
                    </div>
                    <input 
                        type="text" 
                        value={missionText}
                        onChange={(e) => setMissionText(e.target.value)}
                        placeholder="미션 내용을 입력하세요."
                        className="mission_input"
                    />
                    <button type="submit" className="mission_add_btn">등록</button>
                </form>
            </div>

            <div className="mission_tab_menu">
                <button
                    className={activeTab === "ACTIVE" ? "mission_tab_item active" : "mission_tab_item"}
                    onClick={() => setActiveTab("ACTIVE")}
                >
                    현재 미션 <span className="mission_count">{activeMissions.length}</span>
                </button>
                <button
                    className={activeTab === "COMPLETED" ? "mission_tab_item active" : "mission_tab_item"}
                    onClick={() => setActiveTab("COMPLETED")}
                >
                    완료된 미션 <span className="mission_count complete">{completedMissions.length}</span>
                </button>
            </div>

            {activeTab === "ACTIVE" &&(
                <div className="mission_list">
                <h3>현재 미션 목록 <span className="mission_count">{activeMissions.length}</span></h3>
                <div className="mission_grid">
                    {activeMissions.length > 0 ? (
                        activeMissions.map((mission, idx) => {
                            const isSelected = Number(selectedMissionId) === Number(mission.id);
                            const cardKey = (mission.id !== null && mission.id !== undefined) 
                                            ? `active-${mission.id}` 
                                            : `active-fallback-${idx}`;

                            return (
                                <div 
                                    key={cardKey}
                                    className={`mission_card ${isSelected ? 'selected' : ''}`}
                                    onClick={() => cardSelectHandler(mission.id)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <div className="card_header">
                                        <span className="mission_date">{formatDate(mission.startedAt)}</span>
                                        <div className="action_btns">
                                            <button onClick={(e) => completeMissionHandler(mission.id, e)} className="complete_mini_btn">완료</button>
                                            <button onClick={(e) => deleteMissionHandler(mission.id, e)} className="delete_btn">삭제</button>
                                        </div>
                                    </div>
                                    <p className="card_text"><strong>[{mission.sido} {mission.sigungu} {mission.dong}]</strong><br/>{mission.description}</p>

                                    {isSelected && (
                                        <div className="card_zone_section" onClick={(e) => e.stopPropagation()}>
                                            <h4>미션 구역 설정</h4>
                                            <div className="zone_badge_list">
                                                {mission.zones && mission.zones.length > 0 ? (
                                                    mission.zones.map(zone => (
                                                        <span className="zone_badge" key={zone.id}>
                                                            {zone.zoneName} {zone.operator ? `(${zone.operator})` : '(대기)'}
                                                            <button 
                                                                type="button" 
                                                                onClick={() => deleteZoneHandler(mission.id, zone.id)}
                                                                className="zone_delete_mini_btn"
                                                            >
                                                                ×
                                                            </button>
                                                        </span>
                                                    ))
                                                ) : (
                                                    <p className="no_zone_text">설정된 구역이 없습니다.</p>
                                                )}
                                            </div>

                                            <form onSubmit={(e) => {
                                                e.preventDefault();
                                                addZoneHandler(mission.id, e.target.zoneInput.value);
                                                e.target.zoneInput.value = "";
                                            }} className='zone_add_form'>
                                                <input
                                                    type='text'
                                                    name='zoneInput'
                                                    placeholder='예 : A구역 지하 1층 외곽 로비'
                                                    className='zone_input'
                                                />
                                                <button type='submit' className='zone_add_btn'>설정</button>
                                            </form>
                                        </div>
                                    )}
                                    <div className="card_footer">
                                        <span className="status_badge">
                                            {mission.zones && mission.zones.length > 0 ? `구역 ${mission.zones.length}개 설정됨` : "구역 설정 대기"}
                                        </span>
                                        
                                        {(() => {
                                            const hasOperator = mission.zones && mission.zones.some(z => z.operator);
                                            return (
                                                <span className={`state_tag ${hasOperator ? 'IN_PROGRESS' : 'PENDING'}`} style={{
                                                    fontSize: '11px', fontWeight: 'bold', padding: '3px 8px', borderRadius: '12px',
                                                    backgroundColor: hasOperator ? '#eff6ff' : '#fff7ed',
                                                    color: hasOperator ? '#2563eb' : '#ea580c',
                                                    border: `1px solid ${hasOperator ? '#bfdbfe' : '#ffedd5'}`
                                                }}>
                                                    {hasOperator ? '진행중' : '대기중'}
                                                </span>
                                            );
                                        })()}
                                    </div>
                                </div>
                            );         
                        })
                    ) : (
                        <div className="no_mission">등록된 미션이 없습니다.</div>
                    )}
                </div>
            </div>
            )}

            {activeTab === "COMPLETED" &&(
                    <div className="mission_list">
                <h3>완료된 미션 이력 <span className="mission_count complete">{completedMissions.length}</span></h3>
                <div className="mission_grid">
                    {completedMissions.length > 0 ? (
                        completedMissions.map((mission) => {
                            return (
                                <div key={mission.id} className="mission_card completed_card"
                                    onClick={() => setSelectedCompletedMission(mission)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <div className="card_header">
                                        <span className="mission_date">{formatDate(mission.startedAt)}</span>
                                        <button onClick={(e) => deleteMissionHandler(mission.id, e)} className="delete_btn">삭제</button>
                                    </div>
                                    <p className="card_text"><strong>[{mission.sido} {mission.sigungu} {mission.dong}]</strong><br/>{mission.description}</p>
                                    <div className="card_footer">
                                        <span className="status_badge">상황 종료됨</span>
                                        <span className="state_tag completed_tag">완료</span>
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="no_mission">이전 완료 이력이 존재하지 않습니다.</div>
                    )}
                    {selectedCompletedMission && (
                        <div className="modal_overlay" onClick={() => setSelectedCompletedMission(null)}>
                            <div className="modal_box" onClick={(e) => e.stopPropagation()}>
                                <div className="modal_header">
                                    <h3>미션 이력 상세</h3>
                                    <button className="modal_close_btn" onClick={() => setSelectedCompletedMission(null)}>×</button>
                                </div>
                                <div className="modal_body">
                                    <div className="modal_info_grid">
                                        <div className="modal_info_item">
                                            <span className="modal_label">지역</span>
                                            <span className="modal_value">{selectedCompletedMission.sido} {selectedCompletedMission.sigungu} {selectedCompletedMission.dong}</span>
                                        </div>
                                        <div className="modal_info_item">
                                            <span className="modal_label">미션 정보</span>
                                            <span className="modal_value">{selectedCompletedMission.description}</span>
                                        </div>
                                        <div className="modal_info_item">
                                            <span className="modal_label">시작 시각</span>
                                            <span className="modal_value">{formatDate(selectedCompletedMission.startedAt)}</span>
                                        </div>
                                        <div className="modal_info_item">
                                            <span className="modal_label">종료 시각</span>
                                            <span className="modal_value">{formatDate(selectedCompletedMission.endedAt)}</span>
                                        </div>
                                    </div>
                                    <div className="modal_zone_section">
                                        <p className="modal_zone_title">구역 현황</p>
                                        {selectedCompletedMission.zones && selectedCompletedMission.zones.length > 0 ? (
                                            <div className="modal_zone_list">
                                                {selectedCompletedMission.zones.map(zone => (
                                                    <div key={zone.id} className="modal_zone_item">
                                                        <span className="modal_zone_name">{zone.zoneName}</span>
                                                        <span className="modal_zone_operator">👤 {zone.operator || '미배정'}</span>
                                                        <span className="modal_zone_robot">🤖 {zone.robotId || '미배정'}</span>
                                                        <span className="modal_zone_status">
                                                            {zone.status === 'COMPLETED' ? '완료' :
                                                            zone.status === 'RUNNING' ? '진행중' :
                                                            zone.status === 'ABORTED' ? '중단' : '대기'}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="no_zone_text">구역 정보 없음</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            )}

            
        </div>
        
    );
}

export default MissionAdd;
