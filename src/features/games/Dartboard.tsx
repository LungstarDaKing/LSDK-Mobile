import { memo } from 'react';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';
import { BOARD_ORDER } from './logic';

const pt = (r: number, deg: number): [number, number] => [+(r * Math.sin((deg * Math.PI) / 180) * 100).toFixed(2), +(-r * Math.cos((deg * Math.PI) / 180) * 100).toFixed(2)];
const wedge = (r1: number, r2: number, a1: number, a2: number) => {
  const [x1, y1] = pt(r2, a1), [x2, y2] = pt(r2, a2), [x3, y3] = pt(r1, a2), [x4, y4] = pt(r1, a1);
  return `M${x1} ${y1}A${r2 * 100} ${r2 * 100} 0 0 1 ${x2} ${y2}L${x3} ${y3}A${r1 * 100} ${r1 * 100} 0 0 0 ${x4} ${y4}Z`;
};

// The painted board never changes, so it is drawn once; only the darts and the cross move (60 times a second).
const Wedges = memo(function Wedges() {
  return (
    <G>
      <Circle r={116} fill="#3a2a1c" /><Circle r={113} fill="#101010" />
      {BOARD_ORDER.map((n, i) => {
        const a1 = i * 18 - 9, a2 = i * 18 + 9, even = i % 2 === 0;
        const single = even ? '#161616' : '#efe2bd', ring = even ? '#d6342f' : '#1c8c4a';
        const [tx, ty] = pt(1.075, i * 18);
        return (
          <G key={n}>
            <Path d={wedge(0.094, 0.582, a1, a2)} fill={single} /><Path d={wedge(0.582, 0.629, a1, a2)} fill={ring} />
            <Path d={wedge(0.629, 0.953, a1, a2)} fill={single} /><Path d={wedge(0.953, 1, a1, a2)} fill={ring} />
            <SvgText x={tx} y={ty + 3} textAnchor="middle" fill="#f4f4f4" fontSize={9.5} fontWeight="800">{String(n)}</SvgText>
          </G>
        );
      })}
      <Circle r={9.4} fill="#1c8c4a" /><Circle r={3.7} fill="#d6342f" />
      {[3.7, 9.4, 58.2, 62.9, 95.3, 100].map((r) => <Circle key={r} r={r} fill="none" stroke="#bfc3c9" strokeWidth={0.6} />)}
    </G>
  );
});

/** The board, the darts already thrown (x, y in board-radius units) and, when it is my turn, the moving cross. */
export function Dartboard({ size, darts, aim }: { size: number; darts: { x: number; y: number }[]; aim?: { x: number; y: number } | null }) {
  return (
    <Svg width={size} height={size} viewBox="-118 -118 236 236" accessibilityLabel="Dartboard. Press Throw to release a dart where the cross is." role="img">
      <Wedges />
      {darts.map((d, i) => <G key={i} transform={`translate(${d.x * 100} ${d.y * 100})`}><Circle r={2.4} fill="#F5B83D" stroke="#000" strokeWidth={0.8} /></G>)}
      {aim ? (
        <G transform={`translate(${aim.x * 100} ${aim.y * 100})`}>
          <Circle r={5} fill="none" stroke="#F5B83D" strokeWidth={1.6} />
          <Path d="M-9 0H-3M3 0H9M0 -9V-3M0 3V9" stroke="#F5B83D" strokeWidth={1.6} />
        </G>
      ) : null}
    </Svg>
  );
}
