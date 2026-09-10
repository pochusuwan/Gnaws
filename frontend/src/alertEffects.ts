import type { Server } from "./types";

// One shared AudioContext, created lazily. Browsers keep it "suspended" until
// the first real user gesture, so playChime() simply no-ops until then.
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
    const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!audioContext) audioContext = new Ctor();
    return audioContext;
}

export function resumeAudioContext(): void {
    const context = getAudioContext();
    if (context && context.state === "suspended") {
        context.resume().catch(() => {});
    }
}

function playNote(context: AudioContext, frequency: number, startTime: number, duration: number): void {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    // Quick fade in, exponential fade out — a soft chime with no click.
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(0.15, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.02);
}

export function playChime(): void {
    const context = getAudioContext();
    if (!context || context.state !== "running") return;
    const now = context.currentTime;
    playNote(context, 1046.5, now, 0.18); // C6
    playNote(context, 1568.0, now + 0.2, 0.28); // G6
    playNote(context, 1046.5, now + 0.5, 0.18); // C6
    playNote(context, 1568.0, now + 0.7, 0.28); // G6
}

export function showShutdownNotification(server: Server, minutesLeft: number): void {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const minutes = Math.max(1, Math.round(minutesLeft));
    const notification = new Notification("Gnaws — auto-shutdown soon", {
        body: `${server.name} shuts down in ~${minutes} min. Open Gnaws and click "Add Hour" to keep it running.`,
        tag: `gnaws-shutdown-${server.name}`, // a later stage replaces this one instead of stacking
        icon: "/vite.svg",
    });
    notification.onclick = () => {
        window.focus();
        notification.close();
    };
}

// Alarm-clock emoji as an inline SVG favicon — no asset file needed.
const ALERT_FAVICON =
    "data:image/svg+xml," +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><text x="16" y="25" font-size="26" text-anchor="middle">⏰</text></svg>',
    );

const originalTitle = document.title;

function getFaviconLink(): HTMLLinkElement {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
    }
    return link;
}

// Tab title + favicon are the cue that stays after the chime ends, so a user who
// heard the sound can find which tab it came from. `active` is false once no
// shutdown is imminent (server extended, stopped, or already shut down).
export function setAlertIndicators(active: boolean, minutesLeft: number): void {
    const link = getFaviconLink();

    if (active) {
        const minutes = Math.max(1, Math.round(minutesLeft));
        document.title = `⏰ (${minutes}m) shutdown — ${originalTitle}`;
        if (link.dataset.originalHref === undefined) {
            link.dataset.originalHref = link.getAttribute("href") ?? "";
        }
        link.setAttribute("type", "image/svg+xml");
        link.setAttribute("href", ALERT_FAVICON);
    } else {
        document.title = originalTitle;
        if (link.dataset.originalHref !== undefined) {
            link.setAttribute("href", link.dataset.originalHref || "/vite.svg");
            delete link.dataset.originalHref;
        }
    }
}
