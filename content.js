// Cypress Recorder - Browser Content Script
// Enhanced with WebSocket communication to VS Code Extension

(function() {
    'use strict';

    // Check if current page supports content scripts
    function isValidPage() {
        const url = window.location.href;
        const protocol = window.location.protocol;
        
        // Check for restricted pages
        const restrictedPages = [
            'chrome://',
            'chrome-extension://',
            'moz-extension://',
            'edge://',
            'about:',
            'file://',
            'data:',
            'javascript:',
            'chrome.google.com/webstore',
            'microsoftedge.microsoft.com/addons'
        ];
        
        const isRestricted = restrictedPages.some(restricted => url.includes(restricted));
        const isValidProtocol = protocol === 'http:' || protocol === 'https:';
        
        return !isRestricted && isValidProtocol;
    }

    // Show friendly error message for invalid pages
    function showPageError() {
        console.warn('🚫 Cypress Recorder: 当前页面无法注入脚本，请在普通网页测试！');
        console.info('✅ 建议测试页面：');
        console.info('  • https://example.com');
        console.info('  • https://httpbin.org/forms/post');
        console.info('  • https://demo.guru99.com/test/login.html');
        console.info('  • https://the-internet.herokuapp.com/');
        console.info('  • 或任何 http:// 或 https:// 开头的网页');
        
        // Try to show a visual notification if possible
        if (document.body) {
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #ff4444;
                color: white;
                padding: 15px 20px;
                border-radius: 8px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
                z-index: 999999;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                max-width: 300px;
                line-height: 1.4;
            `;
            notification.innerHTML = `
                <strong>🚫 Cypress Recorder</strong><br>
                当前页面无法注入脚本<br>
                请在普通网页测试！
            `;
            
            document.body.appendChild(notification);
            
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 5000);
        }
        
        return false;
    }

    // Exit early if page is not valid
    if (!isValidPage()) {
        showPageError();
        return;
    }

    // WebSocket connection to VS Code extension
    let ws = null;
    let connectionRetryCount = 0;
    const maxRetries = 3;
    const wsPort = 3004;
    
    // Recording state
    let isRecording = false;
    let recordedActions = [];
    let currentUrl = window.location.href;
    let sessionId = Date.now();
    
    // Scroll debouncing
    let scrollTimeout;
    const scrollDebounceDelay = 150;
    
    // Initialize WebSocket connection
    function initWebSocket() {
        if (ws && ws.readyState === WebSocket.OPEN) {
            return;
        }
        
        try {
            ws = new WebSocket(`ws://localhost:${wsPort}`);
            
            ws.onopen = function() {
                console.log('Connected to Cypress Recorder VS Code Extension');
                connectionRetryCount = 0;
                
                // Send connection status
                sendMessage({
                    type: 'status',
                    connected: true,
                    url: currentUrl,
                    recording: isRecording
                });
            };
            
            ws.onmessage = function(event) {
                try {
                    const message = JSON.parse(event.data);
                    handleMessage(message);
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            };
            
            ws.onclose = function(event) {
                console.log('WebSocket connection closed. Code:', event.code, 'Reason:', event.reason);
                ws = null;
                
                // Retry connection
                if (connectionRetryCount < maxRetries) {
                    connectionRetryCount++;
                    console.log(`🔄 Retrying connection... (${connectionRetryCount}/${maxRetries})`);
                    setTimeout(initWebSocket, 2000 * connectionRetryCount); // Exponential backoff
                } else {
                    console.log('⚠️ Max retries reached. Falling back to local storage.');
                    fallbackToLocalStorage();
                }
            };
            
            ws.onerror = function(error) {
                console.error('❌ WebSocket error:', error);
                
                // Send error details if possible
                if (ws && ws.readyState === WebSocket.OPEN) {
                    try {
                        sendMessage({
                            type: 'error',
                            error: 'WebSocket connection error',
                            details: {
                                url: currentUrl,
                                timestamp: Date.now(),
                                userAgent: navigator.userAgent
                            }
                        });
                    } catch (e) {
                        console.error('Failed to send error message:', e);
                    }
                }
            };
            
        } catch (error) {
            console.error('Failed to create WebSocket connection:', error);
            fallbackToLocalStorage();
        }
    }
    
    // Handle messages from VS Code extension
    function handleMessage(message) {
        switch (message.type) {
            case 'start_recording':
                startRecording();
                break;
            case 'stop_recording':
                stopRecording();
                break;
            case 'connected':
                isRecording = message.recording || false;
                console.log('✅ VS Code extension connected, recording:', isRecording);
                
                // Show connection status to user
                if (isRecording) {
                    console.log('🔴 Recording is already active');
                } else {
                    console.log('⚪ Recording is not active. Use Ctrl+Shift+R to start recording.');
                }
                
                // Update localStorage to sync state
                localStorage.setItem('cypressRecorder_recording', isRecording.toString());
                break;
            case 'error':
                console.error('❌ VS Code extension error:', message.error || message.message || 'Unknown error');
                if (message.details) {
                    console.error('Error details:', message.details);
                }
                break;
            case 'warning':
                console.warn('⚠️ VS Code extension warning:', message.message || message.warning);
                break;
            case 'info':
                console.info('ℹ️ VS Code extension info:', message.message || message.info);
                break;
            case 'ping':
                // Respond to ping with pong
                sendMessage({ type: 'pong', timestamp: Date.now() });
                break;
            case 'pong':
                // Handle pong response
                console.log('📡 Received pong from VS Code extension');
                break;
            default:
                console.warn('🤔 Unknown message type from VS Code:', message.type);
                console.log('Full message:', message);
        }
    }
    
    // Send message to VS Code extension
    function sendMessage(message) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify(message));
                console.log('📤 Message sent to VS Code:', message.type);
            } catch (error) {
                console.error('❌ Failed to send message to VS Code:', error);
                console.log('Message was:', message);
                
                // Try to reconnect if send fails
                if (connectionRetryCount < maxRetries) {
                    console.log('🔄 Attempting to reconnect after send failure...');
                    setTimeout(initWebSocket, 1000);
                }
            }
        } else {
            console.warn('⚠️ WebSocket not connected, message not sent:', message);
            console.log('Connection state:', ws ? ws.readyState : 'No WebSocket');
            
            // Store critical messages in localStorage as fallback
            if (message.type === 'test_generated') {
                localStorage.setItem('cypressRecorder_lastTest', JSON.stringify(message.testData));
                console.log('💾 Test data saved to localStorage as fallback');
            }
        }
    }
    
    // Fallback to local storage when WebSocket is not available
    function fallbackToLocalStorage() {
        console.log('Using local storage fallback');
        
        // Check if recording should be enabled from local storage
        const savedRecordingState = localStorage.getItem('cypressRecorder_recording');
        if (savedRecordingState === 'true') {
            startRecording();
        }
    }
    
    // Start recording user actions
    function startRecording() {
        if (isRecording) {
            return;
        }
        
        isRecording = true;
        recordedActions = [];
        sessionId = Date.now();
        
        console.log('🔴 Recording started');
        localStorage.setItem('cypressRecorder_recording', 'true');
        
        // Add event listeners
        document.addEventListener('click', handleClick, true);
        document.addEventListener('input', handleInput, true);
        document.addEventListener('scroll', handleScroll, true);
        
        // Send confirmation to VS Code
        sendMessage({
            type: 'recording_started',
            url: currentUrl,
            sessionId: sessionId
        });
        
        // Notify popup of state change
        try {
            chrome.runtime.sendMessage({
                action: 'recording_state_changed',
                isRecording: true
            });
        } catch (error) {
            console.log('Could not notify popup:', error);
        }
    }
    
    // Stop recording and generate test
    function stopRecording() {
        if (!isRecording) {
            return;
        }
        
        isRecording = false;
        
        console.log('⏹️ Recording stopped');
        localStorage.setItem('cypressRecorder_recording', 'false');
        
        // Remove event listeners
        document.removeEventListener('click', handleClick, true);
        document.removeEventListener('input', handleInput, true);
        document.removeEventListener('scroll', handleScroll, true);
        
        // Generate and send test data
        generateTest();
        
        // Send confirmation to VS Code
        sendMessage({
            type: 'recording_stopped',
            url: currentUrl,
            sessionId: sessionId
        });
        
        // Notify popup of state change
        try {
            chrome.runtime.sendMessage({
                action: 'recording_state_changed',
                isRecording: false
            });
        } catch (error) {
            console.log('Could not notify popup:', error);
        }
    }
    
    // Enhanced selector generation - skip div tags and top level
    // 禁止修改了！
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
        
        // 如果最终路径为空，不记录此操作
        if (path.length === 0) {
          return '';
        }
        
        return path.join(' ');
      }
    // Handle click events
    function handleClick(event) {
        if (!isRecording) return;
        
        const target = event.target;
        const selector = getSelector(target);
        
        // 如果选择器为空，不记录此操作
        if (!selector) {
            console.log('⏸️ Click ignored: element has no class');
            return;
        }
        
        recordedActions.push({
            type: 'click',
            selector: selector,
            text: target.textContent ? target.textContent.trim().substring(0, 50) : '',
            timestamp: Date.now(),
            url: window.location.href
        });
        
        console.log('📍 Click recorded:', selector);
    }
    
    // Handle input events
    function handleInput(event) {
        if (!isRecording) return;
        
        const target = event.target;
        const selector = getSelector(target);
        
        // 如果选择器为空，不记录此操作
        if (!selector) {
            console.log('⏸️ Input ignored: element has no class');
            return;
        }
        
        recordedActions.push({
            type: 'input',
            selector: selector,
            value: target.value,
            timestamp: Date.now(),
            url: window.location.href
        });
        
        console.log('⌨️ Input recorded:', selector, target.value);
    }
    
    // Handle scroll events with debouncing
    function handleScroll(event) {
        if (!isRecording) return;
        
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            const target = event.target;
            let scrollTop, scrollLeft, selector;
            
            // 判断是页面滚动还是元素滚动
            if (target === document || target === document.documentElement || target === document.body) {
                // 页面滚动
                scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
                selector = 'html'; // 页面滚动使用html作为选择器
            } else {
                // 元素滚动
                scrollTop = target.scrollTop;
                scrollLeft = target.scrollLeft;
                selector = getSelector(target);
                
                // 如果选择器为空，不记录此操作
                if (!selector) {
                    console.log('⏸️ Scroll ignored: element has no class');
                    return;
                }
            }
            
            recordedActions.push({
                type: 'scroll',
                selector: selector,
                scrollTop: scrollTop,
                scrollLeft: scrollLeft,
                timestamp: Date.now(),
                url: window.location.href
            });
            
            console.log('📜 Scroll recorded:', {
                selector: selector,
                scrollTop: scrollTop,
                scrollLeft: scrollLeft,
                isPageScroll: target === document || target === document.documentElement || target === document.body
            });
        }, scrollDebounceDelay);
    }
    
    // Generate test data
    function generateTest() {
        const testData = {
            url: currentUrl,
            actions: recordedActions,
            timestamp: sessionId,
            title: document.title || 'Recorded Test',
            userAgent: navigator.userAgent,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            }
        };
        
        console.log('🧪 Test generated:', testData);
        
        // Send to VS Code extension
        sendMessage({
            type: 'test_generated',
            testData: testData
        });
        
        // Fallback: save to local storage
        localStorage.setItem('cypressRecorder_lastTest', JSON.stringify(testData));
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', function(event) {
        // Ctrl+Shift+E or Cmd+Shift+E to start/stop recording
        if (event.ctrlKey && event.shiftKey && event.key === 'E') {
            event.preventDefault();
            if (isRecording) {
                stopRecording();
            } else {
                startRecording();
            }
        }
    });
    
    // Initialize on page load
    function init() {
        console.log('🚀 Cypress Recorder initialized');
        console.log('📡 Attempting to connect to VS Code extension on port', wsPort);
        
        // Initialize WebSocket connection
        initWebSocket();
        
        // Check for saved recording state
        const savedRecordingState = localStorage.getItem('cypressRecorder_recording');
        console.log('💾 Saved recording state:', savedRecordingState);
        
        if (savedRecordingState === 'true') {
            // Wait a bit for WebSocket to connect
            setTimeout(() => {
                if (!isRecording) {
                    console.log('⏰ Auto-starting recording from saved state');
                    startRecording();
                }
            }, 1000);
        }
    }
    
    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    // Handle page navigation
    window.addEventListener('beforeunload', function() {
        if (isRecording) {
            stopRecording();
        }
        if (ws) {
            ws.close();
        }
    });
    
    // Listen for messages from popup and background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('📨 Content script received message:', message);
        
        switch (message.action) {
            case 'start_recording':
                console.log('🎬 Popup requested start recording');
                startRecording();
                sendResponse({success: true, isRecording: true});
                break;
            case 'stop_recording':
                console.log('⏹️ Popup requested stop recording');
                stopRecording();
                sendResponse({success: true, isRecording: false});
                break;
            case 'get_recording_state':
                console.log('📊 Popup requested recording state:', isRecording);
                sendResponse({isRecording: isRecording});
                break;
            default:
                console.log('❓ Unknown action from popup:', message.action);
                sendResponse({success: false, error: 'Unknown action'});
        }
        return true; // Keep message channel open for async response
    });

    // Expose global functions for debugging
    window.cypressRecorder = {
        startRecording,
        stopRecording,
        getRecordedActions: () => recordedActions,
        isRecording: () => isRecording,
        getConnectionStatus: () => ws ? ws.readyState : 'Not connected'
    };
    
})(); 