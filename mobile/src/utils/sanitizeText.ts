/**
 * Text that leaves the phone: stripped of control characters the backend
 * refuses, and cut to a length without splitting a character.
 *
 * Pasted text often carries invisible control characters (form feeds from
 * PDFs, NULs from odd sources). The backend rejects them with a 400 that used
 * to read as "something went wrong on our side" — and no retry could fix it.
 */

/** C0 controls except tab (09) and newline (0A), DEL, and the C1 range. */
// eslint-disable-next-line no-control-regex
const STRIPPED = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/gu;

/**
 * Removes control characters, keeping newline and tab. Carriage returns are
 * folded into newlines first, so Windows line endings survive as line breaks.
 */
export const sanitizeText = (text: string): string => text.replace(/\r\n?/gu, '\n').replace(STRIPPED, '');

const ZERO_WIDTH_JOINER = '‍';

/**
 * Cuts to at most `maxLength` UTF-16 units — the unit the backend counts in —
 * without ever splitting a surrogate pair, so an emoji at the limit is kept
 * whole or dropped whole, never sent as half a character.
 *
 * By code point, not grapheme: Hermes' Intl documentation lists no
 * Intl.Segmenter, so grapheme segmentation cannot be relied on. The cost is
 * that a multi-part emoji (a family, a flag) cut at the limit loses its last
 * parts; a dangling joiner is removed so what remains is a valid emoji.
 */
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  let end = maxLength;
  const last = text.charCodeAt(end - 1);
  // The unit before the cut is a high surrogate: its pair is on the other side.
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  let cut = text.slice(0, end);
  while (cut.endsWith(ZERO_WIDTH_JOINER)) cut = cut.slice(0, -1);
  return cut;
};

/** Sanitise, then truncate: what every outgoing text goes through. */
export const prepareOutgoingText = (text: string, maxLength: number): string =>
  truncateText(sanitizeText(text), maxLength);
