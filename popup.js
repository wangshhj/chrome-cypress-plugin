// Cypress Recorder - Browser Extension Popup
// Simple independent dual-button approach - v3.1

document.addEventListener('DOMContentLoaded', function() {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const connectionStatus = document.getElementById('connectionStatus');
    const warningMessage = document.getElementById('warningMessage');
    
    let currentTab = null;
    let ws = null;

    // Global error handler for popup
    window.addEventListener('error', function(event) {
        console.error('🚨 Uncaught error in popup:', event.error);
        showError('插件运行时出错，请重试');
    });

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', function(event) {
        console.error('🚨 Unhandled promise rejection in popup:', event.reason);
        event.preventDefault();
    });

    // Initialize popup
    async function init() {
        console.log('🚀 Popup initializing (simple independent mode)...');
        
        try {
            // Get current active tab
            const tabs = await chrome.tabs.query({active: true, currentWindow: true});
            currentTab = tabs[0];
            console.log('📱 Current tab:', currentTab?.url);
            
            // Check if current page is valid
            checkPageValidity();
            
            // Try to connect to VS Code extension
            connectToVSCode();
            
        } catch (error) {
            console.error('❌ Failed to initialize popup:', error);
            showError('初始化失败');
        }
    }
    
    // Check if current page supports content scripts
    function checkPageValidity() {
        if (!currentTab) {
            console.log('⚠️ No current tab');
            showError('无法获取当前页面');
            return false;
        }
        
        const url = currentTab.url;
        console.log('🔍 Checking page validity for:', url);
        
        const invalidPages = [
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
        
        const isInvalid = invalidPages.some(invalid => url.includes(invalid));
        const isValidProtocol = url.startsWith('http://') || url.startsWith('https://');
        
        if (isInvalid || !isValidProtocol) {
            console.log('❌ Invalid page detected');
            showPageWarning();
            // Disable both buttons on invalid pages
            startBtn.disabled = true;
            stopBtn.disabled = true;
            return false;
        } else {
            console.log('✅ Valid page detected');
            hidePageWarning();
            // Enable both buttons on valid pages
            startBtn.disabled = false;
            stopBtn.disabled = false;
            return true;
        }
    }
    
    // Connect to VS Code extension via WebSocket
    function connectToVSCode() {
        console.log('🔌 Connecting to VS Code...');
        
        try {
            ws = new WebSocket('ws://localhost:3004');
            
            ws.onopen = function() {
                updateConnectionStatus('已连接到 VS Code', 'connected');
                console.log('✅ Connected to VS Code extension');
            };
            
            ws.onmessage = function(event) {
                try {
                    const message = JSON.parse(event.data);
                    console.log('📨 Message from VS Code:', message);
                    // No longer handle state changes - just log
                } catch (error) {
                    console.error('❌ Error parsing message:', error);
                }
            };
            
            ws.onclose = function() {
                updateConnectionStatus('VS Code 连接已断开', 'disconnected');
                console.log('❌ VS Code connection closed');
            };
            
            ws.onerror = function(error) {
                updateConnectionStatus('VS Code 连接失败', 'disconnected');
                console.error('❌ WebSocket error:', error);
            };
            
        } catch (error) {
            updateConnectionStatus('VS Code 连接失败', 'disconnected');
            console.error('❌ Failed to connect to VS Code:', error);
        }
    }
    
    // Update connection status display
    function updateConnectionStatus(message, status) {
        connectionStatus.textContent = message;
        connectionStatus.className = `connection-status ${status}`;
        console.log('📶 Connection status updated:', message, status);
    }
    
    // Show page warning
    function showPageWarning() {
        warningMessage.style.display = 'block';
        warningMessage.innerHTML = `
            <strong>⚠️ 页面限制</strong><br>
            当前页面无法使用录制功能<br>
            请访问普通网页进行测试
        `;
    }
    
    // Hide page warning
    function hidePageWarning() {
        warningMessage.style.display = 'none';
    }
    
    // Show error message
    function showError(message) {
        warningMessage.style.display = 'block';
        warningMessage.innerHTML = `<strong>❌ 错误</strong><br>${message}`;
    }
    
    // Send message to content script
    function sendToContentScript(message) {
        console.log('📤 Sending to content script:', message);
        
        if (!currentTab) {
            console.error('❌ No current tab to send message to');
            return;
        }
        
        try {
            chrome.tabs.sendMessage(currentTab.id, message, function(response) {
                if (chrome.runtime.lastError) {
                    console.error('❌ Failed to send message to content script:', chrome.runtime.lastError);
                    showError('无法与页面通信，请刷新页面后重试');
                } else {
                    console.log('✅ Message sent to content script successfully');
                }
            });
        } catch (error) {
            console.error('❌ Error sending message to content script:', error);
            showError('发送消息时出错，请重试');
        }
    }
    
    // Send message to VS Code extension
    function sendToVSCode(message) {
        console.log('📤 Sending to VS Code:', message);
        
        if (ws && ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify(message));
                console.log('✅ Message sent to VS Code successfully');
            } catch (error) {
                console.error('❌ Error sending message to VS Code:', error);
            }
        } else {
            console.warn('⚠️ VS Code not connected');
        }
    }
    
    // START button event listener
    startBtn.addEventListener('click', function() {
        console.log('🎬 User clicked START button');
        
        if (startBtn.disabled) {
            console.log('❌ START button is disabled');
            return;
        }
        
        // Send to content script
        sendToContentScript({action: 'start_recording'});
        
        // Send to VS Code extension
        sendToVSCode({type: 'start_recording'});
        
        console.log('✅ Start recording commands sent');
        
        // Close popup after short delay
        setTimeout(() => {
            console.log('🔒 Closing popup...');
            window.close();
        }, 300);
    });
    
    // STOP button event listener
    stopBtn.addEventListener('click', function() {
        console.log('⏹️ User clicked STOP button');
        
        if (stopBtn.disabled) {
            console.log('❌ STOP button is disabled');
            return;
        }
        
        // Send to content script
        sendToContentScript({action: 'stop_recording'});
        
        // Send to VS Code extension
        sendToVSCode({type: 'stop_recording'});
        
        console.log('✅ Stop recording commands sent');
        
        // Close popup after short delay
        setTimeout(() => {
            console.log('🔒 Closing popup...');
            window.close();
        }, 300);
    });
    
    // Simple debug function
    window.debugPopup = function() {
        console.log('🐛 === Debug Popup State (Simple Independent Mode) ===');
        console.log('currentTab:', currentTab);
        console.log('START button disabled:', startBtn.disabled);
        console.log('STOP button disabled:', stopBtn.disabled);
        console.log('VS Code connection:', ws ? ws.readyState : 'No connection');
        console.log('========================================================');
    };
    
    // Initialize when popup opens
    init();
});

// Handle popup close
window.addEventListener('beforeunload', function() {
    console.log('🔒 Popup closing...');
    
    // Close WebSocket connection
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
    }
}); 