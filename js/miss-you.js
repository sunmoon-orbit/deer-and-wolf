// miss-you.js - 想见你线下模式
// 依赖：db.js, main.js, settings.js, lorebook.js, wechat.js

(function() {
  const MISS_YOU_HISTORY_DEFAULT = 100
  const MISS_YOU_HISTORY_MIN = 1
  const MISS_YOU_HISTORY_MAX = 1000
  const MISS_YOU_WORD_MIN_DEFAULT = 200
  const MISS_YOU_WORD_MAX_DEFAULT = 600
  const MISS_NARRATIVE_PERSON_DEFAULT = 'third'
  const MISS_NARRATIVE_PERSON_VALUES = new Set(['first', 'second', 'third'])
  const MISS_USER_SUBTITLE_DEFAULT = '我說 此刻最好'
  const MISS_CHAR_SUBTITLE_DEFAULT = '你的惡劣 任性 少女心事我都喜歡'
  const MISS_BEAUTY_PRESETS_KEY = 'missYouBeautyPresets'
  const MISS_BEAUTY_STYLE_ID = 'miss-you-beauty-live-style'
  const MISS_STATUS_FORMAT_DEFAULT = '[Location|{{当前具体位置}}]\n[Mood|{{情绪值，0.00-100.00之间的纯数字}}]\n[Mind|{{角色当前心理活动内容，必须符合角色当前心境}}]'
  const MISS_STATUS_DESC_DEFAULT = 'Mood必须保留两位小数；Mind必须在20字以内，语气符合角色人设，暴露内心真实想法。'
  const MISS_BEAUTY_BASE_VARS = {
    '--c-bg': '#ffffff',
    '--c-surface': '#fbfbfb',
    '--c-surface-2': '#f3f3f3',
    '--c-border': 'rgba(0, 0, 0, 0.05)',
    '--c-border-m': 'rgba(0, 0, 0, 0.09)',
    '--c-accent': '#8a8a8a',
    '--c-accent-light': '#f3f3f3',
    '--c-accent-dark': '#787878',
    '--c-text': '#3a3a3a',
    '--c-sub': '#888888',
    '--c-hint': '#b8b8b8',
    '--c-red': '#b05a5a'
  }
  const MISS_BEAUTY_CLASS_GROUPS = [
    {
      label: '页面与顶栏',
      items: [
        '.miss-page', '.miss-header', '.page-header', '.header-back', '.header-title',
        '.miss-settings-btn', '.btn-icon'
      ]
    },
    {
      label: '消息区域',
      items: [
        '.miss-body', '.miss-chat', '.miss-chat-log', '.miss-loading', '.miss-empty', '.miss-empty-chat',
        '.miss-entry', '.is-user', '.is-char', '.is-typing', '.is-generating',
        '.miss-entry-head', '.miss-entry-person', '.miss-msg-avatar',
        '.miss-entry-nameblock', '.miss-msg-name', '.miss-entry-subtitle',
        '.miss-entry-rank', '.miss-hearts', '.miss-hearts i', '.miss-entry-floor'
      ]
    },
    {
      label: '消息正文与状态',
      items: [
        '.miss-entry-card', '.miss-msg-text', '.miss-msg-text p', '.miss-quote-highlight',
        '.miss-entry-footer', '.miss-entry-more', '.miss-entry-delete',
        '.miss-status-card', '.miss-status-card-title', '.miss-status-row',
        '.miss-status-row span', '.miss-status-row strong',
        '.miss-typing-dots', '.miss-typing-dots span'
      ]
    },
    {
      label: '输入栏',
      items: [
        '.miss-compose', '.miss-end-meet', '.miss-input', '.miss-continue', '.miss-send'
      ]
    },
    {
      label: '菜单与弹窗',
      items: [
        '.miss-beauty-layer', '.miss-entry-menu', '.miss-entry-menu button',
        '.sheet-overlay', '.center-modal',
        '.miss-edit-modal', '.miss-edit-body', '.miss-edit-section-title',
        '.miss-edit-status', '.miss-edit-text', '.miss-summary-overlay',
        '.miss-summary-modal', '.miss-summary-modal-message',
        '.miss-summary-modal-actions', '.sheet-title', '.sheet-actions',
        '.btn-pill', '.btn-ghost', '.btn-full'
      ]
    }
  ]
  const MISS_BEAUTY_CLASS_TEXT = MISS_BEAUTY_CLASS_GROUPS.map(group =>
    `${group.label}：\n${group.items.join('\n')}`
  ).join('\n\n')
  const MISS_BEAUTY_CLASS_HINT = `请在这里输入见面页面美化 CSS。
CSS 会自动限定在当前 live 见面页面内。

可使用以下类名：

${MISS_BEAUTY_CLASS_TEXT}`
  const _missYouPending = new Set()
  const _missSummaryPending = new Set()
  const _missEndModalPending = new Set()
  const _missBeautyApplyVersions = new WeakMap()

  function myEsc(str) {
    if (typeof wcEscHtml === 'function') return wcEscHtml(str)
    if (str === null || str === undefined) return ''
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function clampHistoryLimit(value) {
    const n = parseInt(value, 10)
    if (!Number.isFinite(n)) return MISS_YOU_HISTORY_DEFAULT
    return Math.min(MISS_YOU_HISTORY_MAX, Math.max(MISS_YOU_HISTORY_MIN, n))
  }

  function clampWordCount(value, fallback) {
    const n = parseInt(value, 10)
    if (!Number.isFinite(n)) return fallback
    return Math.max(1, n)
  }

  function getInitial(name) {
    return String(name || '?').trim().charAt(0) || '?'
  }

  function avatarHTML(src, name) {
    return src
      ? `<img src="${src}" alt="${myEsc(name)}">`
      : `<span>${myEsc(getInitial(name))}</span>`
  }

  const MISS_STATUS_RE = /<status>\s*\[Location\|([\s\S]*?)\]\s*\[Mood\|([\s\S]*?)\]\s*\[Mind\|([\s\S]*?)\]\s*<\/status>/i

  function extractStatusFields(format) {
    const re = /\[([^\|\]]+)\|[^\]]*\]/g
    const fields = []
    let m
    while ((m = re.exec(format)) !== null) fields.push(m[1].trim())
    return fields
  }

  function generateStatusRegex(format) {
    const fields = extractStatusFields(format)
    if (!fields.length) return null
    const inner = fields.map(f => '\\[' + f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\|([\\s\\S]*?)\\]').join('\\s*')
    return '<status>\\s*' + inner + '\\s*<\\/status>'
  }

  function buildStatusRE(settings) {
    if (settings?.statusRegex) {
      try { return new RegExp(settings.statusRegex, 'i') } catch(e) { /* fall through */ }
    }
    return MISS_STATUS_RE
  }

  function parseMissStatus(content, settings) {
    const raw = String(content || '')
    const re = buildStatusRE(settings)
    const fields = settings?.statusFields?.length ? settings.statusFields : ['Location', 'Mood', 'Mind']
    const match = raw.match(re)
    if (!match) return { status: null, text: raw }
    const parsed = fields.map((name, i) => {
      let value = String(match[i + 1] || '').trim()
      if (name === 'Mood') {
        const n = parseFloat(value)
        if (Number.isFinite(n)) value = Math.min(100, Math.max(0, n)).toFixed(2)
      }
      return { name, value }
    })
    return {
      status: { fields: parsed, raw: match[0].trim() },
      text: raw.replace(match[0], '').trim()
    }
  }

  function getMissMoodHeartCount(mood) {
    const n = parseFloat(mood)
    if (!Number.isFinite(n)) return 1
    if (n >= 80) return 5
    if (n >= 60) return 4
    if (n >= 40) return 3
    if (n >= 20) return 2
    return 1
  }

  function buildMissMoodHeartsHTML(statusFields) {
    const moodField = (statusFields || []).find(f => f.name === 'Mood')
    const count = moodField ? getMissMoodHeartCount(moodField.value) : 5
    return Array.from({ length: count }, () => '<i class="fa-solid fa-heart"></i>').join('')
  }

  function getCharBaseName(char) {
    return char?.nick || char?.name || '未命名'
  }

  function getUserBaseName(user) {
    return user?.nick || user?.name || '我'
  }

  function getOfflinePromptCharName(char) {
    return char?.name || '未命名'
  }

  function getOfflinePromptUserName(user) {
    return user?.name || '我'
  }

  async function getWechatDisplayFor(ownerUid, char) {
    const profile = window.getWechatProfile
      ? await window.getWechatProfile(ownerUid, char.id)
      : ((await db.config.get(`wechatProfile_${ownerUid}_${char.id}`))?.value || {})
    const name = (profile?.remark || '').trim() || getCharBaseName(char)
    const avatar = profile?.avatar || char?.avatar || ''
    return { profile, name, avatar }
  }

  async function getWechatSelfProfileFor(uid) {
    if (!uid) return {}
    const row = await db.config.get(`wechatSelfProfile_${uid}`)
    return row?.value || {}
  }

  async function getUserDisplayFor(uid) {
    const user = await db.characters.get(uid)
    const profile = await getWechatSelfProfileFor(uid)
    return {
      user,
      profile,
      name: getUserBaseName(user),
      avatar: profile.avatar || user?.avatar || ''
    }
  }

  function offlineSettingsKey(ownerUid, chatId, mode) {
    return `offlineMeetSettings_${ownerUid}_${chatId}_${mode}`
  }

  function normalizeOfflineSettings(value, ownerUid) {
    const raw = value || {}
    const minWords = clampWordCount(raw.minWords, MISS_YOU_WORD_MIN_DEFAULT)
    const maxWords = Math.max(minWords, clampWordCount(raw.maxWords, MISS_YOU_WORD_MAX_DEFAULT))
    const maskUserId = parseInt(raw.maskUserId, 10)
    const narrativePerson = MISS_NARRATIVE_PERSON_VALUES.has(raw.narrativePerson)
      ? raw.narrativePerson
      : MISS_NARRATIVE_PERSON_DEFAULT
    const statusFormat = String(raw.statusFormat || '').trim() || MISS_STATUS_FORMAT_DEFAULT
    const statusRegex = String(raw.statusRegex || '').trim()
    const statusDesc = raw.statusDesc !== undefined ? String(raw.statusDesc) : MISS_STATUS_DESC_DEFAULT
    const statusFields = extractStatusFields(statusFormat)
    return {
      minWords,
      maxWords,
      maskUserId: Number.isFinite(maskUserId) ? maskUserId : ownerUid,
      narrativePerson,
      statusFormat,
      statusRegex,
      statusDesc,
      statusFields,
      beautyPresetId: raw.beautyPresetId ? String(raw.beautyPresetId) : '',
      userSubtitle: raw.userSubtitle === undefined || raw.userSubtitle === null
        ? MISS_USER_SUBTITLE_DEFAULT
        : String(raw.userSubtitle),
      charSubtitle: raw.charSubtitle === undefined || raw.charSubtitle === null
        ? MISS_CHAR_SUBTITLE_DEFAULT
        : String(raw.charSubtitle)
    }
  }

  async function getOfflineSettings(ownerUid, chatId, mode) {
    const row = await db.config.get(offlineSettingsKey(ownerUid, chatId, mode))
    return normalizeOfflineSettings(row?.value, ownerUid)
  }

  async function saveOfflineSettings(ownerUid, chatId, mode, value) {
    const settings = normalizeOfflineSettings(value, ownerUid)
    await db.config.put({ key: offlineSettingsKey(ownerUid, chatId, mode), value: settings })
    return settings
  }

  async function getMissBeautyPresets() {
    const row = await db.config.get(MISS_BEAUTY_PRESETS_KEY)
    return Array.isArray(row?.value) ? row.value : []
  }

  function sanitizeMissBeautyPreset(preset) {
    return {
      id: String(preset?.id || ''),
      name: String(preset?.name || ''),
      css: String(preset?.css || ''),
      createdAt: preset?.createdAt || Date.now(),
      updatedAt: preset?.updatedAt || Date.now()
    }
  }

  async function saveMissBeautyPresets(presets) {
    await db.config.put({
      key: MISS_BEAUTY_PRESETS_KEY,
      value: (presets || []).map(sanitizeMissBeautyPreset)
    })
  }

  async function addMissBeautyPreset({ name, css }) {
    const presets = await getMissBeautyPresets()
    const now = Date.now()
    const id = now.toString(36) + Math.random().toString(36).slice(2, 6)
    presets.push({ id, name, css, createdAt: now, updatedAt: now })
    await saveMissBeautyPresets(presets)
    return id
  }

  async function updateMissBeautyPreset(id, updates) {
    const presets = await getMissBeautyPresets()
    const index = presets.findIndex(preset => preset.id === id)
    if (index < 0) return false
    presets[index] = {
      ...presets[index],
      name: updates.name ?? presets[index].name,
      css: updates.css ?? presets[index].css,
      updatedAt: Date.now()
    }
    await saveMissBeautyPresets(presets)
    return true
  }

  async function deleteMissBeautyPreset(id) {
    const presets = await getMissBeautyPresets()
    await saveMissBeautyPresets(presets.filter(preset => preset.id !== id))
  }

  function missCssAttrEscape(value) {
    return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  }

  function scopeMissBeautyCss(css, scope) {
    if (typeof scopeChatBeautyCss !== 'function') return ''
    return scopeChatBeautyCss(css, scope)
      .split(`${scope} .miss-page`)
      .join(`${scope}.miss-page`)
  }

  function setMissBeautyThemeIsolation(page, enabled) {
    if (!page) return
    Object.entries(MISS_BEAUTY_BASE_VARS).forEach(([name, value]) => {
      if (enabled) page.style.setProperty(name, value)
      else page.style.removeProperty(name)
    })
    page.style.colorScheme = enabled ? 'light' : ''
  }

  function clearMissBeauty(page) {
    const style = document.getElementById(MISS_BEAUTY_STYLE_ID)
    if (style) style.remove()
    if (!page) return
    setMissBeautyThemeIsolation(page, false)
    delete page.dataset.beautyPreset
    delete page.dataset.ownerUid
    delete page.dataset.chatId
    delete page.dataset.missMode
  }

  function setMissState(page, state) {
    page._missState = state
    page.dataset.missView = state?.view || ''
    if (state?.view !== 'chat') clearMissBeauty(page)
  }

  async function applyMissBeauty(page, ownerUid, chatId, mode) {
    if (!page || !ownerUid || !chatId) return
    const version = (_missBeautyApplyVersions.get(page) || 0) + 1
    _missBeautyApplyVersions.set(page, version)
    const isCurrent = () =>
      _missBeautyApplyVersions.get(page) === version &&
      page.isConnected &&
      page.dataset.missView === 'chat' &&
      String(page._missState?.ownerUid || '') === String(ownerUid) &&
      String(page._missState?.chat?.id || '') === String(chatId) &&
      String(page._missState?.mode || '') === String(mode)
    try {
      const settings = await getOfflineSettings(ownerUid, chatId, mode)
      if (!isCurrent()) return
      const presets = settings.beautyPresetId ? await getMissBeautyPresets() : []
      if (!isCurrent()) return
      const preset = presets.find(item => item.id === settings.beautyPresetId)
      const oldStyle = document.getElementById(MISS_BEAUTY_STYLE_ID)
      if (!preset) {
        if (oldStyle) oldStyle.remove()
        setMissBeautyThemeIsolation(page, false)
        delete page.dataset.beautyPreset
        return
      }
      page.dataset.ownerUid = String(ownerUid)
      page.dataset.chatId = String(chatId)
      page.dataset.missMode = String(mode)
      page.dataset.beautyPreset = preset.id
      const scope = `#miss-you-page[data-miss-view="chat"][data-owner-uid="${missCssAttrEscape(ownerUid)}"][data-chat-id="${missCssAttrEscape(chatId)}"][data-miss-mode="${missCssAttrEscape(mode)}"][data-beauty-preset="${missCssAttrEscape(preset.id)}"]`
      const scopedCss = scopeMissBeautyCss(preset.css, scope)
      let style = oldStyle
      if (!style) {
        style = document.createElement('style')
        style.id = MISS_BEAUTY_STYLE_ID
        document.head.appendChild(style)
      }
      style.textContent = scopedCss
      setMissBeautyThemeIsolation(page, true)
    } catch (error) {
      clearMissBeauty(page)
      console.error('[miss-you-beauty]', error)
    }
  }

  async function getMaskUser(ownerUid, chatId, mode) {
    const settings = await getOfflineSettings(ownerUid, chatId, mode)
    let user = await db.characters.get(settings.maskUserId)
    if (!user || user.type !== 'user') user = await db.characters.get(ownerUid)
    return user
  }

  async function getMaskUserDisplayFor(ownerUid, chatId, mode) {
    const user = await getMaskUser(ownerUid, chatId, mode)
    const uid = user?.id || ownerUid
    const profile = await getWechatSelfProfileFor(uid)
    return {
      user,
      profile,
      name: getUserBaseName(user),
      avatar: profile.avatar || user?.avatar || ''
    }
  }

  async function getChatHistoryLimit(chatId) {
    const stored = await db.config.get(`chatMemory_${chatId}`)
    const value = typeof stored?.value === 'object' ? stored.value.historyLimit : stored?.value
    return clampHistoryLimit(value)
  }

  function pendingKey(ownerUid, chatId, mode) {
    return `${ownerUid}:${chatId}:${mode}`
  }

  window.showMissYouPage = async function() {
    const page = document.createElement('div')
    page.id = 'miss-you-page'
    page.className = 'full-page miss-page'
    page.innerHTML = `
      <div class="page-header miss-header">
        <button class="header-back" id="miss-back"><i class="fa fa-angle-left"></i></button>
        <span class="header-title" id="miss-title">想见你</span>
        <button class="btn-icon miss-settings-btn" id="miss-settings" title="见面设置" style="display:none">
          <i class="fa-solid fa-ellipsis-vertical"></i>
        </button>
      </div>
      <div class="miss-body" id="miss-body"></div>
    `
    setMissState(page, { view: 'accounts' })
    page.querySelector('#miss-back').addEventListener('click', () => handleMissBack(page))
    page.querySelector('#miss-settings').addEventListener('click', () => {
      const state = page._missState || {}
      if (state.view === 'chat') openMissSettingsPage(page, state.ownerUid, state.chat, state.mode)
    })
    window.openPage(page)
    await renderAccountPicker(page)
  }

  function setMissTitle(page, title) {
    const el = page.querySelector('#miss-title')
    if (el) el.textContent = title
    updateMissHeaderActions(page)
  }

  function updateMissHeaderActions(page) {
    const btn = page.querySelector('#miss-settings')
    if (!btn) return
    const state = page._missState || {}
    btn.style.display = state.view === 'chat' ? 'flex' : 'none'
  }

  async function handleMissBack(page) {
    const state = page._missState || {}
    if (state.view === 'chat') {
      await renderModePicker(page, state.ownerUid, state.chat)
    } else if (state.view === 'modes') {
      await renderRoomPicker(page, state.ownerUid)
    } else if (state.view === 'rooms') {
      await renderAccountPicker(page)
    } else {
      window.closePage('miss-you-page')
    }
  }

  async function renderAccountPicker(page) {
    setMissState(page, { view: 'accounts' })
    setMissTitle(page, '想见你')
    const body = page.querySelector('#miss-body')
    const token = (page._missAccountLoadToken || 0) + 1
    page._missAccountLoadToken = token
    if (page._missAccountState) {
      renderMissAccountRows(page, page._missAccountState.displayItems)
    } else {
      body.innerHTML = '<div class="miss-loading"><i class="fa fa-spinner fa-spin"></i></div>'
    }
    const users = (await db.characters.where('type').equals('user').toArray())
      .sort((a, b) => (b.id || 0) - (a.id || 0))
    if (page._missAccountLoadToken !== token) return
    if (!users.length) {
      page._missAccountState = { displayItems: [] }
      body.innerHTML = `
        <div class="miss-empty">
          <i class="fa fa-user"></i>
          <div>暂无微信账号</div>
          <span>请先在微信里登录或创建 USER 角色</span>
        </div>`
      return
    }
    const displayItems = []
    for (const user of users) {
      const profile = await getWechatSelfProfileFor(user.id)
      displayItems.push({
        user,
        name: getUserBaseName(user),
        avatar: profile.avatar || user.avatar || ''
      })
    }
    page._missAccountState = { displayItems }
    renderMissAccountRows(page, displayItems)
  }

  function renderMissAccountRows(page, displayItems) {
    const body = page.querySelector('#miss-body')
    if (!body) return
    if (!displayItems.length) {
      body.innerHTML = `
        <div class="miss-empty">
          <i class="fa fa-user"></i>
          <div>暂无微信账号</div>
          <span>请先在微信里登录或创建 USER 角色</span>
        </div>`
      return
    }
    body.innerHTML = `
      <div class="miss-section-title">选择微信账号</div>
      <div class="miss-list">
        ${displayItems.map(item => `
          <button class="miss-row" data-owner-uid="${item.user.id}">
            <div class="miss-avatar">${avatarHTML(item.avatar, item.name)}</div>
            <div class="miss-row-main">
              <div class="miss-row-title">${myEsc(item.name)}</div>
              <div class="miss-row-sub">${myEsc(item.user.identity?.account ? '@' + item.user.identity.account : item.user.description || '微信账号')}</div>
            </div>
            <i class="fa fa-angle-right"></i>
          </button>
        `).join('')}
      </div>`
    body.querySelectorAll('.miss-row').forEach(row => {
      row.addEventListener('click', () => renderRoomPicker(page, parseInt(row.dataset.ownerUid)))
    })
  }

  async function renderRoomPicker(page, ownerUid) {
    setMissState(page, { view: 'rooms', ownerUid })
    const user = await db.characters.get(ownerUid)
    setMissTitle(page, getUserBaseName(user))
    const body = page.querySelector('#miss-body')
    const cacheKey = String(ownerUid)
    const roomCache = page._missRoomState && page._missRoomState[cacheKey]
    const token = (page._missRoomLoadToken || 0) + 1
    page._missRoomLoadToken = token
    if (roomCache) {
      renderMissRoomRows(page, ownerUid, roomCache.items)
    } else {
      body.innerHTML = '<div class="miss-loading"><i class="fa fa-spinner fa-spin"></i></div>'
    }
    const chats = (await db.chats.toArray()).filter(c => c.ownerUid === ownerUid)
    const items = []
    for (const chat of chats) {
      const char = await window.getCharacter(chat.charId)
      if (!char) continue
      const display = await getWechatDisplayFor(ownerUid, char)
      items.push({
        chat,
        char,
        display,
        time: chat.createdAt || 0
      })
    }
    items.sort((a, b) => b.time - a.time)
    if (page._missRoomLoadToken !== token) return
    page._missRoomState = page._missRoomState || {}
    page._missRoomState[cacheKey] = { items }
    renderMissRoomRows(page, ownerUid, items)
  }

  function renderMissRoomRows(page, ownerUid, items) {
    const body = page.querySelector('#miss-body')
    if (!body) return
    if (!items.length) {
      body.innerHTML = `
        <div class="miss-empty">
          <i class="fa fa-comments"></i>
          <div>暂无可见面的聊天房间</div>
          <span>请先用这个微信账号和角色建立私聊</span>
        </div>`
      return
    }
    body.innerHTML = `
      <div class="miss-section-title">选择约会对象</div>
      <div class="miss-list">
        ${items.map(item => `
          <button class="miss-row" data-chat-id="${item.chat.id}">
            <div class="miss-avatar">${avatarHTML(item.display.avatar, item.display.name)}</div>
            <div class="miss-row-main">
              <div class="miss-row-title">${myEsc(item.display.name)}</div>
            </div>
            <i class="fa fa-angle-right"></i>
          </button>
        `).join('')}
      </div>`
    body.querySelectorAll('.miss-row').forEach(row => {
      const item = items.find(x => x.chat.id === parseInt(row.dataset.chatId))
      row.addEventListener('click', () => renderModePicker(page, ownerUid, item.chat))
    })
  }

  async function renderModePicker(page, ownerUid, chat) {
    const char = await window.getCharacter(chat.charId)
    const display = await getWechatDisplayFor(ownerUid, char)
    setMissState(page, { view: 'modes', ownerUid, chat })
    setMissTitle(page, display.name)
    const body = page.querySelector('#miss-body')
    body.innerHTML = `
      <div class="miss-mode-hero">
        <div class="miss-mode-avatar">${avatarHTML(display.avatar, display.name)}</div>
        <div class="miss-mode-name">${myEsc(display.name)}</div>
      </div>
      <div class="miss-mode-grid">
        <button class="miss-mode-card" data-mode="meet">
          <i class="fa-solid fa-location-dot"></i>
          <span>见面</span>
        </button>
        <button class="miss-mode-card" data-mode="script">
          <i class="fa-solid fa-book-open"></i>
          <span>剧本</span>
        </button>
      </div>`
    body.querySelectorAll('.miss-mode-card').forEach(btn => {
      btn.addEventListener('click', () => renderOfflineChat(page, ownerUid, chat, btn.dataset.mode))
    })
  }

  async function renderOfflineChat(page, ownerUid, chat, mode) {
    const char = await window.getCharacter(chat.charId)
    const display = await getWechatDisplayFor(ownerUid, char)
    setMissState(page, { view: 'chat', ownerUid, chat, mode, display })
    setMissTitle(page, `${display.name} · ${mode === 'script' ? '剧本' : '见面'}`)
    const body = page.querySelector('#miss-body')
    body.innerHTML = `
      <div class="miss-chat">
        <div class="miss-chat-log" id="miss-chat-log"></div>
        <div class="miss-compose">
          <button class="miss-end-meet" id="miss-end-meet" type="button" title="结束见面">结束</button>
          <textarea class="miss-input" id="miss-input" rows="1" placeholder="说点什么..."></textarea>
          <button class="miss-continue" id="miss-continue" type="button" title="续写"><i class="fa-solid fa-wand-magic-sparkles"></i></button>
          <button class="miss-send" id="miss-send" type="button" title="发送"><i class="fa-solid fa-paper-plane"></i></button>
        </div>
        <div class="miss-beauty-layer" id="miss-beauty-layer"></div>
      </div>`
    const input = body.querySelector('#miss-input')
    const sendButton = body.querySelector('#miss-send')
    let sendPending = false
    const send = async () => {
      if (sendPending) return false
      const draft = input.value
      const text = draft.trim()
      if (!text) return false
      sendPending = true
      sendButton.disabled = true
      try {
        await addOfflineMessage(ownerUid, chat.id, chat.charId, mode, 'user', text)
        await refreshOfflineChat(page)
        if (input.value === draft) input.value = ''
        syncMissInputHeight(input, true)
        startOfflineAIReply(page)
        return true
      } catch (error) {
        console.error('[miss-you] 消息发送失败:', error)
        window.toast('消息发送失败：' + (error?.message || String(error)))
        return false
      } finally {
        sendPending = false
        sendButton.disabled = false
      }
    }
    input.addEventListener('input', () => syncMissInputHeight(input))
    input.addEventListener('keydown', e => {
      const isSend = window.isWanWanSendKeyEvent
        ? window.isWanWanSendKeyEvent(e)
        : e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229 && e.which !== 229
      if (!isSend) return
      e.preventDefault()
      send()
    })
    if (window.bindWanWanMobileAction) window.bindWanWanMobileAction(sendButton, send)
    else sendButton.addEventListener('click', send)
    body.querySelector('#miss-continue').addEventListener('click', () => startOfflineAIReply(page, { preferContinue: true }))
    body.querySelector('#miss-end-meet').addEventListener('click', () => endCurrentMeet(page))
    await refreshOfflineChat(page)
    await applyMissBeauty(page, ownerUid, chat.id, mode)
  }

  function syncMissInputHeight(input, reset = false) {
    if (!input) return
    if (reset) {
      input.style.removeProperty('height')
      return
    }
    input.style.height = 'auto'
    input.style.height = Math.min(input.scrollHeight, 120) + 'px'
  }

  async function getOfflineMessages(ownerUid, chatId, charId, mode, options = {}) {
    const rows = await db.offlineChats.where('charId').equals(charId).toArray()
    return rows
      .filter(m => m.ownerUid === ownerUid && m.chatId === chatId && m.mode === mode)
      .filter(m => options.includeEnded ? true : !m.endedAt)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
  }

  async function addOfflineMessage(ownerUid, chatId, charId, mode, role, content) {
    return await db.offlineChats.add({
      ownerUid, chatId, charId, mode, role, content,
      createdAt: Date.now()
    })
  }

  async function refreshOfflineChat(page) {
    const state = page._missState
    if (!state || state.view !== 'chat') return
    const log = page.querySelector('#miss-chat-log')
    if (!log) return
    const userDisplay = await getMaskUserDisplayFor(state.ownerUid, state.chat.id, state.mode)
    const char = await window.getCharacter(state.chat.charId)
    const display = await getWechatDisplayFor(state.ownerUid, char)
    const rows = await getOfflineMessages(state.ownerUid, state.chat.id, state.chat.charId, state.mode)
    const settings = await getOfflineSettings(state.ownerUid, state.chat.id, state.mode)
    state.settings = settings
    if (!rows.length) {
      log.innerHTML = `
        <div class="miss-empty miss-empty-chat">
          <i class="fa fa-fire-flame-curved"></i>
          <div>${myEsc(display.name)}正在等你开口</div>
        </div>`
    } else {
      log.innerHTML = rows.map((m, i) => buildOfflineMsgHTML(m, userDisplay, display, i, settings, {
        useConfiguredSubtitles: true
      })).join('')
      bindMissEntryActions(log, page)
    }
    log.scrollTop = log.scrollHeight
  }

  async function endCurrentMeet(page) {
    const state = page._missState
    if (!state || state.view !== 'chat') return
    const key = pendingKey(state.ownerUid, state.chat.id, state.mode)
    if (_missYouPending.has(key)) {
      window.toast('正在生成回复，稍后再结束')
      return
    }
    const rows = await getOfflineMessages(state.ownerUid, state.chat.id, state.chat.charId, state.mode)
    if (!rows.length) {
      window.toast('当前没有可结束的见面')
      return
    }
    if (_missSummaryPending.has(key) || _missEndModalPending.has(key)) return
    _missEndModalPending.add(key)
    const action = await showMeetEndModal(page)
    _missEndModalPending.delete(key)
    if (!action) return
    const char = await window.getCharacter(state.chat.charId)
    const display = await getWechatDisplayFor(state.ownerUid, char)
    const endedAt = Date.now()
    const sessionId = `meet_${state.ownerUid}_${state.chat.id}_${state.mode}_${endedAt}`
    const endedTitle = `${display.name} · ${state.mode === 'script' ? '剧本' : '见面'}`
    const settings = await getOfflineSettings(state.ownerUid, state.chat.id, state.mode)
    let summaryResult = null
    let summaryError = null
    const endButton = page.querySelector('#miss-end-meet')
    _missSummaryPending.add(key)
    if (endButton) {
      endButton.disabled = true
      endButton.textContent = action === 'summary' ? '总结中...' : '结束中...'
    }
    try {
      if (action === 'summary') {
        const summaryMessages = buildMeetingSummaryMessages(rows, settings)
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            summaryResult = await window.WanWanMemory.summarizeMeeting(
              state.chat.id,
              state.chat.charId,
              state.ownerUid,
              sessionId,
              summaryMessages,
              endedAt
            )
            summaryError = null
            break
          } catch (error) {
            summaryError = error
          }
        }
      }
      const summarized = action === 'summary' && !summaryError && summaryResult?.ok
      await db.offlineChats.bulkPut(rows.map(m => ({
        ...m,
        sessionId,
        endedAt,
        endedTitle,
        sessionMaskUserId: settings.maskUserId,
        meetSummaryStatus: summarized ? 'summarized' : 'unsummarized',
        meetSummarizedAt: summarized ? Date.now() : null
      })))
      await refreshOfflineChat(page)
      if (summaryError) {
        window.toast('总结失败，见面已结束，可在过往记录中重新总结')
      } else if (summarized) {
        window.toast(`已总结并结束此次见面，生成 ${summaryResult.memoryCount} 条记忆`)
      } else {
        window.toast('已结束此次见面')
      }
    } finally {
      _missSummaryPending.delete(key)
      if (endButton) {
        endButton.disabled = false
        endButton.textContent = '结束'
      }
    }
  }

  function showMeetEndModal(page) {
    return showMeetChoiceModal({
      title: '结束此次见面？',
      message: '结束后当前页面会清空，可在设置里查看记录。你也可以先将本次见面整理为长期记忆。',
      buttons: [
        { value: 'summary', label: '总结并结束', primary: true },
        { value: 'direct', label: '直接结束' }
      ]
    }, page)
  }

  function showMeetSummaryConfirm() {
    return showMeetChoiceModal({
      title: '总结此次见面？',
      message: '将调用一次 AI，把本轮见面记录整理为长期记忆。',
      buttons: [{ value: 'summary', label: '确认总结', primary: true }]
    }).then(value => value === 'summary')
  }

  function showMeetChoiceModal(options, ownerPage) {
    return new Promise(resolve => {
      const overlay = document.createElement('div')
      overlay.className = 'sheet-overlay miss-summary-overlay'
      const modal = document.createElement('div')
      modal.className = 'center-modal miss-summary-modal'
      modal.innerHTML = `
        <div class="sheet-title">${myEsc(options.title)}</div>
        <div class="miss-summary-modal-message">${myEsc(options.message)}</div>
        <div class="sheet-actions miss-summary-modal-actions">
          ${(options.buttons || []).map((button, index) => `
            <button class="${button.primary ? 'btn-pill' : 'btn-ghost'} btn-full" data-meet-choice="${myEsc(button.value)}" type="button">${myEsc(button.label)}</button>
          `).join('')}
          <button class="btn-ghost btn-full" data-meet-choice="" type="button">取消</button>
        </div>`
      const host = ownerPage?.querySelector('#miss-beauty-layer') || document.getElementById('app') || document.body
      host.appendChild(overlay)
      host.appendChild(modal)
      requestAnimationFrame(() => { overlay.classList.add('show'); modal.classList.add('show') })
      let closed = false
      const close = value => {
        if (closed) return
        closed = true
        overlay.classList.remove('show')
        modal.classList.remove('show')
        setTimeout(() => { overlay.remove(); modal.remove() }, 220)
        resolve(value || null)
      }
      overlay.addEventListener('click', () => close(null))
      modal.querySelectorAll('[data-meet-choice]').forEach(button => {
        button.addEventListener('click', () => close(button.dataset.meetChoice))
      })
    })
  }

  function buildMeetingSummaryMessages(messages, settings) {
    return messages.map(message => ({
      id: message.id,
      role: message.role,
      content: parseMissStatus(message.content || '', settings).text
        .replace(/<status>[\s\S]*?<\/status>/gi, '')
        .trim()
    })).filter(message => message.content)
  }

  function buildOfflineMsgHTML(msg, userDisplay, display, index = 0, settings, options = {}) {
    const isUser = msg.role === 'user'
    const name = isUser ? userDisplay.name : display.name
    const avatar = isUser ? userDisplay.avatar : display.avatar
    const parsed = parseMissStatus(msg.content || '', settings)
    const content = formatOfflineContent(parsed.status ? parsed.text : (msg.content || ''))
    const useConfiguredSubtitles = options.useConfiguredSubtitles === true
    const subtitle = isUser
      ? (useConfiguredSubtitles ? settings?.userSubtitle : MISS_USER_SUBTITLE_DEFAULT)
      : (useConfiguredSubtitles ? settings?.charSubtitle : MISS_CHAR_SUBTITLE_DEFAULT)
    const rank = `#${index + 1}`
    const hearts = buildMissMoodHeartsHTML(parsed.status?.fields)
    const statusAttrs = parsed.status
      ? ` data-status-fields="${myEsc(JSON.stringify(parsed.status.fields))}"`
      : ''
    return `
      <article class="miss-entry ${isUser ? 'is-user' : 'is-char'}" data-msg-id="${msg.id || ''}">
        <button class="miss-entry-head" type="button"${statusAttrs}>
          <div class="miss-entry-person">
            <div class="miss-msg-avatar">${avatarHTML(avatar, name)}</div>
            <div class="miss-entry-nameblock">
              <div class="miss-msg-name">${myEsc(name)}</div>
              ${subtitle === '' ? '' : `<div class="miss-entry-subtitle">${myEsc(subtitle ?? (isUser ? MISS_USER_SUBTITLE_DEFAULT : MISS_CHAR_SUBTITLE_DEFAULT))}</div>`}
            </div>
          </div>
          <div class="miss-entry-rank">
            <span class="miss-hearts">${hearts}</span>
          </div>
          <div class="miss-entry-floor">${myEsc(rank)}</div>
        </button>
        <div class="miss-entry-card">
          <div class="miss-msg-text">${content}</div>
          <div class="miss-entry-footer">
            <span>${myEsc(formatMeetTime(msg.createdAt))}</span>
            <button type="button" class="miss-entry-more" title="更多"><i class="fa-solid fa-ellipsis"></i></button>
            <button type="button" class="miss-entry-delete" title="删除"><i class="fa-regular fa-trash-can"></i></button>
          </div>
        </div>
      </article>`
  }

  function bindMissEntryActions(root, page) {
    root.querySelectorAll('.miss-entry.is-char .miss-entry-head').forEach(head => {
      head.addEventListener('click', () => {
        let fields = null
        try { fields = JSON.parse(head.dataset.statusFields || '') } catch(e) { /* ignore */ }
        if (!fields || !fields.length) {
          window.toast?.('这条记录没有状态栏')
          return
        }
        showMissStatusCard(head, { fields })
      })
    })
    root.querySelectorAll('.miss-entry-more').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation()
        if (!page) return
        const entry = btn.closest('.miss-entry')
        const id = parseInt(entry?.dataset.msgId, 10)
        if (!id) return
        await showMissEntryMenu(btn, page, id)
      })
    })
    root.querySelectorAll('.miss-entry-delete').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation()
        const entry = btn.closest('.miss-entry')
        const id = parseInt(entry?.dataset.msgId, 10)
        if (!id || !confirm('删除这条见面记录？')) return
        await db.offlineChats.delete(id)
        await refreshOfflineChat(page)
      })
    })
  }

  async function showMissEntryMenu(anchor, page, msgId) {
    const existing = document.getElementById('miss-entry-menu')
    if (existing) existing.remove()
    const msg = await db.offlineChats.get(msgId)
    if (!msg || msg.endedAt) return
    const isUser = msg.role === 'user'
    const menu = document.createElement('div')
    menu.id = 'miss-entry-menu'
    menu.className = 'miss-entry-menu'
    menu.innerHTML = `
      ${isUser ? '' : '<button type="button" data-action="redo"><i class="fa-solid fa-rotate-left"></i><span>重回</span></button>'}
      <button type="button" data-action="edit"><i class="fa-solid fa-pen"></i><span>编辑</span></button>
    `
    const host = page.querySelector('#miss-beauty-layer') || document.getElementById('app')
    host.appendChild(menu)
    positionMissEntryMenu(menu, anchor)
    menu.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation()
        const action = btn.dataset.action
        menu.remove()
        if (action === 'redo') await redoMissEntry(page, msg)
        if (action === 'edit') showMissEditSheet(page, msg)
      })
    })
    setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 80)
  }

  function positionMissEntryMenu(menu, anchor) {
    const rect = anchor.getBoundingClientRect()
    const gap = 8
    const edge = 8
    const menuRect = menu.getBoundingClientRect()
    const maxLeft = Math.max(edge, window.innerWidth - menuRect.width - edge)
    const left = Math.min(Math.max(rect.right - menuRect.width, edge), maxLeft)
    const topAbove = rect.top - menuRect.height - gap
    const topBelow = rect.bottom + gap
    const top = topAbove >= edge
      ? topAbove
      : Math.min(topBelow, Math.max(edge, window.innerHeight - menuRect.height - edge))
    menu.style.left = left + 'px'
    menu.style.top = top + 'px'
  }

  async function redoMissEntry(page, msg) {
    const state = page._missState
    if (!state || state.view !== 'chat') return
    const key = pendingKey(state.ownerUid, state.chat.id, state.mode)
    if (_missYouPending.has(key)) return
    const rows = await getOfflineMessages(state.ownerUid, state.chat.id, state.chat.charId, state.mode)
    const target = rows.find(m => m.id === msg.id)
    if (!target) {
      window.toast?.('记录不存在')
      return
    }
    const targetIndex = rows.findIndex(m => m.id === target.id)
    if (targetIndex < 0) return
    const removeIds = rows
      .slice(targetIndex)
      .map(m => m.id)
      .filter(Boolean)
    if (!removeIds.length) return
    await db.offlineChats.bulkDelete(removeIds)
    await refreshOfflineChat(page)
    startOfflineAIReply(page, { preferContinue: true })
  }

  function buildMissContent(statusText, text) {
    const body = String(text || '').trim()
    const status = String(statusText || '').trim()
    return status ? `${status}\n${body}`.trim() : body
  }

  async function showMissEditSheet(page, msg) {
    const state = page._missState
    const settings = state ? await getOfflineSettings(state.ownerUid, state.chat.id, state.mode) : null
    const parsed = parseMissStatus(msg.content || '', settings)
    const statusText = parsed.status?.raw || ''
    const fieldNames = settings?.statusFields?.length ? settings.statusFields : ['Location', 'Mood', 'Mind']
    const placeholderLines = fieldNames.map(f => `[${f}|...]`).join('&#10;')
    const overlay = document.createElement('div')
    overlay.className = 'sheet-overlay'
    const sheet = document.createElement('div')
    sheet.className = 'center-modal miss-edit-modal'
    sheet.innerHTML = `
      <div class="sheet-title">编辑见面记录</div>
      <div class="miss-edit-body">
        <div class="miss-edit-section-title">状态栏</div>
        <textarea class="input-field miss-edit-status" id="miss-edit-status" rows="5" placeholder="<status>&#10;${placeholderLines}&#10;</status>">${myEsc(statusText)}</textarea>
        <div class="miss-edit-section-title">正文</div>
        <textarea class="input-field miss-edit-text" id="miss-edit-text" rows="8" placeholder="正文内容">${myEsc(parsed.text || '')}</textarea>
      </div>
      <div class="sheet-actions">
        <button class="btn-ghost btn-full" id="miss-edit-cancel" type="button">取消</button>
        <button class="btn-pill btn-full" id="miss-edit-save" type="button">保存</button>
      </div>
    `
    const host = page.querySelector('#miss-beauty-layer') || document.getElementById('app')
    host.appendChild(overlay)
    host.appendChild(sheet)
    requestAnimationFrame(() => {
      overlay.classList.add('show')
      sheet.classList.add('show')
    })
    const close = () => {
      overlay.classList.remove('show')
      sheet.classList.remove('show')
      setTimeout(() => { overlay.remove(); sheet.remove() }, 220)
    }
    overlay.addEventListener('click', close)
    sheet.querySelector('#miss-edit-cancel').addEventListener('click', close)
    sheet.querySelector('#miss-edit-save').addEventListener('click', async () => {
      const status = sheet.querySelector('#miss-edit-status').value
      const text = sheet.querySelector('#miss-edit-text').value
      if (!String(text || '').trim()) {
        window.toast?.('正文不能为空')
        return
      }
      const content = buildMissContent(status, text)
      await db.offlineChats.update(msg.id, { content })
      close()
      await refreshOfflineChat(page)
    })
  }

  function showMissStatusCard(head, status) {
    const entry = head.closest('.miss-entry')
    if (!entry) return
    const existing = entry.querySelector('.miss-status-card')
    if (existing) {
      existing.remove()
      return
    }
    entry.querySelectorAll('.miss-status-card').forEach(el => el.remove())
    const card = document.createElement('div')
    card.className = 'miss-status-card'
    const rowsHTML = (status.fields || []).map(f =>
      `<div class="miss-status-row"><span>${myEsc(f.name)}</span><strong>${myEsc(f.value || '')}</strong></div>`
    ).join('')
    card.innerHTML = `<div class="miss-status-card-title">状态栏</div>${rowsHTML}`
    head.insertAdjacentElement('afterend', card)
  }

  function formatOfflineContent(content) {
    return String(content || '')
      .split(/\n{2,}|\n/)
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => `<p>${formatMissQuoteHighlights(myEsc(p))}</p>`)
      .join('')
  }

  function formatMissQuoteHighlights(html) {
    return String(html || '').replace(/“([^”]*)”/g, '<span class="miss-quote-highlight">“$1”</span>')
  }

  function startOfflineAIReply(page, options = {}) {
    const state = page._missState
    if (!state || state.view !== 'chat') return
    const key = pendingKey(state.ownerUid, state.chat.id, state.mode)
    if (_missYouPending.has(key)) return
    _missYouPending.add(key)
    applyMissPending(page, true)
    ;(async () => {
      try {
        const reply = await generateOfflineReply(state.ownerUid, state.chat, state.mode, options)
        await addOfflineMessage(state.ownerUid, state.chat.id, state.chat.charId, state.mode, 'assistant', reply)
        await refreshOfflineChat(page)
      } catch (e) {
        if (typeof showApiErrorModal === 'function') showApiErrorModal(e.message || String(e))
        else window.toast('AI 回复失败：' + (e.message || String(e)))
      } finally {
        _missYouPending.delete(key)
        applyMissPending(page, false)
      }
    })()
  }

  function applyMissPending(page, isPending) {
    const body = page.querySelector('#miss-body')
    if (!body) return
    body.classList.toggle('is-generating', isPending)
    body.querySelectorAll('#miss-send,#miss-continue,#miss-end-meet').forEach(btn => {
      btn.disabled = isPending
    })
    const log = body.querySelector('#miss-chat-log')
    if (!log) return
    let indicator = log.querySelector('#miss-typing')
    if (isPending && !indicator) {
      const state = page._missState || {}
      const display = state.display || {}
      const name = display.name || '对方'
      const avatar = display.avatar
      const subtitle = state.settings?.charSubtitle ?? MISS_CHAR_SUBTITLE_DEFAULT
      log.insertAdjacentHTML('beforeend', `
        <article class="miss-entry is-char is-typing" id="miss-typing">
          <div class="miss-entry-head">
            <div class="miss-entry-person">
              <div class="miss-msg-avatar">${avatarHTML(avatar, name)}</div>
              <div class="miss-entry-nameblock">
                <div class="miss-msg-name">${myEsc(name)}</div>
                ${subtitle === '' ? '' : `<div class="miss-entry-subtitle">${myEsc(subtitle)}</div>`}
              </div>
            </div>
            <div class="miss-entry-rank">
              <span class="miss-typing-dots"><span></span><span></span><span></span></span>
            </div>
            <div class="miss-entry-floor"></div>
          </div>
        </article>`)
      log.scrollTop = log.scrollHeight
    } else if (!isPending && indicator) {
      indicator.remove()
    }
  }

  async function generateOfflineReply(ownerUid, chat, mode, options = {}) {
    const char = await window.getCharacter(chat.charId)
    const user = await getMaskUser(ownerUid, chat.id, mode)
    if (!char || !user) throw new Error('角色或账号不存在')
    const settings = await getOfflineSettings(ownerUid, chat.id, mode)
    const historyLimit = await getChatHistoryLimit(chat.id)
    const timelineContext = await window._wechatCallHelpers.buildUnifiedChatTimeline(chat.id, chat.charId, historyLimit, ownerUid, {
      includeMultimodal: false
    })
    const offlineAll = await getOfflineMessages(ownerUid, chat.id, chat.charId, mode)
    const recentForLore = (timelineContext.loreMessages || []).map(m => ({
      role: m.role,
      content: m.content || ''
    }))
    const loreCtx = window.getLorebookContextSegments
      ? await window.getLorebookContextSegments(chat.charId, recentForLore)
      : (window.getLorebookContext ? await window.getLorebookContext(chat.charId, recentForLore) : '')
    const memoryCtx = window.WanWanMemory?.getMemoryContext
      ? await window.WanWanMemory.getMemoryContext(chat.id, chat.charId, ownerUid, timelineContext.loreMessages)
      : ''
    const lastOffline = offlineAll[offlineAll.length - 1]
    const isContinuation = !!(options.preferContinue && lastOffline && lastOffline.role !== 'user')
    const system = await buildOfflineSystemPrompt(ownerUid, char, user, loreCtx, memoryCtx, offlineAll, settings)
    const timeline = buildOfflineTimeline(timelineContext.textHistory || [], { isContinuation })
    const raw = await window.callAI(timeline, { system, temperature: await window.getAITemperaturePreset('offlineMode') })
    const reply = cleanOfflineReply(raw)
    if (!reply) throw new Error('AI 返回了空响应，请检查 API 配置或稍后重试')
    return reply
  }

  async function buildOfflineSystemPrompt(ownerUid, char, user, loreCtx, memoryCtx, offlineAll, settings) {
    const charName = getOfflinePromptCharName(char)
    const userName = getOfflinePromptUserName(user)
    const relation = buildRelationText(char, user.id || ownerUid)
    const relatedNpcBlock = await buildRelatedNpcBlock(char)
    // loreCtx 可为字符串（旧行为，全部按「中」处理）或 { before, middle, after } 分段对象
    const loreSeg = (loreCtx && typeof loreCtx === 'object')
      ? loreCtx
      : { before: '', middle: loreCtx || '', after: '' }
    const loreBeforeBlock = loreSeg.before ? `## 前置世界观设定\n${loreSeg.before}\n\n` : ''
    const loreBlock = loreSeg.middle ? `## 世界书设定\n${loreSeg.middle}` : ''
    const loreAfterBlock = loreSeg.after ? `## 补充世界观设定\n${loreSeg.after}\n\n` : ''
    const memoryBlock = buildOfflineMemoryBlock(memoryCtx)
    const antiRepeatBlock = buildAntiRepeatBlock(offlineAll)
    const narrativeRule = buildNarrativePersonRule(settings.narrativePerson, charName, userName)
    return `# 想见你线下模式

你扮演【${charName}】，正在和【${userName}】线下真实见面。你不是${userName}，也不是语言模型；你有自己的性格、情绪、边界和判断。

${loreBeforeBlock}## 人物档案

1. 你的身份：${charName}
${char.gender ? `- 性别：${char.gender}\n` : ''}${char.role ? `- 身份：${char.role}\n` : ''}
人设细节：
${char.description || '(未设定，以普通人逻辑行事)'}

2. 互动对象：${userName}
${user.gender ? `- 性别：${user.gender}\n` : ''}${user.role ? `- 身份：${user.role}\n` : ''}
对象人设：
${user.description || '(未设定)'}

3. 你们的关系：
${relation}

${relatedNpcBlock}

${loreBlock}

${memoryBlock}

${antiRepeatBlock}

## 上下文
- 微信聊天和线下见面属于同一条连续时间线；记住两边发生过的事，自然承接最近上下文。
- 当前场景只发生在线下。若历史里出现“之后你们在微信上聊天/线下见面了”等转场提示，只用于理解时间线，不要复述。
- 可以感知并回应现场的表情、距离、停顿、视线、手部动作、身体姿态和环境细节。

${loreAfterBlock}## 回复规则
- AI必须在每次回复的最开头，强制附加以下结构化状态数据，然后再输出正文：
<status>
${settings.statusFormat}
</status>
- ${settings.statusDesc}
- 只输出${charName}这一轮回应，不替${userName}说话或新增${userName}动作。
- ${settings.minWords}-${settings.maxWords}个中文字符；每次都推进动作、情绪、话题或关系张力。
- ${narrativeRule}
- 必须同时包含动作描写、神态描写和心理活动；动作与对白分段换行，不要堆成一行。
- 允许符合人设和关系的自然肢体互动，不能突兀升级，也不能无条件讨好${userName}。

## 禁止
- 禁止微信表情包、图片、语音、红包、转账、朋友圈、聊天气泡等网络元素。
- 禁止重复已出现过的动作、台词、描写、场景和句式；避免让回复像之前内容的改写。
- 除开头固定<status>结构外，禁止输出 JSON、Markdown、标题、解释、方括号前缀或元标记，如[微信消息]、[线下]、[旁白]、[系统]、[动作]。`
  }

  function buildNarrativePersonRule(narrativePerson, charName, userName) {
    if (narrativePerson === 'first') {
      return `用第一人称“我”写${charName}的动作、神态和心理；对白必须放在中文双引号内。`
    }
    if (narrativePerson === 'second') {
      return `用第二人称“你”写${charName}的动作、神态和心理；这里的“你”始终指${charName}，不得指代${userName}；对白可用第一人称，但必须放在中文双引号内。`
    }
    return `用第三人称写${charName}的动作、神态和心理；对白可用第一人称，但必须放在中文双引号内。`
  }

  function buildOfflineMemoryBlock(memoryCtx) {
    if (!memoryCtx) return ''
    return `## 长期记忆
以下记忆只属于当前微信账号与当前角色之间的关系。请自然参考这些事实，不要机械复述，也不要提到“记忆系统”。
- 这些记忆只是背景事实，不能覆盖当前线下场景里刚刚发生的内容。
- 不要因为读到记忆就把回复写成微信消息、聊天气泡、JSON 或系统说明。

${memoryCtx}`
  }

  function buildRelationText(char, ownerUid) {
    const rel = (char.relations || []).find(r => r.charId === ownerUid)
    if (!rel || !rel.type) return '(未设定)'
    return rel.type + (rel.desc ? `（${rel.desc}）` : '')
  }

  function buildOfflinePersonaEstimateText(char, user, relation) {
    return window._wechatCallHelpers.joinPromptEstimateParts([
      getOfflinePromptCharName(char),
      char?.gender ? `性别：${char.gender}` : '',
      char?.role ? `身份：${char.role}` : '',
      char?.description || '(未设定，以普通人逻辑行事)',
      getOfflinePromptUserName(user),
      user?.gender ? `性别：${user.gender}` : '',
      user?.role ? `身份：${user.role}` : '',
      user?.description || '(未设定)',
      `你们的关系：${relation || '(未设定)'}`
    ])
  }

  async function estimateOfflinePromptContext(ownerUid, chat, mode) {
    const baseSummary = await window._wechatCallHelpers.estimateWechatPromptContext(chat.id, chat.charId, ownerUid)
    const historyLimit = await window._wechatCallHelpers.getChatHistoryLimit(chat.id)
    const timelineContext = await window._wechatCallHelpers.buildUnifiedChatTimeline(chat.id, chat.charId, historyLimit, ownerUid, {
      includeMultimodal: false
    })
    const recentForLore = (timelineContext.loreMessages || []).map(m => ({
      role: m.role,
      content: m.content || ''
    }))
    const loreCtx = window.getLorebookContext
      ? await window.getLorebookContext(chat.charId, recentForLore)
      : ''
    const char = await window.getCharacter(chat.charId)
    const user = await getMaskUser(ownerUid, chat.id, mode)
    const relation = buildRelationText(char, user?.id || ownerUid)
    return window._wechatCallHelpers.buildPromptContextEstimateSummary({
      ...baseSummary,
      loreChars: window._wechatCallHelpers.countPromptTextChars(loreCtx),
      personaChars: window._wechatCallHelpers.countPromptTextChars(buildOfflinePersonaEstimateText(char, user, relation))
    })
  }

  function buildMissBeautyPresetRows(selectedId, presets) {
    const hasSelected = !selectedId || presets.some(preset => preset.id === selectedId)
    return `
      <label class="cs-preset-row">
        <input type="radio" name="miss-beauty-preset" value="" ${!hasSelected || !selectedId ? 'checked' : ''}>
        <div class="cs-preset-info">
          <span class="cs-preset-name">默认样式</span>
          <span class="cs-preset-meta">${hasSelected ? '不使用自定义美化' : '原模板已删除，保存后回到默认样式'}</span>
        </div>
      </label>
      ${presets.map(preset => `
        <label class="cs-preset-row">
          <input type="radio" name="miss-beauty-preset" value="${myEsc(preset.id)}" ${selectedId === preset.id ? 'checked' : ''}>
          <div class="cs-preset-info">
            <span class="cs-preset-name">${myEsc(preset.name || '未命名模板')}</span>
            <span class="cs-preset-meta">${myEsc(String(preset.css || '').replace(/\s+/g, ' ').trim().slice(0, 42) || '空 CSS')}</span>
          </div>
        </label>
      `).join('') || '<div class="cs-empty">暂无见面美化模板，请先创建</div>'}
    `
  }

  async function refreshMissBeautyPicker(settingsPage, preferredId) {
    if (!settingsPage?.isConnected) return
    const list = settingsPage.querySelector('#miss-beauty-preset-list')
    if (!list) return
    const selected = preferredId !== undefined
      ? preferredId
      : settingsPage.querySelector('input[name="miss-beauty-preset"]:checked')?.value || ''
    const presets = await getMissBeautyPresets()
    list.innerHTML = buildMissBeautyPresetRows(selected, presets)
  }

  async function openMissSettingsPage(chatPage, ownerUid, chat, mode) {
    const existing = document.getElementById('miss-you-settings-page')
    if (existing) existing.remove()
    const char = await window.getCharacter(chat.charId)
    const display = await getWechatDisplayFor(ownerUid, char)
    const settings = await getOfflineSettings(ownerUid, chat.id, mode)
    const beautyPresets = await getMissBeautyPresets()
    const promptEstimate = await estimateOfflinePromptContext(ownerUid, chat, mode)
    const users = (await db.characters.where('type').equals('user').toArray())
      .sort((a, b) => (b.id || 0) - (a.id || 0))
    const records = await getMeetRecords(ownerUid, chat.id, chat.charId, mode)
    const page = document.createElement('div')
    page.id = 'miss-you-settings-page'
    page.className = 'full-page miss-page'
    page.innerHTML = `
      <div class="page-header">
        <button class="header-back" id="miss-settings-back"><i class="fa fa-angle-left"></i></button>
        <span class="header-title">见面设置</span>
      </div>
      <div class="miss-settings-scroll">
        <div class="miss-settings-target">
          <div class="miss-avatar">${avatarHTML(display.avatar, display.name)}</div>
          <div>
            <div class="miss-settings-target-name">${myEsc(display.name)}</div>
            <div class="miss-settings-target-sub">${mode === 'script' ? '剧本' : '见面'}</div>
          </div>
        </div>

        <div class="cs-section">
          <div class="cs-section-label">回复字数</div>
          <div class="cs-section-sub">控制角色每次线下回应的大致长度</div>
          <div class="miss-word-grid">
            <label class="miss-field-label">
              <span>最少字数</span>
              <input class="input-field" id="miss-min-words" type="number" min="1" step="1" value="${settings.minWords}">
            </label>
            <label class="miss-field-label">
              <span>最多字数</span>
              <input class="input-field" id="miss-max-words" type="number" min="1" step="1" value="${settings.maxWords}">
            </label>
          </div>
        </div>

        <div class="cs-section">
          <div class="cs-section-label">叙述人称</div>
          <div class="cs-section-sub">设置角色动作、神态和心理活动的叙述视角</div>
          <select class="input-field" id="miss-narrative-person">
            <option value="first" ${settings.narrativePerson === 'first' ? 'selected' : ''}>第一人称（我）</option>
            <option value="second" ${settings.narrativePerson === 'second' ? 'selected' : ''}>第二人称（你）</option>
            <option value="third" ${settings.narrativePerson === 'third' ? 'selected' : ''}>第三人称</option>
          </select>
        </div>

        <div class="cs-section">
          <div class="cs-section-label">临时面具</div>
          <div class="cs-section-sub">切换角色回复时读取到的用户人设</div>
          <select class="input-field" id="miss-mask-user">
            ${users.map(user => `
              <option value="${user.id}" ${user.id === settings.maskUserId ? 'selected' : ''}>
                ${myEsc(user.name || '未命名')}${user.nick ? ' / ' + myEsc(user.nick) : ''}
              </option>
            `).join('')}
          </select>
          <div class="miss-mask-hint">*建议维持原本用户面具姓名</div>
        </div>

        <div class="cs-section">
          <div class="cs-section-label">状态栏格式</div>
          <div class="cs-section-sub">自定义状态栏的字段名和提示词格式</div>
          <label class="miss-field-label">
            <span>系统提示词格式</span>
            <textarea class="input-field" id="miss-status-format" rows="4" placeholder="[Location|...]&#10;[Mood|...]&#10;[Mind|...]">${myEsc(settings.statusFormat)}</textarea>
          </label>
          <label class="miss-field-label">
            <span>正则表达式</span>
            <div class="miss-regex-row">
              <input class="input-field" id="miss-status-regex" readonly value="${myEsc(settings.statusRegex)}" placeholder="点击生成按钮从格式自动生成">
              <button class="btn-pill miss-gen-regex-btn" id="miss-gen-regex" type="button">生成正则</button>
            </div>
            <div class="miss-regex-hint" id="miss-regex-hint"></div>
          </label>
          <label class="miss-field-label">
            <span>系统提示词说明</span>
            <textarea class="input-field" id="miss-status-desc" rows="2" placeholder="如：Mood必须保留两位小数；Mind必须在20字以内">${myEsc(settings.statusDesc)}</textarea>
          </label>
        </div>

        <div class="cs-section">
          <div class="cs-section-label">页面美化</div>
          <div class="cs-section-sub">仅应用到当前 live 见面页面，不影响历史记录和其他页面</div>
          <label class="miss-field-label">
            <span>我方文案</span>
            <input class="input-field" id="miss-user-subtitle" value="${myEsc(settings.userSubtitle)}" placeholder="${myEsc(MISS_USER_SUBTITLE_DEFAULT)}">
          </label>
          <label class="miss-field-label">
            <span>对方文案</span>
            <input class="input-field" id="miss-char-subtitle" value="${myEsc(settings.charSubtitle)}" placeholder="${myEsc(MISS_CHAR_SUBTITLE_DEFAULT)}">
          </label>
          <div class="cs-preset-picker miss-beauty-picker">
            <div class="cs-preset-list" id="miss-beauty-preset-list">
              ${buildMissBeautyPresetRows(settings.beautyPresetId, beautyPresets)}
            </div>
            <button class="cs-action-row" id="miss-manage-beauty" type="button">
              <i class="fa-solid fa-wand-sparkles"></i><span>管理见面美化模板</span><i class="fa fa-angle-right" style="margin-left:auto"></i>
            </button>
          </div>
        </div>

        <button class="btn-pill miss-save-settings" id="miss-save-settings" type="button">保存见面设置</button>

        ${window._wechatCallHelpers.buildPromptContextEstimateHTML(promptEstimate)}

        <div class="cs-section">
          <div class="cs-section-label">过往见面记录</div>
          <div class="miss-record-list" id="miss-record-list">
            ${buildMeetRecordsHTML(records)}
          </div>
        </div>
      </div>
    `
    page.querySelector('#miss-settings-back').addEventListener('click', () => window.closePage('miss-you-settings-page'))
    page.querySelector('#miss-gen-regex').addEventListener('click', () => {
      const format = page.querySelector('#miss-status-format').value
      const hint = page.querySelector('#miss-regex-hint')
      const regexInput = page.querySelector('#miss-status-regex')
      const result = generateStatusRegex(format)
      if (!result) {
        hint.textContent = '格式不正确，需要至少一个 [字段名|...] 格式'
        hint.className = 'miss-regex-hint miss-regex-error'
        regexInput.value = ''
        return
      }
      regexInput.value = result
      hint.textContent = '正则已生成'
      hint.className = 'miss-regex-hint miss-regex-ok'
    })
    page.querySelector('#miss-manage-beauty').addEventListener('click', () => {
      openMissBeautyPresetsPage({
        settingsPage: page,
        chatPage,
        ownerUid,
        chat,
        mode
      })
    })
    page.querySelector('#miss-save-settings').addEventListener('click', async () => {
      const minWords = page.querySelector('#miss-min-words').value
      const maxWords = page.querySelector('#miss-max-words').value
      const narrativePerson = page.querySelector('#miss-narrative-person').value
      const maskUserId = parseInt(page.querySelector('#miss-mask-user').value, 10) || ownerUid
      const statusFormat = page.querySelector('#miss-status-format').value
      const statusRegex = page.querySelector('#miss-status-regex').value
      const statusDesc = page.querySelector('#miss-status-desc').value
      const userSubtitle = page.querySelector('#miss-user-subtitle').value
      const charSubtitle = page.querySelector('#miss-char-subtitle').value
      const beautyPresetId = page.querySelector('input[name="miss-beauty-preset"]:checked')?.value || ''
      await saveOfflineSettings(ownerUid, chat.id, mode, {
        minWords,
        maxWords,
        narrativePerson,
        maskUserId,
        statusFormat,
        statusRegex,
        statusDesc,
        userSubtitle,
        charSubtitle,
        beautyPresetId
      })
      await refreshOfflineChat(chatPage)
      await applyMissBeauty(chatPage, ownerUid, chat.id, mode)
      window.toast('见面设置已保存')
    })
    bindMeetRecordRows(page, ownerUid, chat, mode)
    window.openPage(page)
  }

  function downloadMissBeautyPreset(preset) {
    const safeName = String(preset?.name || '未命名模板')
      .replace(/[\\/:*?"<>|]+/g, '_')
      .trim() || '未命名模板'
    const blob = new Blob([String(preset?.css || '')], { type: 'text/css;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `弯弯见面美化_${safeName}.css`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    window.toast('见面美化模板已导出')
  }

  async function copyMissBeautyClassText() {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(MISS_BEAUTY_CLASS_TEXT)
      return
    }
    const textarea = document.createElement('textarea')
    textarea.value = MISS_BEAUTY_CLASS_TEXT
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    textarea.remove()
    if (!ok) throw new Error('复制失败')
  }

  function getImportedMissBeautyName(filename) {
    return String(filename || '')
      .replace(/\.css$/i, '')
      .replace(/^弯弯见面美化_/, '')
      .trim() || '导入模板'
  }

  async function syncMissBeautyManagerContext(page, preferredId) {
    const context = page?._missBeautyContext || {}
    await refreshMissBeautyPicker(context.settingsPage, preferredId)
    if (context.chatPage?.isConnected) {
      await applyMissBeauty(context.chatPage, context.ownerUid, context.chat?.id, context.mode)
    }
  }

  async function openMissBeautyPresetsPage(context) {
    const existing = document.getElementById('miss-beauty-presets-page')
    if (existing) existing.remove()
    const page = document.createElement('div')
    page.id = 'miss-beauty-presets-page'
    page.className = 'full-page thought-presets-page miss-beauty-presets-page'
    page._missBeautyContext = context
    page.innerHTML = `
      <div class="page-header">
        <button class="header-back" id="miss-beauty-list-back"><i class="fa fa-angle-left"></i></button>
        <span class="header-title">见面美化</span>
        <div class="tp-header-actions">
          <button class="btn-icon tp-header-action" id="miss-beauty-import" title="导入模板" aria-label="导入模板"><i class="fa fa-upload"></i></button>
          <button class="btn-icon tp-header-action" id="miss-beauty-add" title="添加模板" aria-label="添加模板"><i class="fa fa-plus"></i></button>
        </div>
      </div>
      <input type="file" id="miss-beauty-import-input" accept=".css,text/css" hidden>
      <div class="tp-list" id="miss-beauty-list"></div>
    `
    window.openPage(page)
    page.querySelector('#miss-beauty-list-back').addEventListener('click', () => window.closePage('miss-beauty-presets-page'))
    page.querySelector('#miss-beauty-add').addEventListener('click', () => openMissBeautyEditor(page))
    const fileInput = page.querySelector('#miss-beauty-import-input')
    page.querySelector('#miss-beauty-import').addEventListener('click', () => fileInput.click())
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0]
      try {
        if (!file || !/\.css$/i.test(file.name || '')) throw new Error('请选择 CSS 文件')
        const css = await file.text()
        if (!css.trim()) throw new Error('文件内容为空')
        await addMissBeautyPreset({ name: getImportedMissBeautyName(file.name), css })
        await renderMissBeautyPresetsList(page)
        await syncMissBeautyManagerContext(page)
        window.toast('见面美化模板已导入')
      } catch (error) {
        window.toast('导入失败：' + (error?.message || '文件无效'))
      } finally {
        fileInput.value = ''
      }
    })
    await renderMissBeautyPresetsList(page)
  }

  async function renderMissBeautyPresetsList(page) {
    const list = page.querySelector('#miss-beauty-list')
    if (!list) return
    const presets = await getMissBeautyPresets()
    if (!presets.length) {
      list.innerHTML = `
        <div class="tp-empty">
          <i class="fa-solid fa-wand-sparkles tp-empty-icon"></i>
          <div class="tp-empty-text">还没有见面美化模板</div>
          <div class="tp-empty-sub">创建后，可在每个见面设置中单独选用</div>
          <button class="btn-pill" id="miss-beauty-create-first" type="button">创建第一个模板</button>
        </div>`
      list.querySelector('#miss-beauty-create-first').addEventListener('click', () => openMissBeautyEditor(page))
      return
    }
    list.innerHTML = `
      <div class="tp-list-card">
        ${presets.map(preset => `
          <div class="tp-row" data-id="${myEsc(preset.id)}">
            <div class="tp-row-icon"><i class="fa-solid fa-wand-sparkles"></i></div>
            <div class="tp-row-info">
              <div class="tp-row-name">${myEsc(preset.name || '未命名模板')}</div>
              <div class="tp-row-meta">${myEsc(String(preset.css || '').replace(/\s+/g, ' ').trim().slice(0, 52) || '空 CSS')}</div>
            </div>
            <div class="tp-row-actions">
              <button class="btn-icon miss-beauty-edit" data-id="${myEsc(preset.id)}" title="编辑"><i class="fa fa-pen"></i></button>
              <button class="btn-icon miss-beauty-export" data-id="${myEsc(preset.id)}" title="导出"><i class="fa fa-download"></i></button>
              <button class="btn-icon miss-beauty-delete" data-id="${myEsc(preset.id)}" title="删除"><i class="fa fa-trash"></i></button>
            </div>
          </div>
        `).join('')}
      </div>`
    list.querySelectorAll('.miss-beauty-edit').forEach(button => {
      button.addEventListener('click', async () => {
        const latest = await getMissBeautyPresets()
        const preset = latest.find(item => item.id === button.dataset.id)
        if (preset) openMissBeautyEditor(page, preset)
      })
    })
    list.querySelectorAll('.miss-beauty-export').forEach(button => {
      button.addEventListener('click', async () => {
        const latest = await getMissBeautyPresets()
        const preset = latest.find(item => item.id === button.dataset.id)
        if (preset) downloadMissBeautyPreset(preset)
      })
    })
    list.querySelectorAll('.miss-beauty-delete').forEach(button => {
      button.addEventListener('click', async () => {
        if (!confirm('删除这个见面美化模板？使用它的见面将回到默认样式。')) return
        await deleteMissBeautyPreset(button.dataset.id)
        await renderMissBeautyPresetsList(page)
        await syncMissBeautyManagerContext(page)
        window.toast('模板已删除')
      })
    })
  }

  function buildMissBeautyPreviewHTML() {
    const entry = (role, name, subtitle, text, options = {}) => `
      <article class="miss-entry ${role}">
        <button class="miss-entry-head" type="button">
          <div class="miss-entry-person">
            <div class="miss-msg-avatar"><span>${myEsc(name.charAt(0))}</span></div>
            <div class="miss-entry-nameblock">
              <div class="miss-msg-name">${myEsc(name)}</div>
              <div class="miss-entry-subtitle">${myEsc(subtitle)}</div>
            </div>
          </div>
          <div class="miss-entry-rank">
            ${options.typing
              ? '<span class="miss-typing-dots"><span></span><span></span><span></span></span>'
              : '<span class="miss-hearts"><i class="fa-solid fa-heart"></i><i class="fa-solid fa-heart"></i><i class="fa-solid fa-heart"></i></span>'}
          </div>
          <div class="miss-entry-floor">#1</div>
        </button>
        ${options.typing ? '' : `
          ${options.status ? `
            <div class="miss-status-card">
              <div class="miss-status-card-title">状态栏</div>
              <div class="miss-status-row"><span>Location</span><strong>街角咖啡店</strong></div>
              <div class="miss-status-row"><span>Mood</span><strong>86.50</strong></div>
            </div>` : ''}
          <div class="miss-entry-card">
            <div class="miss-msg-text"><p>${text}</p></div>
            <div class="miss-entry-footer">
              <span>2026-07-24 20:18</span>
              <button type="button" class="miss-entry-more"><i class="fa-solid fa-ellipsis"></i></button>
              <button type="button" class="miss-entry-delete"><i class="fa-regular fa-trash-can"></i></button>
            </div>
          </div>`}
      </article>`
    return `
      <div class="miss-body">
        <div class="miss-chat">
          <div class="miss-chat-log">
            ${entry('is-char', '弯弯', MISS_CHAR_SUBTITLE_DEFAULT, '<span class="miss-quote-highlight">“见到你真好。”</span>这是对方的见面回复。', { status: true })}
            ${entry('is-user', '我', MISS_USER_SUBTITLE_DEFAULT, '这是我在见面中说的话。')}
            ${entry('is-char is-typing', '弯弯', MISS_CHAR_SUBTITLE_DEFAULT, '', { typing: true })}
            <div class="miss-empty miss-beauty-preview-empty">
              <i class="fa fa-fire-flame-curved"></i><div>空页面状态</div><span>对方正在等你开口</span>
            </div>
          </div>
          <div class="miss-compose">
            <button class="miss-end-meet" type="button">结束</button>
            <textarea class="miss-input" rows="1" placeholder="说点什么..."></textarea>
            <button class="miss-continue" type="button"><i class="fa-solid fa-wand-magic-sparkles"></i></button>
            <button class="miss-send" type="button"><i class="fa-solid fa-paper-plane"></i></button>
          </div>
          <div class="miss-beauty-layer"></div>
        </div>
      </div>`
  }

  function openMissBeautyPreview(css) {
    const existing = document.getElementById('miss-beauty-preview-page')
    if (existing) existing.remove()
    const page = document.createElement('div')
    page.id = 'miss-beauty-preview-page'
    page.className = 'full-page miss-page miss-beauty-preview-page'
    page.innerHTML = `
      <div class="page-header miss-header">
        <button class="header-back" id="miss-beauty-preview-back"><i class="fa fa-angle-left"></i></button>
        <span class="header-title">见面美化预览</span>
        <button class="btn-icon miss-settings-btn"><i class="fa-solid fa-ellipsis-vertical"></i></button>
      </div>
      ${buildMissBeautyPreviewHTML()}`
    const style = document.createElement('style')
    style.id = 'miss-beauty-preview-style'
    style.textContent = scopeMissBeautyCss(css, '#miss-beauty-preview-page')
    page.prepend(style)
    setMissBeautyThemeIsolation(page, true)
    window.openPage(page)
    page.querySelector('#miss-beauty-preview-back').addEventListener('click', () => window.closePage('miss-beauty-preview-page'))
  }

  function openMissBeautyEditor(listPage, preset) {
    const isEdit = !!preset
    const page = document.createElement('div')
    page.id = 'miss-beauty-editor-page'
    page.className = 'full-page thought-preset-editor miss-beauty-editor-page'
    page.innerHTML = `
      <div class="page-header">
        <button class="header-back" id="miss-beauty-editor-back"><i class="fa fa-angle-left"></i></button>
        <span class="header-title">${isEdit ? '编辑见面美化' : '新建见面美化'}</span>
      </div>
      <div class="tpe-scroll">
        <div class="cs-section">
          <label class="cs-field-label" for="miss-beauty-name">模板名称</label>
          <input class="input-field" id="miss-beauty-name" placeholder="填入模板名称" value="${myEsc(preset?.name || '')}">
          <div class="cs-template-preview-head">
            <span>CSS代码</span>
            <button class="tutorial-copy-btn" id="miss-beauty-copy-classes" type="button"><i class="fa-regular fa-clone"></i>复制类名</button>
          </div>
          <textarea class="input-field cs-textarea miss-beauty-css-input" id="miss-beauty-css" rows="14" placeholder="${myEsc(MISS_BEAUTY_CLASS_HINT)}">${myEsc(preset?.css || '')}</textarea>
          <button class="btn-ghost btn-full" id="miss-beauty-show-preview" type="button">展示预览</button>
          <button class="btn-pill btn-full" id="miss-beauty-save" type="button">${isEdit ? '保存修改' : '创建模板'}</button>
        </div>
      </div>`
    window.openPage(page)
    page.querySelector('#miss-beauty-editor-back').addEventListener('click', () => window.closePage('miss-beauty-editor-page'))
    page.querySelector('#miss-beauty-copy-classes').addEventListener('click', async () => {
      try {
        await copyMissBeautyClassText()
        window.toast('见面页面类名已复制')
      } catch {
        window.toast('复制失败')
      }
    })
    page.querySelector('#miss-beauty-show-preview').addEventListener('click', () => {
      openMissBeautyPreview(page.querySelector('#miss-beauty-css').value)
    })
    page.querySelector('#miss-beauty-save').addEventListener('click', async () => {
      const name = page.querySelector('#miss-beauty-name').value.trim()
      const css = page.querySelector('#miss-beauty-css').value
      if (!name) {
        window.toast('请输入模板名称')
        return
      }
      if (isEdit) {
        await updateMissBeautyPreset(preset.id, { name, css })
        window.toast('模板已更新')
      } else {
        await addMissBeautyPreset({ name, css })
        window.toast('模板已创建')
      }
      await renderMissBeautyPresetsList(listPage)
      await syncMissBeautyManagerContext(listPage)
      window.closePage('miss-beauty-editor-page')
    })
  }

  async function getMeetRecords(ownerUid, chatId, charId, mode) {
    const rows = await getOfflineMessages(ownerUid, chatId, charId, mode, { includeEnded: true })
    const ended = rows.filter(m => m.endedAt)
    const groups = new Map()
    ended.forEach(m => {
      const key = m.sessionId || `ended_${m.endedAt}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(m)
    })
    return [...groups.entries()].map(([sessionId, messages]) => {
      messages.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
      const first = messages[0]
      const last = messages[messages.length - 1]
      return {
        sessionId,
        messages,
        summarized: messages.some(m => m.meetSummaryStatus === 'summarized'),
        endedAt: Math.max(...messages.map(m => m.endedAt || 0)),
        title: last?.endedTitle || first?.endedTitle || '线下见面',
        firstText: first?.content || '',
        lastText: last?.content || '',
        count: messages.length
      }
    }).sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0))
  }

  function buildMeetRecordsHTML(records) {
    if (!records.length) return '<div class="cs-empty">暂无过往见面记录</div>'
    return records.map(record => `
      <button class="miss-record-row" data-session-id="${myEsc(record.sessionId)}" type="button">
        <div class="miss-record-main">
          <div class="miss-record-title">
            <span>${myEsc(formatMeetTime(record.endedAt))}</span>
            ${record.summarized ? '' : '<span class="miss-record-unsummarized">未总结</span>'}
          </div>
          <div class="miss-record-sub">${myEsc(record.count)} 条 · ${myEsc(summarizeMeetText(record.firstText))}</div>
          <div class="miss-record-preview">${myEsc(summarizeMeetText(record.lastText))}</div>
        </div>
        <i class="fa fa-angle-right"></i>
      </button>
    `).join('')
  }

  function bindMeetRecordRows(page, ownerUid, chat, mode) {
    page.querySelectorAll('.miss-record-row').forEach(row => {
      row.addEventListener('click', () => {
        openMeetRecordDetail(ownerUid, chat, mode, row.dataset.sessionId, page)
      })
    })
  }

  async function openMeetRecordDetail(ownerUid, chat, mode, sessionId, recordListPage) {
    const records = await getMeetRecords(ownerUid, chat.id, chat.charId, mode)
    const record = records.find(r => r.sessionId === sessionId)
    if (!record) {
      window.toast('记录不存在')
      return
    }
    const char = await window.getCharacter(chat.charId)
    const display = await getWechatDisplayFor(ownerUid, char)
    const sessionMaskId = record.messages.find(m => m.sessionMaskUserId)?.sessionMaskUserId
    const userDisplay = sessionMaskId ? await getUserDisplayFor(sessionMaskId) : await getMaskUserDisplayFor(ownerUid, chat.id, mode)
    const settings = await getOfflineSettings(ownerUid, chat.id, mode)
    const existing = document.getElementById('miss-you-record-page')
    if (existing) existing.remove()
    const page = document.createElement('div')
    page.id = 'miss-you-record-page'
    page.className = 'full-page miss-page'
    page.innerHTML = `
      <div class="page-header">
        <button class="header-back" id="miss-record-back"><i class="fa fa-angle-left"></i></button>
        <span class="header-title">${myEsc(formatMeetTime(record.endedAt))}</span>
        ${record.summarized ? '' : '<button class="btn-icon miss-record-summary-btn" id="miss-record-summary" type="button" title="总结此次见面" aria-label="总结此次见面"><i class="fa-solid fa-wand-magic-sparkles"></i></button>'}
      </div>
      <div class="miss-record-detail">
        ${record.messages.map((m, i) => buildOfflineMsgHTML(m, userDisplay, display, i, settings)).join('')}
      </div>
    `
    page.querySelector('#miss-record-back').addEventListener('click', () => window.closePage('miss-you-record-page'))
    page.querySelector('#miss-record-summary')?.addEventListener('click', async event => {
      const button = event.currentTarget
      const pendingKey = `record:${record.sessionId}`
      if (_missSummaryPending.has(pendingKey)) return
      _missSummaryPending.add(pendingKey)
      button.disabled = true
      try {
        const confirmed = await showMeetSummaryConfirm()
        if (!confirmed) return
        button.innerHTML = '<i class="fa fa-spinner fa-spin"></i>'
        const summaryMessages = buildMeetingSummaryMessages(record.messages, settings)
        const result = await window.WanWanMemory.summarizeMeeting(
          chat.id,
          chat.charId,
          ownerUid,
          record.sessionId,
          summaryMessages,
          record.endedAt
        )
        const summarizedAt = Date.now()
        await db.offlineChats.bulkPut(record.messages.map(message => ({
          ...message,
          meetSummaryStatus: 'summarized',
          meetSummarizedAt: summarizedAt
        })))
        button.remove()
        await refreshMeetRecordList(recordListPage, ownerUid, chat, mode)
        window.toast(`已生成 ${result.memoryCount} 条见面记忆`)
      } catch (error) {
        button.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i>'
        window.toast('总结失败：' + (error?.message || String(error)))
      } finally {
        _missSummaryPending.delete(pendingKey)
        if (document.body.contains(button)) button.disabled = false
      }
    })
    window.openPage(page)
  }

  async function refreshMeetRecordList(page, ownerUid, chat, mode) {
    if (!page || !document.body.contains(page)) return
    const list = page.querySelector('#miss-record-list')
    if (!list) return
    const records = await getMeetRecords(ownerUid, chat.id, chat.charId, mode)
    list.innerHTML = buildMeetRecordsHTML(records)
    bindMeetRecordRows(page, ownerUid, chat, mode)
  }

  function formatMeetTime(ts) {
    if (!ts) return '未知时间'
    const d = new Date(ts)
    const pad = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  function summarizeMeetText(text) {
    const clean = parseMissStatus(text).text.replace(/\s+/g, ' ').trim()
    if (!clean) return '无内容'
    return clean.length > 42 ? clean.slice(0, 42) + '...' : clean
  }

  async function buildRelatedNpcBlock(char) {
    const relations = (char.relations || []).filter(r => r.charId)
    if (!relations.length) return ''
    const lines = []
    for (const rel of relations) {
      const target = await window.getCharacter(rel.charId)
      if (!target) continue
      lines.push(`- ${getCharBaseName(target)}（${rel.type || '关系未设定'}）${rel.desc ? '：' + rel.desc : ''}`)
    }
    return lines.length ? `## 关联角色/NPC\n${lines.join('\n')}` : ''
  }

  function buildAntiRepeatBlock(offlineAll) {
    const recentAssistant = offlineAll
      .filter(m => m.role === 'assistant')
      .slice(-8)
    if (recentAssistant.length <= 2) return ''
    const summary = recentAssistant.map((m, i) => {
      const brief = String(m.content || '').replace(/\n+/g, ' ').slice(0, 80)
      return `${i + 1}. ${brief}...`
    }).join('\n')
    return `## 已出现过的内容（严禁重复）
以下是你之前回复的摘要，绝对不要重复类似的动作、台词或描写：
${summary}

请务必引入全新的动作、表情、话题或情感变化，让剧情向前推进。`
  }

  function buildOfflineTimeline(sharedTimeline, options = {}) {
    const result = (Array.isArray(sharedTimeline) ? sharedTimeline : [])
      .filter(msg => msg && msg.content)
      .map(msg => ({ role: msg.role, content: msg.content }))
    if (!result.length) {
      result.push({ role: 'user', content: '（你们线下见面了。）' })
    }
    if (options.isContinuation) {
      result.push({
        role: 'user',
        content: '（续写：请在不新增用户发言的前提下，承接你上一条角色回复继续推进当前线下剧情。不要复述或改写刚发生的动作、台词、情绪或场景，必须引入新的动作、反应、话题或情绪变化，并继续严格遵守系统提示中的状态栏格式、字数、人设和禁忌。）'
      })
    }
    return result
  }

  function cleanOfflineReply(raw) {
    return String(raw || '')
      .trim()
      .replace(/^```(?:text|markdown)?\s*/i, '')
      .replace(/```$/i, '')
      .trim()
  }
})()
