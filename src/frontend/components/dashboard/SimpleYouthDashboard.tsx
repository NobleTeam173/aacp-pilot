import React from \{ useState, useEffect } from 'react';

export default function SimpleYouthDashboard() {
  const [data, setData] = useState({
    name: 'Youth User',
    skills: ['Aviation basics', 'Safety training'],
    progress: 65,
    nextMilestone: 'Private Pilot License'
  });

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial' }}>
      <h1>??? Youth Dashboard</h1>
      <div style={{ background: '#f0f8ff', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
        <h2>{data.name}</h2>
        <p>Progress: {data.progress}%</p>
        <p>Next Milestone: {data.nextMilestone}</p>
      </div>
      
      <div style={{ background: '#fff', padding: '15px', borderRadius: '8px', border: '1px solid #ddd' }}>
        <h3>Skills</h3>
        {data.skills.map((skill, i) => (
          <div key={i} style={{ padding: '8px', background: '#e6f3ff', marginBottom: '5px', borderRadius: '4px' }}>
            ? {skill}
          </div>
        ))}
      </div>
    </div>
  );
}
