const TG_BOT = 'vsc_strahovka_bot';
const MAX_BOT = 'id525708754339_bot';

module.exports = function (app, opts, done) {
  // Сценарий 1: ?cid=12345
  // Сценарий 2: ?p=79991234567&us=...
  app.get('/m', async (req, reply) => {
    const contact_id = req.query.cid;
    const phone = req.query.p || req.query.phone;
    const utm_source = req.query.us || req.query.utm_source;
    const utm_medium = req.query.um || req.query.utm_medium;
    const utm_campaign = req.query.uc || req.query.utm_campaign;
    const utm_term = req.query.ut || req.query.utm_term;
    const utm_content = req.query.uo || req.query.utm_content;

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
      return reply.code(400).send({ error: 'Требуется cid или p (phone)' });
    }

    const tgLink = `https://t.me/${TG_BOT}?start=${tgPayload}`;
    const maxLink = `https://max.ru/${MAX_BOT}?start=${maxPayload}`;

    return reply.view('messenger.ejs', { tgLink, maxLink });
  });

  // Сценарий 3: лендинг с вводом телефона (стандартные utm_* из рекламных систем)
  app.get('/l', async (req, reply) => {
    const utm_source = req.query.utm_source || '';
    const utm_medium = req.query.utm_medium || '';
    const utm_campaign = req.query.utm_campaign || '';
    const utm_term = req.query.utm_term || '';
    const utm_content = req.query.utm_content || '';

    return reply.view('landing.ejs', {
      tgBot: TG_BOT,
      maxBot: MAX_BOT,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
    });
  });

  done();
};
