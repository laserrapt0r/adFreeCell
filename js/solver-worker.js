/* adFreeCell - background thread for the dead-end check.
   findSolutionMove can take 0.3-1.6s; on the main thread that froze the UI
   mid-drag. Here it runs in a Web Worker (fully local, ships with the app,
   works offline) and posts the verdict back. The engine attaches itself to
   `window`, which doesn't exist in a worker - alias it to the worker global. */
self.window = self;
importScripts('deal.js', 'engine.js');   // engine reads Deal.isRed at load time

var E = self.FreeCellEngine;

self.onmessage = function (ev) {
  var msg = ev.data;
  var res = E.findSolutionMove(msg.state, msg.maxNodes || 30000);
  self.postMessage({ id: msg.id, unsolvable: !!res.unsolvable });
};
