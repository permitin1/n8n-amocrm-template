const TG_BOT = 'vsc_strahovka_bot';
const MAX_BOT = 'id525708754339_bot';

module.exports = function (app, opts, done) {
  // Сценарий 1: ?contact_id=12345
  // Сценарий 2: ?phone=79991234567&utm_source=...
  app.get('/messenger', async (req, reply) => {
    const { contact_id, phone, utm_source, utm_medium, utm_campaign, utm_term, utm_content } = req.query;

    let tgPayload, maxPayload;

    if (contact_id) {
      tgPayload = 'tgcid' + contact_id;
      maxPayload = 'maxcid' + contact_id;
    } else if (phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      const utmParts = [utm_source, utm_medium, utm_campaign, utm_term, utm_content].filter(Boolean);
      if (utmParts.length > 0) {
        tgPayload = 'tel' + cleanPhone + '-' + [utm_source || '', utm_medium || '', utm_campaign || '', utm_term || '', utm_content || ''].join('-').replace(/-+$/, '');
        maxPayload = 'tel' + cleanPhone + '_' + [utm_source || '', utm_medium || '', utm_campaign || '', utm_term || '', utm_content || ''].join('_').replace(/_+$/, '');
      } else {
        tgPayload = 'tel' + cleanPhone;
        maxPayload = 'tel' + cleanPhone;
      }
    } else {
      return reply.code(400).send({ error: 'Требуется contact_id или phone' });
    }

    const tgLink = `https://t.me/${TG_BOT}?start=${tgPayload}`;
    const maxLink = `https://max.ru/${MAX_BOT}?start=${maxPayload}`;

    return reply.view('messenger.ejs', { tgLink, maxLink });
  });

  // Сценарий 3: лендинг с вводом телефона
  app.get('/landing', async (req, reply) => {
    const { utm_source, utm_medium, utm_campaign, utm_term, utm_content } = req.query;

    return reply.view('landing.ejs', {
      tgBot: TG_BOT,
      maxBot: MAX_BOT,
      utm_source: utm_source || '',
      utm_medium: utm_medium || '',
      utm_campaign: utm_campaign || '',
      utm_term: utm_term || '',
      utm_content: utm_content || '',
    });
  });

  done();
};
