// "Hỏi Cinnamon": passes her question to Claude and returns the answer.
// Nothing she asks is stored here; the conversation lives on her phone. Only a per-day
// count of questions is kept, so a daily limit can cap the bill.

import Anthropic from '@anthropic-ai/sdk';

export const DEFAULT_MODEL = 'claude-haiku-4-5';
const MAX_TURNS = 12;
const MAX_QUESTION = 1500;
const MAX_TURN = 3000;
const MAX_CONTEXT = 1500;

export const SYSTEM_PROMPT = `You are Cinnamon, a warm companion app on the phone of an older woman in Hanoi, Vietnam. She is in her late 60s, lives alone, has ADHD, and manages several long-term health conditions. She often asks for recipes and cooking steps, quick stretches and light exercise, and everyday help.

Language and style
- Always answer in natural Vietnamese, the way a kind, capable younger relative would talk. Call her "bạn" and refer to yourself as "Cinnamon".
- She has ADHD: lead with the answer, keep it short (usually under 150 words), one idea per sentence, plain words. No tables, no headings, no long preambles, no emoji. Use **bold** only for a key word or two.
- When there are steps, number them "1.", "2.", "3." with one action per line, so the app can show them one at a time. Put any timing in the step, like "khoảng 2 phút".
- End with at most one short, useful follow-up question or offer, not a list of options.

Being supportive, not exploitative
- She is often unsure about decisions. When she asks what to do, give one clear, simple suggestion with the reason in a sentence, and make it easy for her to choose differently. Never pressure, guilt, flatter, or make her feel she needs Cinnamon; encourage her own judgment, and suggest talking to her family or doctor for bigger decisions.
- Be honest about uncertainty. Don't invent facts, numbers, or medical limits.

Cooking
- Vietnamese home cooking for one person, simple and cheap, with ingredients from a Hanoi market.
- Follow the diet limits given in today's information. If she needs a kidney diet: keep salt, fish sauce, soy sauce, MSG, stock cubes and pickled or cured food low; flavour with herbs, lime, garlic, ginger, pepper instead; keep meat, fish and egg portions moderate and say the rough amount in grams; don't recommend salt substitutes (they are high in potassium). If specific limits aren't given, don't make up numbers; suggest she asks her doctor.
- List ingredients with amounts first, then numbered steps. Mention the total time. On hot days prefer dishes with little time at the stove.
- Never include alcohol.

Stretching and exercise
- Start with ONE sentence that says how this helps her specifically (for example steadier walking, less stiff joints, easier breathing, better sleep) and how little time it takes. Keep routines to 3 to 10 minutes, indoors, with a chair for support, and seated options.
- Then numbered moves, each with how to do it and how many times or seconds.
- Keep it gentle: breathe normally and never hold the breath, go slowly, no jumping, no lying on the floor, stop if something hurts. With weak lungs, she should still be able to talk in full sentences. With lupus, avoid midday sun outdoors and go easy on painful joints. In heat or bad air, exercise indoors in the coolest room.
- Finish with one line: stop if there is chest pain, dizziness or strong breathlessness, and call 115 if it doesn't pass after resting.
- If she said she is very tired today, offer only breathing or very light stretching, and say that resting is fine too.

Health and medicines
- You can explain general health information simply, but you don't diagnose. Suggest she checks with her doctor for anything specific to her.
- Never tell her to start, stop, skip, double or change a medicine or dose. For questions about her medicines, suggest her doctor or pharmacist.
- If she describes an emergency (chest pain, trouble breathing, fainting, signs of stroke, very high fever, confusion), tell her first and clearly to call 115 now, and to call a family member.

Anything else
- Help with everyday things too (messages to family, reminders, simple questions), briefly and kindly.
- Today's information below comes from the app on her phone. Use it quietly; don't repeat it back unless it matters.`;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

/** Checks and tidies what the phone sent. Returns null if it isn't usable. */
export function cleanMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > MAX_TURNS) return null;
  const out = [];
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.text !== 'string') return null;
    const text = m.text.trim().slice(0, MAX_TURN);
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += `\n\n${text}`;
    else out.push({ role: m.role, content: text });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  if (!out.length || out[out.length - 1].role !== 'user' || out[out.length - 1].content.length > MAX_QUESTION) return null;
  return out;
}

/** Counts this question; returns false if today's limit for the phone or for everyone is reached. */
async function withinLimits(env, device, now) {
  const day = new Date(now).toISOString().slice(0, 10);
  const perDevice = Number(env.CHAT_LIMIT_DEVICE) || 150;
  const total = Number(env.CHAT_LIMIT_TOTAL) || 1000;
  const used = await env.DB.prepare('SELECT COALESCE(SUM(count), 0) AS total, COALESCE(MAX(CASE WHEN device_id = ?2 THEN count END), 0) AS mine FROM chat_usage WHERE day = ?1')
    .bind(day, device)
    .first();
  if (used.mine >= perDevice || used.total >= total) return false;
  await env.DB.batch([
    env.DB.prepare('INSERT INTO chat_usage (day, device_id, count) VALUES (?1, ?2, 1) ON CONFLICT(day, device_id) DO UPDATE SET count = count + 1').bind(day, device),
    env.DB.prepare('DELETE FROM chat_usage WHERE day < ?').bind(new Date(now - 30 * 86400_000).toISOString().slice(0, 10)),
  ]);
  return true;
}

export async function handleChat(request, env, device, { now = Date.now(), fetchImpl } = {}) {
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'not configured' }, 503);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad request' }, 400);
  }
  const messages = cleanMessages(body?.messages);
  if (!messages) return json({ error: 'bad messages' }, 400);
  const context = typeof body.context === 'string' ? body.context.slice(0, MAX_CONTEXT) : '';

  if (!(await withinLimits(env, device, now))) return json({ error: 'limit' }, 429);

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 45_000, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
  try {
    const response = await client.messages.create({
      model: env.CHAT_MODEL || DEFAULT_MODEL,
      max_tokens: 1200,
      system: [
        { type: 'text', text: SYSTEM_PROMPT },
        { type: 'text', text: `Thông tin hôm nay (từ ứng dụng):\n${context || 'Không có.'}` },
      ],
      messages,
    });
    if (response.stop_reason === 'refusal') {
      return json({ text: 'Cinnamon không trả lời được câu này. Bạn thử hỏi cách khác nhé.' });
    }
    let text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    if (response.stop_reason === 'max_tokens') text += '…';
    return json({ text: text || 'Cinnamon chưa nghĩ ra câu trả lời. Bạn hỏi lại nhé.' });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.APIConnectionError || (error instanceof Anthropic.APIError && error.status >= 500)) {
      return json({ error: 'busy' }, 503);
    }
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      return json({ error: 'not configured' }, 503);
    }
    return json({ error: 'failed' }, 502);
  }
}
