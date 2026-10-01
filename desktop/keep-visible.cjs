// Raise only passive overlays; never activate or show a hidden window.
module.exports = function keepVisible(windows) {
  for (const win of windows) {
    if (!win || win.isDestroyed() || !win.isVisible() || win.isMinimized()) continue;
    if (win.isFocusable()) continue;
    if (!win.isAlwaysOnTop()) win.setAlwaysOnTop(true, 'screen-saver');
    win.moveTop();
  }
};
