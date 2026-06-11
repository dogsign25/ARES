import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"; 
import React, {useCallback, useState} from 'react';
import Header from "./components/Header";
import Footer from "./components/Footer";
import Main from "./pages/Main";
import Status from "./pages/Status";
import Monitoring from "./pages/Monitoring";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import AuthSelect from "./pages/AuthSelect";
import AdminList from "./pages/AdminList";
import MissionAdd from "./pages/MissionAdd";
import RobotAdd from "./pages/RobotAdd";
import MissionRobotSelect from "./pages/MissionRobotSelect";
import { MissionProvider } from "./context/MissionContext";
import AdminControl from "./pages/AdminControl";

const VIDEO_URL =
  import.meta.env.VITE_VIDEO_URL || "http://172.16.118.62:5000/video_feed";

function App() {
  const [userRole, setUserRole] = useState(localStorage.getItem("userRole") || null);
  const [isLogin, setIsLogin] = useState(!!localStorage.getItem("token"));
  const [user, setUser] = useState(localStorage.getItem("username") || null);
  const [isLive, setIsLive] = useState(false);

  const startStream = useCallback(()=>{
    setIsLive(true);
  }, []);


  const stopStream = useCallback(()=>{
    setIsLive(false);
  },[]);

  const [selection, setSelection] = useState(() => {
    const saved = sessionStorage.getItem("current_selection");
    if (saved && saved !== "undefined") {
      try {
        return JSON.parse(saved);
      } catch {
        return { missionId: null, zoneId: null, robotId: null };
      }
    }
    return { missionId: null, zoneId: null, robotId: null };
  });

  //연결 종료
  const resetSelection = () => {
    setSelection({ missionId: null , zoneId: null, robotId: null });
    sessionStorage.removeItem("current_selection"); 
    sessionStorage.removeItem("temp_select_step");
  };


  return (
    <MissionProvider key={isLogin ? `session-${user || "user"}` : "anonymous"}>

      <BrowserRouter> 
        <Header
          user={user}
          setUser={setUser}
          setUserRole={setUserRole}
          setIsLogin={setIsLogin}
          isLogin={isLogin}
          resetSelection={resetSelection}
        />

        

        <Routes>

          

          <Route 
            path="/missionadd" 
            element={isLogin && userRole === "ADMIN" ? <MissionAdd /> : <Navigate to="/" />} 
          />

          <Route 
            path="/robotadd" 
            element={isLogin && userRole === "ADMIN" ? <RobotAdd /> : <Navigate to="/" />} 
          />

          <Route path="/authselect" element={!isLogin ? <AuthSelect /> : <Navigate to="/" />} />

          <Route path="/signup" 
                element={!isLogin ? <Signup /> : <Navigate to="/" />} />

	          <Route path="/login" element={!isLogin ? <Login setUser={setUser} setUserRole={setUserRole} setIsLogin={setIsLogin}/> : <Navigate to="/" />} />
        
          
          <Route path="/select" element={ 
            isLogin ? (
              userRole === "ADMIN" ? (
                <Navigate to="/" /> 
              ) : (
                selection.missionId && selection.zoneId && selection.robotId ? <Navigate to="/" /> : <MissionRobotSelect setSelection={setSelection} />
              )
            ) : <Navigate to="/login" />
          } />

          <Route path="/" element={
            isLogin ? (
              userRole === "ADMIN" ? (
                <MissionAdd /> // 시스템 관리자는 미션 등록이 메인
              ) : (
                selection.missionId && selection.zoneId && selection.robotId ? (
                  <Main
                    isLive={isLive}
                    imageSrc={VIDEO_URL}
                    selection={selection}
                    user={user}
                    resetSelection={resetSelection}
                  />
                ) : (
                  <Navigate to="/select" /> 
                )
              )
            ) : (
              <Navigate to="/authselect" />
            )
          } />

          <Route path="/status" 
                element={isLogin ? <Status /> : <Navigate to="/login" />} />
          <Route path="/monitoring" 
            element={ isLogin ? (
            <Monitoring 
              isLive={isLive}
              imageSrc={VIDEO_URL}
              selection={selection} // 로봇 정보 표시용
              resetSelection={resetSelection} // 연결 종료용
              startStream={startStream}
              stopStream={stopStream}/>
            ) : <Navigate to="/login" />} />

          <Route path="/adminlist" 
                element={isLogin ? <AdminList /> : <Navigate to="/login" />}/>
                      
        <Route 
          path="/admin/control" 
          element={
            isLogin ? (
              userRole === "ADMIN" ? (
	                <AdminControl imageSrc={VIDEO_URL} />
              ) : (
                <Navigate to="/" /> // 일반 대원이 접근하면 메인으로 튕겨냄
              )
            ) : (
              <Navigate to="/login" /> // 로그인 안 했으면 로그인 창으로 튕겨냄
            )
          } 
        />
        </Routes>
        <Footer />
      </BrowserRouter>
    </MissionProvider>
  );
}

export default App;
