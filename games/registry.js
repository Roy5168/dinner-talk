// 小遊戲清單。每週新做的遊戲放在 games/<代號>.html，並在這裡登記一筆；組長在「準備聚會」選這場要玩哪一個。
window.GAMES = [
  { id: 'night-drive', title: '夜路導航', emoji: '🚗', desc: '看不見前面的路時，你會相信誰？約 3 分鐘', theme: '啟發4 如何得著信心' },
  { id: 'traffic-light', title: '爸爸的紅綠燈', emoji: '🚦', desc: '今天換你當爸媽：孩子來求，你會怎麼回應？約 3 分鐘', theme: '啟發5 為什麼禱告？怎樣禱告？' },
  { id: 'love-letter', title: '情書解密', emoji: '💌', desc: '五個人、五句話：在人生低谷時，什麼話接住了他們？約 4 分鐘', theme: '啟發6 為什麼讀聖經？怎樣讀聖經？' }
];
window.gameById = function (id) {
  return (window.GAMES || []).filter(function (g) { return g.id === id; })[0] || null;
};
