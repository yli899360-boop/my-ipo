// 主逻辑：界面交互、消息渲染、本地存储恢复。依赖 js/emojis.js 提供的 WEIXIN_EMOJIS。
let currentRole = 'right';
let currentAvatarTargetRole = null; 
let leftAvatarSrc = null;  
let rightAvatarSrc = null; 
let isManualTime = false; 
let currentSelectedRow = null;
const STORAGE_KEY = 'ios_wechat_simulator_v8';
let storageWarningShown = false;
let isRestoringState = false;

function syncRealTime() {
    if (isManualTime) return; 
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('displayTime').innerText = `${hours}:${minutes}`;
}

function saveState() {
    if (isRestoringState) return;
    try {
        const state = {
            version: 8,
            chatHTML: document.getElementById('chatBody').innerHTML,
            title: document.getElementById('chatTitle').textContent,
            time: document.getElementById('displayTime').textContent,
            manualTime: isManualTime,
            battery: document.getElementById('displayBattery').textContent,
            role: currentRole,
            leftAvatar: leftAvatarSrc,
            rightAvatar: rightAvatarSrc,
            customEmojiHTML: Array.from(document.querySelectorAll('#emojiGrid .custom-emoji-item')).map(el => el.outerHTML).join(''),
            savedAt: Date.now()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
        if (!storageWarningShown) {
            storageWarningShown = true;
            console.warn('本地保存失败，可能是浏览器存储空间不足：', err);
        }
    }
}

let saveTimer = null;
function scheduleSave() {
    if (isRestoringState) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveState, 250);
}

// 自定义弹窗控制
let dialogCallback = null;
function showCustomDialog(options) {
    const mask = document.getElementById('customDialogMask');
    const titleEl = document.getElementById('customDialogTitle');
    const inputEl = document.getElementById('customDialogInput');
    const cancelBtn = document.getElementById('customDialogCancelBtn');
    const okBtn = document.getElementById('customDialogOkBtn');

    titleEl.innerText = options.title;
    cancelBtn.innerText = options.cancelText;
    okBtn.innerText = options.okText;
    cancelBtn.style.display = options.hideCancel ? 'none' : 'flex';

    if (options.showInput) {
        inputEl.style.display = 'block';
        inputEl.value = options.defaultValue || '';
        setTimeout(() => inputEl.focus(), 100);
    } else {
        inputEl.style.display = 'none';
    }

    dialogCallback = options.callback;
    mask.classList.add('show');

    cancelBtn.onclick = function() {
        mask.classList.remove('show');
        if (dialogCallback) dialogCallback('left');
    };
    okBtn.onclick = function() {
        mask.classList.remove('show');
        if (dialogCallback) {
            if (options.showInput) {
                dialogCallback('ok', inputEl.value);
            } else {
                dialogCallback('right');
            }
        }
    };
}

// 统一风格的提示弹窗（单个“确定”按钮）
function showCustomAlert(message, okText) {
    showCustomDialog({
        title: message,
        showInput: false,
        cancelText: '取消',
        okText: okText || '确定',
        hideCancel: true,
        callback: function() {}
    });
}

function loadState() {
    let state;
    try { state = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
    catch (err) { console.warn('读取本地记录失败：', err); return; }
    if (!state || state.version !== 8) return;
    isRestoringState = true;
    try {
        if (typeof state.chatHTML === 'string') document.getElementById('chatBody').innerHTML = state.chatHTML;
        if (typeof state.title === 'string') document.getElementById('chatTitle').textContent = state.title;
        if (typeof state.time === 'string') document.getElementById('displayTime').textContent = state.time;
        isManualTime = !!state.manualTime;
        if (state.battery !== undefined) {
            const n = Math.max(0, Math.min(100, Number(state.battery) || 0));
            document.getElementById('displayBattery').textContent = String(n);
            document.getElementById('batteryFill').style.width = n + '%';
            document.getElementById('batteryPill').classList.toggle('low-battery', n <= 15);
        }
        if (state.role === 'left' || state.role === 'right') currentRole = state.role;
        leftAvatarSrc = typeof state.leftAvatar === 'string' ? state.leftAvatar : null;
        rightAvatarSrc = typeof state.rightAvatar === 'string' ? state.rightAvatar : null;
        if (typeof state.customEmojiHTML === 'string' && state.customEmojiHTML) {
            const grid = document.getElementById('emojiGrid');
            const addBtn = grid.querySelector('.custom-emoji-add');
            const tmp = document.createElement('div');
            tmp.innerHTML = state.customEmojiHTML;
            Array.from(tmp.children).forEach(el => grid.insertBefore(el, addBtn));
        }
        bindCustomEmojiEvents();
        updateRoleButtons();
        setupRowHandlers();
        handleInput();
    } catch (err) { console.warn('恢复聊天记录失败：', err); }
    finally { isRestoringState = false; }
}

function setupRowHandlers() {
    document.querySelectorAll('#chatBody .msg-row').forEach(row => {
        row.onclick = function(e) { onRowClick(e, row); };
    });
    if (leftAvatarSrc) updateAllAvatars('left', leftAvatarSrc);
    if (rightAvatarSrc) updateAllAvatars('right', rightAvatarSrc);
}

function updateRoleButtons() {
    document.getElementById('roleBtnRight').className = currentRole === 'right' ? 'btn' : 'btn btn-secondary';
    document.getElementById('roleBtnLeft').className = currentRole === 'left' ? 'btn' : 'btn btn-secondary';
}

function handleInput() {
    const input = document.getElementById('msgInput');
    const plusBtn = document.getElementById('plusBtn');
    const sendBtn = document.getElementById('sendBtn');

    if (input.value.trim().length > 0) {
        plusBtn.style.display = 'none';
        sendBtn.style.display = 'block';
    } else {
        plusBtn.style.display = 'flex';
        sendBtn.style.display = 'none';
    }
}

function onInputFocus() {
    document.getElementById('morePanel').classList.remove('show');
    document.getElementById('emojiPanel').classList.remove('show');
    setTimeout(() => {
        const chatBody = document.getElementById('chatBody');
        chatBody.scrollTop = chatBody.scrollHeight;
    }, 300);
}

function toggleMorePanel() {
    document.getElementById('emojiPanel').classList.remove('show');
    const morePanel = document.getElementById('morePanel');
    morePanel.classList.toggle('show');
    const chatBody = document.getElementById('chatBody');
    chatBody.scrollTop = chatBody.scrollHeight;
}

function toggleEmojiPanel() {
    document.getElementById('morePanel').classList.remove('show');
    const emojiPanel = document.getElementById('emojiPanel');
    emojiPanel.classList.toggle('show');
    const chatBody = document.getElementById('chatBody');
    chatBody.scrollTop = chatBody.scrollHeight;
}


// 动态渲染内置微信表情到面板（不写入 localStorage，避免撑爆存储）
function renderWeixinEmojis() {
    const grid = document.getElementById('emojiGrid');
    const addBtn = grid.querySelector('.custom-emoji-add');
    WEIXIN_EMOJIS.forEach(function(item) {
        const div = document.createElement('div');
        div.className = 'emoji-item weixin-emoji';
        div.title = item[0];
        const img = document.createElement('img');
        img.src = item[1];
        img.alt = item[0];
        div.appendChild(img);
        div.addEventListener('click', function() {
            sendWeixinEmoji(item[1], item[0]);
        });
        grid.insertBefore(div, addBtn);
    });
}

// 发送微信表情：与真实微信一致，表情以约 27px 显示在气泡内
function sendWeixinEmoji(src, name) {
    document.getElementById('emojiPanel').classList.remove('show');
    appendBubble('<div class="bubble emoji-bubble"><img class="emoji-bubble-img" src="' + src + '" alt="' + name + '"></div>', 'custom', currentRole);
}

// 删除指定自定义表情（带确认）
function deleteCustomEmoji(el) {
    showCustomDialog({
        title: '要删除这个自定义表情吗？',
        showInput: false,
        cancelText: '取消',
        okText: '删除',
        callback: function(action) {
            if (action !== 'right') return;
            el.remove();
            scheduleSave();
        }
    });
}

// 为自定义表情绑定事件：点击发送；右上角 × 删除；长按（手机）/右键（电脑）也可删除
function attachCustomEmojiHandlers(el, img) {
    if (!el || !img) return;

    // 右上角删除按钮（已存在则复用，避免重复插入）
    let delBtn = el.querySelector('.custom-emoji-del');
    if (!delBtn) {
        delBtn = document.createElement('span');
        delBtn.className = 'custom-emoji-del';
        delBtn.textContent = '×';
        delBtn.title = '删除这个表情';
        el.appendChild(delBtn);
    }
    if (!delBtn.__bound) {
        delBtn.__bound = true;
        delBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            deleteCustomEmoji(el);
        });
    }

    // 用 JS 属性而非 data-* 记标记，避免被 outerHTML 存进 localStorage 后恢复时“假绑定”
    if (el.__bound) return;
    el.__bound = true;

    let pressTimer = null;
    let longPressed = false;

    el.addEventListener('click', function() {
        // 长按删除后触发的 click 不再发送表情
        if (longPressed) { longPressed = false; return; }
        appendBubble(img.src, 'image', currentRole);
    });

    function cancelPress() {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    }

    function startPress() {
        cancelPress();
        longPressed = false;
        pressTimer = setTimeout(function() {
            longPressed = true;
            deleteCustomEmoji(el);
        }, 550);
    }

    el.addEventListener('touchstart', startPress, { passive: true });
    el.addEventListener('touchend', cancelPress);
    el.addEventListener('touchmove', cancelPress);
    el.addEventListener('touchcancel', cancelPress);
    el.addEventListener('mousedown', startPress);
    el.addEventListener('mouseup', cancelPress);
    el.addEventListener('mouseleave', cancelPress);
    el.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        startPress();
    });
}

// 从 localStorage 恢复后事件会丢失，需重新绑定
function bindCustomEmojiEvents() {
    document.querySelectorAll('#emojiGrid .custom-emoji-item').forEach(function(el) {
        const img = el.querySelector('img');
        if (!img) return;
        attachCustomEmojiHandlers(el, img);
    });
}

function triggerCustomEmojiUpload() {
    const input = document.getElementById('customEmojiInput');
    input.onchange = handleCustomEmojiFile;
    input.click();
}

function handleCustomEmojiFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    compressImage(file, 512, 0.78, true).then(imgSrc => {
        const grid = document.getElementById('emojiGrid');
        const addBtn = grid.querySelector('.custom-emoji-add');
        const newEmojiDiv = document.createElement('div');
        newEmojiDiv.className = 'emoji-item custom-emoji-item';
        newEmojiDiv.title = '自定义表情';
        const img = document.createElement('img');
        img.src = imgSrc;
        img.alt = '自定义表情';
        newEmojiDiv.appendChild(img);
        attachCustomEmojiHandlers(newEmojiDiv, img);
        grid.insertBefore(newEmojiDiv, addBtn);
        scheduleSave();
    }).catch(() => showCustomAlert('表情图片读取失败，请换一张图片再试。')).finally(() => { e.target.value = ''; });
}

// 红包卡片改用纯 CSS 绘制（见 .rp-* 样式），不再内嵌图片

function sendRedPacket() {
    document.getElementById('morePanel').classList.remove('show');

    // 尖角朝向跟随发送身份：自己发（右）尖角在右，对方发（左）尖角在左
    const dirClass = currentRole === 'right' ? 'rp-right' : 'rp-left';

    const html = `
        <div class="redpacket-card-img" onclick="showCustomAlert('微信红包')">
            <div class="rp-card ${dirClass}">
                <div class="rp-body">
                    <div class="rp-env"><div class="rp-flap"></div><div class="rp-coin">￥</div></div>
                    <div class="rp-title">恭喜发财，大吉大利</div>
                    <div class="rp-sub">红包</div>
                </div>
            </div>
        </div>
    `;
    appendBubble(html, 'custom', currentRole);
}

// 转账卡片改用纯 CSS 绘制（见 .tc-* 样式），不再内嵌图片

function sendTransfer() {
    document.getElementById('morePanel').classList.remove('show');
    showCustomDialog({
        title: '请输入转账金额（元）：',
        showInput: true,
        defaultValue: '0.10',
        cancelText: '取消',
        okText: '确认',
        callback: function(action, inputValue) {
            if (action !== 'ok') return;
            const amount = inputValue;
            if (amount === null || amount.trim() === '') return;

            const rawAmount = amount.trim();
            if (!/^(?:\d+)(?:\.\d{1,2})?$/.test(rawAmount)) {
                showCustomAlert('金额格式不正确，请输入数字，最多保留两位小数。');
                return;
            }
            const numericAmount = Number(rawAmount);
            if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > 100000000) {
                showCustomAlert('金额必须大于 0 且不超过 100,000,000 元。');
                return;
            }
            const val = numericAmount.toFixed(2);

            const transferId = 'transfer_' + Date.now();
            const subText = currentRole === 'right' ? '你发起了一笔转账' : '请收款';
            const transferDir = currentRole === 'right' ? 'tc-right' : 'tc-left';

            const html = `
                <div class="transfer-card-img" id="${transferId}">
                    <div class="tc-css ${transferDir}">
                        <div class="tc-body">
                            <div class="tc-ring">
                                <svg viewBox="0 0 32 32" fill="none" stroke="#FFFFFF" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M13.25 8.70 L7.30 13.45 H24.15"/>
                                    <path d="M8.30 18.83 H24.15 L18.85 24.10"/>
                                </svg>
                            </div>
                            <span class="tc-tag">转账</span>
                        </div>
                    </div>
                    <div class="transfer-overlay-text">
                        <div class="transfer-money-title">¥${val}</div>
                        <div class="transfer-desc-sub" id="${transferId}_sub">${subText}</div>
                    </div>
                </div>
            `;
            // 记录发起这笔转账时的身份，后续点击收款/退款时以此为准（避免切换身份后收款方错位）
            const senderRole = currentRole;
            const row = appendBubble(html, 'custom', senderRole);
            row.querySelector('#' + transferId).addEventListener('click', function(e) {
                handleTransferClick(e, transferId, val, senderRole);
            });
        }
    });
}

function handleTransferClick(e, id, amount, senderRole) {
    e.stopPropagation();
    const bubble = document.getElementById(id);

    if (bubble.classList.contains('status-done')) {
        showCustomAlert("该笔转账已处理完毕。");
        return;
    }

    showCustomDialog({
        title: `收到一笔 ¥${amount} 的转账：`,
        showInput: false,
        cancelText: '退还转账',
        okText: '确认收款',
        callback: function(btn) {
            if (btn === 'right') {
                bubble.className = "transfer-card-css status-done";
                bubble.innerHTML = `
                    <div class="transfer-body">
                        <div class="transfer-icon-ring">
                            <svg class="transfer-check-svg" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </div>
                        <div class="transfer-info">
                            <div class="transfer-amount">¥${amount}</div>
                            <div class="transfer-status-text">已被接收</div>
                        </div>
                    </div>
                    <div class="transfer-footer">转账</div>
                `;

                const recipientRole = senderRole === 'right' ? 'left' : 'right';
                const recipientTransferId = 'transfer_recv_' + Date.now();

                const recipientHtml = `
                    <div class="transfer-card-css status-done" id="${recipientTransferId}">
                        <div class="transfer-body">
                            <div class="transfer-icon-ring">
                                <svg class="transfer-check-svg" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            </div>
                            <div class="transfer-info">
                                <div class="transfer-amount">¥${amount}</div>
                                <div class="transfer-status-text">已收款</div>
                            </div>
                        </div>
                        <div class="transfer-footer">转账</div>
                    </div>
                `;
                appendBubble(recipientHtml, 'custom', recipientRole);

            } else if (btn === 'left') {
                bubble.className = "transfer-card-css status-done";
                bubble.innerHTML = `
                    <div class="transfer-body">
                        <div class="transfer-icon-ring">
                            <svg class="transfer-check-svg" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </div>
                        <div class="transfer-info">
                            <div class="transfer-amount">¥${amount}</div>
                            <div class="transfer-status-text">已被退还</div>
                        </div>
                    </div>
                    <div class="transfer-footer">转账</div>
                `;

                const recipientRole = senderRole === 'right' ? 'left' : 'right';
                const recipientTransferId = 'transfer_refund_' + Date.now();

                const recipientHtml = `
                    <div class="transfer-card-css status-done" id="${recipientTransferId}">
                        <div class="transfer-body">
                            <div class="transfer-icon-ring">
                                <svg class="transfer-check-svg" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            </div>
                            <div class="transfer-info">
                                <div class="transfer-amount">¥${amount}</div>
                                <div class="transfer-status-text">已退还</div>
                            </div>
                        </div>
                        <div class="transfer-footer">转账</div>
                    </div>
                `;
                appendBubble(recipientHtml, 'custom', recipientRole);
            }
        }
    });
}

function onRowClick(e, rowEl) {
    e.stopPropagation();

    // 只有点到头像或消息内容才弹菜单；点消息行的空白区域一律收起，避免菜单乱跑
    const target = e.target;
    const hitArea = target && target.closest
        ? (target.closest('.avatar') || target.closest('.bubble-wrapper'))
        : null;
    if (!hitArea) {
        currentSelectedRow = null;
        hideActionMenu();
        return;
    }

    currentSelectedRow = rowEl;
    const menu = document.getElementById('actionMenu');
    const chatBody = document.getElementById('chatBody');
    const bodyRect = chatBody.getBoundingClientRect();

    menu.style.display = 'block';
    const menuW = menu.offsetWidth;
    const menuH = menu.offsetHeight;
    const areaRect = hitArea.getBoundingClientRect();
    const isRight = rowEl.classList.contains('right');

    // 菜单固定贴在消息上方（右侧消息右对齐、左侧消息左对齐），不跟随点击位置跳动
    let left = areaRect.left - bodyRect.left + (isRight ? areaRect.width - menuW : 0);
    let top = areaRect.top - bodyRect.top + chatBody.scrollTop - menuH - 6;
    if (top < 4) top = areaRect.bottom - bodyRect.top + chatBody.scrollTop + 6;
    if (left < 4) left = 4;
    const maxLeft = chatBody.clientWidth - menuW - 4;
    if (left > maxLeft) left = maxLeft;

    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
}

function hideActionMenu() {
    const menu = document.getElementById('actionMenu');
    menu.style.display = 'none';
}

// 聊天时间：点击后弹出「删除时间 / 编辑时间」
let currentSelectedTime = null;

function onTimeClick(e, el) {
    e.stopPropagation();
    currentSelectedTime = el;
    hideActionMenu();
    document.getElementById('timeDialogTitle').innerText = el.innerText;
    document.getElementById('timeDialogMask').classList.add('show');
}

function closeTimeDialog() {
    document.getElementById('timeDialogMask').classList.remove('show');
}

function deleteSelectedTime() {
    if (currentSelectedTime) currentSelectedTime.remove();
    currentSelectedTime = null;
    closeTimeDialog();
    scheduleSave();
}

function editSelectedTime() {
    const el = currentSelectedTime;
    if (!el) return;
    closeTimeDialog();
    showCustomDialog({
        title: '请输入新的聊天时间（如：昨天 00:44 或 00:30）：',
        showInput: true,
        defaultValue: el.innerText,
        cancelText: '取消',
        okText: '确定',
        callback: function(action, inputValue) {
            if (action !== 'ok') return;
            const t = (inputValue || '').trim();
            if (!t) return;
            if (!el.isConnected) return;
            el.innerText = t;
            scheduleSave();
        }
    });
}

function deleteCurrentRow() {
    if (currentSelectedRow) {
        currentSelectedRow.remove();
        currentSelectedRow = null;
    }
    hideActionMenu();
}

function changeBattery() {
    const currentBat = document.getElementById('displayBattery').innerText;
    showCustomDialog({
        title: '请输入电量数值（0 - 100）：',
        showInput: true,
        defaultValue: currentBat,
        cancelText: '取消',
        okText: '确定',
        callback: function(action, inputValue) {
            if (action !== 'ok') return;
            const trimmed = (inputValue || '').trim();
            if (trimmed === '') return;
            let val = parseInt(trimmed);
            if (isNaN(val)) { showCustomAlert('请输入有效的数字。'); return; }
            if (val > 100) val = 100;
            if (val < 0) val = 0;

            document.getElementById('displayBattery').innerText = val;
            scheduleSave();

            const batteryPill = document.getElementById('batteryPill');
            const batteryFill = document.getElementById('batteryFill');

            batteryFill.style.width = val + '%';

            if (val <= 15) {
                batteryPill.classList.add('low-battery');
            } else {
                batteryPill.classList.remove('low-battery');
            }
        }
    });
}

function insertChatTime() {
    const now = new Date();
    const defaultTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    showCustomDialog({
        title: '请输入要插入的聊天时间（如：昨天 00:44 或 00:30）：',
        showInput: true,
        defaultValue: defaultTime,
        cancelText: '取消',
        okText: '插入',
        callback: function(action, inputValue) {
            if (action !== 'ok') return;
            const t = (inputValue || '').trim();
            if (!t) return;
            const chatBody = document.getElementById('chatBody');
            const timeDiv = document.createElement('div');
            timeDiv.className = 'chat-time-divider';
            timeDiv.innerText = t;
            chatBody.appendChild(timeDiv);
            chatBody.scrollTop = chatBody.scrollHeight;
            scheduleSave();
        }
    });
}

function changeTime() {
    const currentTime = document.getElementById('displayTime').innerText;
    showCustomDialog({
        title: '请输入要显示的时间（如 03:39）：',
        showInput: true,
        defaultValue: currentTime,
        cancelText: '取消',
        okText: '确定',
        callback: function(action, inputValue) {
            if (action !== 'ok') return;
            const t = (inputValue || '').trim();
            if (!t) return;
            isManualTime = true;
            document.getElementById('displayTime').innerText = t;
            scheduleSave();
        }
    });
}

function setRole(role) {
    if (role !== 'left' && role !== 'right') return;
    currentRole = role;
    updateRoleButtons();
    scheduleSave();
}

function changeTitle() {
    const titleEl = document.getElementById('chatTitle');
    showCustomDialog({
        title: '请输入微信好友昵称：',
        showInput: true,
        defaultValue: titleEl.innerText,
        cancelText: '取消',
        okText: '确定',
        callback: function(action, inputValue) {
            if (action !== 'ok') return;
            const t = (inputValue || '').trim();
            if (!t) return;
            titleEl.innerText = t;
            scheduleSave();
        }
    });
}

function triggerAvatarUpload(role) {
    currentAvatarTargetRole = role;
    const avatarInput = document.getElementById('avatarFileInput');
    avatarInput.onchange = handleAvatarSelect;
    avatarInput.click();
}

function handleAvatarSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    compressImage(file, 512, 0.78).then(imgSrc => {
        if (currentAvatarTargetRole === 'left') {
            leftAvatarSrc = imgSrc;
            updateAllAvatars('left', imgSrc);
        } else {
            rightAvatarSrc = imgSrc;
            updateAllAvatars('right', imgSrc);
        }
        scheduleSave();
    }).catch(() => showCustomAlert('头像读取失败，请换一张图片再试。')).finally(() => { e.target.value = ''; });
}

function updateAllAvatars(role, src) {
    const selector = role === 'left' ? '.left-avatar' : '.right-avatar';
    const avatarNodes = document.querySelectorAll(selector);
    avatarNodes.forEach(node => {
        node.innerHTML = `<img src="${src}" alt="头像">`;
    });
}

function sendMsg() {
    const input = document.getElementById('msgInput');
    const text = input.value.trim();
    if (!text) return;

    appendBubble(text, 'text', currentRole);
    input.value = '';
    handleInput();
}

function appendBubble(content, type, role) {
    const chatBody = document.getElementById('chatBody');
    const row = document.createElement('div');
    row.className = `msg-row ${role}`;
    row.onclick = function(e) { onRowClick(e, row); };

    let avatarHTML = '';
    if (role === 'left') {
        const innerImg = leftAvatarSrc ? `<img src="${leftAvatarSrc}" alt="头像">` : '客';
        avatarHTML = `<div class="avatar left-avatar" style="background-color: #507090;" onclick="triggerAvatarUpload('left')" title="点击更换对方头像">${innerImg}</div>`;
    } else {
        const innerImg = rightAvatarSrc ? `<img src="${rightAvatarSrc}" alt="头像">` : '我';
        avatarHTML = `<div class="avatar right-avatar" style="background-color: #2c2c2c;" onclick="triggerAvatarUpload('right')" title="点击更换我的头像">${innerImg}</div>`;
    }

    let innerContent = '';
    if (type === 'text') {
        innerContent = `<div class="bubble">${escapeHTML(content)}</div>`;
    } else if (type === 'image') {
        innerContent = `<img class="bubble-img" src="${content}">`;
    } else if (type === 'custom') {
        innerContent = content; 
    }

    row.innerHTML = `
        ${avatarHTML}
        <div class="bubble-wrapper">
            ${innerContent}
        </div>
    `;

    chatBody.appendChild(row);
    chatBody.scrollTop = chatBody.scrollHeight;
    scheduleSave();
    return row;
}

function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMsg();
    }
}

function triggerImageUpload() {
    document.getElementById('morePanel').classList.remove('show');
    const fileInput = document.getElementById('fileInput');
    fileInput.onchange = handleImageFile;
    fileInput.click();
}

function handleImageFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    compressImage(file, 1280, 0.82).then(src => appendBubble(src, 'image', currentRole))
        .catch(() => showCustomAlert('图片读取失败，请换一张图片再试。'))
        .finally(() => { e.target.value = ''; });
}

function triggerCameraUpload() {
    document.getElementById('morePanel').classList.remove('show');
    const input = document.getElementById('cameraInput');
    input.onchange = handleImageFile;
    input.click();
}

function simulateVideoCall() {
    document.getElementById('morePanel').classList.remove('show');
    showCustomAlert('这是微信界面模拟器，视频通话仅作演示，不会连接真实通话。');
}

function sendLocation() {
    document.getElementById('morePanel').classList.remove('show');
    showCustomDialog({
        title: '请输入要发送的位置名称：',
        showInput: true,
        defaultValue: '我的位置',
        cancelText: '取消',
        okText: '发送',
        callback: function(action, inputValue) {
            if (action !== 'ok') return;
            const place = (inputValue || '').trim();
            if (!place) return;
            const safePlace = escapeHTML(place);
            appendBubble(`<div class="bubble" style="min-width:190px"><strong>📍 位置</strong><br><span>${safePlace}</span><br><small style="color:#888">位置分享（模拟）</small></div>`, 'custom', currentRole);
        }
    });
}

function sendGift() {
    document.getElementById('morePanel').classList.remove('show');
    showCustomDialog({
        title: '请输入礼物名称：',
        showInput: true,
        defaultValue: '小礼物',
        cancelText: '取消',
        okText: '发送',
        callback: function(action, inputValue) {
            if (action !== 'ok') return;
            const gift = (inputValue || '').trim();
            if (!gift) return;
            appendBubble(`<div class="bubble" style="min-width:170px;background:#fff4e6">🎁 <strong>${escapeHTML(gift)}</strong><br><small style="color:#888">礼物（模拟）</small></div>`, 'custom', currentRole);
        }
    });
}

function voiceInput() {
    showCustomDialog({
        title: '请输入要模拟识别的语音内容：',
        showInput: true,
        defaultValue: '',
        cancelText: '取消',
        okText: '确定',
        callback: function(action, inputValue) {
            if (action !== 'ok') return;
            const text = (inputValue || '').trim();
            if (!text) return;
            const input = document.getElementById('msgInput');
            input.value = (input.value ? input.value + ' ' : '') + text;
            handleInput();
            input.focus();
        }
    });
}

function compressImage(file, maxSize, quality, preserveAlpha) {
    return new Promise((resolve, reject) => {
        if (!file || !file.type || !file.type.startsWith('image/')) return reject(new Error('not image'));
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('read failed'));
        reader.onload = () => {
            const image = new Image();
            image.onerror = () => reject(new Error('image failed'));
            image.onload = () => {
                const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
                canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject(new Error('canvas failed'));
                if (!preserveAlpha) {
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }
                ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
                try {
                    // 需要保留透明时输出 PNG（JPEG 不支持透明通道，会让透明区域变白）
                    resolve(canvas.toDataURL(preserveAlpha ? 'image/png' : 'image/jpeg', quality));
                }
                catch (err) { reject(err); }
            };
            image.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

function escapeHTML(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function clearAll() {
    showCustomDialog({
        title: '确定要清空全部消息吗？',
        showInput: false,
        cancelText: '取消',
        okText: '清空',
        callback: function(action) {
            if (action !== 'right') return;
            const chatBody = document.getElementById('chatBody');
            chatBody.innerHTML = '<div class="chat-action-menu" id="actionMenu"><ul><li onclick="deleteCurrentRow()">删除</li></ul></div>';
            currentSelectedRow = null;
            hideActionMenu();
            scheduleSave();
        }
    });
}

// 初始化：所有 const 与函数均已定义后再执行，避免变量暂时性死区（TDZ）报错
document.getElementById('chatBody').addEventListener('click', function(e) {
    const t = e.target && e.target.closest ? e.target.closest('.chat-time-divider') : null;
    if (t) onTimeClick(e, t);
});
renderWeixinEmojis();
loadState();
syncRealTime();
setInterval(syncRealTime, 1000);
const persistenceObserver = new MutationObserver(scheduleSave);
persistenceObserver.observe(document.getElementById('chatBody'), { childList: true, subtree: true, characterData: true, attributes: true });
