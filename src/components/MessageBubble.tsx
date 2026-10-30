import { memo } from 'react';
import { Pressable, View } from 'react-native';
import type { ReplyTarget } from '@/features/chat/api';
import type { ChatMsg } from '@/features/chat/messageList';
import { quoteText } from '@/features/chat/messageList';
import type { ReactionChip } from '@/features/chat/reactions';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, radius, space } from '@/theme/tokens';
import { Image } from 'expo-image';
import { isStickerFile, stickerUrl } from '@/features/stickers/logic';
import { Attachment, attachmentSummary } from './Attachment';
import { Text } from './ui';

const hhmm = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

type Props = {
  msg: ChatMsg;
  mine: boolean;
  grouped: boolean;
  senderName: string | null;       // shown above others' messages in groups
  a11yName: string;                // always the real sender name, for screen readers (even where it is not shown)
  senderColor: string;
  quote: { sender: string; target: ReplyTarget | undefined } | null;
  chips: ReactionChip[];
  seen: boolean;                   // someone has read this (my messages only)
  seenCaption: string | null;      // only on the latest seen message
  onLongPress: (m: ChatMsg) => void;
  onChip: (m: ChatMsg, emoji: string) => void;
  onQuote: (replyToId: string) => void;
  onRetry: (id: string) => void;
  onDiscard: (id: string) => void;
};

function Bubble(p: Props) {
  const { colors } = useTheme();
  const { msg, mine } = p;
  const fg = mine ? colors.ownText : colors.otherText;
  const hasFile = !!msg.attachment_type;
  const caption = msg.content?.trim() ? msg.content : '';
  const sUrl = stickerUrl(msg.content); const sticker = !!sUrl || isStickerFile(msg);
  const text = sticker ? 'Sticker' : hasFile ? [attachmentSummary(msg), caption].filter(Boolean).join(': ') : caption;
  const state = msg._failed ? 'Not sent' : msg._pending ? 'Sending' : p.seen ? 'Seen' : 'Sent';
  const time = hhmm(msg.created_at);
  const label = `${mine ? 'You' : p.a11yName}: ${text}. ${time}${msg.edited_at ? ', edited' : ''}${mine ? `. ${state}` : ''}`;

  return (
    <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '84%', marginTop: p.grouped ? 2 : space.sm }}>
      {p.senderName ? <Text variant="small" style={{ color: p.senderColor, fontWeight: '700', marginLeft: space.sm, marginBottom: 2 }} numberOfLines={1}>{p.senderName}</Text> : null}
      <Pressable
        accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Long press for reactions, reply and more"
        onLongPress={() => !msg._pending && !msg._failed && p.onLongPress(msg)} delayLongPress={350}
        style={{ backgroundColor: sticker ? 'transparent' : mine ? colors.own : colors.other, borderRadius: radius.lg, paddingVertical: sticker ? 2 : space.sm, paddingHorizontal: sticker ? 2 : space.md, opacity: msg._pending ? 0.7 : 1 }}
      >
        {msg.reply_to ? (
          <Pressable
            accessibilityRole="button" accessibilityLabel={`In reply to ${p.quote?.sender ?? 'message'}: ${quoteText(p.quote?.target)}`}
            onPress={() => p.onQuote(msg.reply_to!)}
            style={{ borderLeftWidth: 3, borderLeftColor: colors.gold, backgroundColor: mine ? 'rgba(255,255,255,0.14)' : colors.surface2, borderRadius: radius.sm, paddingVertical: 4, paddingHorizontal: space.sm, marginBottom: space.xs }}
          >
            <Text variant="small" style={{ color: fg, fontWeight: '700' }} numberOfLines={1}>{p.quote?.sender ?? 'Message'}</Text>
            <Text variant="small" style={{ color: fg, opacity: 0.85 }} numberOfLines={2}>{quoteText(p.quote?.target)}</Text>
          </Pressable>
        ) : null}
        {sUrl ? <Image source={{ uri: sUrl }} contentFit="contain" style={{ width: 150, height: 150 }} accessibilityLabel="Sticker" /> : null}
        {hasFile ? <Attachment msg={msg} mine={mine} /> : null}
        {caption && !sUrl ? <Text style={{ color: fg, marginTop: hasFile ? space.xs : 0 }}>{caption}</Text> : null}
        <View style={{ flexDirection: 'row', alignSelf: 'flex-end', alignItems: 'center', gap: 4, marginTop: 2 }}>
          <Text variant="small" style={{ color: mine && !sticker ? colors.ownText : colors.muted, opacity: 0.75 }}>{time}{msg.edited_at ? ' · edited' : ''}</Text>
          {mine ? <Text variant="small" style={{ color: p.seen ? colors.tick : sticker ? colors.muted : colors.ownText, opacity: p.seen ? 1 : 0.75, fontWeight: '700' }}>
            {msg._failed ? '!' : msg._pending ? '…' : p.seen ? '✓✓' : '✓'}
          </Text> : null}
        </View>
      </Pressable>

      {p.chips.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3, alignSelf: mine ? 'flex-end' : 'flex-start' }}>
          {p.chips.map((c) => (
            <Pressable
              key={c.emoji} accessibilityRole="button" accessibilityLabel={`${c.emoji} ${c.count}${c.mine ? ', you reacted' : ''}. Tap to ${c.mine ? 'remove' : 'add'}`}
              onPress={() => p.onChip(msg, c.emoji)}
              style={{ minHeight: 28, paddingHorizontal: 8, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.mine ? colors.accentSoft : colors.surface, borderWidth: 1, borderColor: c.mine ? colors.accent : colors.border }}
            >
              <Text style={{ fontSize: 14 }}>{c.emoji}</Text>
              {c.count > 1 ? <Text variant="small" muted>{c.count}</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      {msg._failed ? (
        <View style={{ flexDirection: 'row', gap: space.md, alignSelf: 'flex-end', marginTop: 2 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Retry sending" onPress={() => p.onRetry(msg.id)} style={{ minHeight: MIN_TOUCH - 8, justifyContent: 'center' }}>
            <Text variant="small" style={{ color: colors.danger, fontWeight: '700' }}>Not sent. Retry</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Discard message" onPress={() => p.onDiscard(msg.id)} style={{ minHeight: MIN_TOUCH - 8, justifyContent: 'center' }}>
            <Text variant="small" muted>Discard</Text>
          </Pressable>
        </View>
      ) : p.seenCaption ? (
        <Text variant="small" muted style={{ alignSelf: 'flex-end', marginTop: 2 }}>{p.seenCaption}</Text>
      ) : null}
    </View>
  );
}

export const MessageBubble = memo(Bubble);
