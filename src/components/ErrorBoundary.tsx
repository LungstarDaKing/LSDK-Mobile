import { Component, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

type Props = { children: ReactNode };
type State = { failed: boolean };

/** Last line of defence: a render error shows a plain "try again" screen instead of a white screen. Uses no theme/context so it works even if those failed. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(): State { return { failed: true }; }
  componentDidCatch(error: unknown) {
    // Deliberately logs the error name only: messages can contain user text.
    if (__DEV__) console.warn('Render error:', error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View accessibilityRole="alert" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#0e0a1e' }}>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 8 }}>Something went wrong</Text>
        <Text style={{ color: '#d6d0f0', textAlign: 'center', marginBottom: 20 }}>The screen hit an unexpected problem. Your messages are safe on the server.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Try again" onPress={() => this.setState({ failed: false })} style={{ minHeight: 48, minWidth: 140, borderRadius: 24, backgroundColor: '#6b46f5', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}
