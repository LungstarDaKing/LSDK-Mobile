import { memo } from 'react';
import { Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';
import { carShapes, type Grad } from './carart';

/** One car, facing right, centred on (0,0). Use inside an <Svg>. Memoised: the shapes only change with the car or colour. */
export const CarArt = memo(function CarArt({ id, color, uid }: { id: string; color: string; uid: string }) {
  const shapes = carShapes(id, color);
  const grads: { gid: string; g: Grad }[] = [];
  const els = shapes.map((s, i) => {
    let fill: string | undefined;
    if (typeof s.fill === 'object') { const gid = `${uid}-g${i}`; grads.push({ gid, g: s.fill }); fill = `url(#${gid})`; } else fill = s.fill;
    return <Path key={i} d={s.d} fill={fill ?? 'none'} stroke={s.stroke} strokeWidth={s.sw} strokeLinejoin="round" />;
  });
  return (
    <G>
      <Defs>
        {grads.map(({ gid, g }) => (
          <LinearGradient key={gid} id={gid} gradientUnits="userSpaceOnUse" x1={g.x0} y1={g.y0} x2={g.x1} y2={g.y1}>
            {g.stops.map(([o, c], k) => <Stop key={k} offset={o} stopColor={c} />)}
          </LinearGradient>
        ))}
      </Defs>
      {els}
    </G>
  );
});
