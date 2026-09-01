/* ==========================================================================
   Remok.uz — скрипты сайта
   Ванильный JavaScript, без библиотек и сборки.
   ========================================================================== */
(function () {
  'use strict';

  /* Все настройки лежат в js/config.js — правьте их там, не здесь. */
  var CFG = window.REMOK_CONFIG || {};

  var PHONE_DIGITS = CFG.PHONE_DIGITS || '998909180501';
  var ENDPOINT     = (CFG.ENDPOINT || '').trim();
  var TG_TOKEN     = (CFG.TG_TOKEN || '8447297138:AAHvQ1AuSqHuaG8Ph7WiGuXJLR77zpMXJb4').trim();
  var TG_CHAT_IDS  = CFG.TG_CHAT_IDS || [2077634702,1430286964,5884034743];

  var $  = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  /* ------------------------------------------------------------------------
     1. Тень у шапки при скролле
     ------------------------------------------------------------------------ */
  var header = $('#header');
  if (header) {
    var onScroll = function () {
      header.classList.toggle('is-scrolled', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ------------------------------------------------------------------------
     2. Мобильное меню
     ------------------------------------------------------------------------ */
  var burger = $('#burger');
  var nav = $('#nav');

  if (burger && nav) {
    var closeMenu = function () {
      nav.classList.remove('is-open');
      burger.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
    };

    burger.addEventListener('click', function () {
      var willOpen = !nav.classList.contains('is-open');
      nav.classList.toggle('is-open', willOpen);
      burger.classList.toggle('is-open', willOpen);
      burger.setAttribute('aria-expanded', String(willOpen));
    });

    $$('a', nav).forEach(function (link) {
      link.addEventListener('click', closeMenu);
    });

    document.addEventListener('click', function (e) {
      if (!nav.contains(e.target) && !burger.contains(e.target)) closeMenu();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });
  }

  /* ------------------------------------------------------------------------
     3. Переключение языка RU / UZ
     Русский текст лежит прямо в HTML, узбекский — в атрибуте data-uz.
     Чтобы добавить перевод новому элементу, просто допишите ему data-uz="...".
     ------------------------------------------------------------------------ */
  var LANG_KEY = 'remokuz-lang';

  var translatable = $$('[data-uz]');
  var placeholders = $$('[data-uz-placeholder]');

  // Запоминаем исходный русский вариант один раз, при загрузке.
  translatable.forEach(function (el) {
    el.setAttribute('data-ru', el.textContent.replace(/\s+/g, ' ').trim());
  });
  placeholders.forEach(function (el) {
    el.setAttribute('data-ru-placeholder', el.getAttribute('placeholder') || '');
  });

  function setLang(lang) {
    var isUz = lang === 'uz';
    var attr = isUz ? 'data-uz' : 'data-ru';
    var phAttr = isUz ? 'data-uz-placeholder' : 'data-ru-placeholder';

    translatable.forEach(function (el) {
      var value = el.getAttribute(attr);
      if (value) el.textContent = value;
    });

    placeholders.forEach(function (el) {
      var value = el.getAttribute(phAttr);
      if (value !== null) el.setAttribute('placeholder', value);
    });

    document.documentElement.setAttribute('lang', isUz ? 'uz' : 'ru');

    $$('.langswitch__btn').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-lang') === lang);
    });

    try { localStorage.setItem(LANG_KEY, lang); } catch (err) { /* приватный режим */ }
  }

  $$('.langswitch__btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setLang(btn.getAttribute('data-lang'));
    });
  });

  var savedLang = null;
  try { savedLang = localStorage.getItem(LANG_KEY); } catch (err) { /* приватный режим */ }
  if (savedLang === 'uz') setLang('uz');

  /* ------------------------------------------------------------------------
     4. Маска телефона: +998 90 918 05 01
     ------------------------------------------------------------------------ */
  var phoneInput = $('#f-phone');

  function formatPhone(raw) {
    var digits = raw.replace(/\D/g, '');

    // Приводим к формату 998XXXXXXXXX
    if (digits.indexOf('998') === 0) digits = digits.slice(3);
    else if (digits.indexOf('8') === 0 && digits.length > 9) digits = digits.slice(1);
    digits = digits.slice(0, 9);

    if (!digits) return '';

    var out = '+998 ' + digits.slice(0, 2);
    if (digits.length > 2) out += ' ' + digits.slice(2, 5);
    if (digits.length > 5) out += ' ' + digits.slice(5, 7);
    if (digits.length > 7) out += ' ' + digits.slice(7, 9);
    return out;
  }

  if (phoneInput) {
    phoneInput.addEventListener('input', function () {
      phoneInput.value = formatPhone(phoneInput.value);
    });
    phoneInput.addEventListener('focus', function () {
      if (!phoneInput.value) phoneInput.value = '+998 ';
    });
  }

  /* ------------------------------------------------------------------------
     5. Форма заявки → Telegram

     Заявка уходит сообщением каждому получателю из TG_CHAT_IDS.
     Если Telegram недоступен (нет интернета, бот заблокирован) — показываем
     запасной блок со ссылками на телефон и WhatsApp.
     ------------------------------------------------------------------------ */
  var form = $('#lead');

  if (form) {
    var okBox    = $('#leadOk');
    var errBox   = $('#leadErr');
    var waLink   = $('#leadWa');
    var submitBt = form.querySelector('button[type="submit"]');

    var setError = function (input, hasError) {
      var field = input.closest('.field');
      if (field) field.classList.toggle('has-error', hasError);
    };

    $$('input, textarea', form).forEach(function (input) {
      input.addEventListener('input', function () { setError(input, false); });
    });

    // Экранируем то, что уходит в Telegram с parse_mode=HTML
    function esc(str) {
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Отправка одному получателю. URLSearchParams -> запрос без preflight-CORS.
    function sendToChat(chatId, text) {
      return fetch('https://api.telegram.org/bot' + TG_TOKEN + '/sendMessage', {
        method: 'POST',
        body: new URLSearchParams({
          chat_id: chatId,
          text: text,
          parse_mode: 'HTML',
          disable_web_page_preview: 'true'
        })
      }).then(function (res) {
        return res.json();
      }).then(function (data) {
        if (!data || !data.ok) throw new Error(data && data.description ? data.description : 'Telegram error');
        return true;
      });
    }

    /* Отправка заявки. Возвращает число получателей, до которых дошло.

       Если в config.js задан ENDPOINT — идём через свой обработчик,
       и токен в браузер вообще не попадает.
       Если нет — шлём напрямую в Telegram каждому из TG_CHAT_IDS. */
    function sendLead(text) {
      if (ENDPOINT) {
        return fetch(ENDPOINT, {
          method: 'POST',
          body: new URLSearchParams({ text: text })
        }).then(function (res) {
          return res.json();
        }).then(function (data) {
          if (!data || !data.ok) throw new Error(data && data.error ? data.error : 'Endpoint error');
          return data.delivered || 1;
        }).catch(function (err) {
          console.warn('Заявка не ушла через обработчик:', err.message);
          return 0;
        });
      }

      if (!TG_TOKEN || !TG_CHAT_IDS.length) {
        console.warn('Заявки не настроены: заполните TG_TOKEN и TG_CHAT_IDS в js/config.js');
        return Promise.resolve(0);
      }

      return Promise.all(TG_CHAT_IDS.map(function (id) {
        return sendToChat(id, text).then(
          function () { return true; },
          function (err) {
            console.warn('Telegram: не доставлено на ' + id + ' — ' + err.message +
              (/chat not found/i.test(err.message)
                ? '. Этот человек ещё не нажал «Начать» у бота.'
                : ''));
            return false;
          }
        );
      })).then(function (results) {
        return results.filter(Boolean).length;
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var nameInput  = $('#f-name', form);
      var phoneField = $('#f-phone', form);
      var service    = $('#f-service', form);
      var comment    = $('#f-comment', form);

      var name = nameInput.value.trim();
      var phoneDigits = phoneField.value.replace(/\D/g, '');

      var nameBad = name.length < 2;
      // 9 цифр номера + код страны 998
      var phoneBad = !(phoneDigits.length === 12 && phoneDigits.indexOf('998') === 0);

      setError(nameInput, nameBad);
      setError(phoneField, phoneBad);

      if (nameBad) { nameInput.focus(); return; }
      if (phoneBad) { phoneField.focus(); return; }

      var isUz = document.documentElement.getAttribute('lang') === 'uz';
      // Берём видимую подпись — она уже на выбранном языке.
      var selected = service.options[service.selectedIndex];
      var serviceText = selected ? selected.textContent.trim() : '';
      var note = comment.value.trim();

      // Текст сообщения для мастеров — всегда по-русски,
      // язык сайта добавляем отдельной строкой, чтобы знали, как перезванивать.
      var msg =
        '<b>🔧 Новая заявка с сайта Remok.uz</b>\n\n' +
        '👤 <b>Имя:</b> ' + esc(name) + '\n' +
        '📞 <b>Телефон:</b> ' + esc(phoneField.value) + '\n' +
        '🛠 <b>Услуга:</b> ' + esc(serviceText) + '\n' +
        (note ? '💬 <b>Проблема:</b> ' + esc(note) + '\n' : '') +
        '🌐 <b>Язык клиента:</b> ' + (isUz ? 'узбекский' : 'русский') + '\n\n' +
        '🕒 ' + new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

      // Запасная ссылка на WhatsApp с тем же текстом
      if (waLink) {
        var plain = msg.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        waLink.href = 'https://wa.me/' + PHONE_DIGITS + '?text=' + encodeURIComponent(plain);
      }

      if (okBox) okBox.hidden = true;
      if (errBox) errBox.hidden = true;

      // Блокируем кнопку на время отправки
      var btnLabel = submitBt ? submitBt.innerHTML : '';
      if (submitBt) {
        submitBt.disabled = true;
        submitBt.classList.add('is-loading');
        submitBt.innerHTML = isUz ? 'Yuborilmoqda…' : 'Отправляем…';
      }

      // Успех, если сообщение дошло хотя бы до одного получателя
      sendLead(msg).then(function (delivered) {

        if (submitBt) {
          submitBt.disabled = false;
          submitBt.classList.remove('is-loading');
          submitBt.innerHTML = btnLabel;
        }

        if (delivered > 0) {
          if (okBox) {
            okBox.hidden = false;
            okBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
          form.reset();
        } else {
          if (errBox) {
            errBox.hidden = false;
            errBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }
      });
    });
  }

  /* ------------------------------------------------------------------------
     6. FAQ: открыт только один вопрос за раз
     ------------------------------------------------------------------------ */
  var faqItems = $$('.faq__item');
  faqItems.forEach(function (item) {
    item.addEventListener('toggle', function () {
      if (!item.open) return;
      faqItems.forEach(function (other) {
        if (other !== item) other.open = false;
      });
    });
  });

  /* ------------------------------------------------------------------------
     7. Мягкое появление блоков при прокрутке
     ------------------------------------------------------------------------ */
  var revealTargets = $$('.card, .plan, .feature, .review, .process__steps li, .problems li, .pricecard');

  if ('IntersectionObserver' in window && revealTargets.length) {
    revealTargets.forEach(function (el, i) {
      el.classList.add('reveal');
      el.style.transitionDelay = Math.min(i % 8, 6) * 45 + 'ms';
    });

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        el.classList.add('is-visible');
        observer.unobserve(el);
        // Убираем служебные классы, чтобы не мешали hover-анимациям карточек.
        setTimeout(function () {
          el.classList.remove('reveal', 'is-visible');
          el.style.transitionDelay = '';
        }, 950);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    revealTargets.forEach(function (el) { observer.observe(el); });
  }

  /* ------------------------------------------------------------------------
     8. Текущий год в подвале
     ------------------------------------------------------------------------ */
  var yearEl = $('#year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

})();
