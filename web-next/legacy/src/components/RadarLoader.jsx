import { useState, useEffect } from 'react';

export default function RadarLoader() {
  const [logText, setLogText] = useState('[sys] Initializing scan...');

  useEffect(() => {
    const logs = [
      '[sys] Calibrating connection...',
      '[sys] Scanning regional zones...',
      '[sys] Searching zone 4...',
      '[sys] Bypassing firewall...',
      '[sys] Intercepting signal...',
      '[sys] Locking onto target...',
    ];
    let index = 0;

    const intervalId = setInterval(() => {
      index = (index + 1) % logs.length;
      setLogText(logs[index]);
    }, 1200);

    return () => clearInterval(intervalId);
  }, []);

  return (
    <div className="radar-loader-wrapper">
      <div className="radar-circle">
        <div className="radar-sweep"></div>
        <div className="radar-blip blip-1"></div>
        <div className="radar-blip blip-2"></div>
        <div className="radar-blip blip-3"></div>
      </div>
      <div className="radar-glitch-text">{logText}</div>
    </div>
  );
}
