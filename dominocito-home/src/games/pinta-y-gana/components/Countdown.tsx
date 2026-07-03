import { useEffect, useRef, useState } from 'react';

interface Props {
  targetDate: Date;
  onExpire: () => void;
}

export default function Countdown({ targetDate, onExpire }: Props) {
  const [seconds, setSeconds] = useState(0);
  const onExpireRef = useRef(onExpire);
  const firedRef = useRef(false);

  useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);
  useEffect(() => { firedRef.current = false; }, [targetDate]);

  useEffect(() => {
    const tick = () => {
      const diff = Math.max(0, Math.floor((targetDate.getTime() - Date.now()) / 1000));
      setSeconds(diff);
      if (diff === 0 && !firedRef.current) {
        firedRef.current = true;
        onExpireRef.current();
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const urgent = seconds < 30;
  const critical = seconds < 10;

  return (
    <div className="text-center">
      <div
        className="text-xs font-bold uppercase tracking-widest mb-4"
        style={{ color: 'var(--walnut)', opacity: 0.6 }}
      >
        Próximo sorteo en
      </div>

      <div className="flex items-center justify-center gap-2">
        {/* Minutes */}
        <div className="flex flex-col items-center">
          <div
            className="font-black tabular-nums font-mono leading-none px-4 py-3 rounded-2xl"
            style={{
              fontSize: '64px',
              background: 'transparent',
              color: 'var(--walnut)',
              fontFamily: 'var(--font-display)',
              fontWeight: 900,
              letterSpacing: '-0.02em',
              minWidth: '110px',
              textAlign: 'center',
            }}
          >
            {String(mins).padStart(2, '0')}
          </div>
          <div
            className="text-xs font-bold mt-1 uppercase tracking-widest"
            style={{ color: 'var(--walnut)', opacity: 0.55 }}
          >
            MIN
          </div>
        </div>

        {/* Separator */}
        <div
          className="font-black leading-none"
          style={{
            fontSize: '64px',
            color: 'var(--walnut)',
            opacity: 0.4,
            fontFamily: 'var(--font-display)',
          }}
        >
          :
        </div>

        {/* Seconds */}
        <div className="flex flex-col items-center">
          <div
            className="font-black tabular-nums font-mono leading-none px-4 py-3 rounded-2xl"
            style={{
              fontSize: '64px',
              background: 'transparent',
              color: urgent ? '#dc2626' : 'var(--walnut)',
              fontFamily: 'var(--font-display)',
              fontWeight: 900,
              letterSpacing: '-0.02em',
              minWidth: '110px',
              textAlign: 'center',
              animation: critical ? 'countdown-urgent 0.8s ease-in-out infinite' : 'none',
            }}
          >
            {String(secs).padStart(2, '0')}
          </div>
          <div
            className="text-xs font-bold mt-1 uppercase tracking-widest"
            style={{ color: 'var(--walnut)', opacity: 0.55 }}
          >
            SEG
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div
        className="mt-4 mx-auto rounded-full overflow-hidden"
        style={{
          height: '3px',
          background: 'rgba(58, 36, 24, 0.8)',
          maxWidth: '280px',
        }}
      >
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{
            width: `${(seconds / 1800) * 100}%`,
            background: urgent
              ? 'linear-gradient(90deg, #ef4444, #fca5a5)'
              : 'linear-gradient(90deg, var(--coral), var(--gold-bright))',
          }}
        />
      </div>
    </div>
  );
}