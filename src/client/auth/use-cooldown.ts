import { useCallback, useEffect, useRef, useState } from "react";

export type Cooldown = {
  secondsRemaining: number;
  isCoolingDown: boolean;
  start: (seconds: number) => void;
};

export function useCooldown(initialSeconds = 0): Cooldown {
  const [secondsRemaining, setSecondsRemaining] = useState(initialSeconds);
  const intervalRef = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    clear();
    intervalRef.current = window.setInterval(() => {
      setSecondsRemaining((value) => {
        if (value <= 1) {
          clear();
          return 0;
        }
        return value - 1;
      });
    }, 1_000);
  }, [clear]);

  const start = useCallback(
    (seconds: number) => {
      setSecondsRemaining(seconds);
      if (seconds > 0) tick();
    },
    [tick],
  );

  useEffect(() => {
    if (initialSeconds > 0) tick();
    return clear;
  }, [initialSeconds, tick, clear]);

  return { secondsRemaining, isCoolingDown: secondsRemaining > 0, start };
}
