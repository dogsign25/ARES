/* eslint-disable react-hooks/set-state-in-effect, react-refresh/only-export-components */
import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../config';

const MissionContext = createContext();
const API_BASE_URL = `${API_URL}/missions`;
const ROBOT_API_URL = `${API_URL}/robots`;

export function MissionProvider({ children }) {
    const [missions, setMissions] = useState([]);
    const [availableRobots, setAvailableRobots] = useState([]);

    const getAuthHeader = () => {
        const token = localStorage.getItem("token");
        return token ? { "Authorization": `Bearer ${token}` } : {};
    };

    const fetchMissions = async () => {
    try {
      const response = await axios.get(API_BASE_URL, {
        headers: getAuthHeader()
      });
      setMissions(response.data); 
    } catch (error) {
      console.error("백엔드 미션 목록 로드 실패:", error);
    }
  };

  const fetchAvailableRobots = async () => {
    try {
      const response = await axios.get(ROBOT_API_URL, {
        headers: getAuthHeader()
      });
      setAvailableRobots(response.data);
    } catch (error) {
      console.error("백엔드 로봇 목록 로드 실패:", error);
    }
  };


  useEffect(() => {
    if (!localStorage.getItem("token")) {
      setMissions([]);
      setAvailableRobots([]);
      return;
    }
    fetchMissions();
    fetchAvailableRobots();
  }, []);

  const addMission = async (missionData) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/start`, missionData,
        {
            headers: getAuthHeader()
        }
      );
      setMissions(prev => [response.data, ...prev]);
      return response.data;
    } catch (error) {
      console.error("미션 등록 실패:", error);
      if (error.response?.status === 401 || error.response?.status === 403) {
        alert("로그인 인증이 만료되었거나 권한이 없습니다. 다시 로그인해주세요.");
      } else {
        alert(error.response?.data || "서버 오류로 미션을 등록하지 못했습니다.");
      }
      throw error;
    }
  };

  const deleteMission = async (id) => {
  try {
    await axios.delete(
      `${API_BASE_URL}/${id}`,
      {
        headers: getAuthHeader()
      }
    );

    setMissions(prev => prev.filter(m => m.id !== id));
  } catch(error) {
    console.error(error);
  }
};


  const completeMission = async (missionId) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/${missionId}/end`,
        {},
        {
          headers: getAuthHeader()
        }
      );
      setMissions(prev => prev.map(m => m.id === missionId ? response.data : m));
    } catch (error) {
      console.error("미션 종료 처리 실패:", error);
      alert("미션 종료 처리 중 오류가 발생했습니다.");
    }
  };

  const addZoneToMission = async (missionId, zoneName) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/${missionId}/zones`, { zoneName },
        
        {
            headers: getAuthHeader()
        }
      );
      setMissions(prev => prev.map(mission => {
        if (mission.id === missionId) {
          return {
            ...mission,
            zones: [...(mission.zones || []), response.data]
          };
        }
        return mission;
      }));
    } catch (error) {
      console.error("구역 추가 실패:", error);
      alert("구역 추가에 실패했습니다.");
    }
  };

  const deleteZoneFromMission = async (missionId, zoneId) => {
    try {
      await axios.delete(`${API_BASE_URL}/${missionId}/zones/${zoneId}`,
        {
            headers: getAuthHeader()
        }
      );
      setMissions(prev => prev.map(mission => {
        if (mission.id === missionId) {
          return {
            ...mission,
            zones: mission.zones.filter(z => z.id !== zoneId)
          };
        }
        return mission;
      }));
    } catch (error) {
      console.error("구역 원격 삭제 실패:", error);
      alert("구역 삭제 도중 오류가 발생했습니다.");
    }
  };


  // 운영자 및 로봇 배정
  const assignOperatorAndRobot = async (zoneId, operator, robotId) => {
  try {
    if (!operator && !robotId) {
      const response = await axios.put(
        `${API_BASE_URL}/zones/${zoneId}/release`,
        {},
        {
            headers: getAuthHeader()
        }
      );
      return response.data;
    }

    const response = await axios.put(
      `${API_BASE_URL}/zones/${zoneId}/assign`,
      {
        operator,
        robotId
      },
      {
            headers: getAuthHeader()
        }
    );

    return response.data;
  } catch (error) {
    console.error("구역 로봇 배정/해제 통신 실패:", error);
    throw error;
  }
};

const checkActiveAssignment = async (username) => {
  if (!username) return null;
  try {
    const response = await axios.get(`${API_BASE_URL}/active-zone`, {
      params: { operator: username },
      headers: getAuthHeader()
    });
    
    if (response.status === 200 && response.data) {
      // 배정 정보가 존재하면 { missionId, zoneId, robotId } 반환
      return response.data;
    }
    return null;
  } catch (error) {
    console.error("기존 배정 정보 조회 실패:", error);
    return null;
  }
};

  return (
    <MissionContext.Provider value={{ 
      missions,
      availableRobots,
      fetchMissions,
      fetchAvailableRobots,
      addMission, 
      deleteMission, 
      addZoneToMission, 
      assignOperatorAndRobot,
      deleteZoneFromMission,
      completeMission,
      checkActiveAssignment
    }}>
      {children}
    </MissionContext.Provider>
  );
}

export function useMissions() {
  return useContext(MissionContext);
}
