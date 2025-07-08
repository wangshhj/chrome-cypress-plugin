console.log('用户操作记录器 content.js 已加载');

let isRecording = false;
let actions = [];

function getSelector(el) {
  if (!el) return '';
  if (el === document.body) return 'body';
  
  // 构建基于 class 的路径选择器
  let path = [];
  let current = el;
  
  while (current && current !== document.body) {
    // 检查当前元素是否有 class
    if (current.className && typeof current.className === 'string') {
      const classes = current.className.trim().split(/\s+/).filter(cls => cls);
      if (classes.length > 0) {
        // 只取第一个 class
        let selector = '.' + classes[0];
        
        // 检查是否有同样 class 的兄弟元素，但 body 层的直接子元素不加选择器
        if (current.parentElement && current.parentElement !== document.body) {
          const siblings = Array.from(current.parentElement.children);
          
          // 找到所有有相同 class 的兄弟元素
          const sameClassSiblings = siblings.filter(sibling => {
            if (!sibling.className) return false;
            
            // 确保 className 是字符串类型
            const siblingClassName = typeof sibling.className === 'string' 
              ? sibling.className 
              : sibling.className.toString();
            
            const siblingClasses = siblingClassName.trim().split(/\s+/).filter(cls => cls);
            return siblingClasses.length > 0 && siblingClasses[0] === classes[0];
          });
          
          // 如果有多个相同 class 的元素，使用 nth-child 来精确定位
          if (sameClassSiblings.length > 1) {
            // 计算当前元素在所有兄弟元素中的位置（1开始）
            const index = siblings.indexOf(current) + 1;
            selector += ':nth-child(' + index + ')';
          }
        }
        
        path.unshift(selector);
      }
    }
    // 如果没有 class，跳过这个元素，继续向上查找
    current = current.parentElement;
  }
  
  // 如果最终路径为空，返回元素标签名
  if (path.length === 0) {
    return el.tagName.toLowerCase();
  }
  
  return path.join(' ');
}

function clickHandler(e) {
  if (!isRecording) return;
  const dom = getSelector(e.target);
  actions.push({type: 'click', dom});
  // 不阻止原始事件，让页面正常响应点击
}

function inputHandler(e) {
  if (!isRecording) return;
  const dom = getSelector(e.target);
  actions.push({type: 'input', dom, value: e.target.value});
}

function startRecord() {
  isRecording = true;
  actions = [];
  document.addEventListener('click', clickHandler, true);
  document.addEventListener('input', inputHandler, true);
}

function stopRecord() {
  isRecording = false;
  document.removeEventListener('click', clickHandler, true);
  document.removeEventListener('input', inputHandler, true);
  if (actions.length > 0) {
    const blob = new Blob([JSON.stringify(actions, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'actions.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'start_record') {
    startRecord();
    sendResponse({success: true});
  } else if (msg.action === 'stop_record') {
    stopRecord();
    sendResponse({success: true});
  }
}); 