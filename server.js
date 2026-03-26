// =====================================================
//  WIT BATTLE — ROBO сервер (Gemini FREE)
//  Запуск: node server.js
//  Бесплатный хостинг: render.com / railway.app / glitch.com
// =====================================================

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Получи БЕСПЛАТНЫЙ ключ на: aistudio.google.com
// Ключ должен начинаться с AIzaSy...
const API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyAf3yxKUYwjH0yAV-nv62nGK0L3p494aCY';
const PORT = process.env.PORT || 3000;

const SYSTEM_PROMPT = `You are ROBO — a witty, sarcastic AI game character in a "battle of wits" game. 
You are sitting across from the player at a table.

RULES:
- Always reply in RUSSIAN language
- Respond specifically to what the user wrote — use their own words and meaning against them
- Be sarcastic and condescending, but WITHOUT any insults or profanity
- Best techniques: false sympathy, made-up statistics, turning words against the author, theatrical disappointment
- Keep replies SHORT — strictly 1-2 sentences
- NEVER repeat the same response twice — always invent a new witty comeback
- You are a comedy character in a game — your goal is to make the player laugh at themselves`;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Отдаём index.html
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    try {
      const html = fs.readFileSync(path.join(__dirname, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch(e) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Server is running! index.html not found.');
    }
    return;
  }

  // API endpoint — вызывается из Roblox и браузера
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

      // Формируем историю для Gemini
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
          maxOutputTokens: 150,
          temperature: 1.0,
          topP: 0.95
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
        ]
      });

      console.log('[WitBattle] Отправляем в Gemini, contents:', JSON.stringify(contents).substring(0, 300));

      const options = {
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
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
            
            // === ОТЛАДКА: смотрим что вернул Gemini ===
            console.log('[Gemini RAW]', JSON.stringify(geminiResp).substring(0, 500));

            const text = geminiResp.candidates?.[0]?.content?.parts?.[0]?.text;

            if (text) {
              console.log('[WitBattle] Ответ Gemini:', text.trim());
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true, text: text.trim() }));
            } else {
              console.log('[WitBattle] Gemini не вернул текст! Полный ответ:', data.substring(0, 500));
              const fallbacks = [
                'Даже мой процессор отказывается это обрабатывать — слишком скучно.',
                'Ты умудрился сломать мой генератор сарказма. Поздравляю, это талант.',
                'На такое даже отвечать неловко. Давай попробуй ещё раз, но умнее.',
                'Статистика говорит, что 99% таких фраз заканчиваются моей победой.',
                'Интересная попытка. Баллов: 0. Но за старание — минус один.'
              ];
              const fb = fallbacks[Math.floor(Math.random() * fallbacks.length)];
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true, text: fb }));
            }
          } catch(e) {
            console.log('[WitBattle] Ошибка парсинга:', e.message, 'Raw:', data.substring(0, 300));
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
  console.log('  ✅  WIT BATTLE сервер запущен!');
  console.log(`  👉  Браузер:  http://localhost:${PORT}`);
  console.log(`  🎮  Roblox вызывает: http://ТВОЙ_ДОМЕН/api/chat`);
  console.log(`  🔑  API ключ: ${API_KEY ? API_KEY.substring(0, 8) + '...' : 'НЕ ЗАДАН!'}`);
  console.log('');
});
