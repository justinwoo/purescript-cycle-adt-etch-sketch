exports.onKeyboardDown = function (eff) {
  window.onkeydown = function (e) {
    eff(e.keyCode)();
  };
};


exports.writeToDOM = function(s) {
  return function () {
    a.innerText = s;
  };
};
