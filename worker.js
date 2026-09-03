/* ==========================================================================
   Remok.uz — обработчик заявок (Cloudflare Worker)

   ЗАЧЕМ ЭТО НУЖНО
   Сайт статичный, у него нет сервера. Поэтому токен бота, если он лежит
   в js/config.js, виден каждому посетителю. Этот файл — крошечный сервер,
   который прячет токен: браузер шлёт заявку сюда, а уже отсюда она уходит
   в Telegram. Токен хранится в переменных окружения Cloudflare
   и в браузер не попадает никогда.

   Бесплатно: 100 000 заявок в сутки на бесплатном тарифе.

   ── КАК РАЗВЕРНУТЬ (10 минут, без установки программ) ───────────────────

   1. Зарегистрируйтесь на dash.cloudflare.com
   2. Слева: Compute (Workers)  →  Create  →  Start with Hello World  →  Deploy
   3. Откройте созданный Worker  →  Edit code
      Удалите весь пример и вставьте содержимое ЭТОГО файла  →  Deploy
   4. Settings  →  Variables and Secrets  →  добавьте (тип Secret):

        TG_TOKEN     
        TG_CHAT_IDS  2077634702,1430286964,5884034743
        ALLOW_ORIGIN https://remok.uz

      (значения берите из своего .env — см. .env.example)

   5. Скопируйте адрес Worker'а, например
        https://remok-lead.ваш-логин.workers.dev

   6. В файле js/config.js:
        ENDPOINT: 'https://remok-lead.ваш-логин.workers.dev',
        TG_TOKEN: '',          // очистить!

   7. Обновите сайт на хостинге и отправьте тестовую заявку.

   После этого токена в открытом доступе не останется.
   ========================================================================== */

export default {
  async fetch(request, env) {

    const allowOrigin = env.ALLOW_ORIGIN || '*';

    const cors = {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    };

    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors }
      });

    // Предварительный запрос браузера
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Only POST' }, 405);
    }

    if (!env.TG_TOKEN || !env.TG_CHAT_IDS) {
      return json({ ok: false, error: 'Не заданы TG_TOKEN / TG_CHAT_IDS в переменных Worker' }, 500);
    }

    // Пускаем только со своего сайта
    if (allowOrigin !== '*') {
      const origin = request.headers.get('Origin');
      if (origin && origin !== allowOrigin) {
        return json({ ok: false, error: 'Forbidden origin' }, 403);
      }
    }

    let text = '';
    try {
      const form = await request.formData();
      text = String(form.get('text') || '').trim();
    } catch (err) {
      return json({ ok: false, error: 'Bad request body' }, 400);
    }

    if (!text) return json({ ok: false, error: 'Пустая заявка' }, 400);

    // Ограничиваем длину — защита от спама через форму
    if (text.length > 3000) text = text.slice(0, 3000) + '…';

    const chatIds = env.TG_CHAT_IDS.split(',').map(s => s.trim()).filter(Boolean);

    const results = await Promise.all(chatIds.map(async (chatId) => {
      try {
        const res = await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: true
          })
        });
        const data = await res.json();
        if (!data.ok) console.log(`Не доставлено на ${chatId}: ${data.description}`);
        return data.ok === true;
      } catch (err) {
        console.log(`Ошибка отправки на ${chatId}: ${err.message}`);
        return false;
      }
    }));

    const delivered = results.filter(Boolean).length;

    return delivered > 0
      ? json({ ok: true, delivered })
      : json({ ok: false, error: 'Telegram не принял ни одно сообщение' }, 502);
  }
};
