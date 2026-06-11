
import { useState } from "react";
import "./Signup.css";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../config";

function Signup(){
    const [id, setId] =useState("");
    const [password, setPassword] = useState("");
    const [passwordCheck, setpasswordCheck] = useState("");
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [role, setRole] = useState("OPERATOR");
    const [message, setMessage] = useState("");

    const navigate = useNavigate();


    const signupHandler = async (e) =>{
        e.preventDefault();
        setMessage("");

        if(!id || ! password || !name){
            setMessage("모든 필드를 입력해주세요.");
            return;
        }

        //비밀번호 체크
        if (password !== passwordCheck) {  
            return;
        }

        try{
            const response = await fetch(`${API_URL}/auth/register`,{
                method : "POST",
                headers: {
                    "Content-Type" : "application/json"
                },
                body : JSON.stringify({
                    username: id,
                    password: password,
                    passwordCheck: passwordCheck,
                    role: role,
                    name: name,      
                    phone: phone
                })
            });

            if(response.ok){
                alert("회원가입 요청이 완료되었습니다.");
                navigate("/login");
            }else{
                setMessage("회원가입에 실패했습니다. 다시 시도해주세요.");
            }

        }catch(error){
            console.error("통신에러", error);
            setMessage("서버와 연결할 수 없습니다.")
        }
    }
    
    
    return(
        <main className="signup_container">
            <section className="signup_card">
                <h2 className="signup_title">ARES</h2>
                <p>승인된 사용자만 회원가입 가능합니다.</p>

                <form onSubmit={signupHandler}>
                    <div className="input_group">
                        <label>아이디</label>
                        <input type="text" 
                        name={id}
                        className="id_input" 
                        placeholder="아이디를 입력하세요"
                        onChange={(e)=>setId(e.target.value)}
                        />
                        
                    </div>
                    <div className="input_group">
                        <label>비밀번호</label>
                        <input 
                        type="password" 
                        name={password}
                        className="pw_input" 
                        placeholder="비밀번호를 입력하세요"
                        onChange={(e)=>setPassword(e.target.value)}/>
                    </div>
                    <div className="input_group">
                        <label>비밀번호 확인</label>
                        <input 
                        type="password" 
                        className="pw_input" 
                        placeholder="비밀번호를 다시 입력하세요"
                        onChange={(e) => setpasswordCheck(e.target.value)}/>
                        {passwordCheck && password !== passwordCheck && (
                            <span className="error_msg">비밀번호가 일치하지 않습니다.</span>
                        )}
                        {passwordCheck && password === passwordCheck && (
                            <span className="success_msg">✓ 비밀번호가 일치합니다.</span>
                        )}
                    </div>

                    <div className="input_group">
                        <label>이름</label>
                        <input 
                        type="text" 
                        name={name}
                        className="name_input" 
                        placeholder="이름을 입력하세요"
                        onChange={(e)=>setName(e.target.value)}/>
                    </div>

                    <div className="input_group">
                        <label>전화번호</label>
                        <input 
                        type="text" 
                        name={phone}
                        className="phone_input" 
                        placeholder="전화번호를 입력하세요"
                        onChange={(e)=>setPhone(e.target.value)}/>
                    </div>

                    

                    <div className="input_group">
                        <label>사용자 권한</label>
                        <select 
                        className="signup_select"
                        name="role"
                        value={role}
                        onChange={(e)=>setRole(e.target.value)}
                        >
                            <option value="OPERATOR">현장 관리자</option>
                            <option value="ADMIN">시스템 관리자</option>
                        </select>
                    </div>

                    {message && <p className="error_msg">{message}</p>}

                    <button type="submit" className="signup_btn">회원가입 요청</button>
                </form>
            </section>
        </main>
    );
}
export default Signup;
