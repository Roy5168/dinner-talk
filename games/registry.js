// 小遊戲清單。每週新做的遊戲放在 games/<代號>.html，並在這裡登記一筆；組長在「準備聚會」選這場要玩哪一個。
window.GAMES = [
  { id: 'night-drive', title: '夜路導航', emoji: '🚗', desc: '看不見前面的路時，你會相信誰？約 3 分鐘', theme: '啟發4 如何得著信心' }
];
window.gameById = function (id) {
  return (window.GAMES || []).filter(function (g) { return g.id === id; })[0] || null;
};
