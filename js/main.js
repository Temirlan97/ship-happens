// Entry point: everything above attaches itself to window.Game; wait for
// sprite assets to load (async, unlike the old fully-procedural draws) before
// booting the game loop.
(function () {
  window.Game.Assets.loadAll(() => {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.add('hidden');
    window.Game.Core.init();
  });
})();
