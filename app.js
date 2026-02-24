/* ============================================================
   ClipForge AI — Full SPA
   Pages: auth | landing | dashboard | editor
   ============================================================ */

// ── Backend API Config ───────────────────────────────────────
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3001/api'
  : '/api';
let backendOnline = false;

async function checkBackend() {
  try {
    const r = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(2000) });
    const data = await r.json();
    backendOnline = data.status === 'ok';
    updateBackendBadge(data);
    return data;
  } catch {
    backendOnline = false;
    updateBackendBadge(null);
    return null;
  }
}

function updateBackendBadge(health) {
  const badge = document.getElementById('backend-badge');
  if (!badge) return;
  if (!health) {
    badge.className = 'backend-badge offline';
    badge.innerHTML = '<span class="material-symbols-outlined">cloud_off</span> Backend Offline (Demo Mode)';
  } else {
    badge.className = 'backend-badge online';
    badge.innerHTML = `<span class="material-symbols-outlined">cloud_done</span>
      Backend Online &middot; Gemini: ${health.services?.gemini ? '✅' : '⚠️ Mock'}
      &middot; FFmpeg: ${health.services?.ffmpeg ? '✅' : '❌'}
      &middot; yt-dlp: ${health.services?.ytdlp ? '✅' : '❌'}`;

  }
}

// ── Auth State ───────────────────────────────────────────────
let currentUser = null;
const STORAGE_KEYS = {
  user: 'cf_user',
  editor: 'cf_editor_state',
  projects: 'cf_projects'
};

function loadSession() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.user);
    if (saved) currentUser = JSON.parse(saved);
  } catch (e) { currentUser = null; }
}

function saveSession(user) {
  currentUser = user;
  localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
}

function clearSession() {
  currentUser = null;
  localStorage.removeItem(STORAGE_KEYS.user);
}

// ── Editor State Persistence ─────────────────────────────────
const defaultEditorState = {
  preset: 'viral-bold',
  color: '#fbbf24',
  font: 'Inter Extra Bold',
  aiAnim: true,
  progress: 40,
  projectId: 1
};

function loadEditorState() {
  try {
    const s = localStorage.getItem(STORAGE_KEYS.editor);
    return s ? { ...defaultEditorState, ...JSON.parse(s) } : { ...defaultEditorState };
  } catch (e) { return { ...defaultEditorState }; }
}

let editorState = loadEditorState();
let saveTimer = null;

function markUnsaved() {
  const ind = document.getElementById('save-indicator');
  if (!ind) return;
  ind.className = 'save-indicator unsaved';
  ind.innerHTML = '<span class="material-symbols-outlined">edit</span> Unsaved changes';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(autoSave, 1200);
}

function autoSave() {
  const ind = document.getElementById('save-indicator');
  if (ind) {
    ind.className = 'save-indicator saving';
    ind.innerHTML = '<span class="material-symbols-outlined">sync</span> Saving…';
  }
  localStorage.setItem(STORAGE_KEYS.editor, JSON.stringify(editorState));
  setTimeout(() => {
    if (ind) {
      ind.className = 'save-indicator saved';
      ind.innerHTML = '<span class="material-symbols-outlined">cloud_done</span> Saved';
    }
  }, 600);
}

// ── Router ───────────────────────────────────────────────────
let currentPage = 'landing';

function navigate(page) {
  // Guard: require auth for dashboard/editor
  if ((page === 'dashboard' || page === 'editor') && !currentUser) {
    openAuth('signin');
    return;
  }
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + page);
  if (target) target.classList.add('active');
  window.scrollTo(0, 0);
}

// ── Data ─────────────────────────────────────────────────────
const projects = [
  {
    id: 1, title: 'AI Travel Vlog: Hidden Gems of Iceland', status: 'completed', lang: 'English', progress: 100,
    thumb: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=600&auto=format&fit=crop'
  },
  {
    id: 2, title: 'Top 10 Tech Gadgets 2024', status: 'processing', lang: 'Hindi', progress: 64,
    thumb: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&auto=format&fit=crop'
  },
  {
    id: 3, title: 'Cooking Masterclass: Italian Pasta', status: 'completed', lang: 'Spanish', progress: 100,
    thumb: 'https://images.unsplash.com/photo-1546549032-9571cd6b27df?w=600&auto=format&fit=crop'
  },
  {
    id: 4, title: 'Extreme Sports: Downhill MTB', status: 'completed', lang: 'English', progress: 100,
    thumb: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&auto=format&fit=crop'
  }
];

// ── Auth Modal ────────────────────────────────────────────────
let authMode = 'signin'; // 'signin' | 'signup'

function openAuth(mode = 'signin') {
  authMode = mode;
  const overlay = document.getElementById('auth-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  renderAuthContent();
  // Focus first input after animation
  setTimeout(() => {
    const first = overlay.querySelector('input');
    if (first) first.focus();
  }, 420);
}

function closeAuth() {
  const overlay = document.getElementById('auth-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function switchAuthMode(mode) {
  authMode = mode;
  renderAuthContent();
  setTimeout(() => {
    const first = document.getElementById('auth-overlay')?.querySelector('input');
    if (first) first.focus();
  }, 50);
}

function renderAuthContent() {
  const body = document.getElementById('auth-modal-body');
  if (!body) return;

  if (authMode === 'signin') {
    body.innerHTML = `
      <div class="auth-tabs">
        <button class="auth-tab active" onclick="switchAuthMode('signin')" id="tab-signin">Sign In</button>
        <button class="auth-tab" onclick="switchAuthMode('signup')" id="tab-signup">Sign Up</button>
      </div>
      <h2 class="auth-heading">Welcome back!</h2>
      <p class="auth-sub">Sign in to continue creating viral content.</p>
      <div class="auth-social">
        <button class="social-btn" onclick="socialLogin('google')" id="google-signin-btn">
          <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google"/>
          Continue with Google
        </button>
        <button class="social-btn social-btn-twitter" onclick="socialLogin('twitter')" id="twitter-signin-btn">
          <svg width="18" height="18" viewBox="0 0 300 300" fill="#1DA1F2"><path d="M178.57 127.15 290.27 0h-26.46l-97.03 110.38L89.34 0H0l117.13 166.93L0 300.25h26.46l102.4-116.59 81.8 116.59h89.34M36.01 19.54H76.66l187.13 262.13h-40.66"/></svg>
          Continue with X (Twitter)
        </button>
      </div>
      <div class="auth-divider"><span>or sign in with email</span></div>
      <form class="auth-form" onsubmit="handleSignIn(event)" id="signin-form">
        <div class="form-group">
          <label class="form-label" for="signin-email">Email Address</label>
          <input class="form-input" id="signin-email" type="email" placeholder="you@example.com" autocomplete="email" required/>
        </div>
        <div class="form-group">
          <label class="form-label" for="signin-password">Password</label>
          <div class="form-input-wrap">
            <input class="form-input" id="signin-password" type="password" placeholder="••••••••" autocomplete="current-password" required/>
            <button type="button" class="input-eye" onclick="togglePw('signin-password',this)" id="signin-pw-eye">
              <span class="material-symbols-outlined">visibility</span>
            </button>
          </div>
        </div>
        <button type="button" class="form-forgot" id="forgot-pw-btn" onclick="showToast('Password reset email sent!','info')">Forgot password?</button>
        <button type="submit" class="auth-submit" id="signin-submit-btn">
          <span class="material-symbols-outlined">login</span> Sign In
        </button>
      </form>
      <div class="auth-switch">Don't have an account?
        <button onclick="switchAuthMode('signup')" id="switch-to-signup">Create one</button>
      </div>
    `;
  } else {
    body.innerHTML = `
      <div class="auth-tabs">
        <button class="auth-tab" onclick="switchAuthMode('signin')" id="tab-signin">Sign In</button>
        <button class="auth-tab active" onclick="switchAuthMode('signup')" id="tab-signup">Sign Up</button>
      </div>
      <h2 class="auth-heading">Create your account</h2>
      <p class="auth-sub">Start turning long videos into viral shorts today — free.</p>
      <div class="auth-social">
        <button class="social-btn" onclick="socialLogin('google')" id="google-signup-btn">
          <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google"/>
          Continue with Google
        </button>
      </div>
      <div class="auth-divider"><span>or sign up with email</span></div>
      <form class="auth-form" onsubmit="handleSignUp(event)" id="signup-form">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="signup-firstname">First Name</label>
            <input class="form-input" id="signup-firstname" type="text" placeholder="Harshit" required/>
          </div>
          <div class="form-group">
            <label class="form-label" for="signup-lastname">Last Name</label>
            <input class="form-input" id="signup-lastname" type="text" placeholder="Sharma" required/>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="signup-email">Email Address</label>
          <input class="form-input" id="signup-email" type="email" placeholder="you@example.com" autocomplete="email" required/>
        </div>
        <div class="form-group">
          <label class="form-label" for="signup-password">Password</label>
          <div class="form-input-wrap">
            <input class="form-input" id="signup-password" type="password" placeholder="Min 8 characters"
              autocomplete="new-password" oninput="checkPwStrength(this.value)" required minlength="8"/>
            <button type="button" class="input-eye" onclick="togglePw('signup-password',this)" id="signup-pw-eye">
              <span class="material-symbols-outlined">visibility</span>
            </button>
          </div>
          <div class="pw-strength">
            <div class="pw-bar" id="pw-bar-1"></div>
            <div class="pw-bar" id="pw-bar-2"></div>
            <div class="pw-bar" id="pw-bar-3"></div>
            <div class="pw-bar" id="pw-bar-4"></div>
          </div>
        </div>
        <button type="submit" class="auth-submit" id="signup-submit-btn">
          <span class="material-symbols-outlined">person_add</span> Create Account
        </button>
      </form>
      <div class="terms-text">
        By creating an account you agree to our
        <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>.
      </div>
      <div class="auth-switch">Already have an account?
        <button onclick="switchAuthMode('signin')" id="switch-to-signin">Sign in</button>
      </div>
    `;
  }
}

// ── Auth Handlers ─────────────────────────────────────────────
function togglePw(inputId, btn) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  const isHidden = inp.type === 'password';
  inp.type = isHidden ? 'text' : 'password';
  const icon = btn.querySelector('.material-symbols-outlined');
  if (icon) icon.textContent = isHidden ? 'visibility_off' : 'visibility';
}

function checkPwStrength(pw) {
  const bars = [1, 2, 3, 4].map(i => document.getElementById('pw-bar-' + i));
  bars.forEach(b => { if (b) b.className = 'pw-bar'; });
  const score = [/.{8,}/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(r => r.test(pw)).length;
  const cls = score <= 1 ? 'weak' : score <= 2 ? 'medium' : 'strong';
  for (let i = 0; i < score; i++) { if (bars[i]) bars[i].classList.add(cls); }
}

function handleSignIn(e) {
  e.preventDefault();
  const email = document.getElementById('signin-email')?.value.trim();
  const password = document.getElementById('signin-password')?.value;
  const btn = document.getElementById('signin-submit-btn');
  if (!email || !password) return;

  // Simulate async auth
  if (btn) { btn.classList.add('loading'); btn.innerHTML = '<span class="material-symbols-outlined">hourglass_top</span> Signing in…'; }
  setTimeout(() => {
    const user = {
      name: email.split('@')[0].charAt(0).toUpperCase() + email.split('@')[0].slice(1),
      firstName: email.split('@')[0],
      email,
      avatar: email.charAt(0).toUpperCase(),
      plan: 'Pro', joinedAt: new Date().toISOString()
    };
    saveSession(user);
    closeAuth();
    updateUIForUser();
    navigate('dashboard');
    showToast(`👋 Welcome back, ${user.name}!`, 'success');
  }, 1200);
}

function handleSignUp(e) {
  e.preventDefault();
  const firstName = document.getElementById('signup-firstname')?.value.trim();
  const lastName = document.getElementById('signup-lastname')?.value.trim();
  const email = document.getElementById('signup-email')?.value.trim();
  const password = document.getElementById('signup-password')?.value;
  const btn = document.getElementById('signup-submit-btn');
  if (!firstName || !email || !password) return;

  if (btn) { btn.classList.add('loading'); btn.innerHTML = '<span class="material-symbols-outlined">hourglass_top</span> Creating account…'; }
  setTimeout(() => {
    const user = {
      name: `${firstName} ${lastName}`.trim(),
      firstName,
      email,
      avatar: firstName.charAt(0).toUpperCase(),
      plan: 'Starter',
      joinedAt: new Date().toISOString()
    };
    saveSession(user);
    closeAuth();
    updateUIForUser();
    navigate('dashboard');
    showToast(`🎉 Account created! Welcome, ${firstName}!`, 'success');
  }, 1400);
}

function socialLogin(provider) {
  const names = { google: 'Google User', twitter: 'Twitter User' };
  const btn = document.querySelector(`#google-${authMode}-btn, #twitter-${authMode}-btn`);
  showToast(`Connecting to ${provider}…`, 'info');
  setTimeout(() => {
    const user = {
      name: names[provider] || 'User',
      firstName: names[provider].split(' ')[0],
      email: `user@${provider}.com`,
      avatar: names[provider].charAt(0),
      plan: 'Starter',
      joinedAt: new Date().toISOString()
    };
    saveSession(user);
    closeAuth();
    updateUIForUser();
    navigate('dashboard');
    showToast(`✅ Signed in with ${provider.charAt(0).toUpperCase() + provider.slice(1)}!`, 'success');
  }, 1200);
}

function signOut() {
  clearSession();
  updateUIForUser();
  navigate('landing');
  showToast('You have been signed out.', 'info');
}

function updateUIForUser() {
  // Update avatar
  const avatarEl = document.getElementById('user-avatar');
  if (avatarEl) avatarEl.textContent = currentUser ? currentUser.avatar : 'H';
  // Update nav login button
  const navLogin = document.getElementById('nav-login-btn');
  if (navLogin) {
    if (currentUser) {
      navLogin.textContent = 'Dashboard';
      navLogin.onclick = () => navigate('dashboard');
    } else {
      navLogin.textContent = 'Login';
      navLogin.onclick = () => openAuth('signin');
    }
  }
  // Update welcome text
  const welcome = document.querySelector('.dash-header h1');
  if (welcome && currentUser) {
    welcome.textContent = `Welcome back, ${currentUser.firstName} 👋`;
  }
}

// ── Landing Page ──────────────────────────────────────────────
function renderLanding() {
  return `
<div class="page active" id="page-landing">
  <nav class="main-nav glass-nav">
    <div class="nav-logo" onclick="navigate('landing')">
      <div class="nav-logo-icon"><span class="material-symbols-outlined">movie_filter</span></div>
      <span class="nav-logo-text">ClipForge AI</span>
    </div>
    <div class="nav-links">
      <a href="#features">Features</a>
      <a href="#how-it-works">How it Works</a>
      <a href="#pricing">Pricing</a>
    </div>
    <div class="nav-right">
      <button class="btn-primary" id="nav-login-btn" onclick="openAuth('signin')">Login</button>
    </div>
  </nav>

  <!-- Hero -->
  <section class="hero">
    <div class="hero-aurora"></div>
    <div class="hero-badge"><span class="material-symbols-outlined">bolt</span>AI-Powered Reframing Now Live</div>
    <h1 class="hero-title">
      Turn Any YouTube Video Into<br>
      <span class="hero-gradient">Viral Shorts in 1 Click</span>
    </h1>
    <p class="hero-sub">Our AI detects the best moments, adds kinetic captions, and reframes to 9:16 automatically. Stop editing, start growing.</p>
    <div class="hero-actions">
      <button class="hero-btn-lg hero-btn-primary" onclick="openAuth('signup')" id="hero-start-btn">Start Free Trial</button>
      <button class="hero-btn-lg hero-btn-ghost" id="hero-demo-btn">
        <span class="material-symbols-outlined">play_circle</span> Watch Demo
      </button>
    </div>
  </section>

  <!-- Product Preview -->
  <section style="padding:3rem 1.5rem;">
    <div class="product-section">
      <div class="phone-mockup-wrap">
        <div class="phone-glow"></div>
        <div class="phone-frame">
          <div class="phone-notch"></div>
          <div class="phone-video">
            <div class="phone-caption">
              <span class="cap-yellow">Making</span><span class="cap-white">Viral</span>
              <span class="cap-line2">Content easily!</span>
            </div>
          </div>
        </div>
        <div class="floating-card glass">
          <div class="engagement-score">
            <div class="score-badge">98</div>
            <div class="score-meta"><p>Engagement Score</p><p>Predicted Viral 🔥</p></div>
          </div>
          <div class="score-bar"><div class="score-fill fill-blue"></div></div>
          <div class="score-bar" style="margin-top:6px"><div class="score-fill fill-cyan"></div></div>
        </div>
      </div>
      <div class="product-text">
        <h2>Professional-Grade Editing<br>Without the Effort</h2>
        <p>Our AI-driven engine analyzes long-form content to identify high-retention hooks and emotional peaks. It reframes, subtitles, and optimizes for TikTok, Reels, and Shorts.</p>
        <ul class="check-list">
          <li><span class="material-symbols-outlined">check_circle</span> Auto-face tracking for 9:16 re-centering</li>
          <li><span class="material-symbols-outlined">check_circle</span> Dynamic animated captions with 12+ styles</li>
          <li><span class="material-symbols-outlined">check_circle</span> One-click export to all social platforms</li>
        </ul>
      </div>
    </div>
  </section>

  <!-- Features -->
  <section id="features" class="features-section">
    <div class="section-header">
      <h2>Everything You Need for Viral Growth</h2>
      <p>Supercharge your content workflow with our high-end AI toolset.</p>
    </div>
    <div class="features-grid">
      ${[
      { icon: 'magic_button', title: 'AI Clip Detection', desc: 'Our neural network watches your videos to find the most engaging segments automatically.' },
      { icon: 'analytics', title: 'Engagement Scoring', desc: 'Predict virality before you post with data-backed scores for every detected clip.' },
      { icon: 'closed_caption', title: 'Auto-Subtitles', desc: 'Generate 99% accurate captions with word-by-word animation and emoji suggestions.' },
      { icon: 'language', title: 'Global Translation', desc: 'Translate audio and captions into 50+ languages to reach a worldwide audience.' },
      { icon: 'aspect_ratio', title: '9:16 Formatting', desc: 'Smart re-centering keeps you in the frame even when you\'re moving around.' },
      { icon: 'tag', title: 'Smart Hashtags', desc: 'AI-generated descriptions and SEO tags tailored to each clip\'s specific content.' }
    ].map(f => `
        <div class="feature-card glass">
          <div class="feature-icon"><span class="material-symbols-outlined">${f.icon}</span></div>
          <h3>${f.title}</h3><p>${f.desc}</p>
        </div>`).join('')}
    </div>
  </section>

  <!-- How it works -->
  <section id="how-it-works" class="how-section">
    <div class="how-inner">
      <div class="section-header"><h2>From YouTube to Viral in Seconds</h2></div>
      <div class="steps-row">
        <div class="steps-line"></div>
        ${[
      { n: 1, title: 'Paste URL', desc: 'Drop any YouTube or Twitch link directly into our dashboard.', active: true },
      { n: 2, title: 'AI Processing', desc: 'Our AI scans the video, identifies hooks, and generates clips.', active: false },
      { n: 3, title: 'Fine Tune', desc: 'Review clips, choose caption styles, and adjust framing.', active: false },
      { n: 4, title: 'Export & Viral', desc: 'Download 9:16 clips or publish directly to social media.', active: false },
    ].map(s => `
          <div class="step">
            <div class="step-num ${s.active ? 'active' : ''}">${s.n}</div>
            <h4>${s.title}</h4><p>${s.desc}</p>
          </div>`).join('')}
      </div>
    </div>
  </section>

  <!-- Pricing -->
  <section id="pricing" class="pricing-section">
    <div class="section-header">
      <h2>Flexible Pricing for Every Creator</h2>
      <p>Scale your content without breaking the bank.</p>
    </div>
    <div class="pricing-grid">
      <div class="pricing-card glass">
        <h3>Starter</h3>
        <div class="pricing-price"><span class="amount">$0</span><span class="period">/mo</span></div>
        <ul class="pricing-features">
          <li><span class="material-symbols-outlined">check</span>3 AI Clips per Month</li>
          <li><span class="material-symbols-outlined">check</span>720p Export Resolution</li>
          <li><span class="material-symbols-outlined">check</span>Watermarked Videos</li>
        </ul>
        <button class="pricing-btn pricing-btn-outline" onclick="openAuth('signup')" id="pricing-starter-btn">Choose Starter</button>
      </div>
      <div class="pricing-card glass-primary featured">
        <div class="pricing-badge">Most Popular</div>
        <h3>Pro</h3>
        <div class="pricing-price"><span class="amount">$29</span><span class="period">/mo</span></div>
        <ul class="pricing-features">
          <li><span class="material-symbols-outlined">check</span>Unlimited AI Clips</li>
          <li><span class="material-symbols-outlined">check</span>4K Export Resolution</li>
          <li><span class="material-symbols-outlined">check</span>No Watermarks</li>
          <li><span class="material-symbols-outlined">check</span>Priority Processing</li>
        </ul>
        <button class="pricing-btn pricing-btn-fill" onclick="openAuth('signup')" id="pricing-pro-btn">Choose Pro</button>
      </div>
      <div class="pricing-card glass">
        <h3>Agency</h3>
        <div class="pricing-price"><span class="amount">$99</span><span class="period">/mo</span></div>
        <ul class="pricing-features">
          <li><span class="material-symbols-outlined">check</span>Multiple Team Members</li>
          <li><span class="material-symbols-outlined">check</span>Custom Caption Presets</li>
          <li><span class="material-symbols-outlined">check</span>API Access</li>
          <li><span class="material-symbols-outlined">check</span>Dedicated Manager</li>
        </ul>
        <button class="pricing-btn pricing-btn-outline" onclick="openAuth('signup')" id="pricing-agency-btn">Choose Agency</button>
      </div>
    </div>
  </section>

  <!-- CTA -->
  <section class="cta-section">
    <div class="cta-box glass">
      <div class="cta-glow"></div>
      <h2>Stop Editing.<br><span style="color:var(--primary)">Start Growing.</span></h2>
      <p>Join 10,000+ creators using ClipForge AI to dominate short-form content.</p>
      <button class="hero-btn-lg hero-btn-primary" onclick="openAuth('signup')" id="cta-btn" style="border:none">Start Now for Free</button>
      <p style="color:var(--text-muted);font-size:0.82rem;margin-top:1rem;">No credit card required</p>
    </div>
  </section>

  <!-- Footer -->
  <footer class="footer">
    <div class="footer-inner">
      <div class="footer-logo">
        <span class="material-symbols-outlined">movie_filter</span>
        <span>ClipForge AI</span>
      </div>
      <div class="footer-links">
        <a href="#">Privacy</a><a href="#">Terms</a><a href="#">Twitter</a><a href="#">Discord</a>
      </div>
      <p style="color:var(--text-muted)">© 2024 ClipForge AI. All rights reserved.</p>
    </div>
  </footer>
  <div class="mobile-cta-bar">
    <button onclick="openAuth('signup')" id="mobile-cta-btn">
      <span class="material-symbols-outlined">bolt</span> Get Started Free
    </button>
  </div>
</div>`;
}

// ── Dashboard ─────────────────────────────────────────────────
function projectCard(p) {
  const proc = p.status === 'processing';
  return `
<div class="project-card glass" id="project-${p.id}">
  <div class="project-thumb">
    <img src="${p.thumb}" alt="${p.title}" loading="lazy"/>
    ${proc ? `
      <div class="processing-overlay">
        <div class="spinner"></div>
        <span>Processing ${p.progress}%</span>
      </div>
      <div class="progress-bar" style="width:${p.progress}%"></div>
    ` : `
      <div class="project-overlay" onclick="openProjectEditor(${p.id})">
        <div class="play-btn-overlay"><span class="material-symbols-outlined">play_arrow</span></div>
      </div>
    `}
    <div class="project-tags">
      <span class="tag ${proc ? 'tag-processing' : 'tag-complete'}">${proc ? '<span class="tag-dot"></span>Processing' : 'Completed'}</span>
      <span class="tag tag-lang">${p.lang}</span>
    </div>
  </div>
  <div class="project-info">
    <h3>${p.title}</h3>
    <div class="project-actions">
      <button class="proj-btn proj-btn-edit" onclick="openProjectEditor(${p.id})">
        <span class="material-symbols-outlined">edit</span> Edit
      </button>
      ${proc
      ? `<button class="proj-btn proj-btn-disabled" disabled><span class="material-symbols-outlined">download</span> Download</button>`
      : `<button class="proj-btn proj-btn-download" onclick="downloadProject(${p.id})"><span class="material-symbols-outlined">download</span> Download</button>`}
    </div>
  </div>
</div>`;
}

function openProjectEditor(id) {
  editorState.projectId = id;
  autoSave();
  navigate('editor');
}

function downloadProject(id) {
  showToast('⬇️ Preparing your download…', 'info');
  setTimeout(() => showToast('✅ Download started!', 'success'), 1500);
}

function renderDashboard() {
  const firstName = currentUser ? currentUser.firstName : 'Harshit';
  const avatarChar = currentUser ? currentUser.avatar : 'H';
  return `
<div class="page" id="page-dashboard">
  <nav class="dash-nav glass-nav">
    <div class="nav-logo" onclick="navigate('landing')" style="cursor:pointer">
      <div class="nav-logo-icon"><span class="material-symbols-outlined">movie_edit</span></div>
    </div>
    <div class="dash-search">
      <div class="search-wrap">
        <span class="material-symbols-outlined">search</span>
        <input type="text" placeholder="Search projects…" id="project-search" oninput="filterProjects(this.value)"/>
      </div>
    </div>
    <div class="dash-actions">
      <button class="notif-btn" id="notif-btn"><span class="material-symbols-outlined">notifications</span><span class="notif-dot"></span></button>
      <div class="avatar" id="user-avatar" onclick="openUserMenu()" style="cursor:pointer">${avatarChar}</div>
      <button class="btn-primary" onclick="toggleUrlInput()" id="new-short-btn">
        <span class="material-symbols-outlined" style="font-size:1rem;margin-right:4px">add</span> New Short
      </button>
    </div>
  </nav>

  <main class="dash-main">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;margin-bottom:2.5rem">
      <div class="dash-header" style="margin-bottom:0">
        <h1>Welcome back, ${firstName} 👋</h1>
        <p>Here's what's happening with your video projects today.</p>
      </div>
      <button class="new-project-btn" onclick="toggleUrlInput()" id="header-new-btn">
        <span class="material-symbols-outlined">add_circle</span> New Project
      </button>
    </div>

    <!-- URL Input -->
    <div class="url-input-section" id="url-input-section">
      <div id="backend-badge" class="backend-badge offline">
        <span class="material-symbols-outlined">cloud_off</span> Backend Offline (Demo Mode)
      </div>
      <h3>🎬 Paste a YouTube or Twitch URL to get started</h3>
      <div class="url-row">
        <input type="url" id="video-url-input" placeholder="https://youtube.com/watch?v=…"/>
        <button class="btn-primary" onclick="processUrl()" id="process-url-btn">Generate Clips</button>
      </div>
      <p style="color:var(--text-muted);font-size:0.78rem;margin-top:0.75rem">
        ⚠️ Full AI processing requires the backend server + FFmpeg + yt-dlp installed.
        <a href="#" onclick="showToast('See README.md for setup instructions','info')" style="color:var(--primary)">Setup guide</a>
      </p>
    </div>

    <!-- Stats -->
    <div class="stats-grid">
      ${[
      { icon: 'folder_open', value: '24', label: 'Projects', change: '+12%', up: true },
      { icon: 'bolt', value: '142', label: 'Shorts', change: '+5%', up: true },
      { icon: 'visibility', value: '12.5k', label: 'Views', change: '+18%', up: true },
      { icon: 'database', value: '450', label: 'Credits', change: '-5%', up: false },
    ].map(s => `
        <div class="stat-card glass">
          <div class="stat-top">
            <span class="material-symbols-outlined">${s.icon}</span>
            <span class="stat-badge ${s.up ? 'up' : 'down'}">${s.change}</span>
          </div>
          <div class="stat-value">${s.value}</div>
          <div class="stat-label">${s.label}</div>
        </div>`).join('')}
    </div>

    <!-- Projects -->
    <div class="projects-header">
      <h2>Recent Projects</h2>
      <button class="view-all-btn" id="view-all-btn">View all <span class="material-symbols-outlined">arrow_forward</span></button>
    </div>
    <div class="projects-grid" id="projects-grid">
      ${projects.map(projectCard).join('')}
      <div class="add-project-card" onclick="toggleUrlInput()" id="add-project-card">
        <span class="material-symbols-outlined">add_circle_outline</span>
        <span class="label">New Project</span>
      </div>
    </div>
  </main>

  <!-- User menu (hidden by default) -->
  <div id="user-menu" style="display:none;position:fixed;top:4.5rem;right:1.5rem;z-index:500;
    background:#0e1117;border:1px solid rgba(255,255,255,0.1);border-radius:0.9rem;
    padding:0.5rem;min-width:13rem;box-shadow:0 16px 40px rgba(0,0,0,0.6)">
    <div style="padding:0.8rem 1rem;border-bottom:1px solid rgba(255,255,255,0.07);margin-bottom:0.4rem">
      <p style="font-weight:700;font-size:0.9rem">${currentUser?.name || 'User'}</p>
      <p style="color:var(--text-muted);font-size:0.75rem">${currentUser?.email || ''}</p>
    </div>
    <button onclick="closeUserMenu();navigate('dashboard')" style="width:100%;text-align:left;padding:0.7rem 1rem;background:none;border:none;color:var(--text);font-family:var(--font);font-size:0.88rem;cursor:pointer;border-radius:0.5rem;display:flex;gap:0.6rem;align-items:center" class="menu-item-hover">
      <span class="material-symbols-outlined" style="font-size:1.1rem">dashboard</span> Dashboard
    </button>
    <button onclick="closeUserMenu();showToast('Settings coming soon!','info')" style="width:100%;text-align:left;padding:0.7rem 1rem;background:none;border:none;color:var(--text);font-family:var(--font);font-size:0.88rem;cursor:pointer;border-radius:0.5rem;display:flex;gap:0.6rem;align-items:center">
      <span class="material-symbols-outlined" style="font-size:1.1rem">settings</span> Settings
    </button>
    <div style="height:1px;background:rgba(255,255,255,0.07);margin:0.4rem 0"></div>
    <button onclick="closeUserMenu();signOut()" style="width:100%;text-align:left;padding:0.7rem 1rem;background:none;border:none;color:#f43f5e;font-family:var(--font);font-size:0.88rem;cursor:pointer;border-radius:0.5rem;display:flex;gap:0.6rem;align-items:center">
      <span class="material-symbols-outlined" style="font-size:1.1rem">logout</span> Sign Out
    </button>
  </div>

  <nav class="dash-bottom-nav glass-nav">
    <button class="bottom-nav-item active" onclick="navigate('dashboard')"><span class="material-symbols-outlined">home</span>Home</button>
    <button class="bottom-nav-item"><span class="material-symbols-outlined">video_library</span>Library</button>
    <button class="bottom-nav-fab" onclick="toggleUrlInput()" id="fab-btn"><span class="material-symbols-outlined">add</span></button>
    <button class="bottom-nav-item"><span class="material-symbols-outlined">analytics</span>Stats</button>
    <button class="bottom-nav-item" onclick="openUserMenu()"><span class="material-symbols-outlined">person</span>Profile</button>
  </nav>
</div>`;
}

function openUserMenu() {
  const menu = document.getElementById('user-menu');
  if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}
function closeUserMenu() {
  const menu = document.getElementById('user-menu');
  if (menu) menu.style.display = 'none';
}

// ── Video Editor ──────────────────────────────────────────────
function renderEditor() {
  const s = editorState;
  const waveBars = [4, 8, 6, 10, 5, 9, 4, 7, 5, 8, 6, 10, 4, 7, 9, 5, 8, 6].map(
    h => `<div class="wave-bar" style="height:${h * 3}px"></div>`).join('');
  const project = projects.find(p => p.id === s.projectId) || projects[0];

  return `
<div class="page" id="page-editor">
  <nav class="editor-nav glass-panel">
    <div class="editor-nav-left">
      <button class="icon-btn" onclick="navigate('dashboard')" id="editor-back-btn" title="Back">
        <span class="material-symbols-outlined">arrow_back</span>
      </button>
      <div class="editor-nav-icon"><span class="material-symbols-outlined">movie_edit</span></div>
      <div>
        <h1 class="editor-nav-title">ClipForge <span>AI</span></h1>
        <p style="font-size:0.72rem;color:var(--text-muted);margin-top:1px">${project.title}</p>
      </div>
    </div>
    <div class="editor-nav-right">
      <div class="save-indicator saved" id="save-indicator">
        <span class="material-symbols-outlined">cloud_done</span> Saved
      </div>
      <button class="icon-btn" id="editor-settings-btn"><span class="material-symbols-outlined">settings</span></button>
      <button class="export-btn" id="export-btn" onclick="handleExport()">
        Export <span class="material-symbols-outlined">ios_share</span>
      </button>
    </div>
  </nav>

  <div class="editor-workspace">
    <section class="editor-preview">
      <div class="video-frame-wrap" id="video-frame">
        <div class="video-bg" style="background-image:url('${project.thumb}')"></div>
        <div class="video-gradient"></div>
        <div class="video-captions">
          <div class="caption-viral" id="caption-display">
            <span class="cap-v yellow">Making</span><span class="cap-v white">Viral</span>
            <span class="cap-v plain">Content easily!</span>
          </div>
        </div>
        <div class="video-controls-overlay">
          <button class="play-center-btn" id="play-center-btn" onclick="togglePlay()">
            <span class="material-symbols-outlined" id="play-icon">play_arrow</span>
          </button>
        </div>
      </div>
    </section>

    <aside class="editor-panel glass-panel">
      <div class="panel-tabs">
        <button class="panel-tab active" onclick="switchTab('edit')" id="tab-edit">Edit</button>
        <button class="panel-tab" onclick="switchTab('subtitles')" id="tab-subtitles">Subtitles</button>
        <button class="panel-tab" onclick="switchTab('style')" id="tab-style">Style</button>
      </div>
      <div class="panel-content" id="panel-content">

        <!-- Trim -->
        <div class="panel-section">
          <h3><span class="material-symbols-outlined">content_cut</span>Trim &amp; Segment<span class="panel-section-meta">00:12 / 00:45</span></h3>
          <div class="trim-bar">
            <div class="trim-selection"><div class="trim-handle left"></div><div class="trim-handle right"></div></div>
            <div class="waveform">${waveBars}</div>
          </div>
        </div>

        <!-- Subtitle Presets -->
        <div class="panel-section">
          <h3><span class="material-symbols-outlined">auto_awesome</span>Subtitle Presets</h3>
          <div class="preset-grid">
            ${[
      { id: 'viral-bold', label: 'Viral Bold', preview: `<span style="font-size:11px;font-weight:900;font-style:italic;background:#fff;color:#000;padding:1px 5px">WORD</span>` },
      { id: 'minimal', label: 'Minimal', preview: `<span style="font-size:10px;color:#fff">Classic text style</span>` },
      { id: 'neon-glow', label: 'Neon Glow', preview: `<span style="font-size:11px;font-weight:700;color:#00f2ff;text-shadow:0 0 8px rgba(0,242,255,0.6)">GLOW</span>` },
      { id: 'cinematic', label: 'Cinematic', preview: `<span style="font-size:8px;letter-spacing:0.2em;color:#fff;text-transform:uppercase;font-weight:300">Elegance</span>` },
    ].map(p => `
              <button class="preset-btn${s.preset === p.id ? ' selected' : ''}" id="preset-${p.id}" onclick="selectPreset('${p.id}')">
                <div class="preset-label ${s.preset === p.id ? 'active' : 'inactive'}">${p.label}</div>
                <div class="preset-preview">${p.preview}</div>
              </button>`).join('')}
          </div>
        </div>

        <!-- Text Styling -->
        <div class="panel-section" style="padding-bottom:3rem">
          <h3>Text Styling</h3>
          <div style="display:flex;flex-direction:column;gap:1.2rem">
            <div class="style-row">
              <span class="style-label">Font Family</span>
              <select class="style-select" id="font-select" onchange="changeFont(this.value)">
                ${['Inter Extra Bold', 'Montserrat', 'Bebas Neue', 'Roboto'].map(
      f => `<option${f === s.font ? ' selected' : ''}>${f}</option>`).join('')}
              </select>
            </div>
            <div class="style-row">
              <span class="style-label">Primary Color</span>
              <div class="color-options">
                ${[['#fbbf24', 'Yellow'], ['#397bf3', 'Blue'], ['#00f2ff', 'Neon'], ['#ffffff', 'White']].map(
        ([c, n]) => `<div class="color-swatch${s.color === c ? ' selected' : ''}" style="background:${c}"
                    onclick="selectColor(this,'${c}')" title="${n}"></div>`).join('')}
              </div>
            </div>
            <div class="toggle-row">
              <div class="toggle-info">
                <p>AI Animation</p><p>Smart word tracking</p>
              </div>
              <label class="toggle-switch" for="ai-anim-toggle">
                <input type="checkbox" id="ai-anim-toggle" ${s.aiAnim ? 'checked' : ''} onchange="toggleAiAnim(this)"/>
                <div class="toggle-track"><div class="toggle-thumb"></div></div>
              </label>
            </div>
          </div>
        </div>

      </div><!-- /panel-content -->
    </aside>
  </div>

  <footer class="editor-footer glass-panel">
    <button class="play-foote-btn" onclick="togglePlay()" id="footer-play-btn">
      <span class="material-symbols-outlined" id="footer-play-icon">play_circle</span>
    </button>
    <div class="progress-track" id="progress-track" onclick="scrubTo(event)">
      <div class="progress-fill" id="progress-fill" style="width:${s.progress}%"></div>
      <div class="progress-thumb" id="progress-thumb" style="left:${s.progress}%"></div>
    </div>
    <div class="time-display" id="time-display">00:18.4</div>
    <div class="footer-actions">
      <button class="footer-icon-btn" id="vol-btn"><span class="material-symbols-outlined">volume_up</span></button>
      <button class="footer-icon-btn" id="fs-btn"><span class="material-symbols-outlined">fullscreen</span></button>
    </div>
  </footer>
</div>`;
}

// ── Auth Modal HTML (static, always in DOM) ───────────────────
function renderAuthModal() {
  return `
<div class="auth-overlay hidden" id="auth-overlay" onclick="handleOverlayClick(event)">
  <div class="auth-modal" id="auth-modal">
    <button class="auth-close" onclick="closeAuth()" id="auth-close-btn">
      <span class="material-symbols-outlined">close</span>
    </button>
    <div class="auth-logo">
      <div class="auth-logo-icon"><span class="material-symbols-outlined">movie_filter</span></div>
      <span class="auth-logo-text">ClipForge AI</span>
    </div>
    <div id="auth-modal-body"></div>
  </div>
</div>`;
}

function handleOverlayClick(e) {
  if (e.target.id === 'auth-overlay') closeAuth();
}

// ── Build App ─────────────────────────────────────────────────
function buildApp() {
  loadSession();
  const app = document.getElementById('app');
  app.innerHTML = renderAuthModal() + renderLanding() + renderDashboard() + renderEditor();
  navigate('landing');
  if (currentUser) updateUIForUser();
  initDashboard();
  // Check backend status
  checkBackend();
  setInterval(checkBackend, 30000); // re-check every 30s
  // Close user menu on outside click
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('user-menu');
    const avatar = document.getElementById('user-avatar');
    if (menu && !menu.contains(e.target) && e.target !== avatar) {
      menu.style.display = 'none';
    }
  });
}

// ── Dashboard Logic ───────────────────────────────────────────
function toggleUrlInput() {
  const sec = document.getElementById('url-input-section');
  if (!sec) return;
  sec.classList.toggle('visible');
  if (sec.classList.contains('visible')) {
    setTimeout(() => document.getElementById('video-url-input')?.focus(), 100);
  }
}

async function processUrl() {
  const input = document.getElementById('video-url-input');
  const url = input?.value.trim();
  if (!url) { showToast('Please enter a valid URL', 'error'); return; }

  // Basic URL check
  if (!url.includes('youtube.com') && !url.includes('youtu.be') && !url.includes('twitch.tv')) {
    showToast('Please enter a YouTube or Twitch URL', 'error'); return;
  }

  const btn = document.getElementById('process-url-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Processing...'; }

  if (!backendOnline) {
    // Demo mode — mock processing
    showToast('🚀 Demo mode: simulating AI analysis…', 'info');
    toggleUrlInput();
    if (input) input.value = '';
    showProcessingModal(null, true);
    return;
  }

  // 1) Validate URL with backend
  try {
    showToast('🔍 Validating URL…', 'info');
    const infoRes = await fetch(`${API_BASE}/videos/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const infoData = await infoRes.json();
    if (!infoRes.ok) { showToast(infoData.error || 'Invalid URL', 'error'); return; }

    toggleUrlInput();
    if (input) input.value = '';
    if (btn) { btn.disabled = false; btn.textContent = 'Generate Clips'; }

    showToast(`📹 Got it: "${infoData.info.title}" (${infoData.info.durationStr})`, 'success');

    // 2) Start processing
    const processRes = await fetch(`${API_BASE}/videos/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, userId: currentUser?.email || 'anonymous' }),
    });
    const processData = await processRes.json();
    if (!processRes.ok) { showToast(processData.error, 'error'); return; }

    // 3) Listen to SSE progress
    showProcessingModal(processData.projectId, false);

  } catch (err) {
    showToast('Backend error: ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Generate Clips'; }
  }
}

function showProcessingModal(projectId, isDemoMode) {
  // Remove existing
  document.getElementById('processing-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'processing-modal';
  modal.style.cssText = `position:fixed;inset:0;z-index:2000;display:flex;align-items:center;
    justify-content:center;background:rgba(0,0,0,0.8);backdrop-filter:blur(8px);padding:1rem`;
  modal.innerHTML = `
    <div style="background:#0e1117;border:1px solid rgba(255,255,255,0.1);border-radius:1.25rem;
      padding:2.5rem;width:100%;max-width:28rem;text-align:center">
      <div style="width:4rem;height:4rem;border-radius:50%;background:rgba(57,123,243,0.15);
        border:3px solid var(--primary);display:flex;align-items:center;justify-content:center;
        margin:0 auto 1.5rem;animation:spin 1.5s linear infinite">
        <span class="material-symbols-outlined" style="font-size:1.8rem;color:var(--primary)">movie_filter</span>
      </div>
      <h3 style="font-size:1.15rem;font-weight:700;margin-bottom:0.5rem" id="pm-title">AI Analyzing Your Video</h3>
      <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:1.5rem" id="pm-msg">
        ${isDemoMode ? 'Running in demo mode...' : 'Downloading and analyzing...'}
      </p>
      <div style="background:rgba(255,255,255,0.06);border-radius:9999px;height:8px;overflow:hidden">
        <div id="pm-bar" style="height:100%;background:var(--primary);border-radius:9999px;width:0%;
          transition:width 0.5s ease"></div>
      </div>
      <p style="color:var(--text-muted);font-size:0.75rem;margin-top:0.75rem" id="pm-pct">0%</p>
      <div id="pm-steps" style="margin-top:1rem;text-align:left;font-size:0.8rem;color:var(--text-muted)"></div>
      <button onclick="document.getElementById('processing-modal').remove()" id="pm-cancel"
        style="margin-top:1.5rem;background:none;border:1px solid rgba(255,255,255,0.1);
        border-radius:0.5rem;padding:0.5rem 1.5rem;color:var(--text-muted);cursor:pointer;
        font-family:var(--font)">
        Cancel
      </button>
    </div>`;

  document.body.appendChild(modal);

  const bar = document.getElementById('pm-bar');
  const msg = document.getElementById('pm-msg');
  const pct = document.getElementById('pm-pct');
  const steps = document.getElementById('pm-steps');
  const completedSteps = [];

  function setProgress(p, m) {
    if (bar) bar.style.width = p + '%';
    if (pct) pct.textContent = Math.round(p) + '%';
    if (msg) msg.textContent = m;
    if (m && !completedSteps.includes(m)) {
      completedSteps.push(m);
      if (steps && completedSteps.length <= 6) {
        steps.innerHTML += `<div style="margin-bottom:4px;opacity:0.7">✓ ${m}</div>`;
      }
    }
  }

  if (isDemoMode) {
    // Simulate progress
    const fakeMsgs = [
      [5, 'Downloading video...'],
      [20, 'Extracting audio...'],
      [40, 'Transcribing with Whisper AI...'],
      [62, 'Detecting viral hooks with GPT-4...'],
      [80, 'Generating captions...'],
      [95, 'Ranking clips by virality...'],
      [100, 'Analysis complete!'],
    ];
    let i = 0;
    const fakeTimer = setInterval(() => {
      if (i >= fakeMsgs.length) {
        clearInterval(fakeTimer);
        setTimeout(() => { modal.remove(); navigate('editor'); }, 800);
        return;
      }
      setProgress(fakeMsgs[i][0], fakeMsgs[i][1]);
      i++;
    }, 900);
    return;
  }

  // Real SSE progress
  const evtSource = new EventSource(`${API_BASE}/videos/progress/${projectId}`);
  evtSource.onmessage = (e) => {
    const data = JSON.parse(e.data);
    setProgress(data.progress || 0, data.msg || '');
    if (data.status === 'completed') {
      evtSource.close();
      setTimeout(() => {
        modal.remove();
        if (data.clips) loadProjectIntoEditor(projectId, data.clips);
        else navigate('dashboard');
        showToast(`🎯 Found ${data.clips?.length || 0} viral clips!`, 'success');
      }, 1000);
    }
    if (data.status === 'error') {
      evtSource.close();
      document.getElementById('pm-title').textContent = '❌ Processing Failed';
      if (msg) msg.textContent = data.msg;
    }
  };
  evtSource.onerror = () => evtSource.close();
}

function loadProjectIntoEditor(projectId, clips) {
  editorState.projectId = projectId;
  editorState.backendProjectId = projectId;
  autoSave();
  navigate('editor');
  // Populate clips panel
  showToast(`🎬 Loading ${clips.length} clips into editor...`, 'success');
}

async function exportClip(projectId, clipId) {
  if (!backendOnline) { showToast('Export requires backend server', 'error'); return; }
  try {
    await fetch(`${API_BASE}/videos/${projectId}/clips/${clipId}/export`, { method: 'POST' });
    showToast('🎬 Exporting clip in background...', 'info');
  } catch (e) {
    showToast('Export failed: ' + e.message, 'error');
  }
}

function filterProjects(q) {
  const grid = document.getElementById('projects-grid');
  if (!grid) return;
  const query = q.toLowerCase();
  grid.querySelectorAll('.project-card').forEach(card => {
    const title = card.querySelector('h3')?.textContent.toLowerCase() || '';
    card.style.display = title.includes(query) ? '' : 'none';
  });
}

function initDashboard() {
  setInterval(() => {
    const bar = document.querySelector('.progress-bar');
    if (bar && currentPage === 'dashboard') {
      let w = parseFloat(bar.style.width) || 64;
      if (w < 99) {
        w = Math.min(w + 0.3, 99);
        bar.style.width = w + '%';
        const label = bar.closest('.project-card')?.querySelector('.processing-overlay span');
        if (label) label.textContent = `Processing ${Math.round(w)}%`;
      }
    }
  }, 800);
}

// ── Editor Logic ──────────────────────────────────────────────
let isPlaying = false;
let playProgress = editorState.progress || 40;
let playInterval = null;

function togglePlay() {
  isPlaying = !isPlaying;
  const icons = [document.getElementById('play-icon'), document.getElementById('footer-play-icon')];
  icons.forEach(ic => { if (ic) ic.textContent = isPlaying ? 'pause' : (ic.id === 'play-icon' ? 'play_arrow' : 'play_circle'); });
  if (isPlaying) {
    playInterval = setInterval(() => {
      playProgress = (playProgress + 0.5) % 100;
      editorState.progress = Math.round(playProgress);
      updateProgress();
    }, 150);
  } else {
    clearInterval(playInterval);
    markUnsaved();
  }
}

function updateProgress() {
  const fill = document.getElementById('progress-fill');
  const thumb = document.getElementById('progress-thumb');
  const time = document.getElementById('time-display');
  if (fill) fill.style.width = playProgress + '%';
  if (thumb) thumb.style.left = playProgress + '%';
  if (time) {
    const secs = Math.round((playProgress / 100) * 45);
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toFixed(1).padStart(4, '0');
    time.textContent = `${m}:${s}`;
  }
}

function scrubTo(e) {
  const track = document.getElementById('progress-track');
  if (!track) return;
  const rect = track.getBoundingClientRect();
  playProgress = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
  editorState.progress = Math.round(playProgress);
  updateProgress();
  markUnsaved();
}

function switchTab(tab) {
  document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
  const active = document.getElementById('tab-' + tab);
  if (active) active.classList.add('active');
}

function selectPreset(id) {
  document.querySelectorAll('.preset-btn').forEach(b => {
    b.classList.remove('selected');
    b.querySelector('.preset-label')?.classList.replace('active', 'inactive');
  });
  const btn = document.getElementById('preset-' + id);
  if (btn) {
    btn.classList.add('selected');
    btn.querySelector('.preset-label')?.classList.replace('inactive', 'active');
  }
  editorState.preset = id;
  markUnsaved();
}

function selectColor(el, hex) {
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
  editorState.color = hex;
  markUnsaved();
}

function changeFont(val) {
  editorState.font = val;
  markUnsaved();
}

function toggleAiAnim(checkbox) {
  editorState.aiAnim = checkbox.checked;
  showToast(checkbox.checked ? '✨ AI Animation enabled' : 'AI Animation disabled', 'info');
  markUnsaved();
}

function handleExport() {
  showToast('🎬 Exporting your clip…', 'success');
  autoSave();
  setTimeout(() => showToast('✅ Export complete! Ready to download.', 'success'), 2000);
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const existing = document.getElementById('toast');
  if (existing) existing.remove();
  const colors = { success: '#10b981', error: '#f43f5e', info: '#397bf3' };
  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.textContent = msg;
  Object.assign(toast.style, {
    position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%) translateY(10px)',
    background: colors[type] || colors.info, color: '#fff',
    padding: '0.8rem 1.5rem', borderRadius: '0.75rem',
    fontFamily: 'Inter, sans-serif', fontWeight: '600', fontSize: '0.9rem',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    zIndex: '9999', opacity: '0',
    transition: 'opacity 0.3s, transform 0.3s', whiteSpace: 'nowrap', maxWidth: '90vw',
    textAlign: 'center'
  });
  document.body.appendChild(toast);
  requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateX(-50%) translateY(0)'; });
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 2800);
}

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', buildApp);
