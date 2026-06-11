import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./AdminList.css";
import { API_URL } from "../config";

function AdminList() {
    const navigate = useNavigate();
    const [users, setUsers] = useState([]); 
    const [activeTab, setActiveTab] = useState("PENDING"); 
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState(null);
    const [rejectReason, setRejectReason] = useState("");

    const userRole = localStorage.getItem("userRole");
    const token = localStorage.getItem("token");
    const API_BASE_URL = `${API_URL}/admin/users`;

    const rejectReasons = [
        "미등록 직원",
        "존재하는 계정",
        "시스템 접근 권한 없음",
        "등록 정보 불일치"
    ];

    const fetchAllUsers = () => {
        fetch(API_BASE_URL, {
            headers: { "Authorization": `Bearer ${token}` }
        })
        .then(res => {
            if (!res.ok) throw new Error("인증 실패");
            return res.json();
        })
        .then(data => setUsers(data))
        .catch(err => console.error("전체 유저 로드 실패:", err));
    };

    useEffect(() => {
        const storedRole = (userRole || "").trim().toUpperCase();

        if (storedRole !== "ADMIN") {
            alert("관리자만 접근 가능한 페이지입니다.");
            navigate("/"); 
            return;
        }

        fetchAllUsers(); 
    }, [userRole, navigate]);

    if (userRole !== "ADMIN") return null;

    // 승인 처리 
    const approveHandler = (userId, username) => {
        if (window.confirm(`${username}님 사용자의 가입을 승인하시겠습니까?`)) {
            fetch(`${API_BASE_URL}/${userId}/approve`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` }
            })
            .then(res => {
                if (res.ok) {
                    alert("가입 승인을 완료했습니다.");
                    fetchAllUsers(); 
                } else {
                    alert("승인 처리 중 오류가 발생했습니다.");
                }
            })
            .catch(err => console.error("승인 요청 실패:", err));
        }
    };

    //거절 사유 모달 열기
    const rejectHandler = (userId) =>{
        setSelectedUserId(userId);
        setRejectReason("");
        setShowRejectModal(true);
    }

    //거절 처리 확정
    const confirmReject = () => {
        if(!rejectReason){
            alert("거절 사유를 선택해주세요.");
            return;
        }
        fetch(`${API_BASE_URL}/${selectedUserId}/reject`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` },
                body: JSON.stringify({ reason: rejectReason })
        })
        .then(res => {
            if (res.ok) {
                alert("가입 신청을 거절 처리했습니다.");
                setShowRejectModal(false); //모달 닫기
                fetchAllUsers(); // 🌟 거절 후 전체 목록 다시 갱신
            } else {
                    alert("거절 처리 중 오류가 발생했습니다.");
            }
        })
        .catch(err => console.error("거절 요청 실패:", err));
    };

    return (
        <div className="admin_container">
            <h2>관리자 설정</h2>

            <div className="tab_menu">
                <button 
                    className={activeTab === "PENDING" ? "tab_item active" : "tab_item"}
                    onClick={() => setActiveTab("PENDING")}
                >
                    가입 승인 대기 <span className="count_badge">{users.filter(u => u.role === 'OPERATOR' && u.status === 'PENDING').length}</span>
                </button>

                <button 
                    className={activeTab === "REJECTED" ? "tab_item active" : "tab_item"} 
                    onClick={() => setActiveTab("REJECTED")}
                >
                    가입 거절 목록
                </button>

                <button 
                    className={activeTab === "OPERATOR" ? "tab_item active" : "tab_item"}
                    onClick={() => setActiveTab("OPERATOR")}
                >
                    현장 관리자 목록
                </button>

                <button 
                    className={activeTab === "ADMIN" ? "tab_item active" : "tab_item"}
                    onClick={() => setActiveTab("ADMIN")}
                >
                    시스템 관리자 목록
                </button>
            </div>

            <div className="admin_section scrollable">
                
                {activeTab === "PENDING" && (
                    <table className="admin_table">
                        <thead>
                            <tr>
                                <th>번호</th>
                                <th>ID</th>
                                <th>Role</th>
                                <th>요청 날짜</th>
                                <th>승인 여부</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.filter(u => u.role === 'OPERATOR' && u.status === 'PENDING').map(user => (
                                <tr key={user.id}>
                                    <td>{user.id}</td>
                                    <td>{user.username}</td>
                                    <td><span className="badge_op">{user.role}</span></td>
                                    <td>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "-"}</td>
                                    <td>
                                        <button className="approve_btn" onClick={() => approveHandler(user.id, user.username)}>승인</button>
                                        <button className="reject_btn" onClick={() => rejectHandler(user.id, user.username)}>거절</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {activeTab === "REJECTED" && (
                    <table className="admin_table">
                        <thead>
                            <tr>
                                <th>번호</th>
                                <th>ID</th>
                                <th>Role</th>
                                <th>요청 날짜</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.filter(u => u.role === 'OPERATOR' && u.status === 'REJECTED').map(user => (
                                <tr key={user.id}>
                                    <td>{user.id}</td>
                                    <td>{user.username}</td>
                                    <td><span className="badge_op">{user.role}</span></td>
                                    <td>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "-"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                {activeTab === "OPERATOR" && (
                    <table className="admin_table">
                        <thead>
                            <tr>
                                <th>번호</th>
                                <th>ID</th>
                                <th>Role</th>
                                <th>요청 날짜</th>
                                <th>승인 날짜</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.filter(u => u.role === 'OPERATOR' && u.status === 'APPROVED').map(user => (
                                <tr key={user.id}>
                                    <td>{user.id}</td>
                                    <td>{user.username}</td>
                                    <td><span className="badge_op">{user.role}</span></td>
                                    <td>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "-"}</td>
                                    <td>{user.createdAt ? new Date(user.approvedAt).toLocaleDateString() : "-"}</td>
                                    
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                {activeTab === "ADMIN" && (
                    <table className="admin_table">
                        <thead>
                            <tr>
                                <th>번호</th>
                                <th>ID</th>
                                <th>Role</th>
                                <th>요청 날짜</th>
                                <th>승인 날짜</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.filter(u => u.role === 'ADMIN').map(user => (
                                <tr key={user.id}>
                                    <td>{user.id}</td>
                                    <td>{user.username}</td>
                                    <td><span className="badge_admin">{user.role}</span></td>
                                    <td>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "-"}</td>
                                    <td>{user.createdAt ? new Date(user.approvedAt).toLocaleDateString() : "-"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}  
                
            </div>

            {/* 거절 사유 선택 모달 */}
            {showRejectModal && (
                <div className="modal_overlay">
                    <div className="modal_box">
                        <h3>거절 사유 선택</h3>
                        <div className="reason_list">
                            {rejectReasons.map((reason, idx) => (
                                <label key={idx} className={`reason_item ${rejectReason === reason ? "selected" : ""}`}>
                                    <input
                                        type="radio"
                                        name="reason"
                                        value={reason}
                                        checked={rejectReason === reason}
                                        onChange={(e) => setRejectReason(e.target.value)}
                                    />
                                    {reason}
                                </label>
                            ))}
                        </div>
                        <div className="modal_btn_group">
                            <button className="cancel_btn" onClick={() => setShowRejectModal(false)}>취소</button>
                            <button className="reject_btn" onClick={confirmReject}>거절</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default AdminList;
