import React, { useEffect, useRef } from 'react';
import axios from 'axios';
import { API_URL } from '../config';

const RobotController = ({ robotId }) => {
    const isProcessing = useRef(false);

    const sendMoveCommand = async (gait) => {
        if (isProcessing.current) return;
        
        const token = localStorage.getItem("token"); 

        try {
            isProcessing.current = true;
            await axios.post(
                `${API_URL}/robots/${robotId}/command/move`,
                { gait: gait },
                {
                    // 2. 헤더에 JWT 토큰 실어주기
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );
            console.log(`[인증됨] 명령 전송: ${gait}`);
        } catch (error) {
            if (error.response?.status === 403) {
                console.error("권한이 없습니다. 관리자 로그인이 필요합니다.");
            } else {
                console.error("명령 전송 실패:", error);
            }
        } finally {
            setTimeout(() => { isProcessing.current = false; }, 200);
        }
    };

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.target.tagName === 'INPUT') return;
            const key = event.key.toLowerCase();
            switch (key) {
                case 'w': sendMoveCommand('WALK'); break;
                case 's': sendMoveCommand('BACKWARD'); break;
                case 'a': sendMoveCommand('TURN_LEFT'); break;
                case 'd': sendMoveCommand('TURN_RIGHT'); break;
                default: break;
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [robotId]);

    return null;
};

export default RobotController;
