import { useState } from "react";
import "./Login.css";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../config";

function Login({setUser, setUserRole, setIsLogin}){
    const [userid, setUserid] = useState("");
    const [password, setPassword] = useState("");
    const [message, setMessage] = useState("");
    const navigate = useNavigate();

    const loginHandler = async (e) =>{
        e.preventDefault();
        setMessage("");

        try{
            const response = await fetch(`${API_URL}/auth/login`, {
                method: "POST", 
                headers: {"Content-Type":"application/json"},
                body: JSON.stringify({
                    username:userid,
                    password:password
                })
            });

           
            
            if(response.ok){
                const data = await response.json();
                localStorage.setItem("userId", data.id || data.userId || "1");
                localStorage.setItem("token", data.token);
                localStorage.setItem("username", data.username);
                localStorage.setItem("userRole", data.userRole || data.role);
                setUserRole(data.userRole || data.role);
                setIsLogin(true);
                setUser(data.username);
                navigate("/");
            }else{
                setMessage("아이디 또는 비밀번호를 확인해주세요.")
            }
        } catch(error){
            console.error("통신 에러: " ,error);
        }
    }
    return(
        <>
            <div className="login_container">
                <div className="login_wrap">
                    <h2>ARES</h2>
                    <p>관리자만 로그인 할 수 있습니다.</p>
                    <form onSubmit={loginHandler}>
                        <label>아이디</label>
                        <input 
                        type="text" 
                        value={userid}
                        onChange={(e)=>setUserid(e.target.value)}
                        placeholder="아이디를 입력하세요."
                        />

                        <label>비밀번호</label>
                        <input 
                        type="password"
                        value={password}
                        onChange={(e)=>setPassword(e.target.value)}
                        placeholder="비밀번호를 입력하세요."
                        />

                        {message && <p className="error">{message}</p>}
                        
                        <button type="submit" className="login_submit">로그인</button>
                            
                        
                    </form>
                    
                </div>
            </div>
        </>
    );
}
export default Login;
