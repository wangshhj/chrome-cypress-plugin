document.getElementById('startBtn').onclick = function() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {action: 'start_record'}, function(response) {
      if (chrome.runtime.lastError) {
        alert('当前页面无法注入脚本，请在普通网页测试！');
      } else {
        console.log('开始记录操作');
      }
    });
  });
};
document.getElementById('stopBtn').onclick = function() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {action: 'stop_record'}, function(response) {
      if (chrome.runtime.lastError) {
        alert('当前页面无法注入脚本，请在普通网页测试！');
      } else {
        console.log('结束记录操作');
      }
    });
  });
}; 