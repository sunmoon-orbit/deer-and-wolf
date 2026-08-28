// x-page.js — 仿 X (Twitter) 页面

var X_SESSION_UID_KEY = 'wanwan_x_uid'
var X_PROFILE_PREFIX = 'wanwan_x_profile_'
var X_POSTS_PREFIX = 'wanwan_x_posts_'

window.showXPage = async function() {
  var user = await getXSessionUser()
  if (!user) {
    showXLoginPage()
    return
  }
  renderXPage(user)
}

function renderXPage(user) {
  var existing = document.getElementById('x-page')
  if (existing) existing.remove()

  var page = document.createElement('div')
  page.id = 'x-page'
  page.className = 'full-page'
  page.dataset.xUid = user.id

  page.innerHTML =
    '<div class="x-topbar">' +
      '<div class="x-topbar-main">' +
        '<div class="x-topbar-avatar">' + getXAvatarHTML(user) + '</div>' +
        '<div class="x-topbar-logo">' +
          '<svg viewBox="0 0 24 24"><g><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></g></svg>' +
        '</div>' +
        '<button class="x-topbar-right" type="button" aria-label="个人主页"><i class="fa-solid fa-circle-user"></i></button>' +
      '</div>' +
      '<div class="x-tabs">' +
        '<div class="x-tab active">' +
          '为你推荐' +
          '<span class="x-tab-arrow"><svg viewBox="0 0 24 24"><g><path d="M3.543 8.96l1.414-1.42L12 14.59l7.043-7.05 1.414 1.42L12 17.41 3.543 8.96z"></path></g></svg></span>' +
        '</div>' +
        '<div class="x-tab">正在跟隨</div>' +
      '</div>' +
    '</div>' +

    '<div class="x-feed" data-x-view="home">' +
      buildXOwnPostsHTML(user) +
      buildXPost({
        avatar: 'img/wanwan.png',
        name: '弯弯协会',
        verified: true,
        handle: '@Wanwan_Offical',
        time: '2小时',
        content: '产品上线请多多关注。#AI #Wanwan',
        comments: 847,
        retweets: 203,
        likes: 3654,
        views: '28.6万',
        bookmarks: 0,
        shares: 0
      }) +
    '</div>' +

      '<button class="x-fab" onclick="showXCompose()">' +
      '<i class="fi fi-rr-plus"></i>' +
    '</button>' +

    '<div class="x-bottombar">' +
      buildXBottomBar() +
    '</div>'

  if (window.openPage) {
    window.openPage(page)
  } else {
    var app = document.getElementById('app') || document.body
    app.appendChild(page)
  }

  var avatar = page.querySelector('.x-topbar-avatar')
  if (avatar) {
    avatar.setAttribute('role', 'button')
    avatar.setAttribute('aria-label', '退出 X')
    avatar.addEventListener('click', closeXPage)
  }

  var accountBtn = page.querySelector('.x-topbar-right')
  if (accountBtn) {
    accountBtn.addEventListener('click', function(e) {
      e.preventDefault()
      e.stopPropagation()
      showXProfilePage(user)
    })
  }

  // 返回手势 — 从左边缘右滑关闭
  var startX = 0
  var startY = 0
  var tracking = false
  page.addEventListener('touchstart', function(e) {
    var t = e.touches[0]
    if (t.clientX < 25) {
      startX = t.clientX
      startY = t.clientY
      tracking = true
    }
  }, { passive: true })
  page.addEventListener('touchend', function(e) {
    if (!tracking) return
    tracking = false
    var t = e.changedTouches[0]
    var dx = t.clientX - startX
    var dy = Math.abs(t.clientY - startY)
    if (dx > 80 && dy < 100) {
      closeXPage()
    }
  }, { passive: true })

  // 底栏点击
  var items = page.querySelectorAll('.x-bottombar-item')
  items.forEach(function(item) {
    item.addEventListener('click', function() {
      items.forEach(function(i) { i.classList.remove('active') })
      item.classList.add('active')
      renderXTab(page, item.dataset.tab, user)
    })
  })

  var likeButtons = page.querySelectorAll('.x-post-action.like')
  likeButtons.forEach(function(button) {
    button.addEventListener('click', function(e) {
      e.preventDefault()
      e.stopPropagation()
      var liked = button.dataset.liked === '1'
      var baseCount = Number(button.dataset.baseCount || button.dataset.count || 0)
      var count = Math.max(baseCount, Number(button.dataset.count || baseCount) + (liked ? -1 : 1))
      button.dataset.count = String(count)
      button.dataset.liked = liked ? '0' : '1'
      button.classList.toggle('liked', !liked)
      button.innerHTML = getXHeartSvg(!liked) + '<span>' + formatXNumber(count) + '</span>'
    })
  })
}

async function showXProfilePage(user) {
  var existing = document.getElementById('x-profile-page')
  if (existing) existing.remove()
  var profile = await getXProfile(user)

  var page = document.createElement('div')
  page.id = 'x-profile-page'
  page.className = 'full-page x-profile-page'

  var name = getXProfileName(user, profile)
  var handle = getXProfileHandle(user, profile)
  var following = normalizeXCount(profile.following)
  var followers = normalizeXCount(profile.followers)
  page.innerHTML =
    '<div class="x-profile-cover"' + (profile.backgroundImage ? ' style="background-image:url(' + xEscape(profile.backgroundImage) + ')"' : '') + '>' +
      '<button class="x-profile-circle-btn x-profile-back" type="button" aria-label="返回"><i class="fa-solid fa-arrow-left"></i></button>' +
      '<button class="x-profile-circle-btn x-profile-switch" type="button" aria-label="切换账号"><i class="fa-solid fa-right-left"></i></button>' +
      '<button class="x-profile-circle-btn x-profile-edit" type="button" aria-label="编辑个人资料"><i class="fa-solid fa-pen"></i></button>' +
    '</div>' +
    '<div class="x-profile-main">' +
      '<div class="x-profile-avatar">' + getXProfileAvatarHTML(user, profile) + '</div>' +
      '<div class="x-profile-name">' + xEscape(name) + '</div>' +
      '<div class="x-profile-handle">' + xEscape(handle) + '</div>' +
      '<div class="x-profile-joined">' +
        '<i class="fa-regular fa-calendar"></i>' +
        '<span>' + xEscape(getXJoinText(user, profile)) + '</span>' +
        '<i class="fa-solid fa-angle-right"></i>' +
      '</div>' +
      '<div class="x-profile-stats">' +
        '<span><strong>' + xEscape(following) + '</strong> 跟隨中</span>' +
        '<span><strong>' + xEscape(followers) + '</strong> 跟隨者</span>' +
      '</div>' +
    '</div>'

  if (window.openPage) {
    window.openPage(page)
  } else {
    var app = document.getElementById('app') || document.body
    app.appendChild(page)
  }

  page.querySelector('.x-profile-back').addEventListener('click', function(e) {
    e.preventDefault()
    e.stopPropagation()
    closeXProfilePage()
  })

  page.querySelector('.x-profile-edit').addEventListener('click', function(e) {
    e.preventDefault()
    e.stopPropagation()
    showXProfileEditPage(user)
  })

  page.querySelector('.x-profile-switch').addEventListener('click', function(e) {
    e.preventDefault()
    e.stopPropagation()
    showXLoginPage({ replaceExisting: true, returnToProfile: true })
  })
}

async function showXProfileEditPage(user) {
  var existing = document.getElementById('x-profile-edit-page')
  if (existing) existing.remove()
  var profile = await getXProfile(user)

  var page = document.createElement('div')
  page.id = 'x-profile-edit-page'
  page.className = 'full-page x-profile-edit-page'
  page.innerHTML =
    '<div class="x-profile-edit-header">' +
      '<button class="x-profile-edit-back" type="button" aria-label="返回"><i class="fa-solid fa-chevron-left"></i></button>' +
      '<div class="x-profile-edit-title">编辑个人资料</div>' +
      '<button class="x-profile-edit-save" type="button">保存</button>' +
    '</div>' +
    '<div class="x-profile-edit-scroll">' +
      '<button class="x-profile-edit-cover" id="x-edit-cover" type="button"' + (profile.backgroundImage ? ' style="background-image:url(' + xEscape(profile.backgroundImage) + ')"' : '') + '>' +
        '<span><i class="fa-solid fa-image"></i> 背景图</span>' +
      '</button>' +
      '<button class="x-profile-edit-avatar" id="x-edit-avatar" type="button">' + getXProfileAvatarHTML(user, profile) + '</button>' +
      '<input type="hidden" id="x-edit-cover-value" value="' + xEscape(profile.backgroundImage || '') + '">' +
      '<input type="hidden" id="x-edit-avatar-value" value="' + xEscape(profile.avatar || '') + '">' +
      '<label class="x-profile-edit-field">昵称<input id="x-edit-name" class="input-field" value="' + xEscape(profile.name || getXUserName(user)) + '" placeholder="昵称"></label>' +
      '<label class="x-profile-edit-field">用户名<input id="x-edit-handle" class="input-field" value="' + xEscape(stripXAt(profile.handle || getXUserHandle(user))) + '" placeholder="用户名"></label>' +
      '<div class="x-profile-edit-grid">' +
        '<label class="x-profile-edit-field">加入年份<input id="x-edit-join-year" class="input-field" inputmode="numeric" maxlength="4" value="' + xEscape(profile.joinYear) + '"></label>' +
        '<label class="x-profile-edit-field">加入月份<input id="x-edit-join-month" class="input-field" inputmode="numeric" maxlength="2" value="' + xEscape(profile.joinMonth) + '"></label>' +
      '</div>' +
      '<div class="x-profile-edit-grid">' +
        '<label class="x-profile-edit-field">追随中<input id="x-edit-following" class="input-field" inputmode="numeric" value="' + xEscape(normalizeXCount(profile.following)) + '"></label>' +
        '<label class="x-profile-edit-field">跟随者<input id="x-edit-followers" class="input-field" inputmode="numeric" value="' + xEscape(normalizeXCount(profile.followers)) + '"></label>' +
      '</div>' +
    '</div>'

  if (window.openPage) {
    window.openPage(page)
  } else {
    var app = document.getElementById('app') || document.body
    app.appendChild(page)
  }

  page.querySelector('.x-profile-edit-back').addEventListener('click', function() {
    closeXProfileEditPage()
  })
  page.querySelector('#x-edit-cover').addEventListener('click', function() {
    pickXImage(function(imageUrl) {
      page.querySelector('#x-edit-cover-value').value = imageUrl || ''
      page.querySelector('#x-edit-cover').style.backgroundImage = imageUrl ? 'url(' + imageUrl + ')' : ''
    })
  })
  page.querySelector('#x-edit-avatar').addEventListener('click', function() {
    pickXImage(function(imageUrl) {
      page.querySelector('#x-edit-avatar-value').value = imageUrl || ''
      page.querySelector('#x-edit-avatar').innerHTML = imageUrl ? '<img src="' + xEscape(imageUrl) + '" alt="">' : getXAvatarHTML(user)
    })
  })
  page.querySelector('.x-profile-edit-save').addEventListener('click', async function() {
    var next = {
      backgroundImage: page.querySelector('#x-edit-cover-value').value.trim(),
      avatar: page.querySelector('#x-edit-avatar-value').value.trim(),
      name: page.querySelector('#x-edit-name').value.trim() || getXUserName(user),
      handle: stripXAt(page.querySelector('#x-edit-handle').value.trim()) || stripXAt(getXUserHandle(user)),
      joinYear: normalizeXJoinYear(page.querySelector('#x-edit-join-year').value, user),
      joinMonth: normalizeXJoinMonth(page.querySelector('#x-edit-join-month').value, user),
      following: normalizeXCount(page.querySelector('#x-edit-following').value),
      followers: normalizeXCount(page.querySelector('#x-edit-followers').value)
    }
    await saveXProfile(user, next)
    closeXProfileEditPage(true)
    var profilePage = document.getElementById('x-profile-page')
    if (profilePage) profilePage.remove()
    showXProfilePage(user)
  })
}

window.showXCompose = function() {
  var existing = document.getElementById('x-compose')
  if (existing) existing.remove()

  getXSessionUser().then(function(user) {
    renderXCompose(user)
  })
}

function renderXCompose(user) {
  var page = document.createElement('div')
  page.id = 'x-compose'
  page.className = 'full-page x-compose-page'

  page.innerHTML =
    '<div class="x-compose-header">' +
      '<button class="x-compose-cancel">取消</button>' +
      '<button class="x-compose-publish">发布</button>' +
    '</div>' +
    '<div class="x-compose-body">' +
      '<div class="x-compose-avatar">' + getXAvatarHTML(user) + '</div>' +
      '<div class="x-compose-input" contenteditable="true" data-placeholder="有什么新鲜事？"></div>' +
    '</div>' +
    '<div class="x-compose-footer">' +
      '<div class="x-compose-tools">' +
        '<button class="x-compose-tool"><i class="fa-solid fa-image"></i></button>' +
        '<button class="x-compose-tool"><i class="fa-solid fa-camera"></i></button>' +
        '<button class="x-compose-tool"><i class="fa-solid fa-hashtag"></i></button>' +
      '</div>' +
    '</div>'

  if (window.openPage) {
    window.openPage(page)
  } else {
    var app = document.getElementById('app') || document.body
    app.appendChild(page)
  }

  var cancelBtn = page.querySelector('.x-compose-cancel')
  if (cancelBtn) {
    cancelBtn.addEventListener('click', function(e) {
      e.stopPropagation()
      closeXCompose()
    })
  }

  var input = page.querySelector('.x-compose-input')
  var publishBtn = page.querySelector('.x-compose-publish')
  function syncPublishState() {
    var hasText = Boolean(String(input.innerText || '').trim())
    publishBtn.disabled = !hasText
    publishBtn.classList.toggle('is-ready', hasText)
  }
  input.addEventListener('input', syncPublishState)
  publishBtn.addEventListener('click', function(e) {
    e.preventDefault()
    var content = String(input.innerText || '').trim()
    if (!content || publishBtn.disabled) return
    var posts = getXOwnPosts(user)
    posts.unshift({ id: Date.now(), content: content, createdAt: Date.now() })
    saveXOwnPosts(user, posts)
    closeXCompose()
    var xPage = document.getElementById('x-page')
    if (xPage) renderXTab(xPage, 'home', user)
    window.toast && window.toast('发布成功')
  })
  syncPublishState()
}

function getXOwnPosts(user) {
  if (!user || user.id == null) return []
  try {
    var parsed = JSON.parse(localStorage.getItem(X_POSTS_PREFIX + user.id) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    return []
  }
}

function saveXOwnPosts(user, posts) {
  if (!user || user.id == null) return
  localStorage.setItem(X_POSTS_PREFIX + user.id, JSON.stringify(posts.slice(0, 100)))
}

function buildXOwnPostsHTML(user) {
  return getXOwnPosts(user).map(function(post) {
    return buildXPost({
      avatar: user.avatar || '',
      name: getXUserName(user),
      handle: getXUserHandle(user),
      time: formatXPostTime(post.createdAt),
      content: post.content || '',
      comments: 0,
      retweets: 0,
      likes: 0,
      views: 0
    })
  }).join('')
}

function formatXPostTime(ts) {
  var diff = Math.max(0, Date.now() - Number(ts || Date.now()))
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟'
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时'
  return Math.floor(diff / 86400000) + '天'
}

function renderXTab(page, tab, user) {
  var feed = page.querySelector('.x-feed')
  if (!feed) return
  feed.dataset.xView = tab
  page.querySelector('.x-fab').style.display = tab === 'home' ? '' : 'none'
  if (tab === 'home') {
    feed.innerHTML = buildXOwnPostsHTML(user) + buildXPost({
      avatar: 'img/wanwan.png', name: '弯弯协会', verified: true,
      handle: '@Wanwan_Offical', time: '2小时',
      content: '产品上线请多多关注。#AI #Wanwan', comments: 847,
      retweets: 203, likes: 3654, views: '28.6万'
    })
    bindXLikeButtons(feed)
    return
  }
  var views = {
    search: '<div class="x-secondary-view"><label class="x-search-box"><i class="fa fa-search"></i><input type="search" placeholder="搜索"></label><div class="x-secondary-title">试试搜索感兴趣的内容</div></div>',
    notifications: '<div class="x-secondary-view"><div class="x-secondary-icon"><i class="fa-regular fa-bell"></i></div><div class="x-secondary-title">暂无通知</div><div class="x-secondary-copy">新的关注、喜欢和回复会出现在这里。</div></div>',
    messages: '<div class="x-secondary-view"><div class="x-secondary-icon"><i class="fa-regular fa-envelope"></i></div><div class="x-secondary-title">欢迎来到私信</div><div class="x-secondary-copy">暂时还没有新的对话。</div></div>'
  }
  feed.innerHTML = views[tab] || views.search
}

function bindXLikeButtons(root) {
  root.querySelectorAll('.x-post-action.like').forEach(function(button) {
    button.addEventListener('click', function(e) {
      e.preventDefault()
      e.stopPropagation()
      var liked = button.dataset.liked === '1'
      var baseCount = Number(button.dataset.baseCount || button.dataset.count || 0)
      var count = Math.max(baseCount, Number(button.dataset.count || baseCount) + (liked ? -1 : 1))
      button.dataset.count = String(count)
      button.dataset.liked = liked ? '0' : '1'
      button.classList.toggle('liked', !liked)
      button.innerHTML = getXHeartSvg(!liked) + '<span>' + formatXNumber(count) + '</span>'
    })
  })
}

function showXLoginPage(options) {
  options = options || {}
  var existing = document.getElementById('x-login-page')
  if (existing) existing.remove()
  if (options.replaceExisting) {
    var xPage = document.getElementById('x-page')
    if (xPage) xPage.remove()
    var profilePage = document.getElementById('x-profile-page')
    if (profilePage) profilePage.remove()
    var editPage = document.getElementById('x-profile-edit-page')
    if (editPage) editPage.remove()
  }

  var page = document.createElement('div')
  page.id = 'x-login-page'
  page.className = 'full-page x-login-page'
  if (options.returnToProfile) page.dataset.returnToProfile = '1'
  page.innerHTML =
    '<button class="x-login-close" type="button" aria-label="返回"><i class="fa fa-angle-left"></i></button>' +
    '<div class="x-login-shell">' +
      '<div class="x-login-logo"><svg viewBox="0 0 24 24"><g><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></g></svg></div>' +
      '<div class="x-login-title">登录 X</div>' +
      '<div class="x-login-subtitle">选择微信账号继续</div>' +
      '<button class="x-login-wechat" id="x-login-wechat" type="button">' +
        getXWeChatSvg() +
        '<span>通过微信登录</span>' +
      '</button>' +
      '<div class="x-login-users" id="x-login-users" hidden></div>' +
    '</div>'

  if (window.openPage) {
    window.openPage(page)
  } else {
    var app = document.getElementById('app') || document.body
    app.appendChild(page)
  }

  page.querySelector('.x-login-close').addEventListener('click', function() {
    closeXLoginPage()
  })
  page.querySelector('#x-login-wechat').addEventListener('click', function() {
    renderXLoginUsers(page)
  })
}

async function renderXLoginUsers(page) {
  var list = page.querySelector('#x-login-users')
  if (!list) return
  list.hidden = false
  list.innerHTML = '<div class="x-login-loading"><i class="fa fa-spinner fa-spin"></i></div>'
  var users = await getXUserList()
  if (!users.length) {
    list.innerHTML =
      '<div class="x-login-empty">' +
        '<div>暂无 USER 账号</div>' +
        '<span>请先在角色档案里创建 USER 类型角色</span>' +
      '</div>'
    return
  }
  list.innerHTML = users.map(function(user) {
    var name = getXUserName(user)
    var account = user.identity && user.identity.account ? '@' + user.identity.account : '微信用户'
    return '<button class="x-login-user" type="button" data-uid="' + xEscape(user.id) + '">' +
      '<span class="x-login-user-avatar">' + getXAvatarHTML(user) + '</span>' +
      '<span class="x-login-user-main">' +
        '<span class="x-login-user-name">' + xEscape(name) + '</span>' +
        '<span class="x-login-user-account">' + xEscape(account) + '</span>' +
      '</span>' +
      '<i class="fa fa-angle-right"></i>' +
    '</button>'
  }).join('')

  list.querySelectorAll('.x-login-user').forEach(function(row) {
    row.addEventListener('click', async function() {
      var uid = parseInt(row.dataset.uid)
      var user = users.find(function(item) { return parseInt(item.id) === uid })
      if (!user) return
      setXSessionUser(user)
      var returnToProfile = page.dataset.returnToProfile === '1'
      closeXLoginPage(true)
      renderXPage(user)
      if (returnToProfile) showXProfilePage(user)
    })
  })
}

function closeXLoginPage(immediate) {
  var page = document.getElementById('x-login-page')
  if (!page) return
  if (immediate) {
    page.remove()
  } else if (window.closePage) {
    window.closePage('x-login-page')
  } else {
    page.remove()
  }
}

window.closeXCompose = function() {
  var page = document.getElementById('x-compose')
  if (!page) return
  if (window.closePage) {
    window.closePage('x-compose')
  } else {
    page.remove()
  }
}

function closeXProfilePage() {
  var page = document.getElementById('x-profile-page')
  if (!page) return
  if (window.closePage) {
    window.closePage('x-profile-page')
  } else {
    page.remove()
  }
}

function closeXProfileEditPage(immediate) {
  var page = document.getElementById('x-profile-edit-page')
  if (!page) return
  if (immediate) {
    page.remove()
  } else if (window.closePage) {
    window.closePage('x-profile-edit-page')
  } else {
    page.remove()
  }
}

function closeXPage() {
  var page = document.getElementById('x-page')
  if (!page) return
  if (window.closePage) {
    window.closePage('x-page')
  } else {
    page.remove()
  }
}

async function getXUserList() {
  if (!window.db || !db.characters) return []
  try {
    return await db.characters.where('type').equals('user').toArray()
  } catch (e) {
    return (await db.characters.toArray()).filter(function(user) { return user.type === 'user' })
  }
}

async function getXSessionUser() {
  var stored = localStorage.getItem(X_SESSION_UID_KEY)
  if (!stored) return null
  var uid = parseInt(stored)
  if (!Number.isFinite(uid)) {
    localStorage.removeItem(X_SESSION_UID_KEY)
    return null
  }
  var user = window.getCharacter ? await window.getCharacter(uid) : await db.characters.get(uid)
  if (!user || user.type !== 'user') {
    localStorage.removeItem(X_SESSION_UID_KEY)
    return null
  }
  return user
}

function setXSessionUser(user) {
  if (!user || user.type !== 'user') return
  localStorage.setItem(X_SESSION_UID_KEY, user.id)
}

function getXUserName(user) {
  return (user && (user.nick || user.name)) || '微信用户'
}

function getXUserHandle(user) {
  var account = user && user.identity && user.identity.account
  account = account ? String(account).replace(/^@+/, '') : ''
  return '@' + (account || getXUserName(user).replace(/\s+/g, '_') || 'User')
}

async function getXProfile(user) {
  var fallback = getXDefaultProfile(user)
  if (!user || user.id == null) return fallback
  var key = X_PROFILE_PREFIX + user.id
  try {
    if (window.db && db.config) {
      var row = await db.config.get(key)
      return normalizeXProfile(user, row && row.value)
    }
  } catch (e) {}
  try {
    var raw = localStorage.getItem(key)
    return normalizeXProfile(user, raw ? JSON.parse(raw) : null)
  } catch (e2) {
    return fallback
  }
}

async function saveXProfile(user, profile) {
  if (!user || user.id == null) return
  var normalized = normalizeXProfile(user, profile)
  var key = X_PROFILE_PREFIX + user.id
  try {
    if (window.db && db.config) {
      await db.config.put({ key: key, value: normalized })
      return
    }
  } catch (e) {}
  localStorage.setItem(key, JSON.stringify(normalized))
}

function getXDefaultProfile(user) {
  var join = getXDefaultJoinParts(user)
  return {
    backgroundImage: '',
    avatar: '',
    name: getXUserName(user),
    handle: stripXAt(getXUserHandle(user)),
    joinYear: join.year,
    joinMonth: join.month,
    following: '0',
    followers: '0'
  }
}

function normalizeXProfile(user, profile) {
  var base = getXDefaultProfile(user)
  if (!profile || typeof profile !== 'object') return base
  return {
    backgroundImage: profile.backgroundImage || '',
    avatar: profile.avatar || '',
    name: String(profile.name || base.name),
    handle: stripXAt(profile.handle || base.handle),
    joinYear: normalizeXJoinYear(profile.joinYear || base.joinYear, user),
    joinMonth: normalizeXJoinMonth(profile.joinMonth || base.joinMonth, user),
    following: normalizeXCount(profile.following),
    followers: normalizeXCount(profile.followers)
  }
}

function getXProfileName(user, profile) {
  return (profile && profile.name) || getXUserName(user)
}

function getXProfileHandle(user, profile) {
  var handle = profile && profile.handle ? profile.handle : getXUserHandle(user)
  return '@' + stripXAt(handle)
}

function getXProfileAvatarHTML(user, profile) {
  var name = getXProfileName(user, profile)
  var avatar = profile && profile.avatar ? profile.avatar : (user && user.avatar)
  if (avatar) return '<img src="' + xEscape(avatar) + '" alt="' + xEscape(name) + '">'
  return buildXDefaultAvatarHTML(name)
}

function stripXAt(value) {
  return String(value == null ? '' : value).trim().replace(/^@+/, '')
}

function normalizeXCount(value) {
  var str = String(value == null || value === '' ? '0' : value).trim()
  if (/^\d+$/.test(str)) return String(parseInt(str, 10))
  return str.replace(/[<>"'&]/g, '').slice(0, 12) || '0'
}

function pickXImage(callback) {
  if (window.showImagePicker) {
    window.showImagePicker(callback)
  } else if (window.toast) {
    window.toast('当前环境不支持选择图片')
  }
}

function getXDefaultJoinParts(user) {
  var ts = user && (user.createdAt || user.updatedAt || user.idCreatedAt)
  var date = ts ? new Date(ts) : new Date(2026, 2, 1)
  if (isNaN(date.getTime())) date = new Date(2026, 2, 1)
  return {
    year: String(date.getFullYear()),
    month: String(date.getMonth() + 1)
  }
}

function normalizeXJoinYear(value, user) {
  var fallback = getXDefaultJoinParts(user).year
  var year = parseInt(String(value == null ? '' : value).replace(/\D/g, ''), 10)
  if (!Number.isFinite(year) || year < 1900 || year > 2999) return fallback
  return String(year)
}

function normalizeXJoinMonth(value, user) {
  var fallback = getXDefaultJoinParts(user).month
  var month = parseInt(String(value == null ? '' : value).replace(/\D/g, ''), 10)
  if (!Number.isFinite(month) || month < 1 || month > 12) return fallback
  return String(month)
}

function getXJoinText(user, profile) {
  var year = normalizeXJoinYear(profile && profile.joinYear, user)
  var month = normalizeXJoinMonth(profile && profile.joinMonth, user)
  return '於 ' + year + '年' + month + '月加入'
}

function getXAvatarHTML(user) {
  var name = getXUserName(user)
  if (user && user.avatar) return '<img src="' + xEscape(user.avatar) + '" alt="' + xEscape(name) + '">'
  return buildXDefaultAvatarHTML(name)
}

function buildXDefaultAvatarHTML(name) {
  return '<span class="x-avatar-placeholder">' + xEscape((name || '我').slice(0, 1)) + '</span>'
}

function getXWeChatSvg() {
  return '<svg class="x-login-wechat-svg" viewBox="0 0 576 512" aria-hidden="true"><path d="M385.2 167.6c6.4 0 12.6.3 18.8 1.1C387.4 90.3 303.3 32 207.7 32 100.5 32 13 104.8 13 197.4c0 53.4 29.3 97.5 77.9 131.6l-19.3 58.6 68.1-34.1c24.4 4.8 43.8 9.7 68.2 9.7 6.2 0 12.1-.3 18.3-.8-3.9-12.9-6.2-26.6-6.2-40.8-.1-84.9 72.9-154 165.2-154zM280.7 114.7c14.5 0 24.2 9.7 24.2 24.4 0 14.5-9.7 24.2-24.2 24.2-14.8 0-29.3-9.7-29.3-24.2.1-14.7 14.6-24.4 29.3-24.4zm-136.4 48.6c-14.5 0-29.3-9.7-29.3-24.2 0-14.8 14.8-24.4 29.3-24.4 14.8 0 24.4 9.7 24.4 24.4 0 14.6-9.6 24.2-24.4 24.2zM563 319.4c0-77.9-77.9-141.3-165.4-141.3-92.7 0-165.4 63.4-165.4 141.3s72.8 141.3 165.4 141.3c19.3 0 38.9-5.1 58.6-9.9l53.4 29.3-14.8-48.6C534 402.1 563 363.2 563 319.4zM343.9 294.9c-9.7 0-19.3-9.7-19.3-19.4 0-9.9 9.7-19.6 19.3-19.6 14.8 0 24.4 9.7 24.4 19.6 0 9.7-9.6 19.4-24.4 19.4zm107.1 0c-9.7 0-19.3-9.7-19.3-19.4 0-9.9 9.7-19.6 19.3-19.6 14.8 0 24.4 9.7 24.4 19.6.1 9.7-9.5 19.4-24.4 19.4z"></path></svg>'
}

function xEscape(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, function(ch) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
  })
}

function formatXNumber(n) {
  if (typeof n === 'string') return n
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万'
  return String(n)
}

function formatXContent(str) {
  return xEscape(str)
    .replace(/(#[A-Za-z0-9_\u4e00-\u9fa5]+)/g, '<span class="x-hashtag">$1</span>')
    .replace(/\n/g, '<br>')
}

function getXHeartSvg(solid) {
  return solid
    ? '<svg viewBox="0 0 24 24"><g><path d="M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"></path></g></svg>'
    : '<svg viewBox="0 0 24 24"><g><path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"></path></g></svg>'
}

function buildXPost(data) {
  var contentHTML = formatXContent(data.content)
  var avatarHTML = data.avatar
    ? '<img src="' + xEscape(data.avatar) + '" alt="">'
    : buildXDefaultAvatarHTML(data.name || '')

  return '<div class="x-post">' +
    '<div class="x-post-avatar">' + avatarHTML + '</div>' +
    '<div class="x-post-body">' +
      '<div class="x-post-header">' +
        '<span class="x-post-name">' + xEscape(data.name) + '</span>' +
        (data.verified ?
          '<span class="x-post-verified"><svg viewBox="0 0 24 24"><g><path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.27 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.46 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z"></path></g></svg></span>' : '') +
        '<span class="x-post-handle">' + xEscape(data.handle) + '</span>' +
        '<span class="x-post-dot">·</span>' +
        '<span class="x-post-time">' + xEscape(data.time) + '</span>' +
        '<span class="x-post-more"><svg viewBox="0 0 24 24"><g><path d="M3 12c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2zm9 2c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm7 0c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"></path></g></svg></span>' +
      '</div>' +
      '<div class="x-post-content">' + contentHTML + '</div>' +
      '<div class="x-post-actions">' +
        '<button class="x-post-action comment"><svg viewBox="0 0 24 24"><g><path d="M1.751 10c0-4.42 3.584-8.005 8.005-8.005h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.005zm8.005-6.005c-3.317 0-6.005 2.69-6.005 6.005 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z"></path></g></svg><span>' + formatXNumber(data.comments) + '</span></button>' +
        '<button class="x-post-action retweet"><svg viewBox="0 0 24 24"><g><path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.791-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.791 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"></path></g></svg><span>' + formatXNumber(data.retweets) + '</span></button>' +
        '<button class="x-post-action like" data-count="' + Number(data.likes || 0) + '" data-base-count="' + Number(data.likes || 0) + '" data-liked="0">' + getXHeartSvg(false) + '<span>' + formatXNumber(data.likes) + '</span></button>' +
        '<button class="x-post-action views"><svg viewBox="0 0 24 24"><g><path d="M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10H6v10H4zm9.248 0v-7h2v7h-2z"></path></g></svg><span>' + formatXNumber(data.views) + '</span></button>' +
        '<button class="x-post-action bookmark"><svg viewBox="0 0 24 24"><g><path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5zM6.5 4c-.276 0-.5.22-.5.5v14.56l6-4.29 6 4.29V4.5c0-.28-.224-.5-.5-.5h-11z"></path></g></svg></button>' +
        '<button class="x-post-action share"><svg viewBox="0 0 24 24"><g><path d="M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.29 3.3-1.42-1.42L12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z"></path></g></svg></button>' +
      '</div>' +
    '</div>' +
  '</div>'
}

function buildXBottomBar() {
  var items = [
    {
      id: 'home',
      active: true,
      defaultSvg: '<svg viewBox="0 0 24 24"><g><path d="M21.591 7.146L12.52 1.157c-.316-.21-.724-.21-1.04 0l-9.071 5.99c-.26.173-.409.456-.409.757v13.183c0 .502.418.913.929.913h6.638c.511 0 .929-.41.929-.913v-7.075h3.008v7.075c0 .502.418.913.929.913h6.638c.511 0 .929-.41.929-.913V7.904c0-.301-.158-.584-.408-.758zM20 20l-4.5.01v-7.09c0-.5-.418-.91-.929-.91H9.43c-.511 0-.929.41-.929.91L8.5 20H4V8.773l8-5.27 8 5.271V20z"></path></g></svg>',
      activeSvg: '<svg viewBox="0 0 24 24"><g><path d="M21.591 7.146L12.52 1.157c-.316-.21-.724-.21-1.04 0l-9.071 5.99c-.26.173-.409.456-.409.757v13.183c0 .502.418.913.929.913H9.14c.511 0 .929-.41.929-.913v-7.075h3.862v7.075c0 .502.418.913.929.913h6.141c.511 0 .929-.41.929-.913V7.904c0-.301-.158-.584-.408-.758z"></path></g></svg>'
    },
    {
      id: 'search',
      active: false,
      defaultSvg: '<svg viewBox="0 0 24 24"><g><path d="M10.25 3.75c-3.59 0-6.5 2.91-6.5 6.5s2.91 6.5 6.5 6.5c1.795 0 3.419-.726 4.596-1.904 1.178-1.177 1.904-2.801 1.904-4.596 0-3.59-2.91-6.5-6.5-6.5zm-8.5 6.5c0-4.694 3.806-8.5 8.5-8.5s8.5 3.806 8.5 8.5c0 1.986-.682 3.815-1.824 5.262l4.781 4.781-1.414 1.414-4.781-4.781c-1.447 1.142-3.276 1.824-5.262 1.824-4.694 0-8.5-3.806-8.5-8.5z"></path></g></svg>',
      activeSvg: '<svg viewBox="0 0 24 24"><g><path d="M10.25 3.75c-3.59 0-6.5 2.91-6.5 6.5s2.91 6.5 6.5 6.5c1.795 0 3.419-.726 4.596-1.904 1.178-1.177 1.904-2.801 1.904-4.596 0-3.59-2.91-6.5-6.5-6.5zm-8.5 6.5c0-4.694 3.806-8.5 8.5-8.5s8.5 3.806 8.5 8.5c0 1.986-.682 3.815-1.824 5.262l4.781 4.781-1.414 1.414-4.781-4.781c-1.447 1.142-3.276 1.824-5.262 1.824-4.694 0-8.5-3.806-8.5-8.5z" stroke="currentColor" stroke-width="1.5"></path></g></svg>'
    },
    {
      id: 'notifications',
      active: false,
      defaultSvg: '<svg viewBox="0 0 24 24"><g><path d="M19.993 9.042C19.48 5.017 16.054 2 11.996 2s-7.49 3.021-7.999 7.051L2.866 18H7.1c.463 2.282 2.481 4 4.9 4s4.435-1.718 4.9-4h4.236l-1.143-8.958zM12 20c-1.306 0-2.417-.835-2.829-2h5.658c-.412 1.165-1.523 2-2.829 2zm-6.866-4l.847-6.698C6.364 6.272 8.941 4 11.996 4s5.627 2.268 6.013 5.295L18.858 16H5.134z"></path></g></svg>',
      activeSvg: '<svg viewBox="0 0 24 24"><g><path d="M11.996 2c-4.062 0-7.49 3.021-7.999 7.051L2.866 18H7.1c.463 2.282 2.481 4 4.9 4s4.435-1.718 4.9-4h4.236l-1.143-8.958C19.48 5.017 16.054 2 11.996 2zM9.171 18h5.658c-.412 1.165-1.523 2-2.829 2s-2.417-.835-2.829-2z"></path></g></svg>'
    },
    {
      id: 'messages',
      active: false,
      defaultSvg: '<svg viewBox="0 0 24 24"><g><path d="M1.998 5.5c0-1.381 1.119-2.5 2.5-2.5h15c1.381 0 2.5 1.119 2.5 2.5v13c0 1.381-1.119 2.5-2.5 2.5h-15c-1.381 0-2.5-1.119-2.5-2.5v-13zm2.5-.5c-.276 0-.5.224-.5.5v2.764l8 5.333 8-5.333V5.5c0-.276-.224-.5-.5-.5h-15zm15.5 5.463l-8 5.334-8-5.334V18.5c0 .276.224.5.5.5h15c.276 0 .5-.224.5-.5v-8.037z"></path></g></svg>',
      activeSvg: '<svg viewBox="0 0 24 24"><g><path d="M1.998 5.5c0-1.381 1.119-2.5 2.5-2.5h15c1.381 0 2.5 1.119 2.5 2.5v13c0 1.381-1.119 2.5-2.5 2.5h-15c-1.381 0-2.5-1.119-2.5-2.5v-13zm2.5-.5c-.276 0-.5.224-.5.5v2.764l8 5.333 8-5.333V5.5c0-.276-.224-.5-.5-.5h-15zm15.5 5.463l-8 5.334-8-5.334V18.5c0 .276.224.5.5.5h15c.276 0 .5-.224.5-.5v-8.037z" stroke="currentColor" stroke-width="1"></path></g></svg>'
    }
  ]

  return items.map(function(item) {
    return '<div class="x-bottombar-item' + (item.active ? ' active' : '') + '" data-tab="' + item.id + '">' +
      '<span class="icon-default">' + item.defaultSvg + '</span>' +
      '<span class="icon-active">' + item.activeSvg + '</span>' +
    '</div>'
  }).join('')
}
