// imessage.js — iMessage 短信模块
// 依赖：db.js 必须先加载

var _smsActivePhone = null
var _smsUserPhones = []

var SMS_WELCOME_REMOTE = '106908968258'
var SMS_WELCOME_TEXT = '【弯弯AI】欢迎您的加入！您的手机号已注册成功，立即体验AI助手，让工作更高效。如有问题请联系客服。退订回TD'
var SMS_DEFAULT_AVATAR = 'https://img2.tofaka.com/autoupload/WyM1lZ85VwHzLwMUY9JmtdiO_OyvX7mIgxFBfDMDErs/20260530/dPVE/242X242/iMessage_deflaut.png'

function escSmsHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, function(ch) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
  })
}

function formatSmsTime(ts) {
  if (!ts) return ''
  var d = new Date(ts)
  var now = new Date()
  var diff = now - d
  if (diff < 86400000 && d.getDate() === now.getDate()) {
    return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0')
  }
  if (diff < 172800000) return '昨天'
  return (d.getMonth() + 1) + '/' + d.getDate()
}

function formatSmsFullTime(ts) {
  if (!ts) return ''
  var d = new Date(ts)
  return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
    d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0')
}

// ===== 入口 =====
window.showMessagePage = async function() {
  var users = await db.characters.where('type').equals('user').toArray()
  var seen = {}
  _smsUserPhones = []
  for (var i = 0; i < users.length; i++) {
    var u = users[i]
    var phone = u.identity && u.identity.phone
    if (phone && !seen[phone]) {
      seen[phone] = true
      _smsUserPhones.push({
        charId: u.id,
        charName: u.name || '',
        avatar: u.avatar || '',
        phone: phone
      })
    }
  }

  if (!_smsUserPhones.length) {
    var noPage = buildNoPhonePage()
    window.openPage(noPage)
    return
  }

  _smsActivePhone = _smsUserPhones[0].phone
  await seedWelcomeSMS(_smsActivePhone)
  var page = buildSmsListPage()
  window.openPage(page)
  loadSmsConversations(page)
}

// ===== 无手机号页面 =====
function buildNoPhonePage() {
  var page = document.createElement('div')
  page.id = 'imessage-no-phone-page'
  page.className = 'full-page imessage-main'
  page.innerHTML =
    '<div class="imessage-header">' +
      '<button class="imessage-back" onclick="window.closePage(\'imessage-no-phone-page\')">' +
        '<i class="fa fa-angle-left"></i>' +
      '</button>' +
      '<span class="imessage-phone-title" style="cursor:default">信息</span>' +
      '<span style="width:32px"></span>' +
    '</div>' +
    '<div class="imessage-no-phone-body">' +
      '<div class="imessage-no-phone-icon"><i class="fa-brands fa-facebook-messenger"></i></div>' +
      '<div class="imessage-no-phone-text">用户暂未开通手机短信功能</div>' +
      '<button class="imessage-register-btn" id="imessage-register-btn">注册手机</button>' +
    '</div>'
  page.querySelector('#imessage-register-btn').addEventListener('click', function() {
    window.closePage('imessage-no-phone-page')
    setTimeout(function() {
      window.showCharacterPage && showCharacterPage()
    }, 100)
  })
  return page
}

// ===== 短信列表页 =====
function buildSmsListPage() {
  var page = document.createElement('div')
  page.id = 'imessage-page'
  page.className = 'full-page imessage-main'

  var activeUser = _smsUserPhones.find(function(p) { return p.phone === _smsActivePhone }) || _smsUserPhones[0]

  page.innerHTML =
    '<div class="imessage-header">' +
      '<button class="imessage-back" id="imessage-list-back">' +
        '<i class="fa fa-angle-left"></i>' +
      '</button>' +
      '<span class="imessage-phone-title" id="imessage-phone-title">' +
        '<span class="imessage-phone-title-text">' + escSmsHtml(activeUser.phone) + '</span>' +
        (_smsUserPhones.length > 1 ? ' <i class="fa fa-chevron-down imessage-chevron"></i>' : '') +
      '</span>' +
      '<button class="imessage-new-btn" id="imessage-new-btn">' +
        '<i class="fa fa-plus"></i>' +
      '</button>' +
      (_smsUserPhones.length > 1 ? buildPhoneDropdownHTML() : '') +
    '</div>' +
    '<div class="imessage-list" id="imessage-list"></div>'

  bindSmsListEvents(page)
  return page
}

function buildPhoneDropdownHTML() {
  var html = '<div class="imessage-phone-dropdown" id="imessage-phone-dropdown">'
  for (var i = 0; i < _smsUserPhones.length; i++) {
    var p = _smsUserPhones[i]
    var isActive = p.phone === _smsActivePhone
    html +=
      '<div class="imessage-phone-option" data-phone="' + escSmsHtml(p.phone) + '" data-index="' + i + '">' +
        '<img class="imessage-phone-avatar" src="' + escSmsHtml(p.avatar || SMS_DEFAULT_AVATAR) + '" onerror="this.src=\'' + SMS_DEFAULT_AVATAR + '\'">' +
        '<span class="imessage-phone-number">' + escSmsHtml(p.phone) + '</span>' +
        (isActive ? '<i class="fa fa-check imessage-phone-check"></i>' : '') +
      '</div>'
  }
  html += '</div>'
  return html
}

function bindSmsListEvents(page) {
  page.querySelector('#imessage-list-back').addEventListener('click', function() {
    window.closePage('imessage-page')
  })

  var title = page.querySelector('#imessage-phone-title')
  var dropdown = page.querySelector('#imessage-phone-dropdown')

  if (dropdown && _smsUserPhones.length > 1) {
    title.addEventListener('click', function() {
      var isOpen = dropdown.classList.contains('show')
      if (isOpen) {
        dropdown.classList.remove('show')
        title.classList.remove('open')
      } else {
        dropdown.classList.add('show')
        title.classList.add('open')
      }
    })

    dropdown.addEventListener('click', async function(e) {
      var option = e.target.closest('.imessage-phone-option')
      if (!option) return
      var phone = option.getAttribute('data-phone')
      if (phone === _smsActivePhone) {
        dropdown.classList.remove('show')
        title.classList.remove('open')
        return
      }
      _smsActivePhone = phone
      var activeUser = _smsUserPhones.find(function(p) { return p.phone === _smsActivePhone })
      title.querySelector('.imessage-phone-title-text').textContent = activeUser.phone

      dropdown.innerHTML = ''
      var tmp = document.createElement('div')
      tmp.innerHTML = buildPhoneDropdownHTML()
      var newDropdown = tmp.querySelector('.imessage-phone-dropdown')
      dropdown.innerHTML = newDropdown.innerHTML

      dropdown.classList.remove('show')
      title.classList.remove('open')

      await seedWelcomeSMS(_smsActivePhone)
      loadSmsConversations(page)
    })
  }

  page.querySelector('#imessage-new-btn').addEventListener('click', function() {
    openSmsCompose(page)
  })
}

function openSmsCompose(listPage) {
  document.getElementById('imessage-compose-page')?.remove()
  var page = document.createElement('div')
  page.id = 'imessage-compose-page'
  page.className = 'full-page imessage-main imessage-compose'
  page.innerHTML =
    '<div class="imessage-header">' +
      '<button class="imessage-back" id="imessage-compose-back"><i class="fa fa-angle-left"></i></button>' +
      '<span class="imessage-phone-title">新信息</span><span style="width:32px"></span>' +
    '</div>' +
    '<div class="imessage-compose-body">' +
      '<label class="imessage-compose-row"><span>收件人：</span><input id="imessage-compose-phone" inputmode="tel" placeholder="手机号或名称"></label>' +
      '<label class="imessage-compose-row"><span>名称：</span><input id="imessage-compose-name" placeholder="选填"></label>' +
      '<textarea id="imessage-compose-text" placeholder="短信"></textarea>' +
      '<button class="btn-pill imessage-compose-send" id="imessage-compose-send" disabled>发送</button>' +
    '</div>'
  window.openPage(page)
  var phoneInput = page.querySelector('#imessage-compose-phone')
  var textInput = page.querySelector('#imessage-compose-text')
  var sendBtn = page.querySelector('#imessage-compose-send')
  function sync() {
    sendBtn.disabled = !phoneInput.value.trim() || !textInput.value.trim()
  }
  phoneInput.addEventListener('input', sync)
  textInput.addEventListener('input', sync)
  page.querySelector('#imessage-compose-back').addEventListener('click', function() {
    window.closePage('imessage-compose-page')
  })
  sendBtn.addEventListener('click', async function() {
    if (sendBtn.disabled) return
    var remotePhone = phoneInput.value.trim()
    var body = textInput.value.trim()
    var now = Date.now()
    var conv = await db.smsConversations.where('[ownerPhone+remotePhone]').equals([_smsActivePhone, remotePhone]).first()
    var convId = conv && conv.id
    if (convId) {
      await db.smsConversations.update(convId, { remoteName: page.querySelector('#imessage-compose-name').value.trim() || conv.remoteName || '', lastMessage: body, lastMessageAt: now, updatedAt: now })
    } else {
      convId = await db.smsConversations.add({ ownerPhone: _smsActivePhone, remotePhone: remotePhone, remoteName: page.querySelector('#imessage-compose-name').value.trim(), remoteAvatar: SMS_DEFAULT_AVATAR, lastMessage: body, lastMessageAt: now, unreadCount: 0, updatedAt: now })
    }
    await db.smsMessages.add({ conversationId: convId, direction: 'out', body: body, createdAt: now, read: true })
    window.closePage('imessage-compose-page')
    await loadSmsConversations(listPage)
    openSmsChat(convId, listPage)
  })
}

async function loadSmsConversations(page) {
  var list = page.querySelector('#imessage-list')
  if (!list) return
  var convs = await db.smsConversations
    .where('ownerPhone').equals(_smsActivePhone)
    .reverse().sortBy('updatedAt')

  if (!convs.length) {
    list.innerHTML = '<div class="imessage-empty">暂无短信</div>'
    return
  }

  var html = ''
  for (var i = 0; i < convs.length; i++) {
    var c = convs[i]
    html +=
      '<div class="imessage-conv-item" data-conv-id="' + c.id + '">' +
        (c.unreadCount > 0 ? '<div class="imessage-conv-unread"></div>' : '') +
        '<img class="imessage-conv-avatar" src="' + escSmsHtml(c.remoteAvatar || SMS_DEFAULT_AVATAR) + '" onerror="this.src=\'' + SMS_DEFAULT_AVATAR + '\'">' +
        '<div class="imessage-conv-body">' +
          '<div class="imessage-conv-top">' +
            '<span class="imessage-conv-name">' + escSmsHtml(c.remoteName || c.remotePhone) + '</span>' +
            '<span class="imessage-conv-time">' + formatSmsTime(c.lastMessageAt) + '</span>' +
          '</div>' +
          '<div class="imessage-conv-preview">' + escSmsHtml(c.lastMessage || '') + '</div>' +
        '</div>' +
        '<i class="fa fa-angle-right imessage-conv-chevron"></i>' +
      '</div>'
  }
  list.innerHTML = html

  list.querySelectorAll('.imessage-conv-item').forEach(function(item) {
    item.addEventListener('click', function() {
      var convId = parseInt(item.getAttribute('data-conv-id'))
      openSmsChat(convId, page)
    })
  })
}

// ===== 聊天详情页 =====
async function openSmsChat(conversationId, listPage) {
  var conv = await db.smsConversations.get(conversationId)
  if (!conv) return

  var page = document.createElement('div')
  page.id = 'imessage-chat-page'
  page.className = 'full-page imessage-chat'
  page.innerHTML =
    '<div class="imessage-chat-header">' +
      '<button class="imessage-chat-back" id="imessage-chat-back">' +
        '<i class="fa fa-angle-left"></i>' +
      '</button>' +
      '<div class="imessage-chat-contact">' +
        '<img class="imessage-chat-avatar" src="' + escSmsHtml(conv.remoteAvatar || SMS_DEFAULT_AVATAR) + '" onerror="this.src=\'' + SMS_DEFAULT_AVATAR + '\'">' +
        '<span class="imessage-chat-name">' + escSmsHtml(conv.remoteName || conv.remotePhone) + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="imessage-chat-messages" id="imessage-chat-msgs"></div>' +
    '<div class="imessage-chat-input">' +
      '<input class="imessage-input" placeholder="短信" id="imessage-chat-input-field">' +
      '<button class="imessage-send-btn" id="imessage-send-btn"><i class="fa fa-arrow-up"></i></button>' +
    '</div>'

  page.querySelector('#imessage-chat-back').addEventListener('click', function() {
    window.closePage('imessage-chat-page')
    if (listPage) loadSmsConversations(listPage)
  })

  window.openPage(page)
  await loadSmsChatMessages(page, conversationId)

  var input = page.querySelector('#imessage-chat-input-field')
  var send = page.querySelector('#imessage-send-btn')
  function syncSend() { send.classList.toggle('active', Boolean(input.value.trim())) }
  async function sendMessage() {
    var body = input.value.trim()
    if (!body) return
    var now = Date.now()
    await db.smsMessages.add({ conversationId: conversationId, direction: 'out', body: body, createdAt: now, read: true })
    await db.smsConversations.update(conversationId, { lastMessage: body, lastMessageAt: now, updatedAt: now })
    input.value = ''
    syncSend()
    await loadSmsChatMessages(page, conversationId)
  }
  input.addEventListener('input', syncSend)
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  })
  send.addEventListener('click', sendMessage)

  if (conv.unreadCount > 0) {
    await db.smsConversations.update(conversationId, { unreadCount: 0 })
    await db.smsMessages.where('conversationId').equals(conversationId).modify({ read: true })
  }
}

async function loadSmsChatMessages(page, conversationId) {
  var container = page.querySelector('#imessage-chat-msgs')
  if (!container) return
  var msgs = await db.smsMessages.where('conversationId').equals(conversationId).sortBy('createdAt')

  if (!msgs.length) {
    container.innerHTML = '<div class="imessage-empty">暂无消息</div>'
    return
  }

  var html = ''
  var lastDate = ''
  for (var i = 0; i < msgs.length; i++) {
    var m = msgs[i]
    var dateStr = formatSmsFullTime(m.createdAt)
    if (dateStr !== lastDate) {
      html += '<div class="sms-time-label">' + escSmsHtml(dateStr) + '</div>'
      lastDate = dateStr
    }
    var cls = m.direction === 'out' ? 'sms-out' : 'sms-in'
    html += '<div class="sms-bubble ' + cls + '">' + escSmsHtml(m.body) + '</div>'
  }
  container.innerHTML = html
  container.scrollTop = container.scrollHeight
}

// ===== 欢迎短信 =====
async function seedWelcomeSMS(ownerPhone) {
  var existing = await db.smsConversations
    .where('[ownerPhone+remotePhone]')
    .equals([ownerPhone, SMS_WELCOME_REMOTE])
    .first()
  if (existing) return

  var now = Date.now()
  var convId = await db.smsConversations.add({
    ownerPhone: ownerPhone,
    remotePhone: SMS_WELCOME_REMOTE,
    remoteAvatar: SMS_DEFAULT_AVATAR,
    remoteName: '',
    lastMessage: SMS_WELCOME_TEXT,
    lastMessageAt: now,
    unreadCount: 1,
    updatedAt: now
  })
  await db.smsMessages.add({
    conversationId: convId,
    direction: 'in',
    body: SMS_WELCOME_TEXT,
    createdAt: now,
    read: false
  })
}

// ===== 验证码短信投递 + 信息推送 =====
var SMS_TAOBAO_REMOTE = '106900008888'
var SMS_YUMYUM_REMOTE = '106900006666'

// 根据手机号查找已注册 User（identity.phone 绑定）
window.findUserByPhone = async function(phone) {
  if (!phone) return null
  var users = await db.characters.where('type').equals('user').toArray()
  for (var i = 0; i < users.length; i++) {
    var u = users[i]
    if (u.identity && u.identity.phone === phone) {
      return {
        id: u.id,
        name: u.name || '',
        nick: u.nick || '',
        avatar: u.avatar || '',
        account: (u.identity && u.identity.account) || '',
        phone: phone
      }
    }
  }
  return null
}

function genSmsVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

// 生成随机六位验证码，写入对应手机号短信会话并弹出信息推送，返回验证码
window.sendAppVerificationSMS = async function(opts) {
  opts = opts || {}
  var ownerPhone = opts.ownerPhone
  if (!ownerPhone) return null
  var code = genSmsVerificationCode()

  var remotePhone, remoteName, body
  if (opts.appKey === 'yumyum') {
    remotePhone = SMS_YUMYUM_REMOTE
    remoteName = 'YumYum'
    body = '【YumYum】验证码 ' + code + '，您正在登录 YumYum，5分钟内有效，请勿告知他人。如非本人操作请忽略。'
  } else {
    remotePhone = SMS_TAOBAO_REMOTE
    remoteName = '淘宝'
    body = '【淘宝】验证码 ' + code + '，您正在登录淘宝，5分钟内有效。请勿向任何人泄露，谨防诈骗。'
  }

  var now = Date.now()
  var conv = await db.smsConversations
    .where('[ownerPhone+remotePhone]')
    .equals([ownerPhone, remotePhone])
    .first()
  var convId
  if (conv) {
    convId = conv.id
    await db.smsConversations.update(convId, {
      remoteName: remoteName,
      lastMessage: body,
      lastMessageAt: now,
      unreadCount: (conv.unreadCount || 0) + 1,
      updatedAt: now
    })
  } else {
    convId = await db.smsConversations.add({
      ownerPhone: ownerPhone,
      remotePhone: remotePhone,
      remoteAvatar: SMS_DEFAULT_AVATAR,
      remoteName: remoteName,
      lastMessage: body,
      lastMessageAt: now,
      unreadCount: 1,
      updatedAt: now
    })
  }
  await db.smsMessages.add({
    conversationId: convId,
    direction: 'in',
    body: body,
    createdAt: now,
    read: false
  })

  showImessageTopMessagePopup({
    title: remoteName,
    body: body,
    avatar: SMS_DEFAULT_AVATAR,
    copyCode: code,
    open: function() { window.showMessagePage && showMessagePage() }
  })

  return code
}

// ===== 信息顶部新消息推送（视觉与微信顶部推送一致，仅 svg 换成信息原本 svg）=====
var IMESSAGE_TOP_MESSAGE_POPUP_MS = 4200

function buildImessageTopPopupAvatarHTML(avatar, title) {
  if (avatar) {
    return '<img src="' + escSmsHtml(avatar) + '" alt="' + escSmsHtml(title || '信息') + '">'
  }
  return '<div class="imessage-top-popup-initial">' + escSmsHtml(String(title || '信息').slice(0, 1)) + '</div>'
}

function closeImessageTopMessagePopup() {
  var current = document.getElementById('imessage-top-message-popup')
  if (!current) return
  clearTimeout(current._hideTimer)
  current.classList.remove('show')
  current.classList.add('is-hiding')
  setTimeout(function() { current.remove() }, 220)
}

function copyImessageText(text) {
  var value = String(text == null ? '' : text)
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(value).catch(function() {
      return fallbackCopyImessageText(value)
    })
  }
  return fallbackCopyImessageText(value)
}

function fallbackCopyImessageText(text) {
  return new Promise(function(resolve, reject) {
    var textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    textarea.style.pointerEvents = 'none'
    document.body.appendChild(textarea)
    textarea.select()
    textarea.setSelectionRange(0, textarea.value.length)
    var ok = false
    try {
      ok = document.execCommand('copy')
    } catch (err) {
      ok = false
    }
    textarea.remove()
    if (ok) resolve()
    else reject(new Error('copy failed'))
  })
}

function showImessageTopMessagePopup(opts) {
  opts = opts || {}
  if (document.visibilityState !== 'visible') return
  closeImessageTopMessagePopup()
  var msgSvg = (window.SVG_ICONS && SVG_ICONS.message) || ''
  var copyCode = /^\d{6}$/.test(String(opts.copyCode || '')) ? String(opts.copyCode) : ''
  var el = document.createElement('div')
  el.id = 'imessage-top-message-popup'
  el.className = 'imessage-top-message-popup' + (copyCode ? ' has-copy-code' : '')
  el.innerHTML =
    '<button class="imessage-top-popup-main" type="button">' +
      '<div class="imessage-top-popup-avatar">' +
        buildImessageTopPopupAvatarHTML(opts.avatar, opts.title) +
        '<span class="imessage-top-popup-badge">' + msgSvg + '</span>' +
      '</div>' +
      '<div class="imessage-top-popup-body">' +
        '<div class="imessage-top-popup-meta">' +
          '<span class="imessage-top-popup-title">' + escSmsHtml(opts.title || '信息') + '</span>' +
          '<span class="imessage-top-popup-now">NOW</span>' +
        '</div>' +
        '<div class="imessage-top-popup-text">' + escSmsHtml(opts.body || '你收到一条新消息') + '</div>' +
      '</div>' +
    '</button>' +
    (copyCode ? '<button class="imessage-top-popup-copy" type="button">复制</button>' : '')
  el.querySelector('.imessage-top-popup-main').addEventListener('click', function() {
    closeImessageTopMessagePopup()
    if (typeof opts.open === 'function') opts.open()
  })
  var copyBtn = el.querySelector('.imessage-top-popup-copy')
  if (copyBtn) {
    copyBtn.addEventListener('click', function(e) {
      e.stopPropagation()
      copyImessageText(copyCode).then(function() {
        closeImessageTopMessagePopup()
        window.toast && window.toast('验证码已复制')
      }).catch(function() {
        window.toast && window.toast('复制失败')
      })
    })
  }
  document.body.appendChild(el)
  requestAnimationFrame(function() { el.classList.add('show') })
  el._hideTimer = setTimeout(closeImessageTopMessagePopup, IMESSAGE_TOP_MESSAGE_POPUP_MS)
}
