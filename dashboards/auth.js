/**
 * ============================================================================
 * 1LIFE SECURITY & GOOGLE WORKSPACE AUTHENTICATION GATEWAY
 * dashboards/auth.js
 * 
 * Enforces strict @1life.ph Google Account access.
 * Stores authenticated user and prompts for Position / Role.
 * ============================================================================
 */

// Known 1Life QA Team Directory with default roles
window.ONE_LIFE_TEAM_DIRECTORY = {
    'armorales@1life.ph': { name: 'Arabella Morales', role: 'QA Specialist', initials: 'AM' },
    'jtcanaway@1life.ph': { name: 'Janryl Jay Canaway', role: 'QA Specialist', initials: 'JC' },
    'jofrancisco@1life.ph': { name: 'John Michael Francisco', role: 'QA Specialist', initials: 'JF' },
    'jrdayag@1life.ph': { name: 'Julius Rod Dayag', role: 'QA Specialist', initials: 'JD' },
    'ynlao@1life.ph': { name: 'Yesha Nicholai Lao', role: 'QA Specialist', initials: 'YL' }
};

window.current1LifeUser = {
    email: '',
    name: '1Life QA User',
    position: 'QA Specialist',
    role: 'QA Specialist',
    initials: '1L',
    verified_hd: '',
    auth_provider: ''
};

/**
 * Validates whether an email belongs to the 1life.ph Google Workspace
 */
function is1LifeEmail(email) {
    if (!email) return false;
    const clean = String(email).trim().toLowerCase();
    return clean.endsWith('@1life.ph');
}

/**
 * Initialize 1Life Authentication on page load
 */
function init1LifeAuth() {
    let authUser = null;

    // 1. Check if running inside Google Apps Script Web App
    if (window.APPS_SCRIPT_USER && is1LifeEmail(window.APPS_SCRIPT_USER.email)) {
        authUser = window.APPS_SCRIPT_USER;
        authUser.auth_provider = 'google_apps_script';
        authUser.verified_hd = '1life.ph';
    }

    // 2. Check localStorage for persisted Google @1life.ph session
    if (!authUser) {
        try {
            const raw = localStorage.getItem('1life_auth_user');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && is1LifeEmail(parsed.email)) {
                    authUser = parsed;
                }
            }
        } catch (e) {
            console.warn('Failed to parse 1life_auth_user:', e);
        }
    }

    if (authUser) {
        window.current1LifeUser = {
            email: authUser.email,
            name: authUser.name || authUser.email.split('@')[0],
            position: authUser.position || authUser.role || 'QA Specialist',
            role: authUser.position || authUser.role || 'QA Specialist',
            initials: authUser.initials || getInitials(authUser.name || authUser.email),
            picture: authUser.picture || '',
            verified_hd: '1life.ph',
            auth_provider: authUser.auth_provider || 'google_workspace'
        };

        // If position is not explicitly set or empty, prompt for position
        if (!authUser.position || authUser.position === 'Unassigned') {
            promptForUserPosition(window.current1LifeUser);
        }

        apply1LifeUserProfileUI();
        hide1LifeLoginModal();
    } else {
        // Block dashboard access and display login gate
        show1LifeLoginModal();
    }
}

/**
 * Helper to compute user initials
 */
function getInitials(name) {
    if (!name) return '1L';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
}

/**
 * Displays the 1Life Login Modal / Gate
 */
function show1LifeLoginModal() {
    const modal = document.getElementById('one-life-auth-modal');
    if (modal) modal.classList.remove('hidden');
    const dock = document.getElementById('floating-user-dock');
    if (dock) dock.classList.add('hidden');
}

/**
 * Hides the 1Life Login Modal / Gate
 */
function hide1LifeLoginModal() {
    const modal = document.getElementById('one-life-auth-modal');
    if (modal) modal.classList.add('hidden');
    const dock = document.getElementById('floating-user-dock');
    if (dock) dock.classList.remove('hidden');
}

/**
 * Applies the current user profile to header, user dock, and settings
 */
function apply1LifeUserProfileUI() {
    const u = window.current1LifeUser;
    if (!u || !u.email) return;

    // Floating User Dock
    const nameEls = document.querySelectorAll('#sidebar-user-name');
    nameEls.forEach(el => el.textContent = u.name);

    const roleEls = document.querySelectorAll('#sidebar-user-role');
    roleEls.forEach(el => el.textContent = `${u.position || u.role} • 1Life`);

    const initialsEls = document.querySelectorAll('#sidebar-user-initials');
    initialsEls.forEach(el => el.textContent = u.initials);

    // Settings Modal
    const settingsEmail = document.getElementById('settings-profile-email');
    if (settingsEmail) settingsEmail.textContent = u.email;

    const settingsRole = document.getElementById('settings-profile-role');
    if (settingsRole) settingsRole.textContent = u.position || u.role;

    const settingsName = document.getElementById('settings-profile-name');
    if (settingsName) settingsName.textContent = u.name;

    const settingsInitials = document.getElementById('settings-profile-initials');
    if (settingsInitials) settingsInitials.textContent = u.initials;
}

/**
 * Completes sign-in with a verified 1Life account
 */
function complete1LifeLogin(email, name, picture = '') {
    if (!is1LifeEmail(email)) {
        showAuthError(`Access Denied: ${email} is not a valid @1life.ph Google account. Please use your official 1Life company account.`);
        return false;
    }

    const cleanEmail = email.trim().toLowerCase();
    const known = window.ONE_LIFE_TEAM_DIRECTORY[cleanEmail];
    const displayName = name || (known ? known.name : cleanEmail.split('@')[0]);
    const savedPosition = known ? known.role : 'QA Specialist';

    const userObj = {
        email: cleanEmail,
        name: displayName,
        position: savedPosition,
        role: savedPosition,
        initials: getInitials(displayName),
        picture: picture || '',
        verified_hd: '1life.ph',
        auth_provider: 'google_workspace',
        logged_in_at: new Date().toISOString()
    };

    window.current1LifeUser = userObj;
    localStorage.setItem('1life_auth_user', JSON.stringify(userObj));

    hide1LifeLoginModal();
    apply1LifeUserProfileUI();

    // Ask for position if not customized
    promptForUserPosition(userObj);

    if (typeof showNotification === 'function') {
        showNotification(`Welcome, ${displayName}! Logged in as ${cleanEmail}`, 'success');
    }
    return true;
}

/**
 * Displays error message in auth modal
 */
function showAuthError(msg) {
    const errEl = document.getElementById('auth-error-msg');
    if (errEl) {
        errEl.textContent = msg;
        errEl.classList.remove('hidden');
    }
}

/**
 * Handles Position Setup Modal / Prompt
 */
function promptForUserPosition(userObj) {
    let modal = document.getElementById('position-setup-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'position-setup-modal';
        modal.className = 'fixed inset-0 z-[110] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="w-full max-w-md bg-white dark:bg-[#0e272c] border border-teal-300/60 dark:border-teal-500/30 rounded-2xl shadow-2xl overflow-hidden text-slate-900 dark:text-white">
                <div class="p-5 bg-gradient-to-r from-[#0d2226] via-[#14353c] to-[#1c444d] text-white border-b border-teal-500/30">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00b4d8] to-[#0d9488] flex items-center justify-center font-bold text-white shadow-md">
                            1L
                        </div>
                        <div>
                            <h3 class="text-base font-extrabold text-white">Select Your Position</h3>
                            <p class="text-xs text-teal-200">1Life Data Analytics & Quality Assurance</p>
                        </div>
                    </div>
                </div>
                <div class="p-6 space-y-4">
                    <p class="text-xs text-slate-600 dark:text-slate-300">
                        Welcome, <strong id="pos-user-name" class="text-slate-900 dark:text-white">${escapeHtml(userObj.name)}</strong> (<span class="font-mono text-[#00b4d8]">${escapeHtml(userObj.email)}</span>)! Please confirm your position or role for reports attribution:
                    </p>
                    <div>
                        <label class="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Position / Job Title</label>
                        <select id="user-position-select" onchange="onPositionSelectChange(this.value)" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#123036] border border-slate-300 dark:border-teal-500/30 text-xs font-semibold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00b4d8]">
                            <option value="QA Specialist">QA Specialist</option>
                            <option value="Senior QA Analyst">Senior QA Analyst</option>
                            <option value="Data & Analytics QA">Data & Analytics QA</option>
                            <option value="QA Lead / Supervisor">QA Lead / Supervisor</option>
                            <option value="Operational QA Analyst">Operational QA Analyst</option>
                            <option value="IT Systems QA Analyst">IT Systems QA Analyst</option>
                            <option value="__custom__">Other (Custom Title)...</option>
                        </select>
                        <input type="text" id="user-position-custom" placeholder="Type your custom position..." class="hidden mt-2 w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#123036] border border-slate-300 dark:border-teal-500/30 text-xs font-semibold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00b4d8]">
                    </div>
                    <div class="pt-2 flex items-center justify-end gap-2">
                        <button type="button" onclick="saveUserPosition()" class="w-full py-2.5 px-4 rounded-xl bg-[#00b4d8] hover:bg-[#0096c7] text-white font-bold text-xs shadow-md transition">
                            Save Position & Continue
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    } else {
        const nameEl = document.getElementById('pos-user-name');
        if (nameEl) nameEl.textContent = userObj.name;
        modal.classList.remove('hidden');
    }

    const selectEl = document.getElementById('user-position-select');
    if (selectEl && userObj.position) {
        let found = false;
        for (let opt of selectEl.options) {
            if (opt.value === userObj.position) {
                selectEl.value = userObj.position;
                found = true;
                break;
            }
        }
        if (!found && userObj.position !== 'QA Specialist') {
            selectEl.value = '__custom__';
            const customInput = document.getElementById('user-position-custom');
            if (customInput) {
                customInput.value = userObj.position;
                customInput.classList.remove('hidden');
            }
        }
    }
}

/**
 * Handle position dropdown change
 */
function onPositionSelectChange(val) {
    const customInput = document.getElementById('user-position-custom');
    if (customInput) {
        if (val === '__custom__') {
            customInput.classList.remove('hidden');
            customInput.focus();
        } else {
            customInput.classList.add('hidden');
        }
    }
}

/**
 * Save user position into localStorage and update profile
 */
function saveUserPosition() {
    const selectEl = document.getElementById('user-position-select');
    const customInput = document.getElementById('user-position-custom');
    let pos = selectEl ? selectEl.value : 'QA Specialist';
    if (pos === '__custom__' && customInput && customInput.value.trim()) {
        pos = customInput.value.trim();
    }

    if (window.current1LifeUser) {
        window.current1LifeUser.position = pos;
        window.current1LifeUser.role = pos;
        localStorage.setItem('1life_auth_user', JSON.stringify(window.current1LifeUser));
        apply1LifeUserProfileUI();
    }

    const modal = document.getElementById('position-setup-modal');
    if (modal) modal.classList.add('hidden');

    if (typeof showNotification === 'function') {
        showNotification(`Position saved: ${pos}`, 'success');
    }
}

/**
 * Sign out / switch account
 */
function handle1LifeLogout() {
    localStorage.removeItem('1life_auth_user');
    window.current1LifeUser = {
        email: '',
        name: '1Life QA User',
        position: 'QA Specialist',
        role: 'QA Specialist',
        initials: '1L',
        verified_hd: '',
        auth_provider: ''
    };
    apply1LifeUserProfileUI();
    show1LifeLoginModal();
    if (typeof showNotification === 'function') {
        showNotification('Signed out from 1Life QA Dashboard', 'info');
    }
}

/**
 * Trigger official Google OAuth 2.0 flow or team fast selector
 */
function trigger1LifeGoogleSignIn() {
    const errEl = document.getElementById('auth-error-msg');
    if (errEl) errEl.classList.add('hidden');

    // 1. If Google Identity Services is available and client ID configured
    const clientId = typeof getGoogleOAuthClientId === 'function' ? getGoogleOAuthClientId() : '';
    if (clientId && window.google && google.accounts && google.accounts.oauth2) {
        try {
            const tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: 'openid email profile',
                hd: '1life.ph',
                prompt: 'select_account',
                callback: async (tokenResponse) => {
                    if (tokenResponse.error || !tokenResponse.access_token) {
                        showAuthError(`Google Auth Error: ${tokenResponse.error_description || tokenResponse.error || 'Authentication cancelled'}`);
                        return;
                    }
                    try {
                        const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                            headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
                        });
                        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                        const userinfo = await resp.json();
                        complete1LifeLogin(userinfo.email, userinfo.name, userinfo.picture);
                    } catch (err) {
                        showAuthError(`Failed to fetch Google profile: ${err.message}`);
                    }
                }
            });
            tokenClient.requestAccessToken();
            return;
        } catch (e) {
            console.warn('Google Token Client init failed:', e);
        }
    }

    // 2. Direct @1life.ph Team Selector / Input Fallback
    const directBox = document.getElementById('direct-1life-login-box');
    if (directBox) {
        directBox.classList.remove('hidden');
    }
}

function handleDirect1LifeSubmit() {
    const input = document.getElementById('direct-1life-email');
    const email = input ? input.value.trim().toLowerCase() : '';
    if (!email) {
        showAuthError('Please enter your @1life.ph email address.');
        return;
    }
    if (!is1LifeEmail(email)) {
        showAuthError('Access Denied: Only Google accounts ending with @1life.ph are permitted.');
        return;
    }
    complete1LifeLogin(email);
}

// Expose globally on window
window.is1LifeEmail = is1LifeEmail;
window.init1LifeAuth = init1LifeAuth;
window.show1LifeLoginModal = show1LifeLoginModal;
window.hide1LifeLoginModal = hide1LifeLoginModal;
window.apply1LifeUserProfileUI = apply1LifeUserProfileUI;
window.complete1LifeLogin = complete1LifeLogin;
window.promptForUserPosition = promptForUserPosition;
window.saveUserPosition = saveUserPosition;
window.onPositionSelectChange = onPositionSelectChange;
window.handle1LifeLogout = handle1LifeLogout;
window.trigger1LifeGoogleSignIn = trigger1LifeGoogleSignIn;
window.handleDirect1LifeSubmit = handleDirect1LifeSubmit;
