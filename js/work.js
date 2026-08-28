// work.js — 打工系统
// 依赖：db.js, main.js

(function() {
  var WORK_STATE_PREFIX = 'work_state_'
  var WALLET_DATA_PREFIX = 'wechat_wallet_'
  var HIRE_STATE_PREFIX = 'hire_state_'
  var CHAR_WORK_VALUES_PREFIX = 'char_work_values_'
  var PART_TIME_EXP_MIGRATION_PREFIX = 'part_time_exp_migrated_'

  var PT_DURATION = 60 * 60 * 1000       // 1h
  var WP_DURATION = 8 * 60 * 60 * 1000   // 8h

  var LEVELS = [
    { lv: 1, name: 'Junior',    minExp: 0,   maxExp: 50,  hireSlots: 0 },
    { lv: 2, name: 'Senior',    minExp: 50,  maxExp: 100, hireSlots: 2 },
    { lv: 3, name: 'Lead',      minExp: 100, maxExp: 150, hireSlots: 4 },
    { lv: 4, name: 'Principal', minExp: 150, maxExp: 200, hireSlots: 10 },
    { lv: 5, name: 'Director',  minExp: 200, maxExp: 300, hireSlots: Infinity }
  ]

  var LEVEL_COLORS = {
    1: { bg: '#f4f4f4', fg: '#606060' },
    2: { bg: '#eaeef2', fg: '#606e82' },
    3: { bg: '#f0ebe3', fg: '#9a8260' },
    4: { bg: '#e8e0d4', fg: '#7a6840' },
    5: { bg: '#1a1a1a', fg: '#c8b080' }
  }

  var EVAL_SYSTEM_PROMPT = 'You are a character value evaluation system. The user will provide a list of characters with their name and profile. Based on each profile, calculate and return exactly two values per character:\n\n' +
    '1. **Daily RMB** – Money earned in one 8-hour workday (unit: RMB ¥)\n' +
    '2. **Daily EXP** – A score representing the overall skill value of the character (range: 0–10)\n\n' +
    '**Calculation Rules:**\n\n' +
    'For Daily RMB:\n' +
    '- Base range: ¥50–¥10000 per day\n' +
    '- Anchor reference: real-world CNY purchasing power\n' +
    '- A common laborer earns ~¥50–¥100/day\n' +
    '- A skilled craftsman earns ~¥200–¥500/day\n' +
    '- A renowned expert or artist earns ~¥1000–¥3000/day\n' +
    '- A top-tier celebrity or irreplaceable talent earns ~¥5000–¥10000/day\n' +
    '- Apply a multiplier (0.5x–3x) based on fame, unique abilities, or special traits mentioned in the profile\n\n' +
    'For Daily EXP:\n' +
    '- Range: 0.0–10.0\n' +
    '- Represents the overall skill value and expertise level of the character\n' +
    '- 0–2: No notable skills, beginner or unskilled\n' +
    '- 2–4: Basic skills, entry-level competence\n' +
    '- 4–6: Moderate skill level, experienced practitioner\n' +
    '- 6–8: High skill level, seasoned expert\n' +
    '- 8–10: Exceptional, world-class or irreplaceable talent\n' +
    '- Score should reflect the depth, rarity, and mastery of skills described in the profile\n' +
    '- If a character has a "lore" field, use it as additional background context for evaluation\n\n' +
    '**Output Rules:**\n' +
    '- Output ONLY valid JSON, nothing else\n' +
    '- Do NOT wrap in markdown code blocks (no ```)\n' +
    '- No explanation, no prefix, no suffix, no extra text before or after the JSON\n' +
    '- Format: { "results": [{ "index": 1, "dailyRMB": number, "dailyEXP": number }, ...] }'

  var PART_TIME_JOBS = [
    { id: 'pt_store',    name: '便利店收银', icon: 'fa-store',      desc: '在便利店担任收银员', income: 20, exp: 1, duration: PT_DURATION },
    { id: 'pt_delivery', name: '外卖骑手',   icon: 'fa-motorcycle', desc: '骑车配送外卖订单',   income: 20, exp: 1, duration: PT_DURATION },
    { id: 'pt_cafe',     name: '咖啡店兼职', icon: 'fa-mug-hot',    desc: '在咖啡馆打工',       income: 20, exp: 1, duration: PT_DURATION },
    { id: 'pt_library',  name: '图书馆整理', icon: 'fa-book',       desc: '整理馆藏图书',       income: 20, exp: 1, duration: PT_DURATION }
  ]

  var WORKPLACE_JOBS = [
    { id: 'wp_normal', name: '普通职员', tier: 'normal', tierName: '普通', icon: 'fa-user-tie',    unlock: 2000,  income: 150,  exp: 1, duration: WP_DURATION },
    { id: 'wp_pro',    name: '专业顾问', tier: 'pro',    tierName: '专业', icon: 'fa-briefcase',   unlock: 10000, income: 300,  exp: 2, duration: WP_DURATION },
    { id: 'wp_elite',  name: '精英主管', tier: 'elite',  tierName: '精英', icon: 'fa-crown',       unlock: 50000, income: 1000, exp: 5, duration: WP_DURATION }
  ]

  // ===== 等级系统 =====
  function getLevel(exp) {
    exp = exp || 0
    for (var i = LEVELS.length - 1; i >= 0; i--) {
      if (exp >= LEVELS[i].minExp) return LEVELS[i]
    }
    return LEVELS[0]
  }

  function getLevelProgress(exp) {
    exp = exp || 0
    var level = getLevel(exp)
    if (level.lv === 5 && exp >= level.maxExp) return { level: level, pct: 100 }
    var range = level.maxExp - level.minExp
    var progress = exp - level.minExp
    return { level: level, pct: Math.min(100, Math.round(progress / range * 100)) }
  }

  // ===== 数据存储 =====
  async function getWorkState(uid) {
    var row = await db.config.get(WORK_STATE_PREFIX + uid)
    return row ? row.value : { jobId: null, startTime: null, exp: 0 }
  }

  async function saveWorkState(uid, state) {
    await db.config.put({ key: WORK_STATE_PREFIX + uid, value: state })
  }

  async function migratePartTimeExp(uid) {
    var migrationKey = PART_TIME_EXP_MIGRATION_PREFIX + uid
    if (await db.config.get(migrationKey)) return

    var partTimeNames = {}
    PART_TIME_JOBS.forEach(function(job) { partTimeNames[job.name + ' 工资'] = job.exp || 0 })
    var rows = await db.finance.where('charId').equals(uid).toArray()
    var missingExp = rows.reduce(function(total, row) {
      return total + (partTimeNames[row.desc] || 0)
    }, 0)

    if (missingExp > 0) {
      var state = await getWorkState(uid)
      state.exp = (state.exp || 0) + missingExp
      await saveWorkState(uid, state)
    }
    await db.config.put({ key: migrationKey, value: { migratedAt: Date.now(), restoredExp: missingExp } })
  }

  async function getWalletData(uid) {
    var row = await db.config.get(WALLET_DATA_PREFIX + uid)
    return row ? row.value : null
  }

  async function saveWalletData(uid, data) {
    await db.config.put({ key: WALLET_DATA_PREFIX + uid, value: data })
  }

  async function getHireState(uid) {
    var row = await db.config.get(HIRE_STATE_PREFIX + uid)
    return row ? row.value : { hires: [] }
  }

  async function saveHireState(uid, data) {
    await db.config.put({ key: HIRE_STATE_PREFIX + uid, value: data })
  }

  async function getCharWorkValues(uid) {
    var row = await db.config.get(CHAR_WORK_VALUES_PREFIX + uid)
    return row ? row.value : {}
  }

  async function saveCharWorkValues(uid, data) {
    await db.config.put({ key: CHAR_WORK_VALUES_PREFIX + uid, value: data })
  }

  // ===== 工具函数 =====
  function pad2(n) { return n < 10 ? '0' + n : '' + n }

  function formatTime(ms) {
    if (ms <= 0) return '00:00:00'
    var s = Math.floor(ms / 1000)
    var h = Math.floor(s / 3600)
    var m = Math.floor((s % 3600) / 60)
    return pad2(h) + ':' + pad2(m) + ':' + pad2(s % 60)
  }

  function formatAmount(n) {
    return Number(n || 0).toFixed(2)
  }

  function formatUnlock(n) {
    return n >= 10000 ? (n / 10000) + '万' : n.toString()
  }

  function getJob(jobId) {
    for (var i = 0; i < PART_TIME_JOBS.length; i++) if (PART_TIME_JOBS[i].id === jobId) return PART_TIME_JOBS[i]
    for (var i = 0; i < WORKPLACE_JOBS.length; i++) if (WORKPLACE_JOBS[i].id === jobId) return WORKPLACE_JOBS[i]
    return null
  }

  function isPartTimeJob(jobId) {
    return PART_TIME_JOBS.some(function(j) { return j.id === jobId })
  }

  function charAvatarHtml(obj) {
    if (obj && obj.avatar) {
      return '<img src="' + obj.avatar + '" alt="">'
    }
    var n = (obj && (obj.name || obj.charName)) || ''
    return '<span class="work-hire-avatar-text">' + (n.charAt(0) || '?') + '</span>'
  }

  // ===== Modal 工具 =====
  function createOverlay() {
    var el = document.createElement('div')
    el.className = 'sheet-overlay'
    el.style.zIndex = '200'
    return el
  }

  function createSheet(html) {
    var el = document.createElement('div')
    el.className = 'center-modal'
    el.style.zIndex = '201'
    el.innerHTML = html
    return el
  }

  function getCharLore(charId, books) {
    var parts = []
    for (var i = 0; i < books.length; i++) {
      var book = books[i]
      if (!book.enabled || book.scope !== 'personal') continue
      var ids = book.charIds || []
      if (ids.indexOf(charId) === -1) continue
      var entries = book.entries || []
      for (var j = 0; j < entries.length; j++) {
        if (entries[j].enabled) parts.push(entries[j].content)
      }
    }
    return parts.join('\n')
  }

  function extractJSON(text) {
    text = (text || '').trim()
    try { return JSON.parse(text) } catch (_) {}
    var stripped = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/, '')
    try { return JSON.parse(stripped) } catch (_) {}
    var m = text.match(/\{[\s\S]*\}/)
    if (m) {
      try { return JSON.parse(m[0]) } catch (_) {}
    }
    throw new Error('AI返回格式错误: 无法提取有效JSON')
  }

  // ===== API 评估 =====
  // characters: 需要评估的角色列表（调用方已过滤好）
  // 返回更新后的完整缓存
  async function evaluateCharacters(characters, uid) {
    var cache = await getCharWorkValues(uid)
    if (characters.length === 0) return cache

    var books = typeof loadLorebooks === 'function' ? await loadLorebooks() : []

    var batchSize = 15
    for (var b = 0; b < characters.length; b += batchSize) {
      var batch = characters.slice(b, b + batchSize)
      var charList = batch.map(function(c, idx) {
        var lore = getCharLore(c.id, books).substring(0, 300)
        var item = { index: idx + 1, name: c.name, role: c.role || '未知', description: (c.description || '').substring(0, 200) }
        if (lore) item.lore = lore
        return item
      })

      var userMsg = '请评估以下角色的工作能力：\n' + JSON.stringify(charList, null, 2)
      var result = await window.callAI(
        [{ role: 'user', content: userMsg }],
        { system: EVAL_SYSTEM_PROMPT, responseFormat: 'json_object', temperature: await window.getAITemperaturePreset('qianjiWorkEvaluation') }
      )

      var parsed
      try {
        parsed = JSON.parse(result)
      } catch (e) {
        throw new Error('AI返回格式错误')
      }

      var results = parsed.results || parsed
      if (!Array.isArray(results)) throw new Error('AI返回格式错误')

      for (var r = 0; r < results.length; r++) {
        var item = results[r]
        var idx = (item.index || (r + 1)) - 1
        if (idx >= 0 && idx < batch.length) {
          cache[batch[idx].id] = {
            dailyRMB: Math.max(50, Math.min(10000, Number(item.dailyRMB) || 50)),
            dailyEXP: Math.max(0, Math.min(10, Number(item.dailyEXP) || 1)),
            evaluatedAt: Date.now()
          }
        }
      }
    }

    await saveCharWorkValues(uid, cache)
    return cache
  }

  // ===== HTML 构建 =====
  function buildExpBar(exp) {
    var info = getLevelProgress(exp)
    var lv = info.level
    var color = LEVEL_COLORS[lv.lv]
    return '<div class="work-exp-wrap">' +
      '<div class="work-exp-labels">' +
        '<span class="work-exp-label-left" id="work-exp-level">' +
          '<span class="work-level-badge level-' + lv.lv + '">Lv.' + lv.lv + '</span> ' + lv.name +
        '</span>' +
        '<span class="work-exp-label-right" id="work-exp-val">' + (exp || 0) + ' / ' + lv.maxExp + ' EXP</span>' +
      '</div>' +
      '<div class="work-exp-track"><div class="work-exp-fill" id="work-exp-fill" style="width:' + info.pct + '%"></div></div>' +
    '</div>'
  }

  function buildStatusCard(state) {
    var job = getJob(state.jobId)
    if (!job) return ''
    var elapsed = Date.now() - state.startTime
    var done = elapsed >= job.duration
    var remaining = Math.max(0, job.duration - elapsed)
    var pct = Math.min(100, Math.round(elapsed / job.duration * 100))
    return '<div class="work-status-card">' +
      '<div class="work-status-row">' +
        '<span class="work-status-dot ' + (done ? 'is-done' : 'is-active') + '"></span>' +
        '<span class="work-status-name">' + job.name + '</span>' +
        '<span class="work-status-badge ' + (done ? 'badge-done' : 'badge-active') + '">' + (done ? '已完成' : '进行中') + '</span>' +
      '</div>' +
      '<div class="work-status-timer" id="work-status-timer">' +
        (done ? '已完成，请领取工资' : '剩余 ' + formatTime(remaining)) +
      '</div>' +
      '<div class="work-status-track"><div class="work-status-bar" id="work-status-bar" style="width:' + pct + '%"></div></div>' +
    '</div>'
  }

  function buildJobBtn(job, state) {
    var isActive  = state.jobId === job.id
    var elapsed   = isActive ? (Date.now() - state.startTime) : 0
    var isDone    = isActive && elapsed >= job.duration
    var isBusy    = state.jobId && state.jobId !== job.id
    var isWorker  = isActive && !isDone

    if (isDone)    return '<button class="work-btn work-btn-claim" data-action="claim" data-job-id="' + job.id + '">领取</button>'
    if (isWorker)  return '<button class="work-btn work-btn-working" disabled>进行中</button>'
    if (isBusy)    return '<button class="work-btn work-btn-busy" disabled>忙碌中</button>'
    return '<button class="work-btn work-btn-start" data-action="start" data-job-id="' + job.id + '">' +
      (isPartTimeJob(job.id) ? '打工' : '工作') + '</button>'
  }

  function buildParttimeTab(state) {
    var html = '<div class="work-tab-panel">'
    if (state.jobId && isPartTimeJob(state.jobId)) html += buildStatusCard(state)
    html += '<div class="work-section-label">可用职位</div><div class="work-job-list">'
    PART_TIME_JOBS.forEach(function(job) {
      var isActive = state.jobId === job.id
      html += '<div class="work-job-card' + (isActive ? ' is-active' : '') + '">' +
        '<div class="work-job-icon pt-icon"><i class="fa-solid ' + job.icon + '"></i></div>' +
        '<div class="work-job-info">' +
          '<div class="work-job-name">' + job.name + '</div>' +
          '<div class="work-job-meta">' +
            '<span class="meta-time"><i class="fa-regular fa-clock"></i> 1h</span>' +
            '<span class="meta-income"><i class="fa-solid fa-coins"></i> ¥' + job.income + '</span>' +
            '<span class="meta-exp"><i class="fa-solid fa-star"></i> ' + job.exp + ' EXP</span>' +
          '</div>' +
        '</div>' +
        '<div class="work-job-btn">' + buildJobBtn(job, state) + '</div>' +
      '</div>'
    })
    html += '</div></div>'
    return html
  }

  function buildWorkplaceTab(state, checkingBalance, totalAssets) {
    var checking = checkingBalance || 0
    var total = totalAssets || 0
    var html = '<div class="work-tab-panel">'
    html += '<div class="work-balance-group">' +
      '<div class="work-balance-row">' +
        '<span class="work-balance-icon"><i class="fa-solid fa-chart-pie"></i></span>' +
        '<span class="work-balance-item-label">总资产</span>' +
        '<span class="work-balance-item-val work-balance-total">¥' + formatAmount(total) + '</span>' +
      '</div>' +
      '<div class="work-balance-divider"></div>' +
      '<div class="work-balance-row">' +
        '<span class="work-balance-icon"><i class="fa-solid fa-building-columns"></i></span>' +
        '<span class="work-balance-item-label">Checking</span>' +
        '<span class="work-balance-item-val">¥' + formatAmount(checking) + '</span>' +
      '</div>' +
    '</div>'
    if (state.jobId && !isPartTimeJob(state.jobId)) html += buildStatusCard(state)
    html += '<div class="work-section-label">职位列表</div><div class="work-job-list">'
    WORKPLACE_JOBS.forEach(function(job) {
      var unlocked = total >= job.unlock
      var isActive = state.jobId === job.id
      html += '<div class="work-job-card wp-card-' + job.tier + (unlocked ? '' : ' is-locked') + (isActive ? ' is-active' : '') + '">' +
        '<div class="work-job-icon wp-icon-' + job.tier + '"><i class="fa-solid ' + job.icon + '"></i></div>' +
        '<div class="work-job-info">' +
          '<div class="work-job-name">' + job.name +
            '<span class="work-tier-tag tier-' + job.tier + '">' + job.tierName + '</span>' +
          '</div>' +
          '<div class="work-job-meta">' +
            '<span class="meta-time"><i class="fa-regular fa-clock"></i> 8h</span>' +
            '<span class="meta-income"><i class="fa-solid fa-coins"></i> ¥' + job.income + '</span>' +
            '<span class="meta-exp"><i class="fa-solid fa-star"></i> ' + job.exp + ' EXP</span>' +
          '</div>' +
          (!unlocked ? '<div class="work-unlock-hint">需总资产 ≥ ¥' + formatUnlock(job.unlock) + '</div>' : '') +
        '</div>' +
        '<div class="work-job-btn">' +
          (unlocked ? buildJobBtn(job, state) : '<span class="work-lock-icon"><i class="fa-solid fa-lock"></i></span>') +
        '</div>' +
      '</div>'
    })
    html += '</div></div>'
    return html
  }

  function buildHireCard(hire) {
    var elapsed = Date.now() - hire.startTime
    var done = elapsed >= WP_DURATION
    var remaining = Math.max(0, WP_DURATION - elapsed)
    var pct = Math.min(100, Math.round(elapsed / WP_DURATION * 100))

    return '<div class="work-hire-card" data-hire-char-id="' + hire.charId + '">' +
      '<div class="work-hire-avatar">' + charAvatarHtml(hire) + '</div>' +
      '<div class="work-hire-info">' +
        '<div class="work-hire-name">' + hire.charName + '</div>' +
        '<div class="work-hire-meta">' +
          '<span class="meta-income"><i class="fa-solid fa-coins"></i> ¥' + formatAmount(hire.dailyRMB) + '</span>' +
          '<span class="meta-exp"><i class="fa-solid fa-star"></i> ' + hire.dailyEXP.toFixed(1) + ' EXP</span>' +
        '</div>' +
        '<div class="work-hire-progress">' +
          '<div class="work-hire-timer" data-hire-timer="' + hire.charId + '">' +
            (done ? '已完成' : '剩余 ' + formatTime(remaining)) +
          '</div>' +
          '<div class="work-status-track"><div class="work-status-bar" data-hire-bar="' + hire.charId + '" style="width:' + pct + '%"></div></div>' +
        '</div>' +
      '</div>' +
      '<div class="work-hire-action-btn">' +
        (done
          ? '<button class="work-btn work-btn-claim" data-action="claim-hire" data-char-id="' + hire.charId + '">领取</button>'
          : '<span class="work-status-badge badge-active">进行中</span>') +
      '</div>' +
    '</div>'
  }

  function buildAdvancedTab(state, hireState) {
    var info = getLevelProgress(state.exp)
    var lv = info.level

    if (lv.lv < 2) {
      return '<div class="work-tab-panel work-locked-panel">' +
        '<div class="work-locked-icon"><i class="fa-solid fa-lock"></i></div>' +
        '<div class="work-locked-title">高级模块</div>' +
        '<div class="work-locked-hint">达到 Lv.2 Senior 解锁</div>' +
        '<div class="work-locked-progress">' +
          '<div class="work-locked-progress-label">当前 Lv.' + lv.lv + ' ' + lv.name + ' — ' + (state.exp || 0) + '/' + lv.maxExp + ' EXP</div>' +
          '<div class="work-exp-track" style="margin-top:8px"><div class="work-exp-fill" style="width:' + info.pct + '%"></div></div>' +
        '</div>' +
      '</div>'
    }

    var hires = (hireState && hireState.hires) || []
    var maxSlots = lv.hireSlots === Infinity ? '∞' : lv.hireSlots
    var html = '<div class="work-tab-panel">'

    html += '<div class="work-boss-header">' +
      '<div class="work-boss-title">' +
        '<span class="work-level-badge level-' + lv.lv + '">Lv.' + lv.lv + '</span> ' + lv.name +
      '</div>' +
      '<div class="work-boss-slots">' +
        '<i class="fa-solid fa-users"></i> 员工 ' + hires.length + '/' + maxSlots +
      '</div>' +
    '</div>'

    if (hires.length > 0) {
      html += '<div class="work-section-label">在职员工</div><div class="work-hire-list">'
      for (var i = 0; i < hires.length; i++) {
        html += buildHireCard(hires[i])
      }
      html += '</div>'
    } else {
      html += '<div class="work-hire-empty">' +
        '<div class="work-hire-empty-icon"><i class="fa-solid fa-user-plus"></i></div>' +
        '<div class="work-hire-empty-text">点击下方按钮招聘角色为你打工</div>' +
      '</div>'
    }

    var canHire = lv.hireSlots === Infinity || hires.length < lv.hireSlots
    if (canHire) {
      html += '<div class="work-hire-action">' +
        '<button class="work-btn work-btn-hire" id="btn-hire-new">' +
          '<i class="fa-solid fa-user-plus"></i> 招聘员工' +
        '</button>' +
      '</div>'
    }

    html += '</div>'
    return html
  }

  function buildTabContent(tab, state, checkingBalance, totalAssets, hireState) {
    if (tab === 'parttime')  return buildParttimeTab(state)
    if (tab === 'workplace') return buildWorkplaceTab(state, checkingBalance, totalAssets)
    return buildAdvancedTab(state, hireState)
  }

  // ===== 主入口 =====
  window.showWorkPage = async function(user) {
    var uid = user.id
    await migratePartTimeExp(uid)
    var state = await getWorkState(uid)
    var walletData = await getWalletData(uid)
    var checkingBalance = walletData ? (walletData.checkingBalance || 0) : 0
    var totalAssets = walletData ? ((walletData.checkingBalance || 0) + (walletData.savingBalance || 0)) : 0
    var hireState = await getHireState(uid)

    var page = document.createElement('div')
    page.id = 'work-page'
    page.className = 'full-page work-page'

    var levelInfo = getLevelProgress(state.exp)
    var advTabClass = levelInfo.level.lv >= 2 ? '' : ' work-tab-dim'

    page.innerHTML =
      '<div class="page-header">' +
        '<button class="header-back" id="work-back"><i class="fa fa-angle-left"></i></button>' +
        '<span class="header-title">打工系统</span>' +
      '</div>' +
      buildExpBar(state.exp) +
      '<div class="work-tabs">' +
        '<button class="work-tab is-active" data-tab="parttime">兼职</button>' +
        '<button class="work-tab" data-tab="workplace">职场</button>' +
        '<button class="work-tab' + advTabClass + '" data-tab="advanced">高级</button>' +
      '</div>' +
      '<div class="work-body" id="work-body">' +
        buildTabContent('parttime', state, checkingBalance, totalAssets, hireState) +
      '</div>'

    window.openPage(page)

    // ===== 控制器 =====
    var currentTab = 'parttime'
    var timerInterval = null
    var hireTimerInterval = null

    function stopTimer() { if (timerInterval) { clearInterval(timerInterval); timerInterval = null } }
    function stopHireTimer() { if (hireTimerInterval) { clearInterval(hireTimerInterval); hireTimerInterval = null } }

    function startTimer() {
      stopTimer()
      if (!state.jobId) return
      var job = getJob(state.jobId)
      if (!job) return

      timerInterval = setInterval(function() {
        var elapsed  = Date.now() - state.startTime
        var done     = elapsed >= job.duration
        var remaining = Math.max(0, job.duration - elapsed)
        var pct      = Math.min(100, Math.round(elapsed / job.duration * 100))

        var timerEl = page.querySelector('#work-status-timer')
        var barEl   = page.querySelector('#work-status-bar')
        if (timerEl) timerEl.textContent = done ? '已完成，请领取工资' : '剩余 ' + formatTime(remaining)
        if (barEl)   barEl.style.width = pct + '%'

        if (done) {
          stopTimer()
          refreshBody()
        }
      }, 1000)
    }

    function startHireTimer() {
      stopHireTimer()
      if (!hireState || !hireState.hires || hireState.hires.length === 0) return
      if (currentTab !== 'advanced') return

      hireTimerInterval = setInterval(function() {
        var anyDone = false
        for (var i = 0; i < hireState.hires.length; i++) {
          var hire = hireState.hires[i]
          var elapsed = Date.now() - hire.startTime
          var done = elapsed >= WP_DURATION
          var remaining = Math.max(0, WP_DURATION - elapsed)
          var pct = Math.min(100, Math.round(elapsed / WP_DURATION * 100))

          var timerEl = page.querySelector('[data-hire-timer="' + hire.charId + '"]')
          var barEl = page.querySelector('[data-hire-bar="' + hire.charId + '"]')
          if (timerEl) timerEl.textContent = done ? '已完成' : '剩余 ' + formatTime(remaining)
          if (barEl) barEl.style.width = pct + '%'

          if (done) anyDone = true
        }
        if (anyDone) {
          stopHireTimer()
          refreshBody()
        }
      }, 1000)
    }

    async function refreshBody() {
      state = await getWorkState(uid)
      hireState = await getHireState(uid)
      var wd = await getWalletData(uid)
      checkingBalance = wd ? (wd.checkingBalance || 0) : 0
      totalAssets = wd ? ((wd.checkingBalance || 0) + (wd.savingBalance || 0)) : 0
      page.querySelector('#work-body').innerHTML = buildTabContent(currentTab, state, checkingBalance, totalAssets, hireState)
      bindActions()
      startTimer()
      startHireTimer()
    }

    function updateExpBar(exp) {
      var info = getLevelProgress(exp)
      var lv = info.level
      var fill = page.querySelector('#work-exp-fill')
      var val  = page.querySelector('#work-exp-val')
      var lvEl = page.querySelector('#work-exp-level')
      if (fill) fill.style.width = info.pct + '%'
      if (val)  val.textContent = (exp || 0) + ' / ' + lv.maxExp + ' EXP'
      if (lvEl) lvEl.innerHTML = '<span class="work-level-badge level-' + lv.lv + '">Lv.' + lv.lv + '</span> ' + lv.name

      // Update advanced tab dim state
      var advTab = page.querySelector('[data-tab="advanced"]')
      if (advTab) {
        if (lv.lv >= 2) advTab.classList.remove('work-tab-dim')
        else advTab.classList.add('work-tab-dim')
      }
    }

    // ===== 招聘 Modal =====
    async function showHireModal() {
      var allChars = await db.characters.toArray()
      var hireable = allChars.filter(function(c) {
        return c.type === 'char' || c.type === 'npc'
      })

      // 排除在职员工
      var hiredIds = {}
      if (hireState && hireState.hires) {
        for (var i = 0; i < hireState.hires.length; i++) {
          hiredIds[hireState.hires[i].charId] = true
        }
      }
      hireable = hireable.filter(function(c) { return !hiredIds[c.id] })

      if (hireable.length === 0) {
        window.toast('没有可招聘的角色')
        return
      }

      var cache = await getCharWorkValues(uid)

      var overlay = createOverlay()
      var sheet = createSheet(
        '<div class="sheet-title">招聘员工</div>' +
        '<div class="work-hire-modal-actions">' +
          '<button class="work-btn work-btn-start work-btn-sm" id="btn-generate-info">' +
            '<i class="fa-solid fa-wand-magic-sparkles"></i> 生成员工信息' +
          '</button>' +
          '<button class="work-btn work-btn-ghost work-btn-sm" id="btn-reset-info">' +
            '<i class="fa-solid fa-rotate"></i> 重置员工信息' +
          '</button>' +
        '</div>' +
        '<div class="work-hire-modal-body">' +
          '<div class="work-hire-modal-list" id="hire-list"></div>' +
        '</div>'
      )

      document.getElementById('app').appendChild(overlay)
      document.getElementById('app').appendChild(sheet)
      requestAnimationFrame(function() { overlay.classList.add('show'); sheet.classList.add('show') })

      var closeModal = function() {
        overlay.classList.remove('show'); sheet.classList.remove('show')
        setTimeout(function() { overlay.remove(); sheet.remove() }, 200)
      }
      overlay.addEventListener('click', closeModal)

      // 渲染列表
      function renderList() {
        var listHtml = ''
        for (var i = 0; i < hireable.length; i++) {
          var c = hireable[i]
          var vals = cache[c.id]
          var hasVals = !!vals
          listHtml += '<div class="work-hire-modal-row">' +
            '<div class="work-hire-avatar">' + charAvatarHtml(c) + '</div>' +
            '<div class="work-hire-modal-info">' +
              '<div class="work-hire-name">' + c.name + (c.role ? '<span class="work-hire-role">' + c.role + '</span>' : '') + '</div>' +
              (hasVals
                ? '<div class="work-hire-meta">' +
                    '<span class="meta-income"><i class="fa-solid fa-coins"></i> ¥' + formatAmount(vals.dailyRMB) + '/天</span>' +
                    '<span class="meta-exp"><i class="fa-solid fa-star"></i> ' + vals.dailyEXP.toFixed(1) + ' EXP</span>' +
                  '</div>'
                : '<div class="work-hire-uneval">未评估</div>') +
            '</div>' +
            (hasVals
              ? '<button class="work-btn work-btn-start work-btn-sm" data-action="hire" data-char-id="' + c.id + '" data-char-name="' + c.name + '">招聘</button>'
              : '<button class="work-btn work-btn-sm" disabled style="background:#f2f2f2;color:#b0b0b0">招聘</button>') +
          '</div>'
        }
        sheet.querySelector('#hire-list').innerHTML = listHtml
        bindHireButtons()
      }

      // 绑定招聘按钮
      function bindHireButtons() {
        sheet.querySelectorAll('[data-action="hire"]').forEach(function(btn) {
          btn.addEventListener('click', async function() {
            var charId = parseInt(btn.dataset.charId)
            var charName = btn.dataset.charName
            var vals = cache[charId]
            if (!vals) return

            var char = hireable.find(function(c) { return c.id === charId })
            var freshHireState = await getHireState(uid)
            var lvNow = getLevel(state.exp)
            var maxSlots = lvNow.hireSlots
            if (maxSlots !== Infinity && freshHireState.hires.length >= maxSlots) {
              window.toast('员工已满')
              return
            }

            freshHireState.hires.push({
              charId: charId,
              charName: charName,
              avatar: (char && char.avatar) || null,
              startTime: Date.now(),
              dailyRMB: vals.dailyRMB,
              dailyEXP: vals.dailyEXP
            })
            await saveHireState(uid, freshHireState)
            hireState = freshHireState

            closeModal()
            await refreshBody()
            window.toast(charName + ' 已入职，8小时后可领取工资')
          })
        })
      }

      // [生成员工信息] 按钮
      sheet.querySelector('#btn-generate-info').addEventListener('click', async function() {
        var btn = sheet.querySelector('#btn-generate-info')
        // 筛选未缓存的角色
        var needEval = hireable.filter(function(c) { return !cache[c.id] })
        if (needEval.length === 0) {
          window.toast('所有角色已评估')
          return
        }
        btn.disabled = true
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 生成中...'
        try {
          cache = await evaluateCharacters(needEval, uid)
          renderList()
        } catch (e) {
          window.toast(e.message || '生成失败')
        }
        btn.disabled = false
        btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> 生成员工信息'
      })

      // [重置员工信息] 按钮
      sheet.querySelector('#btn-reset-info').addEventListener('click', async function() {
        // 保留在职员工的缓存
        var freshHireState = await getHireState(uid)
        var keepIds = {}
        if (freshHireState && freshHireState.hires) {
          for (var i = 0; i < freshHireState.hires.length; i++) {
            keepIds[freshHireState.hires[i].charId] = true
          }
        }
        var newCache = {}
        var keys = Object.keys(cache)
        for (var k = 0; k < keys.length; k++) {
          if (keepIds[keys[k]]) newCache[keys[k]] = cache[keys[k]]
        }
        cache = newCache
        await saveCharWorkValues(uid, cache)
        renderList()
        window.toast('员工信息已重置')
      })

      // 初始渲染
      renderList()
    }

    function bindActions() {
      // Start job
      page.querySelectorAll('[data-action="start"]').forEach(function(btn) {
        btn.addEventListener('click', async function() {
          var jobId = btn.dataset.jobId
          var freshState = await getWorkState(uid)
          if (freshState.jobId) { window.toast('当前已有任务进行中'); return }

          var job = getJob(jobId)
          if (!job) return

          state = { jobId: jobId, startTime: Date.now(), exp: freshState.exp || 0 }
          await saveWorkState(uid, state)

          var wd = await getWalletData(uid)
          checkingBalance = wd ? (wd.checkingBalance || 0) : 0
          totalAssets = wd ? ((wd.checkingBalance || 0) + (wd.savingBalance || 0)) : 0
          page.querySelector('#work-body').innerHTML = buildTabContent(currentTab, state, checkingBalance, totalAssets, hireState)
          bindActions()
          startTimer()

          window.toast((isPartTimeJob(jobId) ? '开始打工：' : '开始工作：') + job.name)
        })
      })

      // Claim personal job
      page.querySelectorAll('[data-action="claim"]').forEach(function(btn) {
        btn.addEventListener('click', async function() {
          var jobId = btn.dataset.jobId
          var freshState = await getWorkState(uid)
          if (freshState.jobId !== jobId) { window.toast('无法领取'); return }

          var job = getJob(jobId)
          if (!job) return
          if (Date.now() - freshState.startTime < job.duration) { window.toast('工作尚未完成'); return }

          var wd = await getWalletData(uid)
          if (!wd) {
            window.toast('请先在微信钱包中生成余额后再领取')
            return
          }
          wd.checkingBalance = (wd.checkingBalance || 0) + job.income
          await saveWalletData(uid, wd)

          await db.finance.add({
            charId: uid,
            amount: job.income,
            desc: job.name + ' 工资',
            type: 'income',
            source: 'checking',
            createdAt: Date.now()
          })

          var newExp = (freshState.exp || 0) + (job.exp || 0)
          state = { jobId: null, startTime: null, exp: newExp }
          await saveWorkState(uid, state)

          stopTimer()
          updateExpBar(newExp)

          checkingBalance = wd.checkingBalance
          totalAssets = (wd.checkingBalance || 0) + (wd.savingBalance || 0)
          page.querySelector('#work-body').innerHTML = buildTabContent(currentTab, state, checkingBalance, totalAssets, hireState)
          bindActions()

          window.toast('¥' + job.income.toFixed(2) + ' + ' + (job.exp || 0) + ' EXP 已领取！')
        })
      })

      // Claim hire
      page.querySelectorAll('[data-action="claim-hire"]').forEach(function(btn) {
        btn.addEventListener('click', async function() {
          var charId = parseInt(btn.dataset.charId)
          var freshHireState = await getHireState(uid)
          var hireIdx = -1
          for (var i = 0; i < freshHireState.hires.length; i++) {
            if (freshHireState.hires[i].charId === charId) { hireIdx = i; break }
          }
          if (hireIdx < 0) { window.toast('无法领取'); return }

          var hire = freshHireState.hires[hireIdx]
          if (Date.now() - hire.startTime < WP_DURATION) { window.toast('工作尚未完成'); return }

          var wd = await getWalletData(uid)
          if (!wd) {
            window.toast('请先在微信钱包中生成余额后再领取')
            return
          }
          wd.checkingBalance = (wd.checkingBalance || 0) + hire.dailyRMB
          await saveWalletData(uid, wd)

          await db.finance.add({
            charId: uid,
            amount: hire.dailyRMB,
            desc: (hire.charName || '雇员') + ' 工资',
            type: 'income',
            source: 'checking',
            createdAt: Date.now()
          })

          var freshState = await getWorkState(uid)
          var newExp = (freshState.exp || 0) + hire.dailyEXP
          state = { jobId: freshState.jobId, startTime: freshState.startTime, exp: newExp }
          await saveWorkState(uid, state)

          freshHireState.hires.splice(hireIdx, 1)
          await saveHireState(uid, freshHireState)
          hireState = freshHireState

          stopHireTimer()
          updateExpBar(newExp)

          checkingBalance = wd.checkingBalance
          totalAssets = (wd.checkingBalance || 0) + (wd.savingBalance || 0)
          page.querySelector('#work-body').innerHTML = buildTabContent(currentTab, state, checkingBalance, totalAssets, hireState)
          bindActions()
          startHireTimer()

          window.toast('¥' + hire.dailyRMB.toFixed(2) + ' + ' + hire.dailyEXP.toFixed(1) + ' EXP 已领取！')
        })
      })

      // Hire button
      var hireBtn = page.querySelector('#btn-hire-new')
      if (hireBtn) {
        hireBtn.addEventListener('click', function() {
          showHireModal()
        })
      }
    }

    // Tab switching
    page.querySelectorAll('.work-tab').forEach(function(tab) {
      tab.addEventListener('click', async function() {
        var t = tab.dataset.tab
        if (t === currentTab) return
        currentTab = t
        page.querySelectorAll('.work-tab').forEach(function(x) { x.classList.remove('is-active') })
        tab.classList.add('is-active')
        await refreshBody()
      })
    })

    // Back
    page.querySelector('#work-back').addEventListener('click', function() {
      stopTimer()
      stopHireTimer()
      window.closePage('work-page')
    })

    bindActions()
    startTimer()
    startHireTimer()
  }
})()
