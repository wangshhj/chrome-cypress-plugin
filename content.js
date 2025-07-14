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

    // Global error handler to prevent crashes
    window.addEventListener('error', function(event) {
        console.error('🚨 Uncaught error in Cypress Recorder:', event.error);
        // Don't stop the script execution, just log the error
    });

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', function(event) {
        console.error('🚨 Unhandled promise rejection in Cypress Recorder:', event.reason);
        // Prevent the error from being logged to console as uncaught
        event.preventDefault();
    });

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
            // If already connected and we're recording, send recording_started immediately
            if (isRecording) {
                sendMessage({
                    type: 'recording_started',
                    url: currentUrl,
                    sessionId: sessionId
                });
            }
            return;
        }
        
        try {
            ws = new WebSocket(`ws://localhost:${wsPort}`);
            
            ws.onopen = function() {
                connectionRetryCount = 0;
                
                // Send connection status
                sendMessage({
                    type: 'status',
                    connected: true,
                    url: currentUrl,
                    recording: isRecording
                });
                
                // If we're already recording when connection is established, send recording_started
                if (isRecording) {
                    sendMessage({
                        type: 'recording_started',
                        url: currentUrl,
                        sessionId: sessionId
                    });
                }
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
                ws = null;
                
                // Only retry if we're still recording
                if (isRecording && connectionRetryCount < maxRetries) {
                    connectionRetryCount++;
                    setTimeout(initWebSocket, 2000 * connectionRetryCount); // Exponential backoff
                }
            };
            
            ws.onerror = function(error) {
                console.error('❌ WebSocket connection error:', error);
                
                // Don't try to send error details via the same failed connection
                // Just log the error and let the connection retry logic handle it
            };
            
        } catch (error) {
            console.error('Failed to create WebSocket connection:', error);
        }
    }
    
    // Close WebSocket connection
    function closeWebSocket() {
        if (ws) {
            ws.close();
            ws = null;
        }
        connectionRetryCount = 0;
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
                // Don't override local recording state - VS Code should sync to us, not the other way around
                // Only sync if we're not currently recording
                if (!isRecording) {
                    isRecording = message.recording || false;
                    localStorage.setItem('cypressRecorder_recording', isRecording.toString());
                }
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
                break;
            default:
                console.warn('Unknown message type from VS Code:', message.type);
        }
    }
    
    // Send message to VS Code extension
    function sendMessage(message) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify(message));
            } catch (error) {
                console.error('❌ Failed to send message to VS Code:', error);
                
                // Try to reconnect if send fails and we're recording
                if (isRecording && connectionRetryCount < maxRetries) {
                    setTimeout(initWebSocket, 1000);
                }
            }
        } else {
            // WebSocket not connected - store critical messages as fallback
            if (message.type === 'test_generated' && message.testData) {
                try {
                    localStorage.setItem('cypressRecorder_lastTest', JSON.stringify(message.testData));
                } catch (error) {
                    console.error('❌ Failed to save test data to localStorage:', error);
                }
            }
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
        
        // Connect WebSocket when starting recording
        initWebSocket();
        
        // Add event listeners
        document.addEventListener('click', handleClick, true);
        document.addEventListener('input', handleInput, true);
        document.addEventListener('scroll', handleScroll, true);
        
        // Send confirmation to VS Code (will be sent once WebSocket connects)
        // Removed the setTimeout as it's now handled in ws.onopen
        
        // Notify popup of state change (if available)
        if (chrome.runtime && chrome.runtime.sendMessage) {
            try {
                chrome.runtime.sendMessage({
                    action: 'recording_state_changed',
                    isRecording: true
                }, function(response) {
                    // Handle response or error silently
                    if (chrome.runtime.lastError) {
                        // Silently ignore - popup might not be listening
                    }
                });
            } catch (error) {
                // Silently ignore - this is not critical
            }
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
        
        // Generate and send test data before closing connection
        generateTest();
        
        // Send confirmation to VS Code
        sendMessage({
            type: 'recording_stopped',
            url: currentUrl,
            sessionId: sessionId
        });
        
        // Close WebSocket connection after a short delay to ensure messages are sent
        setTimeout(() => {
            closeWebSocket();
        }, 1000);
        
        // Notify popup of state change (if available)
        if (chrome.runtime && chrome.runtime.sendMessage) {
            try {
                chrome.runtime.sendMessage({
                    action: 'recording_state_changed',
                    isRecording: false
                }, function(response) {
                    // Handle response or error silently
                    if (chrome.runtime.lastError) {
                        // Silently ignore - popup might not be listening
                    }
                });
            } catch (error) {
                // Silently ignore - this is not critical
            }
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
            return;
        }
        
        const action = {
            type: 'click',
            selector: selector,
            text: target.textContent ? target.textContent.trim().substring(0, 50) : '',
            timestamp: Date.now(),
            url: window.location.href
        };
        
        recordedActions.push(action);
        console.log('🖱️ Click recorded:', selector);
    }
    
    // Handle input events
    function handleInput(event) {
        if (!isRecording) return;
        
        const target = event.target;
        const selector = getSelector(target);
        
        // 如果选择器为空，不记录此操作
        if (!selector) {
            return;
        }
        
        const action = {
            type: 'input',
            selector: selector,
            value: target.value,
            timestamp: Date.now(),
            url: window.location.href
        };
        
        recordedActions.push(action);
        console.log('⌨️ Input recorded:', selector, '=', target.value ? `"${target.value.substring(0, 20)}${target.value.length > 20 ? '...' : ''}"` : '""');
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
                    return;
                }
            }
            
            const action = {
                type: 'scroll',
                selector: selector,
                scrollTop: scrollTop,
                scrollLeft: scrollLeft,
                timestamp: Date.now(),
                url: window.location.href
            };
            
            recordedActions.push(action);
            console.log('📜 Scroll recorded:', selector, `(${scrollTop}, ${scrollLeft})`);
        }, scrollDebounceDelay);
    }
    
    // Generate test data
    function generateTest() {
        try {
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
            
            // Send to VS Code extension
            sendMessage({
                type: 'test_generated',
                testData: testData
            });
            
            // Fallback: save to local storage
            try {
                localStorage.setItem('cypressRecorder_lastTest', JSON.stringify(testData));
            } catch (error) {
                console.error('❌ Failed to save test data to localStorage:', error);
            }
        } catch (error) {
            console.error('❌ Error generating test data:', error);
        }
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', function(event) {
        // Primary shortcut: Ctrl+Shift+E or Cmd+Shift+E
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'e') {
            event.preventDefault();
            event.stopPropagation();
            
            if (isRecording) {
                stopRecording();
            } else {
                startRecording();
            }
            return;
        }
        
        // Alternative shortcut: Ctrl+Shift+R or Cmd+Shift+R
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'r') {
            event.preventDefault();
            event.stopPropagation();
            
            if (isRecording) {
                stopRecording();
            } else {
                startRecording();
            }
            return;
        }
    }, true);
    
    // Initialize on page load
    function init() {
        // Don't auto-connect WebSocket - only connect when recording starts
        
        // Check for saved recording state
        const savedRecordingState = localStorage.getItem('cypressRecorder_recording');
        
        if (savedRecordingState === 'true') {
            // Auto-start recording if it was previously enabled
            setTimeout(() => {
                if (!isRecording) {
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
        } else {
            // Close WebSocket if it's open but not recording
            closeWebSocket();
        }
    });
    
    // Listen for messages from popup and background script
    if (chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            try {
                switch (message.action) {
                    case 'start_recording':
                        startRecording();
                        sendResponse({success: true, isRecording: true});
                        break;
                    case 'stop_recording':
                        stopRecording();
                        sendResponse({success: true, isRecording: false});
                        break;
                    case 'get_recording_state':
                        sendResponse({isRecording: isRecording});
                        break;
                    default:
                        sendResponse({success: false, error: 'Unknown action'});
                }
            } catch (error) {
                console.error('❌ Error handling message:', error);
                sendResponse({success: false, error: error.message});
            }
            
            return true; // Keep message channel open for async response
        });
    }

    // Expose global functions for debugging
    window.cypressRecorder = {
        startRecording,
        stopRecording,
        getRecordedActions: () => recordedActions,
        isRecording: () => isRecording,
        getConnectionStatus: () => ws ? ws.readyState : 'Not connected'
    };
    
})(); 