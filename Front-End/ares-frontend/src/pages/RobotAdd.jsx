import React, { useState, useEffect } from 'react';
import './RobotAdd.css'; 
import { API_URL } from '../config';

function RobotAdd() {
    const [robotKey, setRobotKey] = useState("");
    const [robots, setRobots] = useState([]); 
    
    const API_BASE_URL = `${API_URL}/robots`; 

    const getAuthHeader = () => {
        const token = localStorage.getItem("token");
        return token ? { "Authorization": `Bearer ${token}` } : {};
    };

    const fetchRobots = () => {
        fetch(API_BASE_URL, {
            method: "GET",
            headers: {
                ...getAuthHeader()
            }
        })
        .then(res => {
            if (!res.ok) throw new Error(`HTTP 에러! 상태코드: ${res.status}`);
            return res.json();
        })
        .then(data => setRobots(data))
        .catch(err => console.error("로봇 목록 로드 실패:", err));
    };

    useEffect(() => {
        fetchRobots();
    }, []);

    // 로봇 등록 
    const addRobotHandler = (e) => {
        e.preventDefault();
        if (!robotKey.trim()) return alert("로봇 고유 Key를 입력해주세요.");
        
        fetch(API_BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeader()
            },
            body: JSON.stringify({ robotKey: robotKey }) 
        })
        .then(async res => {
            if (res.ok) {
                const newRobot = await res.json();
                setRobots([newRobot, ...robots]); // 새 로봇 추가
                setRobotKey(""); 
            } else {
                const errorMsg = await res.text();
                alert(errorMsg || "등록 실패");
            }
        })
        .catch(err => console.error("로봇 등록 에러:", err));
    };

    // 로봇 삭제
    const deleteRobot = (id) => {
        if (window.confirm("이 로봇을 목록에서 제거하시겠습니까?")) {
            fetch(`${API_BASE_URL}/${id}`, {
                method: 'DELETE',
                headers: {
                    ...getAuthHeader() 
                }
            })
            .then(res => {
                if (res.ok) {
                    setRobots(robots.filter(robot => robot.id !== id));
                    alert("로봇이 성공적으로 제거되었습니다.");
                } else {
                    alert("삭제에 실패했습니다.");
                }
            })
            .catch(err => console.error("로봇 삭제 에러:", err));
        }
    };

    return (
        <div className="robot_container">
            <div className="robot_header">
                <h2>로봇 관리 및 등록</h2>
                <p>시스템에 새로운 로봇을 등록하고 실시간 연결 상태를 모니터링하세요.</p>
            </div>

            <div className="robot_input_section">
                <form onSubmit={addRobotHandler} className="robot_form">
                    
                    <label className="robot_label">로봇 고유 식별 번호 (Robot Key)</label>
                    <input 
                        type="text" 
                        value={robotKey}
                        onChange={(e) => setRobotKey(e.target.value)}
                        placeholder="예: ARES-001"
                        className="robot_input"
                    />
                    
                    <button type="submit" className="robot_add_btn">로봇 등록</button>
                </form>
            </div>

            <div className="robot_list_section">
                <h3>등록된 로봇 현황 <span className="robot_count">{robots.length}</span></h3>
                <div className="robot_grid">
                    {robots.length > 0 ? (
                        robots.map((robot) => (
                            <div key={robot.id} className="robot_card">
                                <div className="robot_card_top">
                                    <span className="robot_id"># {robot.id}</span>
                                    <span className={`status_indicator ${robot.status === '온라인' ? 'online' : 'offline'}`}>
                                        {robot.status}
                                    </span>
                                </div>
                                <h4 className="robot_key_display">{robot.robot_key}</h4>
                                <div className="robot_info">
                                    <p><strong>최근 통신:</strong> {robot.last_seen_at}</p>
                                </div>
                                <div className="robot_actions">
                                    
                                    <button 
                                        className="remove_btn" 
                                        onClick={() => deleteRobot(robot.id)}
                                    >
                                        삭제
                                    </button>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="no_data">등록된 로봇이 없습니다.</div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default RobotAdd;
