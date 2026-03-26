import { useEffect, useState } from "react";

export function useCurrentTime(): number {
    const [time, setTime] = useState(() => Date.now());

    useEffect(() => {
        const interval = setInterval(() => setTime(Date.now()), 60000);
        return () => clearInterval(interval);
    }, []);

    return time;
}
