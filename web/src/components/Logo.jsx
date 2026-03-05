import { useEffect, useRef, useState } from "react";

function Logo({ dark, className }) {
  const [drawKey, setDrawKey] = useState(0);
  const timerRef = useRef(null);

  // After each draw finishes, schedule the next redraw in 10–15 s
  useEffect(() => {
    const scheduleNext = () => {
      const delay = 10000 + Math.random() * 5000; // 10–15 s
      timerRef.current = setTimeout(() => {
        setDrawKey((k) => k + 1);
      }, delay);
    };

    scheduleNext();
    return () => clearTimeout(timerRef.current);
  }, [drawKey]);

  const uid = `ld${drawKey}`;
  const color = dark ? "#ffffff" : "#333333";

  return (
    <svg
      key={drawKey}
      viewBox="0 0 520 80"
      className={`logo-svg${className ? ` ${className}` : ""}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ "--lc": color }}
    >
      <defs>
        <style>{`
          .${uid} {
            fill: transparent;
            stroke: var(--lc);
            stroke-width: 1.2;
            stroke-dasharray: 800;
            stroke-dashoffset: 800;
            animation: ${uid} 3.5s ease-in-out forwards;
          }
          @keyframes ${uid} {
            0%   { stroke-dashoffset: 800; fill: transparent; }
            60%  { stroke-dashoffset: 0;   fill: transparent; }
            100% { stroke-dashoffset: 0;   fill: var(--lc); stroke-width: 0.4; }
          }
        `}</style>
      </defs>
      <text
        x="0"
        y="50%"
        dominantBaseline="middle"
        textAnchor="start"
        fontFamily="'Montserrat', sans-serif"
        fontSize="52"
        fontWeight="200"
        letterSpacing="6"
        className={uid}
      >IKHLAS IMPACT</text>
    </svg>
  );
}

export default Logo;
