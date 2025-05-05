
export default {
  bootstrap: () => import('./main.server.mjs').then(m => m.default),
  inlineCriticalCss: true,
  baseHref: '/Destiny-Chronicle/',
  locale: undefined,
  routes: [
  {
    "renderMode": 2,
    "route": "/Destiny-Chronicle"
  }
],
  entryPointToBrowserMapping: undefined,
  assets: {
    'index.csr.html': {size: 743, hash: 'd06547031c4502a0bfd35d71756d224f1ef566f4073c5f8c8c9c0e952da0da61', text: () => import('./assets-chunks/index_csr_html.mjs').then(m => m.default)},
    'index.server.html': {size: 1031, hash: '6871e423bae21b66465be68c1d0a12c041fdcbb4a8e2574c0e87b6cab5e8a442', text: () => import('./assets-chunks/index_server_html.mjs').then(m => m.default)},
    'index.html': {size: 6995528, hash: '8fa3f475b4ce92718d49dcf1b191810e3285500897183dd853e4f280344dd577', text: () => import('./assets-chunks/index_html.mjs').then(m => m.default)},
    'styles-HGSN3UCF.css': {size: 100, hash: 'VomWJ7TDkHE', text: () => import('./assets-chunks/styles-HGSN3UCF_css.mjs').then(m => m.default)}
  },
};
