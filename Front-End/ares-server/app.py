from flask import Flask, Response, request
from flask_cors import CORS
import cv2
import time
import numpy as np

app = Flask(__name__)
CORS(app)  # 리액트에서 접속 가능하도록 허용

# 카메라 초기화 (0번 기본 웹캠)
cap = cv2.VideoCapture(0)

def generate_frames():
    while True:
        success, frame = cap.read()
        if not success:
            # 카메라가 없을 때 검은 화면 송출
            frame = np.zeros((480, 640, 3), dtype="uint8")
            cv2.putText(frame, "CAMERA NOT FOUND", (150, 240), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        else:
            # --- [이 부분에 YOLOv8 추론 코드를 넣으세요] ---
            # 예시: 임시 빨간 박스 (실제 YOLO 모델 연결 시 대체)
            cv2.rectangle(frame, (200, 150), (440, 330), (0, 0, 255), 2)
            cv2.putText(frame, "ARES AI: Tracking...", (200, 140), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
            # ------------------------------------------

        # 실시간 시간 표시
        curr_time = time.strftime("%Y-%m-%d %H:%M:%S")
        cv2.putText(frame, f"LIVE: {curr_time}", (10, 30), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

        # 프레임을 JPEG로 인코딩
        ret, buffer = cv2.imencode('.jpg', frame)
        frame_bytes = buffer.tobytes()

        # Flask용 스트리밍 포맷으로 변환 (중요!)
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

@app.route('/video_feed')
def video_feed():
    # 이 주소로 리액트 img src가 연결됩니다.
    return Response(generate_frames(), 
                    mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/control', methods=['POST'])
def control():
    # 리액트에서 보내는 W, A, S, D 명령 처리
    direction = request.args.get('direction')
    print(f"로봇 이동 명령: {direction}")
    # 여기에 실제 모터 제어 로직 추가 (GPIO 등)
    return {"status": "success", "command": direction}

if __name__ == "__main__":
    # 0.0.0.0으로 설정해야 외부(리액트)에서 IP로 접속 가능합니다.
    app.run(host='0.0.0.0', port=5000, threaded=True)