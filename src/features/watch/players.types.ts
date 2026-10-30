import type { Report } from './logic';
export type PlayerHandle = { play(): void; pause(): void; seek(seconds: number): void };
export type YouTubeProps = { videoId: string; onReport: (r: Report) => void };
