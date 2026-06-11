import React,{ useState } from "react";
import './PatientList.css';


function PatientList({patient}){
    const [filter, setFilter] = useState('전체');

    const filterData = patient.filter(p=>
        filter == '전체' ? true : p.status === filter
    );

    return(
        <div className="patientList_container">
            <div className="filter_group">
                {['전체','위급','주의','양호'].map(category => (
                    <button
                    key={category}
                    className={filter === category ? "btn_active" : ""}
                    onClick={()=> setFilter(category)}
                    >
                        {category}
                    </button>
                ))}
            </div>

            <div className="cards_wrapper">
                {filterData.map((item, index )=>(
                    <div key={item.id} className="patient_card">
                        <div className="info">
                            <h3>부상자 {filterData.length - index}</h3>
                            <p>위도 : {item.lat}, 경도 : {item.lng}</p>
                            
                        </div>
                        <span className={`badge ${item.status}`}>{item.status}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
export default PatientList;