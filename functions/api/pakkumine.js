// Cloudflare Pages Function: POST /api/pakkumine
// Saadab konfiguraatori hinnapakkumise PDF-manusega kliendile ja koopia NORVO-le (Resend API).
// Vajalikud seaded Cloudflare Pages → Settings → Variables and Secrets:
//   RESEND_API_KEY (Secret)          – Resendi API-võti
//   MAIL_FROM      (valikuline)      – vaikimisi "NORVO Outdoor Living <info@norvo.ee>"
//   OFFICE_EMAIL   (valikuline)      – vaikimisi "info@norvo.ee"

const MAX_PDF_B64 = 6_000_000;            // ~4,5 MB PDF
const ALLOWED_ORIGIN = /^https:\/\/((www\.)?norvo\.ee|[a-z0-9-]+\.pages\.dev)$/;

const json = (data, status = 200) => new Response(JSON.stringify(data), {status, headers: {'Content-Type': 'application/json'}});
const esc = (s) => String(s == null ? '' : s).slice(0, 1000).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const txt = (s, n = 300) => String(s == null ? '' : s).replace(/[\r\n]+/g, ' ').trim().slice(0, n);
const money = (v) => (Math.round(Number(v) * 100) / 100).toLocaleString('et-EE', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' €';

export async function onRequestPost({request, env}) {
  if (!env.RESEND_API_KEY) return json({ok: false, error: 'not-configured'}, 503);
  const origin = request.headers.get('Origin') || '';
  if (origin && !ALLOWED_ORIGIN.test(origin)) return json({ok: false, error: 'origin'}, 403);

  let b;
  try { b = await request.json(); } catch { return json({ok: false, error: 'bad-json'}, 400); }
  if (b.website) return json({ok: true});                                   // honeypot: robot
  const c = b.client || {};
  const email = txt(c.e, 200), phone = txt(c.p, 40);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phone.replace(/\D/g, '').length < 6) return json({ok: false, error: 'contact'}, 400);
  const pdf = String(b.pdf || '');
  if (!pdf.startsWith('JVBER') || pdf.length > MAX_PDF_B64) return json({ok: false, error: 'pdf'}, 400);   // peab olema PDF
  const no = txt(b.no, 30).replace(/[^\w-]/g, '');
  if (!no) return json({ok: false, error: 'no'}, 400);

  const lines = (Array.isArray(b.lines) ? b.lines : []).slice(0, 40);
  const spec = (Array.isArray(b.spec) ? b.spec : []).slice(0, 30);
  const t = b.totals || {};
  const link = /^https:\/\/(www\.)?norvo\.ee\/[^\s"<>]*$/.test(String(b.link || '')) ? String(b.link) : '';
  const name = txt(c.n, 120), city = txt(c.c, 120), msg = String(c.msg || '').slice(0, 2000);
  const from = env.MAIL_FROM || 'NORVO Outdoor Living <info@norvo.ee>';
  const office = env.OFFICE_EMAIL || 'info@norvo.ee';
  const attachments = [{filename: `NORVO-pakkumine-${no}.pdf`, content: pdf}];

  const linesHtml = `<table cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px">
    ${lines.map(l => `<tr style="border-bottom:1px solid #e4e5e1"><td>${esc(l.name)}${l.side ? ` · ${esc(String(l.side).toLowerCase())}` : ''}${Number(l.qty) > 1 ? ` × ${esc(l.qty)}` : ''}</td>
      <td align="right" style="white-space:nowrap">${l.free ? 'tasuta' : l.discPct ? `<s style="color:#888">${money(l.list)}</s> −${esc(l.discPct)}% <b>${money(l.net)}</b>` : money(l.net)}</td></tr>`).join('')}
  </table>`;
  const totalsHtml = `<table cellpadding="4" cellspacing="0" style="margin:12px 0 0 auto;font-size:14px">
    <tr><td style="color:#666">Hind ilma soodustuseta</td><td align="right">${money(t.list)}</td></tr>
    ${Number(t.discFrame) ? `<tr><td style="color:#666">Soodustus (pergola raam)</td><td align="right" style="color:#2F7A4F">−${money(t.discFrame)}</td></tr>` : ''}
    ${Number(t.discWall) ? `<tr><td style="color:#666">Soodustus (seinamaterjalid)</td><td align="right" style="color:#2F7A4F">−${money(t.discWall)}</td></tr>` : ''}
    <tr><td style="color:#666">Vahesumma (km-ta)</td><td align="right">${money(t.net)}</td></tr>
    <tr><td style="color:#666">KM 24%</td><td align="right">${money(t.vat)}</td></tr>
    <tr><td style="border-top:2px solid #26372F"><b>Kokku</b></td><td align="right" style="border-top:2px solid #26372F"><b>${money(t.total)}</b></td></tr>
  </table>`;
  const sign = `<p style="margin-top:28px;color:#555;font-size:13px">NORVO Outdoor Living<br>+372 5345 0781 · <a href="mailto:info@norvo.ee">info@norvo.ee</a> · <a href="https://norvo.ee">norvo.ee</a></p>`;
  const wrap = (inner) => `<div style="font-family:Arial,Helvetica,sans-serif;color:#1B2420;max-width:640px;line-height:1.5">${inner}</div>`;

  const clientMail = {
    from, to: [email], reply_to: office,
    subject: `NORVO hinnapakkumine nr ${no}`,
    html: wrap(`<p>Tere${name ? ', ' + esc(name) : ''}!</p>
      <p>Aitäh huvi eest NORVO pergolate vastu. Sinu hinnapakkumine nr <b>${esc(no)}</b> on selle kirja manuses PDF-failina.</p>
      ${linesHtml}${totalsHtml}
      <p style="font-size:13px;color:#555">Hinnad real on ilma käibemaksuta. Pakkumine kehtib kuni ${esc(txt(b.valid, 20))}. Lõplik hind kinnitatakse pärast objekti täpsustamist. Soovi korral saab tasuda ka ESTO järelmaksuga.</p>
      ${link ? `<p><a href="${esc(link)}">Ava pakkumine veebis</a></p>` : ''}
      <p>Võtame sinuga peagi ühendust. Küsimuste korral vasta lihtsalt sellele kirjale.</p>${sign}`),
    attachments
  };
  const officeMail = {
    from, to: [office], reply_to: email,
    subject: `Uus pakkumine nr ${no} – ${name || email}`,
    html: wrap(`<h2 style="font-size:18px">Uus hinnapakkumine konfiguraatorist</h2>
      <table cellpadding="5" cellspacing="0" style="font-size:14px">
        <tr><td style="color:#666">Pakkumise nr</td><td><b>${esc(no)}</b></td></tr>
        <tr><td style="color:#666">Nimi</td><td>${esc(name) || '—'}</td></tr>
        <tr><td style="color:#666">E-post</td><td><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>
        <tr><td style="color:#666">Telefon</td><td><a href="tel:${esc(phone.replace(/[^\d+]/g, ''))}">${esc(phone)}</a></td></tr>
        <tr><td style="color:#666">Asukoht</td><td>${esc(city) || '—'}</td></tr>
        <tr><td style="color:#666;vertical-align:top">Kommentaar</td><td>${esc(msg).replace(/\n/g, '<br>') || '—'}</td></tr>
      </table>
      <h3 style="font-size:15px;margin-top:22px">Valitud lahendus</h3>
      <table cellpadding="4" cellspacing="0" style="font-size:14px">${spec.map(s => `<tr><td style="color:#666">${esc(s[0])}</td><td>${esc(s[1])}</td></tr>`).join('')}</table>
      <h3 style="font-size:15px;margin-top:22px">Hinnad</h3>${linesHtml}${totalsHtml}
      ${link ? `<p><a href="${esc(link)}">Ava pakkumine veebis</a></p>` : ''}
      <p style="color:#555;font-size:13px">Kliendile saadeti sama pakkumine PDF-ina aadressile ${esc(email)}. Vastamiseks vajuta lihtsalt „Vasta“.</p>`),
    attachments
  };

  const send = (mail) => fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json'},
    body: JSON.stringify(mail)
  });
  const r1 = await send(officeMail);                 // esmalt NORVO-le, et kontakt ei kaoks
  if (!r1.ok) return json({ok: false, error: 'office-send', status: r1.status, detail: (await r1.text()).slice(0, 300)}, 502);
  const r2 = await send(clientMail);
  if (!r2.ok) return json({ok: false, error: 'client-send', officeSent: true, status: r2.status, detail: (await r2.text()).slice(0, 300)}, 502);
  return json({ok: true});
}

export const onRequestGet = () => json({ok: false, error: 'method'}, 405);
