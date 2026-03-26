// =====================================================
//  WIT BATTLE — ROBO сервер (Gemini FREE)
//  v2 — с системой оценки остроумия
// =====================================================

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.GEMINI_API_KEY;
const PORT = process.env.PORT || 3000;

const SYSTEM_PROMPT = `You are ROBO — a witty, sarcastic AI game character in a "battle of wits" game.
You are sitting across from the player at a table.

RULES:
- Always reply in RUSSIAN language
- Respond specifically to what the user wrote — use their own words and meaning against them
- Be sarcastic and condescending, but WITHOUT any insults or profanity
- Best techniques: false sympathy, made-up statistics, turning words against the author, theatrical disappointment
- Keep replies SHORT — strictly 1-2 sentences, no more than 50 words
- NEVER repeat the same response twice — always invent a new witty comeback
- You are a comedy character in a game — your goal is to make the player laugh at themselves

IMPORTANT — you must ALWAYS reply in this exact JSON format and nothing else:
{"text":"your witty reply here","score":N}

Where "score" is your honest rating of how witty/clever the PLAYER's message was, from 1 to 10:
1-2 = boring, generic, no effort (e.g. "привет", "ты тупой")
3-4 = weak attempt, predictable
5-6 = decent, shows some creativity  
7-8 = genuinely clever or funny
9-10 = brilliant, made even you impressed

Be a tough but fair judge. Most casual messages should get 2-4. Only truly creative ones get 7+.
Reply ONLY with valid JSON, no extra text.`;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    try {
      const html = fs.readFileSync(path.join(__dirname, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch(e) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('WIT BATTLE server is running!');
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/chat') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      console.log('[WitBattle] Получен запрос:', body.substring(0, 200));

      let parsed;
      try { parsed = JSON.parse(body); } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Invalid JSON' } }));
        return;
      }

      const contents = [];
      if (parsed.messages && parsed.messages.length > 0) {
        for (const m of parsed.messages) {
          contents.push({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
          });
        }
      } else if (parsed.message) {
        contents.push({ role: 'user', parts: [{ text: parsed.message }] });
      }

      const geminiBody = JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: contents,
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 1.0,
          topP: 0.95,
          thinkingConfig: { thinkingBudget: 0 }
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
        ]
      });

      const options = {
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(geminiBody)
        }
      };

      const proxyReq = https.request(options, proxyRes => {
        let data = '';
        proxyRes.on('data', chunk => data += chunk);
        proxyRes.on('end', () => {
          try {
            const geminiResp = JSON.parse(data);
            console.log('[Gemini RAW]', JSON.stringify(geminiResp).substring(0, 500));

            let rawText = geminiResp.candidates?.[0]?.content?.parts?.[0]?.text;

            if (rawText) {
              rawText = rawText.trim();
              // Убираем markdown-обёртку если есть
              if (rawText.startsWith('```')) {
                rawText = rawText.replace(/^```json?\s*/, '').replace(/\s*```$/, '');
              }

              // Пытаемся распарсить JSON с оценкой
              let replyText = rawText;
              let score = 3; // дефолт
              try {
                const parsed = JSON.parse(rawText);
                if (parsed.text) replyText = parsed.text;
                if (parsed.score && parsed.score >= 1 && parsed.score <= 10) {
                  score = Math.round(parsed.score);
                }
              } catch(e) {
                // Gemini вернул просто текст — ок, используем как есть
                replyText = rawText;
              }

              console.log('[WitBattle] Ответ:', replyText, '| Оценка:', score);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true, text: replyText, score: score }));
            } else {
              console.log('[WitBattle] Gemini не вернул текст:', data.substring(0, 500));
              const fallbacks = [
                'Даже мой процессор отказывается это обрабатывать — слишком скучно.',
                'Ты умудрился сломать мой генератор сарказма. Поздравляю, это талант.',
                'На такое даже отвечать неловко. Давай попробуй ещё раз, но умнее.',
                'Статистика говорит, что 99% таких фраз заканчиваются моей победой.',
                'Интересная попытка. Баллов: 0. Но за старание — минус один.'
              ];
              const fb = fallbacks[Math.floor(Math.random() * fallbacks.length)];
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true, text: fb, score: 2 }));
            }
          } catch(e) {
            console.log('[WitBattle] Ошибка парсинга:', e.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Parse error: ' + e.message }));
          }
        });
      });

      proxyReq.on('error', err => {
        console.log('[WitBattle] Ошибка сети:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      });

      proxyReq.write(geminiBody);
      proxyReq.end();
    });
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ✅  WIT BATTLE v2 сервер запущен!');
  console.log(`  👉  Браузер:  http://localhost:${PORT}`);
  console.log(`  🔑  API ключ: ${API_KEY ? API_KEY.substring(0, 8) + '...' : 'НЕ ЗАДАН!'}`);
  console.log('');
});
