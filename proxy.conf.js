/**
 * Local-only Bungie proxy so ng serve works from http://127.0.0.1:4200
 * as well as http://localhost:4200. The registered API key allows the
 * localhost origin, not 127.0.0.1.
 *
 * D2 PGCRs must go to stats.bungie.net. www.bungie.net 301s those
 * requests to http://stats.bungie.net, which the browser then follows
 * off-origin (301/500 noise and missing activity details).
 */
function rewriteOrigin(proxyReq) {
  proxyReq.removeHeader('origin');
  proxyReq.setHeader('Origin', 'http://localhost:4200');
}

function rewriteLocation(proxyRes) {
  const loc = proxyRes.headers.location;
  if (!loc) {
    return;
  }
  const next = loc
    .replace(/^https?:\/\/(www\.)?bungie\.net/i, '')
    .replace(/^https?:\/\/stats\.bungie\.net/i, '');
  if (next && next !== loc) {
    proxyRes.headers.location = next;
  }
}

function attach(proxy) {
  proxy.on('proxyReq', rewriteOrigin);
  proxy.on('proxyRes', rewriteLocation);
}

function bungieProxy(target) {
  return {
    target,
    secure: true,
    changeOrigin: true,
    headers: {
      Origin: 'http://localhost:4200'
    },
    onProxyReq: rewriteOrigin,
    onProxyRes: rewriteLocation,
    configure: attach
  };
}

module.exports = {
  '/Platform/Destiny2/Stats': bungieProxy('https://stats.bungie.net'),
  '/Platform': bungieProxy('https://www.bungie.net'),
  '/d1': bungieProxy('https://www.bungie.net'),
  '/common': bungieProxy('https://www.bungie.net')
};
