const AUTO_REFRESH_INTERVAL = 15000;
const NO_TAG_FILTER_VALUE = "__NO_TAG__";
const MOBILE_LAYOUT_BREAKPOINT = 980;
const DEFAULT_LOG_PAGE_SIZE = 10;

const state = {
    token: localStorage.getItem("mail_manager_token") || "",
    accounts: [],
    selectedAccountId: null,
    tagModalAccountId: null,
    tagModalReturnFocus: null,
    remarkModalAccountId: null,
    remarkModalReturnFocus: null,
    selectedFolder: "inbox",
    mails: [],
    selectedMailId: null,
    loadedMailAccountId: null,
    loadedMailFolder: null,
    mailLoadRequestId: 0,
    mailLoadInFlight: false,
    mailListEmptyText: "请选择一个邮箱账号后查看邮件",
    mailDetailEmptyText: "请选择一封邮件查看内容",
    autoRefreshEnabled: false,
    accountRefreshTimer: null,
    mailRefreshTimer: null,
    tokenRefreshLogs: [],
    logsPagination: {
        page: 1,
        pageSize: DEFAULT_LOG_PAGE_SIZE,
        total: 0,
        totalPages: 1
    },
    tokenRefreshTaskRunning: false,
    currentView: "accounts",
    mobileMailStep: "accounts"
};

const elements = {
    accountCount: document.getElementById("account-count"),
    accountFilterSummary: document.getElementById("account-filter-summary"),
    accountList: document.getElementById("account-list"),
    accountMessage: document.getElementById("account-message"),
    autoRefreshState: document.getElementById("auto-refresh-state"),
    copyMailAddressBtn: document.getElementById("copy-mail-address-btn"),
    exportAccountsBtn: document.getElementById("export-accounts-btn"),
    importBtn: document.getElementById("import-btn"),
    importInput: document.getElementById("import-input"),
    importMessage: document.getElementById("import-message"),
    logoutBtn: document.getElementById("logout-btn"),
    mailAccountList: document.getElementById("mail-account-list"),
    mailDetail: document.getElementById("mail-detail"),
    mailFilterSummary: document.getElementById("mail-filter-summary"),
    mailList: document.getElementById("mail-list"),
    mailMessage: document.getElementById("mail-message"),
    mailPanelTitle: document.getElementById("mail-panel-title"),
    mailSearchInput: document.getElementById("mail-search-input"),
    mailStepButtons: Array.from(document.querySelectorAll("[data-mail-step-target]")),
    mailStepPanels: Array.from(document.querySelectorAll("[data-mail-step]")),
    mailTagFilter: document.getElementById("mail-tag-filter"),
    menuItems: Array.from(document.querySelectorAll(".menu-item")),
    mobileMailSteps: document.querySelector(".mobile-mail-steps"),
    openMailsBtn: document.getElementById("open-mails-btn"),
    refreshAccountsBtn: document.getElementById("refresh-accounts-btn"),
    refreshLogList: document.getElementById("refresh-log-list"),
    refreshLogMessage: document.getElementById("refresh-log-message"),
    refreshLogPage: document.getElementById("refresh-log-page"),
    refreshLogPaginationSummary: document.getElementById("refresh-log-pagination-summary"),
    refreshLogPageSize: document.getElementById("refresh-log-page-size"),
    refreshLogRunBtn: document.getElementById("refresh-log-run-btn"),
    remarkInput: document.getElementById("remark-input"),
    saveTagsBtn: document.getElementById("save-tags-btn"),
    saveRemarkBtn: document.getElementById("save-remark-btn"),
    searchInput: document.getElementById("search-input"),
    tagFilter: document.getElementById("tag-filter"),
    selectedRemark: document.getElementById("selected-remark"),
    selectedEmail: document.getElementById("selected-email"),
    remarkModal: document.getElementById("remark-modal"),
    remarkModalBackdrop: document.getElementById("remark-modal-backdrop"),
    remarkModalCancelBtn: document.getElementById("remark-modal-cancel-btn"),
    remarkModalCloseBtn: document.getElementById("remark-modal-close-btn"),
    remarkModalCurrent: document.getElementById("remark-modal-current"),
    remarkModalEmail: document.getElementById("remark-modal-email"),
    remarkModalInput: document.getElementById("remark-modal-input"),
    remarkModalMessage: document.getElementById("remark-modal-message"),
    remarkModalSaveBtn: document.getElementById("remark-modal-save-btn"),
    tagModal: document.getElementById("tag-modal"),
    tagModalBackdrop: document.getElementById("tag-modal-backdrop"),
    tagModalCancelBtn: document.getElementById("tag-modal-cancel-btn"),
    tagModalCloseBtn: document.getElementById("tag-modal-close-btn"),
    tagModalCurrentTags: document.getElementById("tag-modal-current-tags"),
    tagModalEmail: document.getElementById("tag-modal-email"),
    tagModalInput: document.getElementById("tag-modal-input"),
    tagModalMessage: document.getElementById("tag-modal-message"),
    tagModalPreview: document.getElementById("tag-modal-preview"),
    tagModalSuggestions: document.getElementById("tag-modal-suggestions"),
    tagModalSaveBtn: document.getElementById("tag-modal-save-btn"),
    tabs: Array.from(document.querySelectorAll(".tab")),
    tagsInput: document.getElementById("tags-input"),
    mailAccountRemark: document.getElementById("mail-account-remark"),
    toggleAutoRefreshBtn: document.getElementById("toggle-auto-refresh-btn"),
    viewPanels: Array.from(document.querySelectorAll(".view-panel")),
    viewTitle: document.getElementById("view-title")
};

const text = {
    accountsTitle: "账号管理",
    mailsTitle: "邮件查看",
    noMatchingAccounts: "暂无符合条件的邮箱账号",
    noTags: "暂无标签",
    accountCount: (count) => `${count} 个账号`,
    visibleAccountCount: (visible, total) => `当前显示 ${visible} / 总计 ${total} 个邮箱`,
    chooseMailList: "请选择一个邮箱账号后查看邮件",
    emptyMailList: "当前文件夹暂无邮件",
    emptyMailDetail: "请选择一封邮件查看内容",
    noSubject: "无主题",
    noContent: "暂无内容",
    loginExpired: "登录已失效，请重新登录",
    requestFailed: "请求失败",
    autoRefreshOff: "未开启自动刷新",
    autoRefreshOn: "已开启 15 秒自动刷新",
    enableAutoRefresh: "开启自动刷新",
    disableAutoRefresh: "关闭自动刷新",
    autoRefreshEnabledHint: "已开启自动刷新",
    autoRefreshDisabledHint: "已关闭自动刷新",
    loadingMails: "正在加载邮件...",
    loadedMails: (count) => `已加载 ${count} 封邮件`,
    selectedAccountHint: "已选中账号，可以维护标签或查看邮件",
    chooseAccountFirst: "请先选择邮箱账号",
    importInputRequired: "请先粘贴导入内容",
    importFinished: (data) => `导入完成：新增 ${data.inserted}，更新 ${data.updated}，跳过 ${data.skipped}`,
    exportingAccounts: "正在导出账号...",
    exportAccountsSuccess: "账号导出成功，文件已开始下载",
    saveTagsSuccess: "标签保存成功",
    promptTagsTitle: "请输入标签，多个标签请用逗号分隔",
    tagPreviewEmpty: "输入后会在这里实时预览标签效果",
    tagCurrentEmpty: "当前还没有标签",
    savingTags: "保存中...",
    copyMailAddressSuccess: "邮箱地址已复制",
    copyMailAddressUnavailable: "当前没有可复制的邮箱地址"
};

if (!state.token) {
    window.location.href = "/";
}

const EMPTY_REMARK_TEXT = "暂无备注";
const SAVE_REMARK_SUCCESS_TEXT = "备注保存成功";
const LOG_PAGE_SIZE_OPTIONS = [10, 30, 50];

Object.assign(text, {
    logsTitle: "刷新日志",
    refreshLogsRun: "手动触发任务",
    refreshLogsRunning: "任务执行中...",
    refreshLogsEmpty: "暂无刷新日志",
    refreshLogsLoaded: (total) => `共 ${total} 条日志`,
    refreshLogsTriggerSuccess: (success, total) => `任务完成：刷新成功 ${success}/${total}`,
    refreshLogsTriggerQueued: "刷新任务已开始，正在后台执行",
    refreshLogsFailureNone: "失败账号：无",
    refreshLogsExecutionTime: "执行时间",
    refreshLogsDuration: "耗时",
    refreshLogsManual: "手动触发",
    refreshLogsScheduled: "定时任务",
    refreshLogsPageSummary: (page, totalPages, total) => `第 ${page}/${totalPages} 页，共 ${total} 条`,
    refreshLogsSuccessSummary: (success, total) => `刷新成功 ${success}/${total}`,
    refreshLogsLoading: "正在加载日志...",
    refreshLogsRunHint: "点击后会立即遍历全部邮箱并执行一次收件箱刷新"
});

text.refreshLogsPreview = "Preview HTML";

async function api(path, options = {}) {
    const response = await fetch(path, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            "X-Token": state.token,
            ...(options.headers || {})
        }
    });

    if (response.status === 401) {
        localStorage.removeItem("mail_manager_token");
        window.location.href = "/";
        throw new Error(text.loginExpired);
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.detail || text.requestFailed);
    }
    return data;
}

function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value ?? "";
    return div.innerHTML;
}

function decodeHtmlEntities(value) {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = value;
    return textarea.value;
}

function looksLikeEscapedHtml(value) {
    const sample = value.trim().toLowerCase();
    return [
        "&lt;!doctype",
        "&lt;html",
        "&lt;body",
        "&lt;table",
        "&lt;div",
        "&lt;section",
        "&lt;p"
    ].some((marker) => sample.includes(marker));
}

function extractPreContent(value) {
    const match = value.match(/^<pre[^>]*>([\s\S]*)<\/pre>$/i);
    return match ? match[1] : "";
}

function getSelectedAccount() {
    return state.accounts.find((account) => account.id === state.selectedAccountId) || null;
}

function isMobileLayout() {
    return window.innerWidth <= MOBILE_LAYOUT_BREAKPOINT;
}

function getMailId(value) {
    if (value === null || value === undefined) {
        return null;
    }

    return String(value);
}

function padNumber(value) {
    return String(value).padStart(2, "0");
}

function formatDateTime(timestamp) {
    if (!timestamp) {
        return "-";
    }

    const date = new Date(Number(timestamp) * 1000);
    if (Number.isNaN(date.getTime())) {
        return "-";
    }

    return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())} ${padNumber(date.getHours())}:${padNumber(date.getMinutes())}:${padNumber(date.getSeconds())}`;
}

function formatDuration(seconds) {
    const totalSeconds = Number(seconds) || 0;
    if (totalSeconds < 60) {
        return `${totalSeconds}s`;
    }

    const minutes = Math.floor(totalSeconds / 60);
    const remainSeconds = totalSeconds % 60;
    if (minutes < 60) {
        return remainSeconds ? `${minutes}m ${remainSeconds}s` : `${minutes}m`;
    }

    const hours = Math.floor(minutes / 60);
    const remainMinutes = minutes % 60;
    if (!remainMinutes && !remainSeconds) {
        return `${hours}h`;
    }

    return `${hours}h ${remainMinutes}m ${remainSeconds}s`;
}

function parseTags(value) {
    return (value || "")
        .split(/[，,]/)
        .map((tag) => tag.trim())
        .filter(Boolean);
}

function normalizeTags(value) {
    return parseTags(value).join(", ");
}

function renderTagMarkup(value, emptyText = text.noTags, className = "tag") {
    const tags = parseTags(value);
    if (!tags.length) {
        return `<span class="muted">${escapeHtml(emptyText)}</span>`;
    }

    return tags.map((tag) => `<span class="${className}">${escapeHtml(tag)}</span>`).join("");
}

function renderRemarkMarkup(value, emptyText = EMPTY_REMARK_TEXT, className = "remark-content") {
    const remark = (value || "").trim();
    if (!remark) {
        return `<span class="muted">${escapeHtml(emptyText)}</span>`;
    }

    return `<div class="${className}">${escapeHtml(remark).replace(/\n/g, "<br>")}</div>`;
}

function getAllAvailableTags() {
    const uniqueTags = new Set();
    state.accounts.forEach((account) => {
        parseTags(account.tags).forEach((tag) => uniqueTags.add(tag));
    });

    return Array.from(uniqueTags).sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));
}

function updateTagFilterOptions() {
    const availableTags = getAllAvailableTags();
    [elements.tagFilter, elements.mailTagFilter].forEach((select) => {
        const currentValue = select.value;
        const options = [
            { value: "", label: "全部标签" },
            { value: NO_TAG_FILTER_VALUE, label: "无标签" },
            ...availableTags.map((tag) => ({ value: tag, label: tag }))
        ];

        select.replaceChildren(...options.map(({ value, label }) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = label;
            return option;
        }));
        const hasCurrentValue = currentValue === ""
            || currentValue === NO_TAG_FILTER_VALUE
            || availableTags.includes(currentValue);
        select.value = hasCurrentValue ? currentValue : "";
    });
}

function getMailBodyRenderMode(body) {
    const content = (body || "").trim();
    if (!content) {
        return {
            type: "inline",
            content: `<p>${text.noContent}</p>`
        };
    }

    if (content.startsWith("<pre")) {
        const preContent = extractPreContent(content);
        if (preContent && looksLikeEscapedHtml(preContent)) {
            return {
                type: "iframe",
                content: decodeHtmlEntities(preContent)
            };
        }

        return {
            type: "inline",
            content
        };
    }

    return {
        type: "iframe",
        content: looksLikeEscapedHtml(content) ? decodeHtmlEntities(content) : content
    };
}

function setMessage(target, message, isError = false) {
    target.textContent = message;
    target.classList.toggle("is-error", isError);
}

function matchesTagFilter(account, selectedTag) {
    if (!selectedTag) {
        return true;
    }

    const tags = parseTags(account.tags);
    if (selectedTag === NO_TAG_FILTER_VALUE) {
        return tags.length === 0;
    }

    return tags.includes(selectedTag);
}

function getFilteredAccounts(keyword, selectedTag = "") {
    const query = keyword.trim().toLowerCase();
    return state.accounts.filter((account) => {
        const matchesKeyword = !query || account.email.toLowerCase().includes(query);
        return matchesKeyword && matchesTagFilter(account, selectedTag);
    });
}

function updateAutoRefreshUi() {
    elements.toggleAutoRefreshBtn.textContent = state.autoRefreshEnabled
        ? text.disableAutoRefresh
        : text.enableAutoRefresh;
    elements.autoRefreshState.textContent = state.autoRefreshEnabled
        ? text.autoRefreshOn
        : text.autoRefreshOff;
}

function updateViewActions() {
    elements.toggleAutoRefreshBtn.hidden = state.currentView !== "mails";
    elements.exportAccountsBtn.hidden = state.currentView !== "accounts";
    elements.refreshAccountsBtn.hidden = state.currentView !== "accounts";
}

function getDownloadFileNameFromDisposition(disposition) {
    if (!disposition) {
        return "emailToken.txt";
    }

    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match) {
        try {
            return decodeURIComponent(utf8Match[1]);
        } catch (error) {
            return utf8Match[1];
        }
    }

    const plainMatch = disposition.match(/filename="?([^"]+)"?/i);
    return plainMatch ? plainMatch[1] : "emailToken.txt";
}

function normalizeMailMobileStep(step) {
    if (step === "detail") {
        if (!state.selectedAccountId) {
            return "accounts";
        }
        if (!state.selectedMailId && !state.mails.length) {
            return "list";
        }
    }

    if (step === "list" && !state.selectedAccountId) {
        return "accounts";
    }

    return step;
}

function updateMailMobileView() {
    const isMobile = isMobileLayout();
    state.mobileMailStep = normalizeMailMobileStep(state.mobileMailStep);

    if (elements.mobileMailSteps) {
        elements.mobileMailSteps.hidden = !isMobile;
    }

    elements.mailStepPanels.forEach((panel) => {
        panel.classList.toggle("is-mobile-active", !isMobile || panel.dataset.mailStep === state.mobileMailStep);
    });

    elements.mailStepButtons.forEach((button) => {
        const targetStep = button.dataset.mailStepTarget;
        const needsAccount = targetStep !== "accounts";
        const needsMail = targetStep === "detail";
        const disabled = (needsAccount && !state.selectedAccountId) || (needsMail && !state.selectedMailId && !state.mails.length);

        button.disabled = disabled;
        button.classList.toggle("is-active", targetStep === state.mobileMailStep);
    });
}

function setMailMobileStep(step) {
    state.mobileMailStep = normalizeMailMobileStep(step);
    updateMailMobileView();
}

function syncMailEmptyState(listText, detailText = text.emptyMailDetail) {
    state.mailListEmptyText = listText;
    state.mailDetailEmptyText = detailText;
}

function resetMailView({
    listText = text.chooseMailList,
    detailText = text.emptyMailDetail,
    invalidateRequest = false
} = {}) {
    if (invalidateRequest) {
        state.mailLoadRequestId += 1;
    }

    state.mails = [];
    state.selectedMailId = null;
    state.loadedMailAccountId = null;
    state.loadedMailFolder = null;
    syncMailEmptyState(listText, detailText);
    renderMails();
    updateMailMobileView();
}

function updateMailActions() {
    const hasAccount = Boolean(getSelectedAccount());
    elements.copyMailAddressBtn.disabled = !hasAccount;
    updateMailMobileView();
}

function renderAccountButtons(container, accounts, options) {
    const {
        onSelect,
        onSetTags,
        onSetRemark,
        showSetTagsButton = false,
        showSetRemarkButton = false
    } = options;
    if (!accounts.length) {
        container.innerHTML = `<div class="empty-state">${text.noMatchingAccounts}</div>`;
        return;
    }

    container.innerHTML = accounts.map((account) => {
        const tags = renderTagMarkup(account.tags);
        const activeClass = account.id === state.selectedAccountId ? " account-item-active" : "";
        const accountButton = `
            <button class="account-item account-select-btn${activeClass}" type="button" data-id="${account.id}">
                <strong class="account-item-email">${escapeHtml(account.email)}</strong>
            </button>
        `;

        if (!showSetTagsButton && !showSetRemarkButton) {
            return `
                <div class="account-item-shell${activeClass}">
                    ${accountButton}
                    <div class="tag-row">${tags}</div>
                </div>
            `;
        }

        const actions = [];
        if (showSetTagsButton) {
            actions.push(`<button class="account-tag-button" type="button" data-action="tag" data-id="${account.id}">设置标签</button>`);
        }
        if (showSetRemarkButton) {
            actions.push(`<button class="account-tag-button" type="button" data-action="remark" data-id="${account.id}">设置备注</button>`);
        }

        return `
            <div class="account-item-shell${activeClass}">
                ${accountButton}
                <div class="account-item-meta">
                    <div class="tag-row">${tags}</div>
                    <div class="account-meta-actions">${actions.join("")}</div>
                </div>
            </div>
        `;
    }).join("");

    container.querySelectorAll(".account-select-btn").forEach((button) => {
        button.addEventListener("click", () => onSelect(Number(button.dataset.id)));
    });

    if (showSetTagsButton && onSetTags) {
        container.querySelectorAll('[data-action="tag"]').forEach((button) => {
            button.addEventListener("click", () => onSetTags(Number(button.dataset.id)));
        });
    }
    if (showSetRemarkButton && onSetRemark) {
        container.querySelectorAll('[data-action="remark"]').forEach((button) => {
            button.addEventListener("click", () => onSetRemark(Number(button.dataset.id)));
        });
    }
}

function renderAccounts() {
    const accountMatches = getFilteredAccounts(elements.searchInput.value, elements.tagFilter.value);
    const mailMatches = getFilteredAccounts(elements.mailSearchInput.value, elements.mailTagFilter.value);

    elements.accountCount.textContent = text.accountCount(state.accounts.length);
    elements.accountFilterSummary.textContent = text.visibleAccountCount(accountMatches.length, state.accounts.length);
    elements.mailFilterSummary.textContent = text.visibleAccountCount(mailMatches.length, state.accounts.length);
    renderAccountButtons(elements.accountList, accountMatches, {
        onSelect: selectAccountForManage
    });
    renderAccountButtons(elements.mailAccountList, mailMatches, {
        onSelect: selectAccountForMail,
        onSetTags: promptAndSaveTags,
        onSetRemark: promptAndSaveRemark,
        showSetTagsButton: true,
        showSetRemarkButton: true
    });
}

function renderRefreshLogPagination() {
    const totalPages = Math.max(state.logsPagination.totalPages || 1, 1);
    const currentPage = Math.min(state.logsPagination.page || 1, totalPages);

    elements.refreshLogPage.replaceChildren(...Array.from({ length: totalPages }, (_, index) => {
        const option = document.createElement("option");
        const page = index + 1;
        option.value = String(page);
        option.textContent = `第 ${page} 页`;
        return option;
    }));
    elements.refreshLogPage.value = String(currentPage);

    elements.refreshLogPageSize.replaceChildren(...LOG_PAGE_SIZE_OPTIONS.map((pageSize) => {
        const option = document.createElement("option");
        option.value = String(pageSize);
        option.textContent = `${pageSize} 条`;
        return option;
    }));
    elements.refreshLogPageSize.value = String(state.logsPagination.pageSize);

    elements.refreshLogPage.disabled = state.logsPagination.total === 0;
    elements.refreshLogPaginationSummary.textContent = text.refreshLogsPageSummary(
        currentPage,
        totalPages,
        state.logsPagination.total
    );
}

function renderRefreshLogs() {
    renderRefreshLogPagination();

    if (!state.tokenRefreshLogs.length) {
        elements.refreshLogList.innerHTML = `<div class="empty-state">${text.refreshLogsEmpty}</div>`;
        return;
    }

    elements.refreshLogList.innerHTML = state.tokenRefreshLogs.map((log) => {
        const failureItems = Array.isArray(log.failure_items) ? log.failure_items : [];
        const failureMarkup = failureItems.length
            ? failureItems.map((item) => `
                <div class="refresh-log-failure">
                    <strong>${escapeHtml(item.email || "-")}</strong>
                    <span>${escapeHtml(item.error || "-")}</span>
                </div>
            `).join("")
            : `<div class="refresh-log-failure is-empty">${escapeHtml(text.refreshLogsFailureNone)}</div>`;
        const triggerLabel = log.trigger_type === "scheduled"
            ? text.refreshLogsScheduled
            : text.refreshLogsManual;
        const statusClass = Number(log.failed_count) > 0 ? " is-partial" : " is-success";
        const previewButtonMarkup = log.has_html
            ? `<button class="button button-ghost refresh-log-preview-btn" type="button" data-preview-log-id="${Number(log.id)}">${escapeHtml(text.refreshLogsPreview)}</button>`
            : "";

        return `
            <article class="refresh-log-card${statusClass}">
                <div class="refresh-log-card-head">
                    <span class="pill">${escapeHtml(triggerLabel)}</span>
                    <span class="refresh-log-duration">${escapeHtml(text.refreshLogsDuration)}：${escapeHtml(formatDuration(log.duration_seconds))}</span>
                </div>
                <h3>${escapeHtml(text.refreshLogsSuccessSummary(log.success_count, log.total_count))}</h3>
                <div class="refresh-log-failures">${failureMarkup}</div>
                <div class="refresh-log-time">
                    <span>${escapeHtml(text.refreshLogsExecutionTime)}：</span>
                    <time>${escapeHtml(formatDateTime(log.finished_at || log.started_at || log.created_at))}</time>
                </div>
            </article>
        `;
    }).join("");
}

function renderRefreshLogs() {
    renderRefreshLogPagination();

    if (!state.tokenRefreshLogs.length) {
        elements.refreshLogList.innerHTML = `<div class="empty-state">${text.refreshLogsEmpty}</div>`;
        return;
    }

    elements.refreshLogList.innerHTML = state.tokenRefreshLogs.map((log) => {
        const failureItems = Array.isArray(log.failure_items) ? log.failure_items : [];
        const failureMarkup = failureItems.length
            ? failureItems.map((item) => `
                <div class="refresh-log-failure">
                    <strong>${escapeHtml(item.email || "-")}</strong>
                    <span>${escapeHtml(item.error || "-")}</span>
                </div>
            `).join("")
            : `<div class="refresh-log-failure is-empty">${escapeHtml(text.refreshLogsFailureNone)}</div>`;
        const triggerLabel = log.trigger_type === "scheduled"
            ? text.refreshLogsScheduled
            : text.refreshLogsManual;
        const statusClass = Number(log.failed_count) > 0 ? " is-partial" : " is-success";
        const previewButtonMarkup = log.has_html
            ? `<button class="button button-ghost refresh-log-preview-btn" type="button" data-preview-log-id="${Number(log.id)}">${escapeHtml(text.refreshLogsPreview)}</button>`
            : "";

        return `
            <article class="refresh-log-card${statusClass}">
                <div class="refresh-log-card-head">
                    <span class="pill">${escapeHtml(triggerLabel)}</span>
                    <span class="refresh-log-duration">${escapeHtml(text.refreshLogsDuration)}: ${escapeHtml(formatDuration(log.duration_seconds))}</span>
                </div>
                <h3>${escapeHtml(text.refreshLogsSuccessSummary(log.success_count, log.total_count))}</h3>
                <div class="refresh-log-failures">${failureMarkup}</div>
                <div class="refresh-log-time">
                    <span>${escapeHtml(text.refreshLogsExecutionTime)}:</span>
                    <time>${escapeHtml(formatDateTime(log.finished_at || log.started_at || log.created_at))}</time>
                </div>
                <div class="refresh-log-actions">${previewButtonMarkup}</div>
            </article>
        `;
    }).join("");
}

function openRefreshLogPreview(logId) {
    if (!logId || !state.token) {
        return;
    }

    const url = `/token-refresh-logs/${encodeURIComponent(String(logId))}/preview?token=${encodeURIComponent(state.token)}`;
    window.open(url, "_blank", "noopener");
}

function renderMailDetail() {
    const currentMail = state.mails.find((mail) => getMailId(mail.id) === getMailId(state.selectedMailId));
    if (!currentMail) {
        elements.mailDetail.className = "mail-detail empty-state";
        elements.mailDetail.textContent = text.emptyMailDetail;
        updateMailMobileView();
        return;
    }

    const bodyRender = getMailBodyRenderMode(currentMail.body);
    elements.mailDetail.className = "mail-detail";
    elements.mailDetail.innerHTML = `
        <header class="mail-detail-head">
            <h3>${escapeHtml(currentMail.subject || text.noSubject)}</h3>
            <p>From: ${escapeHtml(currentMail.mail_from || "-")}</p>
            <p>To: ${escapeHtml(currentMail.mail_to || "-")}</p>
            <p>Time: ${escapeHtml(currentMail.mail_dt || "-")}</p>
        </header>
        <section class="mail-detail-body"></section>
    `;

    const bodyContainer = elements.mailDetail.querySelector(".mail-detail-body");
    if (bodyRender.type === "iframe") {
        const iframe = document.createElement("iframe");
        iframe.setAttribute("sandbox", "allow-popups allow-popups-to-escape-sandbox");
        iframe.setAttribute("referrerpolicy", "no-referrer");
        iframe.srcdoc = bodyRender.content;
        bodyContainer.replaceChildren(iframe);
        updateMailMobileView();
        return;
    }

    bodyContainer.innerHTML = bodyRender.content;
    updateMailMobileView();
}

function renderMails() {
    if (!state.mails.length) {
        elements.mailList.className = "mail-list empty-state";
        elements.mailList.textContent = state.mailListEmptyText;
        elements.mailDetail.className = "mail-detail empty-state";
        elements.mailDetail.textContent = state.mailDetailEmptyText;
        return;
    }

    if (!state.selectedMailId && state.mails[0]) {
        state.selectedMailId = getMailId(state.mails[0].id);
    }

    elements.mailList.className = "mail-list";
    elements.mailList.innerHTML = state.mails.map((mail) => {
        const activeClass = getMailId(mail.id) === getMailId(state.selectedMailId) ? " mail-item-active" : "";
        return `
            <button class="mail-item${activeClass}" type="button" data-id="${escapeHtml(getMailId(mail.id) || "")}">
                <strong>${escapeHtml(mail.subject || text.noSubject)}</strong>
                <span>${escapeHtml(mail.mail_from || "-")}</span>
                <time>${escapeHtml(mail.mail_dt || "")}</time>
            </button>
        `;
    }).join("");

    elements.mailList.querySelectorAll(".mail-item").forEach((button) => {
        button.addEventListener("click", () => {
            state.selectedMailId = getMailId(button.dataset.id);
            renderMails();
            setMailMobileStep("detail");
        });
    });

    renderMailDetail();
}

function updateSelectedAccountSummary() {
    const account = getSelectedAccount();
    elements.selectedEmail.textContent = account ? account.email : "请选择邮箱账号";
    elements.tagsInput.value = account ? account.tags : "";
    elements.mailPanelTitle.textContent = account ? `${account.email} 的邮件` : "请选择邮箱";
    updateMailActions();
    renderAccounts();
}

const baseUpdateSelectedAccountSummary = updateSelectedAccountSummary;
updateSelectedAccountSummary = function updateSelectedAccountSummaryWithRemark() {
    baseUpdateSelectedAccountSummary();
    const account = getSelectedAccount();
    elements.remarkInput.value = account ? (account.remark || "") : "";
    elements.selectedRemark.innerHTML = renderRemarkMarkup(account ? account.remark : "");
    elements.mailAccountRemark.innerHTML = renderRemarkMarkup(account ? account.remark : "");
    elements.mailPanelTitle.textContent = account ? `${account.email} 的邮件` : "请选择邮箱";
};

function switchView(view) {
    state.currentView = view;
    elements.menuItems.forEach((item) => {
        item.classList.toggle("is-active", item.dataset.view === view);
    });
    elements.viewPanels.forEach((panel) => {
        panel.classList.toggle("is-visible", panel.dataset.panel === view);
    });
    elements.viewTitle.textContent = ({
        accounts: text.accountsTitle,
        mails: text.mailsTitle,
        logs: text.logsTitle
    })[view] || text.accountsTitle;
    updateViewActions();
    updateMailMobileView();
}

function stopAutoRefresh() {
    if (state.accountRefreshTimer) {
        window.clearInterval(state.accountRefreshTimer);
        state.accountRefreshTimer = null;
    }
    if (state.mailRefreshTimer) {
        window.clearInterval(state.mailRefreshTimer);
        state.mailRefreshTimer = null;
    }
}

function startAutoRefresh() {
    stopAutoRefresh();
    updateAutoRefreshUi();

    if (!state.autoRefreshEnabled) {
        return;
    }

    state.accountRefreshTimer = window.setInterval(() => {
        loadAccounts({ silent: true });
    }, AUTO_REFRESH_INTERVAL);

    if (!state.selectedAccountId || state.currentView !== "mails") {
        return;
    }

    state.mailRefreshTimer = window.setInterval(() => {
        loadMails({ silent: true });
    }, AUTO_REFRESH_INTERVAL);
}

async function loadAccounts({ silent = false } = {}) {
    try {
        const data = await api("/api/accounts");
        state.accounts = (data.items || []).slice().sort((left, right) => right.id - left.id);
        updateTagFilterOptions();

        if (state.selectedAccountId && !state.accounts.some((item) => item.id === state.selectedAccountId)) {
            state.selectedAccountId = null;
            resetMailView({ invalidateRequest: true });
        }

        updateSelectedAccountSummary();
        renderMails();
        startAutoRefresh();
        updateMailMobileView();
    } catch (error) {
        if (!silent) {
            setMessage(elements.accountMessage, error.message, true);
        }
    }
}

function setRefreshLogRunLoading(isLoading) {
    state.tokenRefreshTaskRunning = isLoading;
    elements.refreshLogRunBtn.disabled = isLoading;
    elements.refreshLogRunBtn.textContent = isLoading
        ? text.refreshLogsRunning
        : text.refreshLogsRun;
}

async function loadTokenRefreshLogs({ silent = false } = {}) {
    try {
        if (!silent) {
            setMessage(elements.refreshLogMessage, text.refreshLogsLoading, false);
        }

        const { page, pageSize } = state.logsPagination;
        const data = await api(`/api/token-refresh-logs?page=${page}&page_size=${pageSize}`);
        const pagination = data.pagination || {};

        state.tokenRefreshLogs = data.items || [];
        state.logsPagination.page = pagination.page || page;
        state.logsPagination.pageSize = pagination.page_size || pageSize;
        state.logsPagination.total = pagination.total || 0;
        state.logsPagination.totalPages = pagination.total_pages || 1;
        renderRefreshLogs();

        if (!silent) {
            setMessage(elements.refreshLogMessage, text.refreshLogsLoaded(state.logsPagination.total), false);
        }
    } catch (error) {
        if (!silent) {
            setMessage(elements.refreshLogMessage, error.message, true);
        }
    }
}

async function triggerTokenRefreshTask() {
    setRefreshLogRunLoading(true);
    setMessage(elements.refreshLogMessage, text.refreshLogsRunHint, false);

    try {
        await api("/api/token-refresh-logs/trigger", {
            method: "POST"
        });
        setMessage(
            elements.refreshLogMessage,
            text.refreshLogsTriggerQueued,
            false
        );
    } catch (error) {
        setMessage(elements.refreshLogMessage, error.message, true);
    } finally {
        setRefreshLogRunLoading(false);
    }
}

async function loadMails({ silent = false } = {}) {
    if (!state.selectedAccountId) {
        setMailMobileStep("accounts");
        return;
    }

    // 自动刷新不能叠加慢速 IMAP 请求，否则旧请求虽然会被前端丢弃，
    // 但仍会占用服务端连接和邮箱接口资源。
    if (silent && state.mailLoadInFlight) {
        return;
    }

    const accountId = state.selectedAccountId;
    const folder = state.selectedFolder;
    const requestId = ++state.mailLoadRequestId;
    state.mailLoadInFlight = true;

    try {
        if (!silent) {
            resetMailView({
                listText: text.loadingMails,
                detailText: text.loadingMails
            });
            setMessage(elements.mailMessage, text.loadingMails, false);
        }

        const data = await api(`/api/accounts/${accountId}/mails?folder=${folder}`);
        if (requestId !== state.mailLoadRequestId || state.selectedAccountId !== accountId || state.selectedFolder !== folder) {
            return;
        }

        state.mails = data.items || [];
        state.loadedMailAccountId = accountId;
        state.loadedMailFolder = folder;
        syncMailEmptyState(text.emptyMailList, text.emptyMailDetail);
        if (!state.mails.some((mail) => getMailId(mail.id) === getMailId(state.selectedMailId))) {
            state.selectedMailId = null;
        }

        renderMails();
        setMessage(elements.mailMessage, text.loadedMails(state.mails.length), false);
        updateMailMobileView();
    } catch (error) {
        if (requestId !== state.mailLoadRequestId) {
            return;
        }

        syncMailEmptyState(text.emptyMailList, text.emptyMailDetail);
        renderMails();
        setMessage(elements.mailMessage, error.message, true);
        updateMailMobileView();
    } finally {
        if (state.mailLoadRequestId === requestId) {
            state.mailLoadInFlight = false;
        }
    }
}

function selectAccountForManage(accountId) {
    state.selectedAccountId = accountId;
    updateSelectedAccountSummary();
    setMessage(elements.accountMessage, text.selectedAccountHint, false);
}

async function selectAccountForMail(accountId) {
    state.selectedAccountId = accountId;
    state.selectedMailId = null;
    updateSelectedAccountSummary();
    setMailMobileStep("list");
    await loadMails();
    startAutoRefresh();
}

async function importAccounts() {
    const value = elements.importInput.value.trim();
    if (!value) {
        setMessage(elements.importMessage, text.importInputRequired, true);
        return;
    }

    try {
        const data = await api("/api/accounts/import", {
            method: "POST",
            body: JSON.stringify({ text: value })
        });
        setMessage(elements.importMessage, text.importFinished(data), false);
        elements.importInput.value = "";
        await loadAccounts();
    } catch (error) {
        setMessage(elements.importMessage, error.message, true);
    }
}

async function exportAccounts() {
    setMessage(elements.accountMessage, text.exportingAccounts, false);
    elements.exportAccountsBtn.disabled = true;

    try {
        const params = new URLSearchParams();
        if (elements.tagFilter.value) {
            params.set("tag", elements.tagFilter.value);
        }
        const exportUrl = params.toString()
            ? `/api/accounts/export?${params.toString()}`
            : "/api/accounts/export";

        const response = await fetch(exportUrl, {
            headers: {
                "X-Token": state.token
            }
        });

        if (response.status === 401) {
            localStorage.removeItem("mail_manager_token");
            window.location.href = "/";
            throw new Error(text.loginExpired);
        }

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.detail || text.requestFailed);
        }

        const blob = await response.blob();
        const downloadUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = downloadUrl;
        anchor.download = getDownloadFileNameFromDisposition(response.headers.get("content-disposition"));
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(downloadUrl);

        setMessage(elements.accountMessage, text.exportAccountsSuccess, false);
    } catch (error) {
        setMessage(elements.accountMessage, error.message || text.requestFailed, true);
    } finally {
        elements.exportAccountsBtn.disabled = false;
    }
}

async function saveTags() {
    if (!state.selectedAccountId) {
        setMessage(elements.accountMessage, text.chooseAccountFirst, true);
        return;
    }

    try {
        await persistTags(state.selectedAccountId, elements.tagsInput.value);
        setMessage(elements.accountMessage, text.saveTagsSuccess, false);
    } catch (error) {
        setMessage(elements.accountMessage, error.message, true);
    }
}

async function saveRemark() {
    if (!state.selectedAccountId) {
        setMessage(elements.accountMessage, text.chooseAccountFirst, true);
        return;
    }

    try {
        await persistRemark(state.selectedAccountId, elements.remarkInput.value);
        setMessage(elements.accountMessage, SAVE_REMARK_SUCCESS_TEXT, false);
    } catch (error) {
        setMessage(elements.accountMessage, error.message, true);
    }
}

async function persistTags(accountId, tags) {
    const data = await api(`/api/accounts/${accountId}/tags`, {
        method: "POST",
        body: JSON.stringify({ tags })
    });

    const account = state.accounts.find((item) => item.id === accountId);
    if (account) {
        account.tags = data.tags;
    }

    updateTagFilterOptions();

    if (state.selectedAccountId === accountId) {
        updateSelectedAccountSummary();
    } else {
        renderAccounts();
    }

    return data;
}

async function persistRemark(accountId, remark) {
    const data = await api(`/api/accounts/${accountId}/remark`, {
        method: "POST",
        body: JSON.stringify({ remark })
    });

    const account = state.accounts.find((item) => item.id === accountId);
    if (account) {
        account.remark = data.remark;
    }

    if (state.selectedAccountId === accountId) {
        updateSelectedAccountSummary();
    } else {
        renderAccounts();
    }

    return data;
}

function setRemarkModalLoading(isLoading) {
    elements.remarkModalSaveBtn.disabled = isLoading;
    elements.remarkModalCancelBtn.disabled = isLoading;
    elements.remarkModalCloseBtn.disabled = isLoading;
    elements.remarkModalInput.disabled = isLoading;
    elements.remarkModalSaveBtn.textContent = isLoading ? "保存中..." : "保存备注";
}

function openRemarkModal(account) {
    state.remarkModalAccountId = account.id;
    state.remarkModalReturnFocus = document.activeElement;

    elements.remarkModalEmail.textContent = account.email;
    elements.remarkModalCurrent.innerHTML = renderRemarkMarkup(account.remark);
    elements.remarkModalInput.value = account.remark || "";
    setMessage(elements.remarkModalMessage, "", false);
    setRemarkModalLoading(false);

    document.body.classList.add("modal-open");
    elements.remarkModal.hidden = false;
    window.requestAnimationFrame(() => {
        elements.remarkModal.classList.add("is-visible");
        elements.remarkModalInput.focus();
        elements.remarkModalInput.select();
    });
}

function closeRemarkModal(force = false) {
    if (!force && elements.remarkModalSaveBtn.disabled) {
        return;
    }

    elements.remarkModal.classList.remove("is-visible");
    document.body.classList.remove("modal-open");
    state.remarkModalAccountId = null;
    setMessage(elements.remarkModalMessage, "", false);

    window.setTimeout(() => {
        if (!elements.remarkModal.classList.contains("is-visible")) {
            elements.remarkModal.hidden = true;
        }
    }, 180);

    if (state.remarkModalReturnFocus && typeof state.remarkModalReturnFocus.focus === "function") {
        state.remarkModalReturnFocus.focus();
    }
    state.remarkModalReturnFocus = null;
}

function renderTagModalPreview(value) {
    elements.tagModalPreview.innerHTML = renderTagMarkup(value, text.tagPreviewEmpty, "tag tag-modal-chip");
}

function renderTagModalSuggestions(value) {
    const selectedTags = parseTags(value);
    const availableTags = getAllAvailableTags();

    if (!availableTags.length) {
        elements.tagModalSuggestions.innerHTML = '<span class="muted">暂无可用的历史标签</span>';
        return;
    }

    elements.tagModalSuggestions.replaceChildren(...availableTags.map((tag) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "tag-suggestion-button";
        if (selectedTags.includes(tag)) {
            button.classList.add("is-active");
        }
        button.dataset.tag = tag;
        button.textContent = tag;
        return button;
    }));
}

function syncTagModalTagViews(value) {
    renderTagModalPreview(value);
    renderTagModalSuggestions(value);
}

function applyQuickTag(tag) {
    const nextTags = parseTags(elements.tagModalInput.value);
    if (!nextTags.includes(tag)) {
        nextTags.push(tag);
    }

    const normalizedValue = nextTags.join(", ");
    elements.tagModalInput.value = normalizedValue;
    syncTagModalTagViews(normalizedValue);
    elements.tagModalInput.focus();
}

function setTagModalLoading(isLoading) {
    elements.tagModalSaveBtn.disabled = isLoading;
    elements.tagModalCancelBtn.disabled = isLoading;
    elements.tagModalCloseBtn.disabled = isLoading;
    elements.tagModalInput.disabled = isLoading;
    elements.tagModalSaveBtn.textContent = isLoading ? text.savingTags : "保存标签";
}

function openTagModal(account) {
    state.tagModalAccountId = account.id;
    state.tagModalReturnFocus = document.activeElement;

    elements.tagModalEmail.textContent = account.email;
    elements.tagModalCurrentTags.innerHTML = renderTagMarkup(account.tags, text.tagCurrentEmpty);
    elements.tagModalInput.value = account.tags || "";
    syncTagModalTagViews(account.tags || "");
    setMessage(elements.tagModalMessage, "", false);
    setTagModalLoading(false);

    document.body.classList.add("modal-open");
    elements.tagModal.hidden = false;
    window.requestAnimationFrame(() => {
        elements.tagModal.classList.add("is-visible");
        elements.tagModalInput.focus();
        elements.tagModalInput.select();
    });
}

function closeTagModal(force = false) {
    if (!force && elements.tagModalSaveBtn.disabled) {
        return;
    }

    elements.tagModal.classList.remove("is-visible");
    document.body.classList.remove("modal-open");
    state.tagModalAccountId = null;
    setMessage(elements.tagModalMessage, "", false);

    window.setTimeout(() => {
        if (!elements.tagModal.classList.contains("is-visible")) {
            elements.tagModal.hidden = true;
        }
    }, 180);

    if (state.tagModalReturnFocus && typeof state.tagModalReturnFocus.focus === "function") {
        state.tagModalReturnFocus.focus();
    }
    state.tagModalReturnFocus = null;
}

function openSelectedAccountMails() {
    if (!state.selectedAccountId) {
        setMessage(elements.accountMessage, text.chooseAccountFirst, true);
        return;
    }

    switchView("mails");
    setMailMobileStep("list");
    loadMails();
    startAutoRefresh();
}

async function promptAndSaveTags(accountId = state.selectedAccountId) {
    if (!accountId) {
        setMessage(elements.mailMessage, text.chooseAccountFirst, true);
        return;
    }

    const account = state.accounts.find((item) => item.id === accountId);
    if (!account) {
        setMessage(elements.mailMessage, text.chooseAccountFirst, true);
        return;
    }

    state.selectedAccountId = accountId;
    updateSelectedAccountSummary();
    openTagModal(account);
}

async function promptAndSaveRemark(accountId = state.selectedAccountId) {
    if (!accountId) {
        setMessage(elements.mailMessage, text.chooseAccountFirst, true);
        return;
    }

    const account = state.accounts.find((item) => item.id === accountId);
    if (!account) {
        setMessage(elements.mailMessage, text.chooseAccountFirst, true);
        return;
    }

    state.selectedAccountId = accountId;
    updateSelectedAccountSummary();
    openRemarkModal(account);
}

async function saveTagModalTags() {
    if (!state.tagModalAccountId) {
        closeTagModal(true);
        return;
    }

    const nextTags = normalizeTags(elements.tagModalInput.value);
    elements.tagModalInput.value = nextTags;
    syncTagModalTagViews(nextTags);
    setTagModalLoading(true);

    try {
        await persistTags(state.tagModalAccountId, nextTags);
        closeTagModal(true);
        setMessage(elements.mailMessage, text.saveTagsSuccess, false);
    } catch (error) {
        setMessage(elements.tagModalMessage, error.message, true);
        setTagModalLoading(false);
    }
}

async function saveRemarkModalRemark() {
    if (!state.remarkModalAccountId) {
        closeRemarkModal(true);
        return;
    }

    const nextRemark = elements.remarkModalInput.value.trim();
    elements.remarkModalInput.value = nextRemark;
    setRemarkModalLoading(true);

    try {
        await persistRemark(state.remarkModalAccountId, nextRemark);
        closeRemarkModal(true);
        setMessage(elements.mailMessage, SAVE_REMARK_SUCCESS_TEXT, false);
    } catch (error) {
        setMessage(elements.remarkModalMessage, error.message, true);
        setRemarkModalLoading(false);
    }
}

function handleGlobalKeydown(event) {
    if (!elements.tagModal.hidden) {
        if (event.key === "Escape") {
            event.preventDefault();
            closeTagModal();
            return;
        }

        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            saveTagModalTags();
            return;
        }
    }

    if (!elements.remarkModal.hidden) {
        if (event.key === "Escape") {
            event.preventDefault();
            closeRemarkModal();
            return;
        }

        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            saveRemarkModalRemark();
        }
    }
}

async function copySelectedEmailAddress() {
    const account = getSelectedAccount();
    if (!account) {
        setMessage(elements.mailMessage, text.copyMailAddressUnavailable, true);
        return;
    }

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(account.email);
        } else {
            const input = document.createElement("input");
            input.value = account.email;
            document.body.appendChild(input);
            input.select();
            document.execCommand("copy");
            input.remove();
        }
        setMessage(elements.mailMessage, text.copyMailAddressSuccess, false);
    } catch (error) {
        setMessage(elements.mailMessage, error.message || text.requestFailed, true);
    }
}

function toggleAutoRefresh() {
    state.autoRefreshEnabled = !state.autoRefreshEnabled;
    startAutoRefresh();
    const message = state.autoRefreshEnabled
        ? text.autoRefreshEnabledHint
        : text.autoRefreshDisabledHint;
    const target = state.currentView === "mails" ? elements.mailMessage : elements.accountMessage;
    setMessage(target, message, false);
}

elements.importBtn.addEventListener("click", importAccounts);
elements.exportAccountsBtn.addEventListener("click", exportAccounts);
elements.refreshAccountsBtn.addEventListener("click", () => loadAccounts());
elements.refreshLogRunBtn.addEventListener("click", triggerTokenRefreshTask);
elements.saveTagsBtn.addEventListener("click", saveTags);
elements.saveRemarkBtn.addEventListener("click", saveRemark);
elements.openMailsBtn.addEventListener("click", openSelectedAccountMails);
elements.copyMailAddressBtn.addEventListener("click", copySelectedEmailAddress);
elements.toggleAutoRefreshBtn.addEventListener("click", toggleAutoRefresh);
elements.remarkModalBackdrop.addEventListener("click", closeRemarkModal);
elements.remarkModalCancelBtn.addEventListener("click", closeRemarkModal);
elements.remarkModalCloseBtn.addEventListener("click", closeRemarkModal);
elements.remarkModalSaveBtn.addEventListener("click", saveRemarkModalRemark);
elements.tagModalBackdrop.addEventListener("click", closeTagModal);
elements.tagModalCancelBtn.addEventListener("click", closeTagModal);
elements.tagModalCloseBtn.addEventListener("click", closeTagModal);
elements.tagModalInput.addEventListener("input", () => syncTagModalTagViews(elements.tagModalInput.value));
elements.tagModalSuggestions.addEventListener("click", (event) => {
    const button = event.target.closest("[data-tag]");
    if (!button) {
        return;
    }
    applyQuickTag(button.dataset.tag);
});
elements.tagModalSaveBtn.addEventListener("click", saveTagModalTags);
elements.logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("mail_manager_token");
    stopAutoRefresh();
    window.location.href = "/";
});
elements.searchInput.addEventListener("input", renderAccounts);
elements.mailSearchInput.addEventListener("input", renderAccounts);
elements.tagFilter.addEventListener("change", renderAccounts);
elements.mailTagFilter.addEventListener("change", renderAccounts);
elements.refreshLogPage.addEventListener("change", async () => {
    state.logsPagination.page = Number(elements.refreshLogPage.value) || 1;
    await loadTokenRefreshLogs();
});
elements.refreshLogPageSize.addEventListener("change", async () => {
    state.logsPagination.pageSize = Number(elements.refreshLogPageSize.value) || DEFAULT_LOG_PAGE_SIZE;
    state.logsPagination.page = 1;
    await loadTokenRefreshLogs();
});
elements.refreshLogList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-preview-log-id]");
    if (!button) {
        return;
    }
    openRefreshLogPreview(Number(button.dataset.previewLogId));
});
elements.mailStepButtons.forEach((button) => {
    button.addEventListener("click", () => {
        setMailMobileStep(button.dataset.mailStepTarget);
    });
});
elements.menuItems.forEach((item) => {
    item.addEventListener("click", () => {
        switchView(item.dataset.view);
        if (
            item.dataset.view === "mails"
            && state.selectedAccountId
            && (
                state.loadedMailAccountId !== state.selectedAccountId
                || state.loadedMailFolder !== state.selectedFolder
            )
        ) {
            loadMails();
        }
        if (item.dataset.view === "logs") {
            loadTokenRefreshLogs();
        }
        startAutoRefresh();
    });
});
elements.tabs.forEach((tab) => {
    tab.addEventListener("click", async () => {
        state.selectedFolder = tab.dataset.folder;
        elements.tabs.forEach((item) => item.classList.toggle("is-active", item === tab));
        state.selectedMailId = null;
        await loadMails();
    });
});
window.addEventListener("keydown", handleGlobalKeydown);
window.addEventListener("resize", updateMailMobileView);
window.addEventListener("beforeunload", stopAutoRefresh);

updateAutoRefreshUi();
updateViewActions();
updateMailActions();
updateMailMobileView();
setRefreshLogRunLoading(false);
renderRefreshLogs();
loadAccounts();
