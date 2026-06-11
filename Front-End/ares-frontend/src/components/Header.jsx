import React,{useState} from "react";
import { Link, NavLink, useNavigate } from "react-router-dom"; 
import './Header.css';
import {HiMenu, HiX} from "react-icons/hi";

function Header({user, setUser, setUserRole, isLogin, setIsLogin, resetSelection}) {
    const [isOpen, setIsOpen] = useState(false);
    const userRole = localStorage.getItem("userRole");

    const navigate = useNavigate();
    const logoutHandler = () => {
        if (window.confirm("로그아웃 하시겠습니까?")) {
            localStorage.removeItem("userId");
            localStorage.removeItem("username");
            localStorage.removeItem("userRole");
            localStorage.removeItem("token");

            sessionStorage.clear();

	            
            setUser(null); 
            setUserRole(null);
            setIsLogin(false);
            resetSelection();
            alert("로그아웃 되었습니다.")
            navigate("/login"); 
        }
    };

    return (
        <header className="header">
            <div className="header_logo">
                <Link to="/">ARES</Link>
            </div>

            <div className="hamburger" onClick={()=> setIsOpen(!isOpen)}>
                {isOpen ? <HiX size={30} /> : <HiMenu size={30} />}
            </div>
            
            <nav className={`header_nav ${isOpen ? "show" : ""}`}>
                <ul>
                    {isLogin && userRole == "OPERATOR" &&(
                        <>
                            <li>
                                <NavLink to="/status" 
                                className={({ isActive }) => isActive ? "active" : ""}
                                onClick={()=> setIsOpen(false)}
                                >
                                    부상자 현황
                                </NavLink>
                            </li>
                            <li>
                                <NavLink to="/monitoring" 
                                className={({ isActive }) => isActive ? "active" : ""}
                                onClick={()=>setIsOpen(false)}
                                >
                                    실시간 모니터링 및 로봇조종
                                </NavLink>
                            </li>
                        </>
                    )}
                    
                    {isLogin && userRole == "ADMIN" && (
                        <>
                            <li>
                                <NavLink to="/admin/control"
                                className={({ isActive }) => isActive ? "active" : ""}
                                onClick={() => setIsOpen(false)}>
                                    관제 대시보드
                                </NavLink>
                            </li>
                            <li>
                                <NavLink to ="/missionadd"
                                className={({isActive})=> isActive ? "active" : ""}
                                onClick={()=>setIsOpen(false)}>
                                    미션 등록
                                </NavLink>
                            </li>
                            <li>
                                <NavLink to ="/robotadd"
                                className={({isActive})=> isActive ? "active" : ""}
                                onClick={()=>setIsOpen(false)}>
                                    로봇 등록
                                </NavLink>
                            </li>
                            <li>
                                <NavLink to ="/adminlist"
                                className={({isActive})=> isActive ? "active" : ""}
                                onClick={()=>setIsOpen(false)}>
                                    관리자 설정
                                </NavLink>
                            </li>
                        </>
                        
                    )}

                    <li className="mobile_buttons">
                        {isLogin ? (
                            <button 
                            onClick={logoutHandler} className="header_logout_btn"
                            >로그아웃</button>
                        ) : (
                            <div className="auth_button_group">
                                <Link to="/login" onClick={() => setIsOpen(false)} className="header_login_btn">로그인</Link>
                                <Link to="/signup" onClick={() => setIsOpen(false)} className="header_signup_btn">회원가입</Link>
                            </div>
                        )}
                    </li>
                </ul>
            </nav>

            <div className="header_buttons">
                {isLogin ? (
                    <div className="user_menu">
                        <Link to="/profile" className="user_name_btn">
                            {user}님
                        </Link>
                        <button onClick={logoutHandler} className="header_logout_btn">
                            로그아웃
                        </button>
                    </div>
                ) : (
                    <div className="auth_button_group">
                        <Link to="/login" className="header_login_btn">로그인</Link>
                        <Link to="/signup" className="header_signup_btn">회원가입</Link>
                    </div>
                )}
            </div>
        </header>
    );
}

export default Header;
