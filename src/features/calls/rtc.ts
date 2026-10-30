// Type-only entry so TypeScript resolves './rtc'; Metro picks rtc.native.ts or rtc.web.ts at build time.
export { rtc, rtcAvailable, initRtc } from './rtc.web';
