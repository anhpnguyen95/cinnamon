// Cinnamon companion logic: reading medicine labels, guided routines, and the context the chat gets.
// Pure functions only, so they can be tested in Node.

// ---------- Medicine label ----------

const STRENGTH = /(\d+(?:[.,]\d+)?)\s*(mg|mcg|µg|g|ml|iu|ui)\b/i;
const STRENGTH_ALL = new RegExp(STRENGTH.source, 'gi');

/** Words printed on most packs that are never the medicine's name. */
const NOISE = new Set([
  'viên', 'viên nén', 'viên nang', 'viên nén bao phim', 'hộp', 'vỉ', 'thuốc', 'thuốc kê đơn', 'tablets', 'tablet', 'capsules',
  'capsule', 'film-coated tablets', 'rx', 'gmp', 'who', 'sđk', 'sdk', 'lô', 'hsd', 'nsx', 'exp', 'lot', 'mfg', 'uống', 'oral',
]);

/** Lines starting with these are pack details (box size, registration, batch, dates), not names. */
const DETAIL_START = new Set(['rx', 'hộp', 'vỉ', 'chai', 'lọ', 'sđk', 'sdk', 'lô', 'số', 'hsd', 'nsx', 'exp', 'lot', 'mfg', 'thuốc', 'viên', 'box', 'batch', 'reg']);

/** "5 mg" from "PREDNISOLON 5mg", or null. */
export function strengthIn(text) {
  const m = STRENGTH.exec(text);
  return m ? `${m[1].replace(',', '.')} ${m[2].toLowerCase()}` : null;
}

/** "PREDNISOLON" → "Prednisolon"; mixed case is left alone. */
function tidyName(text) {
  const letters = text.replace(/[^\p{L}]/gu, '');
  if (letters && letters === letters.toUpperCase()) {
    return text.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, sep, c) => sep + c.toUpperCase());
  }
  return text;
}

/**
 * Picks likely medicine names and a strength from text recognised on the phone.
 * lines: [{ text, height, confidence }], height in pixels (taller text is usually the brand name).
 * Returns { name, strength, candidates } where candidates are up to 3 names, most likely first.
 */
export function guessLabel(lines) {
  const usable = lines.filter((l) => l && typeof l.text === 'string' && (l.confidence ?? 100) >= 45);
  const strength = usable.map((l) => strengthIn(l.text)).find(Boolean) || null;

  const seen = new Set();
  const candidates = [];
  for (const line of usable) {
    let text = line.text.replace(STRENGTH_ALL, ' ').replace(/\s+/g, ' ');
    text = text.replace(/^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu, '');
    const letters = (text.match(/\p{L}/gu) || []).length;
    if (letters < 3 || letters * 2 < text.length || text.length > 40) continue;
    const key = text.toLowerCase();
    const first = key.split(/[\s:.,]/)[0];
    if (NOISE.has(key) || DETAIL_START.has(first) || seen.has(key)) continue;
    seen.add(key);
    candidates.push({ name: tidyName(text), height: line.height || 0 });
  }
  candidates.sort((a, b) => b.height - a.height);
  const names = candidates.slice(0, 3).map((c) => c.name);
  return { name: names[0] || null, strength, candidates: names };
}

// ---------- Guided routines ----------

export const STOP_NOTE = 'Dừng lại nếu đau ngực, chóng mặt hoặc khó thở nhiều. Nghỉ vài phút mà không đỡ thì gọi 115.';

/** Short indoor routines. Each says why it helps her and how long it takes before she starts. */
export const ROUTINES = [
  {
    id: 'stretch',
    title: 'Giãn cơ buổi sáng',
    minutes: 5,
    kind: 'Giãn cơ',
    why: 'Khớp bớt cứng sau khi ngủ dậy, đi lại vững hơn và ít nguy cơ ngã. Làm ngồi trên ghế, cạnh giường cũng được.',
    steps: [
      { title: 'Ngồi thẳng', how: 'Ngồi trên ghế, hai bàn chân chạm sàn. Hít vào bằng mũi, thở ra chậm bằng miệng.', seconds: 30 },
      { title: 'Xoay vai', how: 'Xoay hai vai ra sau thật chậm, 10 lần.', seconds: 40 },
      { title: 'Nghiêng đầu', how: 'Nghiêng tai phải về phía vai phải, giữ 10 giây. Đổi bên. Không xoay đầu thành vòng tròn.', seconds: 40 },
      { title: 'Mở ngực', how: 'Nắm hai bên thành ghế, ưỡn nhẹ ngực, hít sâu. Giữ 15 giây rồi thả lỏng.', seconds: 30 },
      { title: 'Duỗi chân', how: 'Ngồi ra mép ghế, duỗi thẳng một chân, gót chạm sàn. Hơi cúi người tới khi thấy căng nhẹ sau đùi. Giữ 20 giây, đổi chân.', seconds: 50 },
      { title: 'Xoay cổ chân', how: 'Nhấc một chân lên, xoay cổ chân 10 vòng mỗi chiều. Đổi chân.', seconds: 50 },
      { title: 'Nắm, mở bàn tay', how: 'Nắm tay lại, rồi xoè hết cỡ. 10 lần.', seconds: 30 },
      { title: 'Đứng lên, ngồi xuống', how: 'Đứng dậy chậm rồi ngồi xuống, bám thành ghế nếu cần. 5 lần.', seconds: 40 },
    ],
  },
  {
    id: 'breathe',
    title: 'Tập thở chậm',
    minutes: 4,
    kind: 'Tập thở',
    why: 'Phổi đưa khí vào sâu hơn, đỡ hụt hơi khi đi lại, và đầu óc cũng dịu lại khi đang lo. Chỉ cần ngồi yên một chỗ.',
    steps: [
      { title: 'Thả lỏng', how: 'Ngồi thoải mái, thả lỏng hai vai.', seconds: 20 },
      { title: 'Thở chúm môi', how: 'Hít vào bằng mũi, đếm 1, 2. Chúm môi như thổi nến, thở ra đếm 1, 2, 3, 4.', seconds: 60 },
      { title: 'Thở bụng', how: 'Đặt một tay lên bụng. Hít vào cho bụng phồng lên. Thở ra chúm môi cho bụng xẹp xuống.', seconds: 60 },
      { title: 'Thở và nâng tay', how: 'Hít vào, nâng hai tay lên ngang vai. Thở ra chậm, hạ tay xuống.', seconds: 60 },
      { title: 'Nghỉ', how: 'Thở bình thường. Nếu thấy chóng mặt thì dừng lại.', seconds: 40 },
    ],
  },
  {
    id: 'move',
    title: 'Vận động nhẹ trong nhà',
    minutes: 8,
    kind: 'Tập nhẹ',
    why: 'Tim và chân khoẻ hơn, ăn ngon và dễ ngủ hơn, mà không phải ra ngoài lúc nóng hay không khí xấu. Vẫn nói được thành câu là vừa sức.',
    steps: [
      { title: 'Đi bộ tại chỗ', how: 'Đi bộ tại chỗ, tay bám lưng ghế nếu cần.', seconds: 90 },
      { title: 'Kiễng gót', how: 'Đứng sau ghế, tay bám. Nhón gót lên rồi hạ xuống chậm. 10 lần.', seconds: 45 },
      { title: 'Bước sang ngang', how: 'Bước 4 bước sang phải, rồi 4 bước sang trái.', seconds: 60 },
      { title: 'Chống tay vào tường', how: 'Đứng cách tường một cánh tay. Gập khuỷu tay cho người nghiêng vào tường, rồi đẩy ra. 10 lần.', seconds: 60 },
      { title: 'Đứng lên, ngồi xuống', how: 'Đứng dậy khỏi ghế rồi ngồi xuống thật chậm. 8 lần.', seconds: 60 },
      { title: 'Nghỉ một chút', how: 'Ngồi nghỉ, uống một ngụm nước nếu cần.', seconds: 30 },
      { title: 'Đi bộ tại chỗ', how: 'Đi bộ tại chỗ thêm một lần nữa.', seconds: 90 },
      { title: 'Thả lỏng', how: 'Đi chậm dần, thở đều.', seconds: 45 },
    ],
  },
];

export const routineById = (id) => ROUTINES.find((r) => r.id === id) || null;

/** Which routines to offer today: on a very tired day only the gentle ones. */
export function routinesFor(energy) {
  if (energy === 'veryLow') return ROUTINES.filter((r) => r.id === 'breathe');
  if (energy === 'low') return ROUTINES.filter((r) => r.id !== 'move');
  return ROUTINES;
}

/** "1 phút 30 giây" style duration. */
export function durationText(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (!m) return `${s} giây`;
  return s ? `${m} phút ${s} giây` : `${m} phút`;
}

/**
 * Pulls numbered steps ("1. …", "Bước 2: …") out of a chat reply so she can follow them one at a time.
 * Returns [] when there are fewer than 3. A step mentioning minutes or seconds gets a timer.
 */
export function parseSteps(text) {
  const steps = [];
  for (const raw of String(text).split('\n')) {
    const m = raw.match(/^\s*(?:Bước\s*)?(\d{1,2})\s*[.):]\s+(.+)$/i);
    if (!m) continue;
    const how = m[2].replace(/\*\*/g, '').trim();
    const time = how.match(/(\d+)\s*(phút|giây)/i);
    const seconds = time ? Number(time[1]) * (time[2].toLowerCase() === 'phút' ? 60 : 1) : null;
    steps.push({ title: `Bước ${steps.length + 1}`, how, seconds: seconds && seconds <= 3600 ? seconds : null });
  }
  return steps.length >= 3 ? steps : [];
}

// ---------- Chat ----------

export const CHAT_STARTERS = [
  { label: 'Hôm nay nấu gì?', text: 'Gợi ý cho tôi một món ăn tối dễ nấu cho một người, hợp chế độ ăn của tôi.' },
  { label: 'Giãn cơ 5 phút', text: 'Hướng dẫn tôi giãn cơ nhanh 5 phút ở nhà.' },
  { label: 'Tập nhẹ 10 phút', text: 'Tôi muốn tập thể dục nhẹ khoảng 10 phút trong nhà. Tôi nên tập gì?' },
  { label: 'Món ít muối', text: 'Làm sao nấu ăn vẫn ngon mà ít muối và ít nước mắm?' },
];

export const CHAT_HISTORY_SENT = 12;
export const CHAT_HISTORY_KEPT = 60;
export const CHAT_MAX_CHARS = 1500;

const ENERGY_TEXT = { good: 'khoẻ', low: 'hơi mệt', veryLow: 'rất mệt' };
const SLEEP_TEXT = { good: 'ngủ ngon', okay: 'ngủ bình thường', poor: 'ngủ không ngon' };
const CONDITION_TEXT = {
  lupus: 'lupus (nhạy cảm với nắng, có thể đau khớp)',
  lungs: 'phổi yếu, dễ hụt hơi',
  kidney: 'cần ăn theo chế độ cho thận',
};

/** Things she can tick in Settings so the chat's advice fits her. */
export const PROFILE_OPTIONS = [
  ['kidney', 'Ăn theo chế độ cho thận'],
  ['lupus', 'Bệnh lupus'],
  ['lungs', 'Phổi yếu, dễ hụt hơi'],
  ['noAlcohol', 'Không uống rượu bia'],
];

/**
 * What the chat is told about her today. Built on the phone; contains no medicine names,
 * address or exact location.
 */
export function chatContext({ now, profile = {}, checkIn, outdoor, fluidLimitMl }) {
  const lines = [];
  const time = new Date(now);
  const hh = String(time.getHours()).padStart(2, '0');
  const mm = String(time.getMinutes()).padStart(2, '0');
  lines.push(`Giờ hiện tại chỗ bạn: ${hh}:${mm}.`);
  const conditions = (profile.conditions || []).map((c) => CONDITION_TEXT[c]).filter(Boolean);
  if (conditions.length) lines.push(`Sức khoẻ cần lưu ý: ${conditions.join('; ')}.`);
  if (profile.saltG) lines.push(`Muối tối đa bác sĩ dặn: ${profile.saltG} g mỗi ngày.`);
  if (profile.proteinG) lines.push(`Đạm (protein) tối đa bác sĩ dặn: ${profile.proteinG} g mỗi ngày.`);
  if ((profile.conditions || []).includes('kidney') && !profile.saltG && !profile.proteinG) {
    lines.push('Chưa biết giới hạn muối và đạm cụ thể: đừng tự đặt con số, hãy gợi ý hỏi bác sĩ.');
  }
  if (fluidLimitMl) lines.push(`Lượng nước tối đa bác sĩ dặn: ${fluidLimitMl} ml mỗi ngày.`);
  if ((profile.conditions || []).includes('noAlcohol')) lines.push('Bạn không uống rượu bia.');
  if (checkIn) lines.push(`Sáng nay bạn ${SLEEP_TEXT[checkIn.sleep] || 'chưa nói về giấc ngủ'} và thấy ${ENERGY_TEXT[checkIn.energy] || 'bình thường'}.`);
  if (outdoor) lines.push(`Ngoài trời hôm nay: ${outdoor}.`);
  return lines.join('\n');
}

/** Short summary of the outdoor outlook for the chat context. */
export function outdoorSummary(o, hour) {
  if (!o || !o.hours?.length) return null;
  const parts = [];
  if (hour?.aqi != null) parts.push(`AQI ${Math.round(hour.aqi)}`);
  if (hour?.tempC != null) parts.push(`${Math.round(hour.tempC)}°C`);
  if (hour?.heat != null && hour?.tempC != null && hour.heat - hour.tempC >= 2) parts.push(`cảm giác như ${Math.round(hour.heat)}°C`);
  if (hour?.uv != null) parts.push(`UV ${Math.round(hour.uv)}`);
  if (o.stayIn) parts.push('nên ở trong nhà cả ngày');
  else if (o.heatDanger) parts.push('có lúc nóng nguy hiểm');
  else if (o.worstRisk >= 1) parts.push('có lúc không nên ra ngoài lâu');
  return parts.join(', ') || null;
}

/** Keeps the most recent turns, starting with one of hers, trimmed to what the server accepts. */
export function historyToSend(history) {
  const recent = history.filter((m) => (m.role === 'user' || m.role === 'assistant') && m.text).slice(-CHAT_HISTORY_SENT);
  while (recent.length && recent[0].role !== 'user') recent.shift();
  return recent.map((m) => ({ role: m.role, text: m.text.slice(0, CHAT_MAX_CHARS * 2) }));
}
