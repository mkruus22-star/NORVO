// NORVO veebileht: staatilised failid + /api/pakkumine (hinnapakkumise saatmine)
import {onRequestPost} from './pakkumine.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // üks põhiaadress otsingumootoritele: http → https ja www.norvo.ee → norvo.ee (301)
    if (url.hostname.endsWith('norvo.ee') && (url.protocol === 'http:' || url.hostname !== 'norvo.ee')) {
      return Response.redirect(`https://norvo.ee${url.pathname}${url.search}`, 301);
    }
    if (url.pathname === '/api/pakkumine') {
      if (request.method === 'POST') return onRequestPost({request, env});
      return new Response(JSON.stringify({ok: false, error: 'method'}), {status: 405, headers: {'Content-Type': 'application/json'}});
    }
    return env.ASSETS.fetch(request);
  }
};
