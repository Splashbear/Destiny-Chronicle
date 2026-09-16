/**
 * Local-only Bungie proxy so ng serve works from http://127.0.0.1:4200
 * as well as http://localhost:4200. The registered API key allows the
 * localhost origin, not 127.0.0.1.
 */
function rewriteOrigin(proxyReq) {
  proxyReq.removeHeader('origin');
  proxyReq.setHeader('Origin', 'http://localhost:4200');
}

const bungieProxy = {
  target: 'https://www.bungie.net',
  secure: true,
  changeOrigin: true,
  headers: {
    Origin: 'http://localhost:4200'
  },
  onProxyReq: rewriteOrigin,
  configure(proxy) {
    proxy.on('proxyReq', rewriteOrigin);
  }
};

module.exports = {
  '/Platform': bungieProxy,
  '/d1': bungieProxy,
  '/common': bungieProxy
};
