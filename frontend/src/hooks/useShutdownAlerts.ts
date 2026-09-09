import { useCallback, useEffect, useRef } from "react";
import type { NetworkDataState, Server, User } from "../types";
import { serverAllowsUser } from "../utils";
import { playChime, resumeAudioContext, setAlertIndicators, showShutdownNotification } from "../alertEffects";

const ALERT_THRESHOLDS_MIN = [30, 10, 2];
const CHECK_INTERVAL_MS = 30_000;

function shouldAlert(server: Server): boolean {
    return (
        serverAllowsUser(server) &&
        !server.configuration?.scheduledShutdownDisabled &&
        !!server.ec2?.ipAddress
    );
}

// Chime + OS notification + tab title + favicon when a server's scheduled
// auto-shutdown is near, but only while the page is open in a tab. Nothing is
// looped or repeated: each threshold fires once, and extending the shutdown
// re-arms it.
export function useShutdownAlerts(servers: NetworkDataState<Server[]>, user: User | null): void {
    // Keys `${name}|${shutdownTime}|${threshold}` already alerted. The timestamp
    // in the key means a new shutdown time is treated as a fresh countdown.
    const alerted = useRef<Set<string>>(new Set());

    const check = useCallback(() => {
        const list = servers.state === "Loaded" ? servers.data : [];
        const now = Date.now();
        let soonestMinutes = Infinity;
        const liveKeys = new Set<string>();

        if (user) {
            for (const server of list) {
                if (!shouldAlert(server)) continue;

                const shutdownTime = server.scheduledShutdown?.shutdownTime;
                if (!shutdownTime) continue;

                const minutesLeft = (new Date(shutdownTime).getTime() - now) / 60_000;
                if (minutesLeft <= 0) continue;
                if (minutesLeft <= ALERT_THRESHOLDS_MIN[0]) {
                    soonestMinutes = Math.min(soonestMinutes, minutesLeft);
                }

                let crossedNewThreshold = false;
                for (const threshold of ALERT_THRESHOLDS_MIN) {
                    if (minutesLeft > threshold) continue;
                    const key = `${server.name}|${shutdownTime}|${threshold}`;
                    liveKeys.add(key);
                    if (!alerted.current.has(key)) {
                        alerted.current.add(key);
                        crossedNewThreshold = true;
                    }
                }
                if (crossedNewThreshold) {
                    playChime();
                    showShutdownNotification(server, minutesLeft);
                }
            }
        }

        // Forget stages for shutdowns that were extended or already happened.
        for (const key of alerted.current) {
            if (!liveKeys.has(key)) alerted.current.delete(key);
        }

        setAlertIndicators(soonestMinutes !== Infinity, soonestMinutes);
    }, [servers, user]);

    useEffect(() => {
        check();
        const id = window.setInterval(check, CHECK_INTERVAL_MS);
        return () => window.clearInterval(id);
    }, [check]);

    // Restore the tab title / favicon when alerts stop mattering (e.g. logout).
    useEffect(() => {
        return () => setAlertIndicators(false, 0);
    }, []);

    // Audio playback and the notification permission prompt both need one user
    // gesture first. Prime on the first interaction anywhere on the page.
    useEffect(() => {
        const prime = () => {
            resumeAudioContext();
            if ("Notification" in window && Notification.permission === "default") {
                Notification.requestPermission().catch(() => {});
            }
        };
        window.addEventListener("pointerdown", prime, { once: true });
        return () => window.removeEventListener("pointerdown", prime);
    }, []);
}
