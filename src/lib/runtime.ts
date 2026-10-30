// Expo Go is a ready-made app that does not contain our native modules (WebRTC for calls, remote push).
// In Expo Go those features switch themselves off instead of crashing; a development build has everything.
import Constants, { ExecutionEnvironment } from 'expo-constants';
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
