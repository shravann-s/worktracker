/**
 * WorkTracker - Office, WFH & Leave Planner
 * Modern Vanilla JavaScript Frontend
 */

(function () {
  'use strict';

  // --- STATE DEFINITION ---
  const state = {
    viewDate: new Date(), // Month/Year currently viewed
    today: new Date(),
    workDays: {}, // 'YYYY-MM-DD' => { status, leave_type, note, half_day_type }
    leaves: [],   // Array of planned leaves
    settings: {
      annual_quota: 20,
      annual_opening_balance: 0, // Accumulated / Opening balance from start of year
      sick_quota: 10,
      sick_opening_balance: 0,
      casual_quota: 5,
      casual_opening_balance: 0,
      optional_quota: 3,
      optional_opening_balance: 0,
      menstrual_quota: 12,
      menstrual_opening_balance: 0,
      joining_month_index: 1, // 1 to 12 in the FY (1 = start of FY, >1 = mid-year joining)
      fy_start_month: 4, // 4 = April (Apr-Mar), 1 = Jan (Jan-Dec), 7 = Jul, 10 = Oct
      fy_year: 2026,
      target_office_pct: 60,
      work_days_per_week: 5,
      year: new Date().getFullYear().toString(),
      theme: 'light'
    },
    isServerMode: false,
    selectedDateStr: null,
    activeTab: 'calendarTab',
    selectedModalStatus: 'office',
    leaveFilter: 'all',
    accrualViewMode: 'annual' // 'annual' or 'sick'
  };

  // Safe Quota Parser (Preserves 0 as a valid quota value!)
  const parseQuota = (val, defaultVal = 0) => {
    if (val === undefined || val === null || val === '') return defaultVal;
    const num = parseFloat(val);
    return isNaN(num) ? defaultVal : num;
  };

  // Financial Year Helpers
  const getFyInfo = (startMonth, fyYear) => {
    const sMonth = parseInt(startMonth, 10) || 4;
    const yearNum = parseInt(fyYear, 10) || 2026;
    const startMonthName = getMonthName(sMonth - 1).slice(0, 3);
    const endMonthIdx = (sMonth + 10) % 12;
    const endMonthName = getMonthName(endMonthIdx).slice(0, 3);

    if (sMonth === 1) {
      return {
        label: `FY ${yearNum}`,
        sub: `Jan ${yearNum} – Dec ${yearNum}`,
        startYear: yearNum,
        endYear: yearNum,
        startMonth: 1,
        endMonth: 12
      };
    } else {
      const nextYearShort = String(yearNum + 1).slice(2);
      return {
        label: `FY ${yearNum}-${nextYearShort}`,
        sub: `${startMonthName} ${yearNum} – ${endMonthName} ${yearNum + 1}`,
        startYear: yearNum,
        endYear: yearNum + 1,
        startMonth: sMonth,
        endMonth: (sMonth + 11) > 12 ? (sMonth + 11 - 12) : (sMonth + 11)
      };
    }
  };

  const getFyMonthsList = (startMonth, fyYear) => {
    const months = [];
    let currYear = parseInt(fyYear, 10) || 2026;
    let m = parseInt(startMonth, 10) || 4;

    for (let i = 0; i < 12; i++) {
      months.push({
        index: i + 1,
        monthIndex: m - 1,
        year: currYear,
        name: getMonthName(m - 1),
        label: `${getMonthName(m - 1).slice(0, 3)} ${currYear}`
      });
      m++;
      if (m > 12) {
        m = 1;
        currYear++;
      }
    }
    return months;
  };

  // Helper date formatters
  const formatDateKey = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const parseDateKey = (str) => {
    const parts = str.split('-');
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  };

  const getMonthName = (monthIdx) => {
    return [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ][monthIdx];
  };

  const getShortMonthName = (monthIdx) => {
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][monthIdx];
  };

  // Format as "dd mmm yyyy" (e.g. "21 Oct 2026")
  const formatDateDisplay = (dateInput) => {
    if (!dateInput) return '';
    const d = typeof dateInput === 'string' ? parseDateKey(dateInput) : dateInput;
    if (isNaN(d.getTime())) return String(dateInput);
    const day = String(d.getDate()).padStart(2, '0');
    const mmm = getShortMonthName(d.getMonth());
    const yyyy = d.getFullYear();
    return `${day} ${mmm} ${yyyy}`;
  };

  // Format as "dd mmm" (e.g. "21 Oct")
  const formatDateShort = (dateInput) => {
    if (!dateInput) return '';
    const d = typeof dateInput === 'string' ? parseDateKey(dateInput) : dateInput;
    if (isNaN(d.getTime())) return String(dateInput);
    const day = String(d.getDate()).padStart(2, '0');
    const mmm = getShortMonthName(d.getMonth());
    return `${day} ${mmm}`;
  };

  // Format date range with "dd mmm yyyy" (e.g. "21 Oct 2026" or "21 Oct – 25 Oct 2026")
  const formatDateRangeDisplay = (startStr, endStr) => {
    if (!startStr) return '';
    if (!endStr || startStr === endStr) return formatDateDisplay(startStr);
    const s = parseDateKey(startStr);
    const e = parseDateKey(endStr);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return `${startStr} – ${endStr}`;
    if (s.getFullYear() === e.getFullYear()) {
      return `${formatDateShort(s)} – ${formatDateDisplay(e)}`;
    }
    return `${formatDateDisplay(s)} – ${formatDateDisplay(e)}`;
  };

  // Format shorter date range with "dd mmm" (e.g. "21 Oct" or "21 Oct – 25 Oct")
  const formatDateRangeShort = (startStr, endStr) => {
    if (!startStr) return '';
    if (!endStr || startStr === endStr) return formatDateShort(startStr);
    return `${formatDateShort(startStr)} – ${formatDateShort(endStr)}`;
  };

  const getDayName = (dayIdx) => {
    return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayIdx];
  };

  const isWeekend = (d) => {
    const day = d.getDay();
    return day === 0 || day === 6;
  };

  // --- DOM ELEMENTS ---
  const elements = {
    prevMonthBtn: document.getElementById('prevMonthBtn'),
    nextMonthBtn: document.getElementById('nextMonthBtn'),
    todayBtn: document.getElementById('todayBtn'),
    currentMonthYear: document.getElementById('currentMonthYear'),
    calendarGrid: document.getElementById('calendarGrid'),
    
    // KPI elements
    kpiOfficeCount: document.getElementById('kpiOfficeCount'),
    kpiOfficeSubtext: document.getElementById('kpiOfficeSubtext'),
    kpiOfficeProgress: document.getElementById('kpiOfficeProgress'),
    kpiOfficeStatusBadge: document.getElementById('kpiOfficeStatusBadge'),
    kpiTargetPct: document.getElementById('kpiTargetPct'),
    kpiOfficeFormulaHint: document.getElementById('kpiOfficeFormulaHint'),
    kpiWfhCount: document.getElementById('kpiWfhCount'),
    kpiWfhSubtext: document.getElementById('kpiWfhSubtext'),
    kpiWfhProgress: document.getElementById('kpiWfhProgress'),
    kpiWfhPct: document.getElementById('kpiWfhPct'),
    kpiCategoryBalances: document.getElementById('kpiCategoryBalances'),
    kpiFyYearText: document.getElementById('kpiFyYearText'),
    viewPlannerFromKpi: document.getElementById('viewPlannerFromKpi'),
    kpiUpcomingContent: document.getElementById('kpiUpcomingContent'),
    viewAllLeavesBtn: document.getElementById('viewAllLeavesBtn'),
    kpiLeavesCard: document.getElementById('kpiLeavesCard'),

    // Nav actions
    navFyBadge: document.getElementById('navFyBadge'),
    quickLogTodayBtn: document.getElementById('quickLogTodayBtn'),
    planLeaveNavBtn: document.getElementById('planLeaveNavBtn'),
    settingsBtn: document.getElementById('settingsBtn'),
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    themeIcon: document.getElementById('themeIcon'),

    // Batch Tray
    batchLogTriggerBtn: document.getElementById('batchLogTriggerBtn'),
    batchLogTray: document.getElementById('batchLogTray'),
    batchStartDate: document.getElementById('batchStartDate'),
    batchEndDate: document.getElementById('batchEndDate'),
    batchStatusSelect: document.getElementById('batchStatusSelect'),
    applyBatchBtn: document.getElementById('applyBatchBtn'),
    closeBatchBtn: document.getElementById('closeBatchBtn'),

    // Day Modal
    dayModal: document.getElementById('dayModal'),
    modalDateTitle: document.getElementById('modalDateTitle'),
    modalDaySubtitle: document.getElementById('modalDaySubtitle'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    modalCancelBtn: document.getElementById('modalCancelBtn'),
    modalSaveBtn: document.getElementById('modalSaveBtn'),
    modalClearBtn: document.getElementById('modalClearBtn'),
    modalLeaveOptions: document.getElementById('modalLeaveOptions'),
    modalLeaveTypeSelect: document.getElementById('modalLeaveTypeSelect'),
    modalLeaveHalfSelect: document.getElementById('modalLeaveHalfSelect'),
    modalDayNote: document.getElementById('modalDayNote'),
    statusChoiceBtns: document.querySelectorAll('.status-choice-btn'),

    // Leave Planner Tab
    leaveBreakdownGrid: document.getElementById('leaveBreakdownGrid'),
    editQuotasBtn: document.getElementById('editQuotasBtn'),
    menstrualCard: document.getElementById('menstrualCard'),
    menstrualMonthBadge: document.getElementById('menstrualMonthBadge'),
    menstrualDesc: document.getElementById('menstrualDesc'),
    menstrualMonthName: document.getElementById('menstrualMonthName'),
    quickLogMenstrualBtn: document.getElementById('quickLogMenstrualBtn'),
    accrualCard: document.getElementById('accrualCard'),
    accrualCardTitle: document.getElementById('accrualCardTitle'),
    accrualFormulaSubtext: document.getElementById('accrualFormulaSubtext'),
    accrualFyBadge: document.getElementById('accrualFyBadge'),
    accrualViewAnnualBtn: document.getElementById('accrualViewAnnualBtn'),
    accrualViewSickBtn: document.getElementById('accrualViewSickBtn'),
    accrualMetric1Label: document.getElementById('accrualMetric1Label'),
    accrualMetric1Sub: document.getElementById('accrualMetric1Sub'),
    accrualMetric2Label: document.getElementById('accrualMetric2Label'),
    accrualMetric2Sub: document.getElementById('accrualMetric2Sub'),
    accrualMetric3Label: document.getElementById('accrualMetric3Label'),
    accrualMetric3Sub: document.getElementById('accrualMetric3Sub'),
    accrualMetric4Label: document.getElementById('accrualMetric4Label'),
    accrualMetric4Sub: document.getElementById('accrualMetric4Sub'),
    accrualRateVal: document.getElementById('accrualRateVal'),
    accrualYtdVal: document.getElementById('accrualYtdVal'),
    accrualYtdSub: document.getElementById('accrualYtdSub'),
    accrualTakenVal: document.getElementById('accrualTakenVal'),
    accrualNetBalanceVal: document.getElementById('accrualNetBalanceVal'),
    accrualTableHeadRow: document.getElementById('accrualTableHeadRow'),
    accrualTableBody: document.getElementById('accrualTableBody'),
    planLeaveForm: document.getElementById('planLeaveForm'),
    leaveTypeSelect: document.getElementById('leaveTypeSelect'),
    leaveDurationMode: document.getElementById('leaveDurationMode'),
    leaveStartDate: document.getElementById('leaveStartDate'),
    leaveEndDate: document.getElementById('leaveEndDate'),
    leaveEndDateGroup: document.getElementById('leaveEndDateGroup'),
    leaveTitleInput: document.getElementById('leaveTitleInput'),
    calculatedLeaveDays: document.getElementById('calculatedLeaveDays'),
    leaveQuotaRemainingHint: document.getElementById('leaveQuotaRemainingHint'),
    plannedLeavesTableBody: document.getElementById('plannedLeavesTableBody'),
    noLeavesPlaceholder: document.getElementById('noLeavesPlaceholder'),
    filterPills: document.querySelectorAll('.filter-pill'),

    // Analytics Tab
    statWorkingDays: document.getElementById('statWorkingDays'),
    statOfficeDays: document.getElementById('statOfficeDays'),
    statOfficeRate: document.getElementById('statOfficeRate'),
    statWfhDays: document.getElementById('statWfhDays'),
    statWfhRate: document.getElementById('statWfhRate'),
    statLeaveDays: document.getElementById('statLeaveDays'),
    statLeaveRate: document.getElementById('statLeaveRate'),
    analyticsCurrentRate: document.getElementById('analyticsCurrentRate'),
    analyticsTargetRate: document.getElementById('analyticsTargetRate'),
    analyticsComplianceFill: document.getElementById('analyticsComplianceFill'),
    analyticsTargetMarker: document.getElementById('analyticsTargetMarker'),
    analyticsComplianceMessage: document.getElementById('analyticsComplianceMessage'),
    analyticsFormulaBox: document.getElementById('analyticsFormulaBox'),
    weeklyBreakdownBody: document.getElementById('weeklyBreakdownBody'),
    ytdStatsGrid: document.getElementById('ytdStatsGrid'),
    ytdYearLabel: document.getElementById('ytdYearLabel'),
    printReportBtn: document.getElementById('printReportBtn'),

    // Settings Modal
    settingsModal: document.getElementById('settingsModal'),
    closeSettingsModalBtn: document.getElementById('closeSettingsModalBtn'),
    cancelSettingsBtn: document.getElementById('cancelSettingsBtn'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    settingFyStartMonth: document.getElementById('settingFyStartMonth'),
    settingFyYear: document.getElementById('settingFyYear'),
    settingFyHint: document.getElementById('settingFyHint'),
    settingJoiningMonth: document.getElementById('settingJoiningMonth'),
    settingJoiningHint: document.getElementById('settingJoiningHint'),
    settingAnnualQuota: document.getElementById('settingAnnualQuota'),
    settingAnnualOpeningBalance: document.getElementById('settingAnnualOpeningBalance'),
    settingAnnualRateHint: document.getElementById('settingAnnualRateHint'),
    settingSickQuota: document.getElementById('settingSickQuota'),
    settingSickOpeningBalance: document.getElementById('settingSickOpeningBalance'),
    settingCasualQuota: document.getElementById('settingCasualQuota'),
    settingCasualOpeningBalance: document.getElementById('settingCasualOpeningBalance'),
    settingOptionalQuota: document.getElementById('settingOptionalQuota'),
    settingOptionalOpeningBalance: document.getElementById('settingOptionalOpeningBalance'),
    settingMenstrualQuota: document.getElementById('settingMenstrualQuota'),
    settingMenstrualOpeningBalance: document.getElementById('settingMenstrualOpeningBalance'),
    settingMenstrualHint: document.getElementById('settingMenstrualHint'),
    settingOfficeTarget: document.getElementById('settingOfficeTarget'),
    settingYear: document.getElementById('settingYear'),
    exportDataBtn: document.getElementById('exportDataBtn'),
    importDataInput: document.getElementById('importDataInput'),
    resetSampleDataBtn: document.getElementById('resetSampleDataBtn'),

    // Toast
    toastContainer: document.getElementById('toastContainer')
  };

  // --- TOAST NOTIFICATIONS ---
  function showToast(message, icon = '✅') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    elements.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      toast.style.transition = 'all 0.2s ease-out';
      setTimeout(() => toast.remove(), 200);
    }, 2800);
  }

  // --- STORAGE ENGINE (DUAL BACKEND / LOCALSTORAGE) ---
  async function checkServerConnection() {
    try {
      const res = await fetch('/api/status', { method: 'GET', cache: 'no-store' });
      if (res.ok) {
        state.isServerMode = true;
        console.log('Connected to WorkTracker Local Python Server (SQLite mode)');
        return true;
      }
    } catch (e) {
      state.isServerMode = false;
      console.log('Running in browser LocalStorage mode');
    }
    return false;
  }

  async function loadInitialData() {
    const serverAvailable = await checkServerConnection();

    if (serverAvailable) {
      try {
        const res = await fetch('/api/data');
        const data = await res.json();
        
        // Populate workDays
        state.workDays = {};
        if (data.work_days && Array.isArray(data.work_days)) {
          data.work_days.forEach(d => {
            state.workDays[d.date] = {
              status: d.status,
              leave_type: d.leave_type || '',
              note: d.note || '',
              half_day_type: d.half_day_type || ''
            };
          });
        }

        // Populate leaves
        state.leaves = data.leaves || [];

        // Populate settings
        if (data.settings) {
          state.settings = { ...state.settings, ...data.settings };
          // parse numbers safely (preserving 0 as a valid quota!)
          state.settings.annual_quota = parseQuota(state.settings.annual_quota, 20);
          state.settings.annual_opening_balance = parseQuota(state.settings.annual_opening_balance, 0);
          state.settings.sick_quota = parseQuota(state.settings.sick_quota, 10);
          state.settings.sick_opening_balance = parseQuota(state.settings.sick_opening_balance, 0);
          state.settings.casual_quota = parseQuota(state.settings.casual_quota, 0);
          state.settings.casual_opening_balance = parseQuota(state.settings.casual_opening_balance, 0);
          state.settings.optional_quota = parseQuota(state.settings.optional_quota, 0);
          state.settings.optional_opening_balance = parseQuota(state.settings.optional_opening_balance, 0);
          state.settings.menstrual_quota = parseQuota(state.settings.menstrual_quota, 12);
          state.settings.menstrual_opening_balance = parseQuota(state.settings.menstrual_opening_balance, 0);
          state.settings.joining_month_index = parseInt(state.settings.joining_month_index, 10) || 1;
          state.settings.fy_start_month = parseInt(state.settings.fy_start_month, 10) || 4;
          state.settings.fy_year = parseInt(state.settings.fy_year, 10) || 2026;
          state.settings.target_office_pct = parseQuota(state.settings.target_office_pct, 60);
        }
      } catch (err) {
        console.error('Error fetching data from server, falling back to localStorage:', err);
        loadFromLocalStorage();
      }
    } else {
      loadFromLocalStorage();
    }

    applyTheme(state.settings.theme || 'light');
    renderAll();
  }

  function loadFromLocalStorage() {
    try {
      const storedDays = localStorage.getItem('wt_work_days');
      if (storedDays) state.workDays = JSON.parse(storedDays);

      const storedLeaves = localStorage.getItem('wt_leaves');
      if (storedLeaves) state.leaves = JSON.parse(storedLeaves);

      const storedSettings = localStorage.getItem('wt_settings');
      if (storedSettings) {
        state.settings = { ...state.settings, ...JSON.parse(storedSettings) };
        state.settings.annual_quota = parseQuota(state.settings.annual_quota, 20);
        state.settings.annual_opening_balance = parseQuota(state.settings.annual_opening_balance, 0);
        state.settings.sick_quota = parseQuota(state.settings.sick_quota, 10);
        state.settings.sick_opening_balance = parseQuota(state.settings.sick_opening_balance, 0);
        state.settings.casual_quota = parseQuota(state.settings.casual_quota, 0);
        state.settings.casual_opening_balance = parseQuota(state.settings.casual_opening_balance, 0);
        state.settings.optional_quota = parseQuota(state.settings.optional_quota, 0);
        state.settings.optional_opening_balance = parseQuota(state.settings.optional_opening_balance, 0);
        state.settings.menstrual_quota = parseQuota(state.settings.menstrual_quota, 12);
        state.settings.menstrual_opening_balance = parseQuota(state.settings.menstrual_opening_balance, 0);
        state.settings.joining_month_index = parseInt(state.settings.joining_month_index, 10) || 1;
        state.settings.fy_start_month = parseInt(state.settings.fy_start_month, 10) || 4;
        state.settings.fy_year = parseInt(state.settings.fy_year, 10) || 2026;
        state.settings.target_office_pct = parseQuota(state.settings.target_office_pct, 60);
      }
    } catch (e) {
      console.error('Error reading localStorage:', e);
    }
  }

  function saveToLocalStorage() {
    try {
      localStorage.setItem('wt_work_days', JSON.stringify(state.workDays));
      localStorage.setItem('wt_leaves', JSON.stringify(state.leaves));
      localStorage.setItem('wt_settings', JSON.stringify(state.settings));
    } catch (e) {
      console.error('Error saving to localStorage:', e);
    }
  }

  async function persistDay(dateStr, status, leaveType = '', note = '', halfDayType = '') {
    if (status === 'clear') {
      delete state.workDays[dateStr];
    } else {
      state.workDays[dateStr] = {
        status,
        leave_type: leaveType,
        note,
        half_day_type: halfDayType
      };
    }
    saveToLocalStorage();

    if (state.isServerMode) {
      try {
        await fetch('/api/day', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: dateStr,
            status,
            leave_type: leaveType,
            note,
            half_day_type: halfDayType
          })
        });
      } catch (e) {
        console.error('Server sync error:', e);
      }
    }
    renderAll();
  }

  async function persistBatchDays(dates, status, leaveType = '', note = '') {
    dates.forEach(d => {
      if (status === 'clear') {
        delete state.workDays[d];
      } else {
        state.workDays[d] = {
          status,
          leave_type: leaveType,
          note,
          half_day_type: ''
        };
      }
    });
    saveToLocalStorage();

    if (state.isServerMode) {
      try {
        await fetch('/api/batch-days', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dates, status, leave_type: leaveType, note })
        });
      } catch (e) {
        console.error('Server batch sync error:', e);
      }
    }
    renderAll();
  }

  async function persistLeave(leaveData) {
    const newId = Date.now();
    const newLeave = {
      id: newId,
      ...leaveData
    };
    state.leaves.push(newLeave);

    // Also mark in workDays
    const startDt = parseDateKey(leaveData.start_date);
    const endDt = parseDateKey(leaveData.end_date);
    let curr = new Date(startDt);

    while (curr <= endDt) {
      if (!isWeekend(curr)) {
        const key = formatDateKey(curr);
        const dayStatus = leaveData.is_half_day ? 'half_leave' : 'leave';
        state.workDays[key] = {
          status: dayStatus,
          leave_type: leaveData.leave_type,
          note: leaveData.notes || leaveData.title,
          half_day_type: leaveData.half_day_period || ''
        };
      }
      curr.setDate(curr.getDate() + 1);
    }

    saveToLocalStorage();

    if (state.isServerMode) {
      try {
        const res = await fetch('/api/leaves', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(leaveData)
        });
        const json = await res.json();
        if (json.id) newLeave.id = json.id;
      } catch (e) {
        console.error('Server leave save error:', e);
      }
    }
    renderAll();
  }

  async function deleteLeave(leaveId) {
    const target = state.leaves.find(l => String(l.id) === String(leaveId));
    if (target) {
      // Remove marks on workDays
      const startDt = parseDateKey(target.start_date);
      const endDt = parseDateKey(target.end_date);
      let curr = new Date(startDt);
      while (curr <= endDt) {
        const key = formatDateKey(curr);
        if (state.workDays[key] && (state.workDays[key].status === 'leave' || state.workDays[key].status === 'half_leave')) {
          delete state.workDays[key];
        }
        curr.setDate(curr.getDate() + 1);
      }
    }

    state.leaves = state.leaves.filter(l => String(l.id) !== String(leaveId));
    saveToLocalStorage();

    if (state.isServerMode) {
      try {
        await fetch(`/api/leaves?id=${leaveId}`, { method: 'DELETE' });
      } catch (e) {
        console.error('Server delete error:', e);
      }
    }
    renderAll();
  }

  async function persistSettings(newSettings) {
    state.settings = { ...state.settings, ...newSettings };
    saveToLocalStorage();

    if (state.isServerMode) {
      try {
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newSettings)
        });
      } catch (e) {
        console.error('Server settings error:', e);
      }
    }
    renderAll();
  }

  // --- CALCULATIONS & STATS ---

  // Count working days between two dates inclusive
  function countWorkingDays(startDate, endDate) {
    let count = 0;
    let curr = new Date(startDate);
    while (curr <= endDate) {
      if (!isWeekend(curr)) {
        count++;
      }
      curr.setDate(curr.getDate() + 1);
    }
    return count;
  }

  // Calculate available leave balances breakdown
  function computeLeaveSummary() {
    const annualQuota = parseQuota(state.settings.annual_quota, 20);
    const annualOpening = parseQuota(state.settings.annual_opening_balance, 0);
    const sickQuota = parseQuota(state.settings.sick_quota, 10);
    const sickOpening = parseQuota(state.settings.sick_opening_balance, 0);
    const casualQuota = parseQuota(state.settings.casual_quota, 0);
    const casualOpening = parseQuota(state.settings.casual_opening_balance, 0);
    const optionalQuota = parseQuota(state.settings.optional_quota, 0);
    const optionalOpening = parseQuota(state.settings.optional_opening_balance, 0);
    const menstrualQuota = parseQuota(state.settings.menstrual_quota, 12);
    const menstrualOpening = parseQuota(state.settings.menstrual_opening_balance, 0);

    const joiningMonthIdx = parseInt(state.settings.joining_month_index, 10) || 1;
    const monthsEntitled = Math.max(1, Math.min(12, 13 - joiningMonthIdx));
    const isMidYear = joiningMonthIdx > 1;

    // Pro-rata calculations based on joining month in FY
    const proRataAnnual = Math.round((annualQuota * (monthsEntitled / 12)) * 10) / 10;
    const proRataSick = isMidYear ? Math.round((sickQuota * (monthsEntitled / 12)) * 10) / 10 : sickQuota;
    const proRataCasual = isMidYear ? Math.round((casualQuota * (monthsEntitled / 12)) * 10) / 10 : casualQuota;
    const proRataOptional = isMidYear ? Math.round((optionalQuota * (monthsEntitled / 12)) * 10) / 10 : optionalQuota;
    const proRataMenstrual = isMidYear ? Math.round((menstrualQuota * (monthsEntitled / 12)) * 10) / 10 : menstrualQuota;

    const categories = [
      {
        id: 'annual',
        name: 'Annual / Vacation',
        icon: '🏖️',
        baseQuota: annualQuota,
        openingBalance: annualOpening,
        proRataQuota: proRataAnnual,
        quota: annualOpening + proRataAnnual,
        isMidYear: isMidYear,
        monthsEntitled: monthsEntitled
      },
      {
        id: 'sick',
        name: 'Sick / Medical',
        icon: '🩺',
        baseQuota: sickQuota,
        openingBalance: sickOpening,
        proRataQuota: proRataSick,
        quota: sickOpening + proRataSick,
        isMidYear: isMidYear,
        monthsEntitled: monthsEntitled
      },
      {
        id: 'casual',
        name: 'Casual Leave',
        icon: '☕',
        baseQuota: casualQuota,
        openingBalance: casualOpening,
        proRataQuota: proRataCasual,
        quota: casualOpening + proRataCasual,
        isMidYear: isMidYear,
        monthsEntitled: monthsEntitled
      },
      {
        id: 'optional',
        name: 'Floating / Optional',
        icon: '⭐',
        baseQuota: optionalQuota,
        openingBalance: optionalOpening,
        proRataQuota: proRataOptional,
        quota: optionalOpening + proRataOptional,
        isMidYear: isMidYear,
        monthsEntitled: monthsEntitled
      },
      {
        id: 'menstrual',
        name: 'Menstrual Leave',
        icon: '🌸',
        baseQuota: menstrualQuota,
        openingBalance: menstrualOpening,
        proRataQuota: proRataMenstrual,
        quota: menstrualOpening + proRataMenstrual,
        isMidYear: isMidYear,
        monthsEntitled: monthsEntitled
      }
    ];

    const todayStr = formatDateKey(state.today);
    let totalQuota = 0;
    let totalTaken = 0;
    let totalPlanned = 0;

    const breakdown = categories.map(cat => {
      let taken = 0;
      let planned = 0;

      // Check all work days logged with this leave type
      Object.keys(state.workDays).forEach(dateStr => {
        const item = state.workDays[dateStr];
        if ((item.status === 'leave' || item.status === 'half_leave') && item.leave_type === cat.id) {
          const val = item.status === 'half_leave' ? 0.5 : 1.0;
          if (dateStr <= todayStr) {
            taken += val;
          } else {
            planned += val;
          }
        }
      });

      const totalUsed = taken + planned;
      const remaining = Math.max(0, cat.quota - totalUsed);
      const usedPct = cat.quota > 0 ? Math.min(100, (totalUsed / cat.quota) * 100) : 0;

      totalQuota += cat.quota;
      totalTaken += taken;
      totalPlanned += planned;

      return {
        ...cat,
        taken,
        planned,
        totalUsed,
        remaining,
        usedPct
      };
    });

    const totalUsedAll = totalTaken + totalPlanned;
    const totalRemaining = Math.max(0, totalQuota - totalUsedAll);
    const totalRemainingPct = totalQuota > 0 ? Math.max(0, Math.min(100, (totalRemaining / totalQuota) * 100)) : 0;

    return {
      breakdown,
      totalQuota,
      totalTaken,
      totalPlanned,
      totalUsedAll,
      totalRemaining,
      totalRemainingPct,
      annualOpening,
      joiningMonthIdx,
      monthsEntitled,
      isMidYear
    };
  }

  // Monthly Attendance & Hybrid Stats for state.viewDate
  function computeMonthStats(year, month) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let workingDays = 0;
    let officeCount = 0;
    let wfhCount = 0;
    let leaveCount = 0;
    let holidayCount = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      const isWknd = isWeekend(d);
      const dateStr = formatDateKey(d);
      const entry = state.workDays[dateStr];

      if (!isWknd) {
        workingDays++;
        if (entry) {
          if (entry.status === 'office') {
            officeCount += 1;
          } else if (entry.status === 'wfh') {
            wfhCount += 1;
          } else if (entry.status === 'half_office_wfh') {
            officeCount += 0.5;
            wfhCount += 0.5;
          } else if (entry.status === 'leave') {
            leaveCount += 1;
          } else if (entry.status === 'half_leave') {
            leaveCount += 0.5;
          } else if (entry.status === 'holiday') {
            holidayCount += 1;
          }
        }
      }
    }

    const targetPct = parseFloat(state.settings.target_office_pct) || 60;
    
    // Exact requested rule: Denominator = total working days - public holidays - leaves taken
    // Ex: 22 working days - 1 public holiday - 2 leaves = 19 effective days
    const effectiveWorkingDays = Math.max(0, workingDays - holidayCount - leaveCount);

    const calcPct = (num) => {
      if (effectiveWorkingDays <= 0) return 0;
      const raw = (num / effectiveWorkingDays) * 100;
      return raw % 1 === 0 ? raw : parseFloat(raw.toFixed(1));
    };

    const officeRate = calcPct(officeCount);
    const wfhRate = calcPct(wfhCount);
    const leaveRate = workingDays > 0 ? parseFloat(((leaveCount / workingDays) * 100).toFixed(1)) : 0;

    return {
      workingDays,
      holidayCount,
      leaveCount,
      effectiveWorkingDays,
      officeCount,
      wfhCount,
      officeRate,
      wfhRate,
      leaveRate,
      targetPct,
      isCompliant: officeRate >= targetPct
    };
  }

  // --- RENDERING FUNCTIONS ---

  function renderAll() {
    renderMonthHeader();
    renderKpis();
    renderCalendar();
    renderLeaveBreakdown();
    renderMenstrualSection();
    renderAccrualTracker();
    renderPlannedLeavesTable();
    renderAnalytics();
  }

  function renderMonthHeader() {
    const month = state.viewDate.getMonth();
    const year = state.viewDate.getFullYear();
    elements.currentMonthYear.textContent = `${getMonthName(month)} ${year}`;
  }

  function renderKpis() {
    const month = state.viewDate.getMonth();
    const year = state.viewDate.getFullYear();
    const stats = computeMonthStats(year, month);
    const leaveSummary = computeLeaveSummary();

    // 1. Office KPI
    elements.kpiOfficeCount.textContent = stats.officeCount;
    elements.kpiOfficeSubtext.textContent = `/ ${stats.effectiveWorkingDays} effective days`;
    elements.kpiOfficeProgress.style.width = `${Math.min(100, stats.officeRate)}%`;
    elements.kpiTargetPct.textContent = `${stats.targetPct}%`;
    
    if (elements.kpiOfficeFormulaHint) {
      elements.kpiOfficeFormulaHint.textContent = `Effective days after leave(s) is ${stats.effectiveWorkingDays} days`;
    }

    if (stats.officeCount === 0) {
      elements.kpiOfficeStatusBadge.textContent = '0% achieved';
      elements.kpiOfficeStatusBadge.className = 'status-pill status-pill-neutral';
    } else if (stats.officeRate >= stats.targetPct) {
      elements.kpiOfficeStatusBadge.textContent = `🎯 ${stats.officeRate}% on track`;
      elements.kpiOfficeStatusBadge.className = 'status-pill status-pill-success';
    } else {
      elements.kpiOfficeStatusBadge.textContent = `⚠️ ${stats.officeRate}% (target ${stats.targetPct}%)`;
      elements.kpiOfficeStatusBadge.className = 'status-pill status-pill-warning';
    }

    // 2. WFH KPI
    elements.kpiWfhCount.textContent = stats.wfhCount;
    elements.kpiWfhProgress.style.width = `${Math.min(100, stats.wfhRate)}%`;
    elements.kpiWfhPct.textContent = `${stats.wfhRate}%`;

    // 3. Available Leaves Summary KPI: Show each category distinctly as its own balance (no lumped overall total)
    const startMonth = parseInt(state.settings.fy_start_month, 10) || 4;
    const fyYear = parseInt(state.settings.fy_year, 10) || 2026;
    const fyInfo = getFyInfo(startMonth, fyYear);
    if (elements.kpiFyYearText) {
      elements.kpiFyYearText.textContent = fyInfo.label;
    }

    if (elements.kpiCategoryBalances) {
      const activeCats = leaveSummary.breakdown.filter(cat => cat.quota > 0);
      if (activeCats.length === 0) {
        elements.kpiCategoryBalances.innerHTML = '<span style="color: var(--text-muted); font-size: 0.75rem; padding: 0.4rem 0;">No active leave quotas configured in settings.</span>';
      } else {
        elements.kpiCategoryBalances.innerHTML = activeCats.map(cat => {
          const shortName = cat.name.split('/')[0].trim();
          let subDetail = `of ${cat.quota} days`;
          if (cat.openingBalance > 0) {
            subDetail = `${cat.quota}d (${cat.openingBalance}d open)`;
          } else if (cat.isMidYear) {
            subDetail = `${cat.quota}d pro-rata`;
          }
          return `
            <div class="kpi-cat-box" title="${cat.name}: ${cat.remaining} available of ${cat.quota} days (Taken: ${cat.taken}, Planned: ${cat.planned})">
              <div class="kpi-cat-box-header">
                <span>${cat.icon} ${shortName}</span>
                <span style="font-size: 0.65rem; color: var(--text-subtle);">${cat.taken} used</span>
              </div>
              <div class="kpi-cat-box-val" style="color: ${cat.remaining > 0 ? 'var(--color-success)' : 'var(--text-muted)'};">${cat.remaining}</div>
              <div class="kpi-cat-box-sub">${subDetail}</div>
            </div>
          `;
        }).join('');
      }
    }

    if (elements.kpiAvailableLeaves) elements.kpiAvailableLeaves.textContent = leaveSummary.totalRemaining;
    if (elements.kpiTotalQuotaSubtext) elements.kpiTotalQuotaSubtext.textContent = `/ ${leaveSummary.totalQuota} Total Quota`;
    if (elements.kpiLeavesProgress) elements.kpiLeavesProgress.style.width = `${leaveSummary.totalRemainingPct}%`;
    if (elements.kpiLeavesTaken) elements.kpiLeavesTaken.textContent = leaveSummary.totalTaken;
    if (elements.kpiLeavesPlanned) elements.kpiLeavesPlanned.textContent = leaveSummary.totalPlanned;
    if (elements.kpiLeavesRemaining) elements.kpiLeavesRemaining.textContent = leaveSummary.totalRemaining;

    // 4. Upcoming Leaves KPI
    const todayStr = formatDateKey(state.today);
    const upcomingLeaves = state.leaves
      .filter(l => l.start_date >= todayStr)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));

    if (upcomingLeaves.length === 0) {
      elements.kpiUpcomingContent.innerHTML = '<div class="empty-upcoming">No upcoming leaves scheduled.</div>';
    } else {
      const nextLeave = upcomingLeaves[0];
      const dateText = formatDateRangeShort(nextLeave.start_date, nextLeave.end_date);
      elements.kpiUpcomingContent.innerHTML = `
        <div style="font-weight: 700; color: var(--color-leave); display: flex; align-items: center; gap: 0.35rem;">
          <span>🌴</span> ${escapeHtml(nextLeave.title || nextLeave.leave_type)}
        </div>
        <div style="font-size: 0.775rem; color: var(--text-muted); margin-top: 2px;">
          📅 ${dateText} (${nextLeave.days_count} day${nextLeave.days_count === 1 ? '' : 's'})
        </div>
      `;
    }
  }

  function renderCalendar() {
    const year = state.viewDate.getFullYear();
    const month = state.viewDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const todayStr = formatDateKey(state.today);
    elements.calendarGrid.innerHTML = '';

    // Previous month filler cells
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const prevDate = daysInPrevMonth - i;
      const cell = document.createElement('div');
      cell.className = 'day-cell other-month';
      cell.innerHTML = `
        <div class="day-header">
          <span class="day-number">${prevDate}</span>
        </div>
      `;
      elements.calendarGrid.appendChild(cell);
    }

    // Current month cells
    for (let day = 1; day <= daysInMonth; day++) {
      const currentCellDate = new Date(year, month, day);
      const dateStr = formatDateKey(currentCellDate);
      const isWknd = isWeekend(currentCellDate);
      const isToday = dateStr === todayStr;
      const entry = state.workDays[dateStr];

      const cell = document.createElement('div');
      cell.className = `day-cell ${isWknd ? 'is-weekend' : ''} ${isToday ? 'is-today' : ''}`;
      cell.dataset.date = dateStr;

      let badgeHtml = '';
      if (entry) {
        if (entry.status === 'office') {
          badgeHtml = `<div class="day-status-badge badge-office"><span class="badge-icon">🏢</span> <span class="badge-text">Office</span></div>`;
        } else if (entry.status === 'wfh') {
          badgeHtml = `<div class="day-status-badge badge-wfh"><span class="badge-icon">🏠</span> <span class="badge-text">WFH</span></div>`;
        } else if (entry.status === 'half_office_wfh') {
          badgeHtml = `<div class="day-status-badge badge-half"><span class="badge-icon">🌓</span> <span class="badge-text">½ Off + ½ WFH</span></div>`;
        } else if (entry.status === 'leave') {
          if (entry.leave_type === 'menstrual') {
            badgeHtml = `<div class="day-status-badge badge-menstrual"><span class="badge-icon">🌸</span> <span class="badge-text">Menstrual</span></div>`;
          } else {
            const typeName = entry.leave_type ? entry.leave_type.toUpperCase() : 'LEAVE';
            badgeHtml = `<div class="day-status-badge badge-leave"><span class="badge-icon">🌴</span> <span class="badge-text">${typeName}</span></div>`;
          }
        } else if (entry.status === 'half_leave') {
          if (entry.leave_type === 'menstrual') {
            badgeHtml = `<div class="day-status-badge badge-menstrual"><span class="badge-icon">🌸</span> <span class="badge-text">½ Menstrual</span></div>`;
          } else {
            badgeHtml = `<div class="day-status-badge badge-half"><span class="badge-icon">🌓</span> <span class="badge-text">½ ${entry.leave_type || 'Leave'}</span></div>`;
          }
        } else if (entry.status === 'holiday') {
          badgeHtml = `<div class="day-status-badge badge-holiday"><span class="badge-icon">🎉</span> <span class="badge-text">Holiday</span></div>`;
        }

        if (entry.note) {
          badgeHtml += `<div class="day-note-preview" title="${escapeHtml(entry.note)}">${escapeHtml(entry.note)}</div>`;
        }
      }

      cell.innerHTML = `
        <div class="day-header">
          <span class="day-number">${day}</span>
        </div>
        ${badgeHtml}
      `;

      cell.addEventListener('click', () => openDayModal(dateStr));
      elements.calendarGrid.appendChild(cell);
    }

    // Next month filler cells to complete grid row
    const totalCells = firstDayIndex + daysInMonth;
    const remainingCells = (7 - (totalCells % 7)) % 7;
    for (let j = 1; j <= remainingCells; j++) {
      const cell = document.createElement('div');
      cell.className = 'day-cell other-month';
      cell.innerHTML = `
        <div class="day-header">
          <span class="day-number">${j}</span>
        </div>
      `;
      elements.calendarGrid.appendChild(cell);
    }
  }

  function renderLeaveBreakdown() {
    const summary = computeLeaveSummary();
    elements.leaveBreakdownGrid.innerHTML = '';

    // If quota is 0, it need not show up on the summary!
    const visibleCategories = summary.breakdown.filter(cat => cat.quota > 0);

    if (visibleCategories.length === 0) {
      elements.leaveBreakdownGrid.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; padding: 1.5rem; text-align: center; grid-column: 1 / -1;">No active leave quotas configured. Click "Edit Quotas" to set allowances.</div>';
    } else {
      visibleCategories.forEach(cat => {
        const card = document.createElement('div');
        card.className = 'leave-cat-card';

        let extraDetails = '';
        if (cat.openingBalance > 0) {
          extraDetails += `<span>Carried Fwd: <b>+${cat.openingBalance}</b></span>`;
        }
        if (cat.isMidYear) {
          extraDetails += `<span>Pro-rata (${cat.monthsEntitled} mos): <b>${cat.proRataQuota}</b></span>`;
        }

        card.innerHTML = `
          <div class="leave-cat-header">
            <span class="leave-cat-title">${cat.icon} ${cat.name}</span>
            <span class="badge ${cat.remaining > 0 ? 'badge-accent' : 'badge-neutral'}">${cat.remaining} Left</span>
          </div>
          <div class="leave-cat-balance">${cat.remaining} <span style="font-size: 0.8rem; font-weight: normal; color: var(--text-muted);">/ ${cat.quota} days</span></div>
          <div class="leave-cat-bar">
            <div class="leave-cat-fill" style="width: ${100 - cat.usedPct}%;"></div>
          </div>
          <div class="leave-cat-details">
            <span>Taken: <b>${cat.taken}</b></span>
            <span>Planned: <b>${cat.planned}</b></span>
            ${extraDetails}
            <span>Total Quota: <b>${cat.quota}</b></span>
          </div>
        `;
        elements.leaveBreakdownGrid.appendChild(card);
      });
    }

    // Also synchronize leave dropdowns so 0-quota categories do not clutter selections!
    updateLeaveTypeDropdowns(summary.breakdown);
  }

  function updateLeaveTypeDropdowns(categories) {
    const selects = [elements.leaveTypeSelect, elements.modalLeaveTypeSelect];
    selects.forEach(selectEl => {
      if (!selectEl) return;
      Array.from(selectEl.options).forEach(opt => {
        const val = opt.value;
        const target = categories.find(c => c.id === val);
        if (target) {
          if (target.quota <= 0) {
            opt.style.display = 'none';
            opt.disabled = true;
          } else {
            opt.style.display = '';
            opt.disabled = false;
          }
        }
      });
    });
  }

  function renderMenstrualSection() {
    if (!elements.menstrualCard) return;

    const month = state.viewDate.getMonth();
    const year = state.viewDate.getFullYear();
    const monthName = getMonthName(month);
    const quota = parseQuota(state.settings.menstrual_quota, 12);

    // If quota is 0, do not show on summary!
    if (quota <= 0) {
      elements.menstrualCard.style.display = 'none';
      return;
    }
    elements.menstrualCard.style.display = 'block';

    if (elements.menstrualMonthName) {
      elements.menstrualMonthName.textContent = `${monthName} ${year}`;
    }

    // Dynamic description based on exact quota
    const perMonthCalc = (quota / 12);
    const perMonthStr = perMonthCalc % 1 === 0 ? perMonthCalc.toString() : parseFloat(perMonthCalc.toFixed(1)).toString();

    // Check if menstrual leave is logged in this month
    let takenDateStr = null;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const dt = new Date(year, month, day);
      const str = formatDateKey(dt);
      const entry = state.workDays[str];
      if (entry && (entry.status === 'leave' || entry.status === 'half_leave') && entry.leave_type === 'menstrual') {
        takenDateStr = str;
        break;
      }
    }

    if (takenDateStr) {
      if (elements.menstrualMonthBadge) {
        elements.menstrualMonthBadge.textContent = '✅ Used This Month';
        elements.menstrualMonthBadge.className = 'status-pill status-pill-neutral';
      }
      if (elements.menstrualDesc) {
        elements.menstrualDesc.innerHTML = `You have utilized your menstrual leave for <strong>${monthName} ${year}</strong> (logged on <b>${formatDateDisplay(takenDateStr)}</b>). Organisation policy: <strong>${quota} days/year</strong> (${perMonthStr} day/month allowance).`;
      }
      if (elements.quickLogMenstrualBtn) elements.quickLogMenstrualBtn.style.display = 'none';
    } else {
      if (elements.menstrualMonthBadge) {
        elements.menstrualMonthBadge.textContent = `🟢 ${perMonthStr} Day Available`;
        elements.menstrualMonthBadge.className = 'status-pill status-pill-success';
      }
      if (elements.menstrualDesc) {
        elements.menstrualDesc.innerHTML = `Women employees are entitled to <strong>${perMonthStr} day(s) of Menstrual Leave</strong> per month (based on your organisation quota of <strong>${quota} days/year</strong>). Available for <strong>${monthName} ${year}</strong>.`;
      }
      if (elements.quickLogMenstrualBtn) elements.quickLogMenstrualBtn.style.display = 'inline-flex';
    }
  }

  function renderAccrualTracker() {
    if (!elements.accrualCard) return;

    const startMonth = parseInt(state.settings.fy_start_month, 10) || 4;
    const fyYear = parseInt(state.settings.fy_year, 10) || 2026;
    const joiningMonthIdx = parseInt(state.settings.joining_month_index, 10) || 1;
    const monthsEntitled = Math.max(1, Math.min(12, 13 - joiningMonthIdx));
    const openingBalance = parseQuota(state.settings.annual_opening_balance, 0);

    const fyInfo = getFyInfo(startMonth, fyYear);
    if (elements.accrualFyBadge) elements.accrualFyBadge.textContent = fyInfo.label;
    if (elements.navFyBadge) {
      elements.navFyBadge.innerHTML = `<span class="fy-full">${escapeHtml(fyInfo.label)} (${escapeHtml(fyInfo.sub)})</span><span class="fy-compact">${escapeHtml(fyInfo.label)}</span>`;
    }

    const fyMonths = getFyMonthsList(startMonth, fyYear);
    const today = state.today;
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth(); // 0-11

    const isAnnualMode = (state.accrualViewMode || 'annual') === 'annual';

    if (elements.accrualViewAnnualBtn && elements.accrualViewSickBtn) {
      if (isAnnualMode) {
        elements.accrualViewAnnualBtn.classList.add('active');
        elements.accrualViewSickBtn.classList.remove('active');
      } else {
        elements.accrualViewSickBtn.classList.add('active');
        elements.accrualViewAnnualBtn.classList.remove('active');
      }
    }

    if (isAnnualMode) {
      // --- ANNUAL LEAVE ACCRUAL MODE ---
      const annualQuota = parseQuota(state.settings.annual_quota, 20);
      const proRataAnnual = Math.round((annualQuota * (monthsEntitled / 12)) * 10) / 10;
      const totalAnnualEntitled = openingBalance + proRataAnnual;

      const monthlyRate = annualQuota / 12;
      const rateDisplay = (monthlyRate % 1 === 0 ? monthlyRate : parseFloat(monthlyRate.toFixed(4))).toString();
      const rateDisplayShort = (monthlyRate % 1 === 0 ? monthlyRate : parseFloat(monthlyRate.toFixed(2))).toString();

      if (elements.accrualCardTitle) {
        elements.accrualCardTitle.textContent = '📅 Monthly Leave Credit & Accrual Tracker';
      }

      // Formula description: "1.67 leaves credited per month (20 ÷ 12)" (NO "Technically"!)
      if (elements.accrualFormulaSubtext) {
        let formulaText = `${rateDisplay} leaves credited per month (${annualQuota} ÷ 12)`;
        if (joiningMonthIdx > 1) {
          formulaText += ` • Joined Month ${joiningMonthIdx} (${fyMonths[joiningMonthIdx - 1]?.name}): ${proRataAnnual} pro-rata leaves (${monthsEntitled} mos)`;
        }
        if (openingBalance > 0) {
          formulaText += ` • +${openingBalance} carried-forward opening balance`;
        }
        elements.accrualFormulaSubtext.textContent = formulaText;
      }

      // Metric card headers
      if (elements.accrualMetric1Label) elements.accrualMetric1Label.textContent = 'Monthly Credit Rate';
      if (elements.accrualMetric1Sub) elements.accrualMetric1Sub.textContent = 'days / month';
      if (elements.accrualRateVal) elements.accrualRateVal.textContent = rateDisplayShort;

      if (elements.accrualMetric2Label) elements.accrualMetric2Label.textContent = 'Accrued YTD';
      if (elements.accrualMetric2Sub) elements.accrualMetric2Sub.textContent = openingBalance > 0 ? `incl. ${openingBalance}d opening` : 'up to current month';

      if (elements.accrualMetric3Label) elements.accrualMetric3Label.textContent = 'Annual Leaves Taken';
      if (elements.accrualMetric3Sub) elements.accrualMetric3Sub.textContent = 'in active FY';

      if (elements.accrualMetric4Label) elements.accrualMetric4Label.textContent = 'Net Available Balance';
      if (elements.accrualMetric4Sub) elements.accrualMetric4Sub.textContent = 'accrued minus taken';

      // Table Header Row
      if (elements.accrualTableHeadRow) {
        elements.accrualTableHeadRow.innerHTML = `
          <th>Month</th>
          <th>Credit Added</th>
          <th>Cumulative Accrued</th>
          <th>Leaves Taken</th>
          <th>Net Accrued Balance</th>
          <th>Status</th>
        `;
      }

      let cumulativeAccrued = openingBalance;
      let cumulativeTaken = 0;
      let ytdAccrued = openingBalance;
      let ytdTaken = 0;

      if (elements.accrualTableBody) {
        elements.accrualTableBody.innerHTML = '';

        fyMonths.forEach((mObj, idx) => {
          const monthNum = idx + 1;
          const isBeforeJoining = monthNum < joiningMonthIdx;
          const isJoiningMonth = monthNum === joiningMonthIdx;

          // Credit added this month
          let addedThisMonth = 0;
          if (!isBeforeJoining) {
            addedThisMonth = monthlyRate;
            cumulativeAccrued += addedThisMonth;
          }

          // Count annual leaves taken in mObj (monthIndex, year)
          let leavesInMonth = 0;
          if (!isBeforeJoining) {
            const daysCount = new Date(mObj.year, mObj.monthIndex + 1, 0).getDate();
            for (let d = 1; d <= daysCount; d++) {
              const dt = new Date(mObj.year, mObj.monthIndex, d);
              const str = formatDateKey(dt);
              const entry = state.workDays[str];
              if (entry && (entry.status === 'leave' || entry.status === 'half_leave') && entry.leave_type === 'annual') {
                leavesInMonth += (entry.status === 'half_leave' ? 0.5 : 1.0);
              }
            }
          }

          cumulativeTaken += leavesInMonth;
          const netAccrued = Math.max(0, cumulativeAccrued - cumulativeTaken);

          const isCurrentMonth = mObj.year === todayYear && mObj.monthIndex === todayMonth;
          const isPastMonth = mObj.year < todayYear || (mObj.year === todayYear && mObj.monthIndex < todayMonth);

          if (!isBeforeJoining && (isCurrentMonth || isPastMonth)) {
            ytdAccrued = cumulativeAccrued;
            ytdTaken = cumulativeTaken;
          }

          let statusBadge = '';
          if (isBeforeJoining) {
            statusBadge = '<span class="status-pill status-pill-neutral">Not Joined</span>';
          } else if (isCurrentMonth) {
            statusBadge = '<span class="status-pill status-pill-success">● Current Month</span>';
          } else if (isPastMonth) {
            statusBadge = '<span class="status-pill status-pill-neutral">Accrued</span>';
          } else {
            statusBadge = '<span class="status-pill status-pill-warning">Upcoming</span>';
          }

          let creditCellText = `+${rateDisplayShort} days`;
          if (isBeforeJoining) {
            creditCellText = '0 days';
          } else if (isJoiningMonth && openingBalance > 0) {
            creditCellText = `+${rateDisplayShort} (+${openingBalance} open)`;
          }

          const tr = document.createElement('tr');
          if (isCurrentMonth) tr.className = 'current-month-row';

          tr.innerHTML = `
            <td><strong>${mObj.name} ${mObj.year}</strong> (Month ${monthNum})${isJoiningMonth && joiningMonthIdx > 1 ? ' 🏷️ <i>Joined</i>' : ''}</td>
            <td>${creditCellText}</td>
            <td><b>${parseFloat(cumulativeAccrued.toFixed(2))}</b> days</td>
            <td>${leavesInMonth > 0 ? `<b>${leavesInMonth}</b> days` : '0'}</td>
            <td style="color: ${netAccrued >= 0 ? 'var(--color-success)' : 'var(--color-danger)'}; font-weight: 700;">
              ${parseFloat(netAccrued.toFixed(2))} days
            </td>
            <td>${statusBadge}</td>
          `;
          elements.accrualTableBody.appendChild(tr);
        });
      }

      if (elements.accrualYtdVal) elements.accrualYtdVal.textContent = parseFloat(ytdAccrued.toFixed(2));
      if (elements.accrualTakenVal) elements.accrualTakenVal.textContent = parseFloat(ytdTaken.toFixed(1));
      const netYtd = Math.max(0, ytdAccrued - ytdTaken);
      if (elements.accrualNetBalanceVal) elements.accrualNetBalanceVal.textContent = parseFloat(netYtd.toFixed(2));

    } else {
      // --- SICK LEAVE MONTHLY SEGREGATION MODE ---
      // Upfront credited quota with month-by-month segregation
      const sickQuota = parseQuota(state.settings.sick_quota, 10);
      const sickOpening = parseQuota(state.settings.sick_opening_balance, 0);
      const isMidYear = joiningMonthIdx > 1;
      const proRataSick = isMidYear ? Math.round((sickQuota * (monthsEntitled / 12)) * 10) / 10 : sickQuota;
      const totalSickEntitled = sickOpening + proRataSick;

      if (elements.accrualCardTitle) {
        elements.accrualCardTitle.textContent = '🩺 Sick Leave Monthly Usage & Balance Segregation';
      }

      if (elements.accrualFormulaSubtext) {
        let formulaText = `Credited at one go: ${sickQuota + sickOpening} days upfront allowance`;
        if (sickOpening > 0) {
          formulaText += ` (incl. +${sickOpening} opening balance)`;
        }
        if (isMidYear) {
          formulaText += ` • Pro-rated to ${totalSickEntitled} days for joining in Month ${joiningMonthIdx} (${fyMonths[joiningMonthIdx - 1]?.name})`;
        }
        elements.accrualFormulaSubtext.textContent = formulaText;
      }

      // Metric card headers for Sick Leave
      if (elements.accrualMetric1Label) elements.accrualMetric1Label.textContent = 'Upfront Credited Quota';
      if (elements.accrualMetric1Sub) elements.accrualMetric1Sub.textContent = sickOpening > 0 ? `incl. +${sickOpening} opening` : 'credited at one go';
      if (elements.accrualRateVal) elements.accrualRateVal.textContent = totalSickEntitled.toString();

      if (elements.accrualMetric2Label) elements.accrualMetric2Label.textContent = 'Sick Leaves Taken YTD';
      if (elements.accrualMetric2Sub) elements.accrualMetric2Sub.textContent = 'up to current month';

      if (elements.accrualMetric3Label) elements.accrualMetric3Label.textContent = 'Current Available Balance';
      if (elements.accrualMetric3Sub) elements.accrualMetric3Sub.textContent = 'quota minus taken YTD';

      if (elements.accrualMetric4Label) elements.accrualMetric4Label.textContent = 'Full FY Balance';
      if (elements.accrualMetric4Sub) elements.accrualMetric4Sub.textContent = 'after all logged leaves';

      // Table Header Row for Sick Leave
      if (elements.accrualTableHeadRow) {
        elements.accrualTableHeadRow.innerHTML = `
          <th>Month</th>
          <th>Credit Allocation</th>
          <th>Leaves Taken in Month</th>
          <th>Cumulative Taken</th>
          <th>Remaining Sick Balance</th>
          <th>Status</th>
        `;
      }

      let cumulativeTaken = 0;
      let ytdTaken = 0;
      let totalFyTaken = 0;

      // Count total sick leaves across all FY months
      fyMonths.forEach(mObj => {
        const daysCount = new Date(mObj.year, mObj.monthIndex + 1, 0).getDate();
        for (let d = 1; d <= daysCount; d++) {
          const dt = new Date(mObj.year, mObj.monthIndex, d);
          const str = formatDateKey(dt);
          const entry = state.workDays[str];
          if (entry && (entry.status === 'leave' || entry.status === 'half_leave') && entry.leave_type === 'sick') {
            totalFyTaken += (entry.status === 'half_leave' ? 0.5 : 1.0);
          }
        }
      });

      if (elements.accrualTableBody) {
        elements.accrualTableBody.innerHTML = '';

        fyMonths.forEach((mObj, idx) => {
          const monthNum = idx + 1;
          const isBeforeJoining = monthNum < joiningMonthIdx;
          const isJoiningMonth = monthNum === joiningMonthIdx;

          let leavesInMonth = 0;
          if (!isBeforeJoining) {
            const daysCount = new Date(mObj.year, mObj.monthIndex + 1, 0).getDate();
            for (let d = 1; d <= daysCount; d++) {
              const dt = new Date(mObj.year, mObj.monthIndex, d);
              const str = formatDateKey(dt);
              const entry = state.workDays[str];
              if (entry && (entry.status === 'leave' || entry.status === 'half_leave') && entry.leave_type === 'sick') {
                leavesInMonth += (entry.status === 'half_leave' ? 0.5 : 1.0);
              }
            }
            cumulativeTaken += leavesInMonth;
          }

          const isCurrentMonth = mObj.year === todayYear && mObj.monthIndex === todayMonth;
          const isPastMonth = mObj.year < todayYear || (mObj.year === todayYear && mObj.monthIndex < todayMonth);

          if (!isBeforeJoining && (isCurrentMonth || isPastMonth)) {
            ytdTaken = cumulativeTaken;
          }

          const remainingSick = Math.max(0, totalSickEntitled - cumulativeTaken);

          let statusBadge = '';
          if (isBeforeJoining) {
            statusBadge = '<span class="status-pill status-pill-neutral">Not Joined</span>';
          } else if (isCurrentMonth) {
            statusBadge = '<span class="status-pill status-pill-success">● Current Month</span>';
          } else if (isPastMonth) {
            statusBadge = '<span class="status-pill status-pill-neutral">Completed</span>';
          } else {
            statusBadge = '<span class="status-pill status-pill-warning">Upcoming</span>';
          }

          let allocText = '-';
          if (isJoiningMonth) {
            allocText = `<b>+${totalSickEntitled}</b> days (Credited upfront${sickOpening > 0 ? `, incl. +${sickOpening} open` : ''})`;
          } else if (!isBeforeJoining) {
            allocText = '<span style="color: var(--text-muted); font-size: 0.75rem;">(Upfront credited)</span>';
          }

          const tr = document.createElement('tr');
          if (isCurrentMonth) tr.className = 'current-month-row';

          tr.innerHTML = `
            <td><strong>${mObj.name} ${mObj.year}</strong> (Month ${monthNum})${isJoiningMonth && joiningMonthIdx > 1 ? ' 🏷️ <i>Joined</i>' : ''}</td>
            <td>${allocText}</td>
            <td>${leavesInMonth > 0 ? `<b>${leavesInMonth}</b> days` : '0'}</td>
            <td><b>${cumulativeTaken}</b> days</td>
            <td style="color: ${remainingSick > 0 ? 'var(--color-success)' : 'var(--text-muted)'}; font-weight: 700;">
              ${isBeforeJoining ? '-' : `${remainingSick} days`}
            </td>
            <td>${statusBadge}</td>
          `;
          elements.accrualTableBody.appendChild(tr);
        });
      }

      if (elements.accrualYtdVal) elements.accrualYtdVal.textContent = parseFloat(ytdTaken.toFixed(1));
      if (elements.accrualTakenVal) elements.accrualTakenVal.textContent = parseFloat(totalFyTaken.toFixed(1));
      const curRem = Math.max(0, totalSickEntitled - ytdTaken);
      if (elements.accrualNetBalanceVal) elements.accrualNetBalanceVal.textContent = parseFloat(curRem.toFixed(1));
    }
  }

  function renderPlannedLeavesTable() {
    const todayStr = formatDateKey(state.today);
    let list = [...state.leaves];

    if (state.leaveFilter === 'upcoming') {
      list = list.filter(l => l.start_date >= todayStr);
    } else if (state.leaveFilter === 'past') {
      list = list.filter(l => l.start_date < todayStr);
    }

    list.sort((a, b) => b.start_date.localeCompare(a.start_date));

    elements.plannedLeavesTableBody.innerHTML = '';
    if (list.length === 0) {
      elements.noLeavesPlaceholder.classList.remove('hidden');
    } else {
      elements.noLeavesPlaceholder.classList.add('hidden');
      list.forEach(leave => {
        const tr = document.createElement('tr');
        const isPast = leave.start_date < todayStr;
        const statusPill = isPast
          ? '<span class="status-pill status-pill-neutral">Completed</span>'
          : '<span class="status-pill status-pill-success">Upcoming</span>';

        const dateRange = formatDateRangeDisplay(leave.start_date, leave.end_date);

        tr.innerHTML = `
          <td>
            <strong>${escapeHtml(leave.title || 'Leave')}</strong>
            ${leave.notes ? `<div style="font-size: 0.725rem; color: var(--text-muted);">${escapeHtml(leave.notes)}</div>` : ''}
          </td>
          <td><span class="badge badge-accent">${escapeHtml(leave.leave_type)}</span></td>
          <td>${dateRange}</td>
          <td><strong>${leave.days_count}</strong> day${leave.days_count === 1 ? '' : 's'}</td>
          <td>${statusPill}</td>
          <td>
            <button class="btn btn-ghost text-danger btn-xs" data-delete-leave="${leave.id}" title="Cancel Leave">
              Cancel
            </button>
          </td>
        `;
        elements.plannedLeavesTableBody.appendChild(tr);
      });

      // Attach cancel listeners
      elements.plannedLeavesTableBody.querySelectorAll('[data-delete-leave]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-delete-leave');
          if (confirm('Are you sure you want to cancel this planned leave? Calendar entries will be cleared.')) {
            deleteLeave(id);
            showToast('Leave cancelled', '🗑️');
          }
        });
      });
    }
  }

  function renderAnalytics() {
    const year = state.viewDate.getFullYear();
    const month = state.viewDate.getMonth();
    const stats = computeMonthStats(year, month);

    if (elements.statWorkingDays) {
      elements.statWorkingDays.textContent = stats.effectiveWorkingDays;
      const titleEl = elements.statWorkingDays.parentElement ? elements.statWorkingDays.parentElement.querySelector('.stat-box-title') : null;
      if (titleEl) titleEl.textContent = 'Effective Working Days';
      const subEl = elements.statWorkingDays.parentElement ? elements.statWorkingDays.parentElement.querySelector('.stat-box-sub') : null;
      if (subEl) subEl.textContent = `${stats.workingDays} working - ${stats.holidayCount} hol - ${stats.leaveCount} lve`;
    }

    if (elements.statOfficeDays) elements.statOfficeDays.textContent = stats.officeCount;
    if (elements.statOfficeRate) elements.statOfficeRate.textContent = `${stats.officeRate}% (${stats.officeCount}/${stats.effectiveWorkingDays} effective days)`;
    if (elements.statWfhDays) elements.statWfhDays.textContent = stats.wfhCount;
    if (elements.statWfhRate) elements.statWfhRate.textContent = `${stats.wfhRate}% (${stats.wfhCount}/${stats.effectiveWorkingDays} effective days)`;
    if (elements.statLeaveDays) elements.statLeaveDays.textContent = stats.leaveCount;
    if (elements.statLeaveRate) elements.statLeaveRate.textContent = `${stats.holidayCount} holiday(s) + ${stats.leaveCount} leave(s)`;

    if (elements.analyticsCurrentRate) elements.analyticsCurrentRate.textContent = `${stats.officeRate}%`;
    if (elements.analyticsTargetRate) elements.analyticsTargetRate.textContent = `${stats.targetPct}%`;
    if (elements.analyticsComplianceFill) elements.analyticsComplianceFill.style.width = `${Math.min(100, stats.officeRate)}%`;
    if (elements.analyticsTargetMarker) elements.analyticsTargetMarker.style.left = `${stats.targetPct}%`;

    if (elements.analyticsComplianceMessage) {
      if (stats.officeRate >= stats.targetPct) {
        elements.analyticsComplianceMessage.innerHTML = `
          <span style="color: var(--color-success); font-weight: 700;">🎉 Excellent!</span> 
          You have achieved <b>${stats.officeRate}%</b> office attendance, meeting your hybrid target of <b>${stats.targetPct}%</b>.
        `;
      } else {
        const needed = Math.ceil(((stats.targetPct / 100) * stats.effectiveWorkingDays) - stats.officeCount);
        elements.analyticsComplianceMessage.innerHTML = `
          <span style="color: var(--color-warning); font-weight: 700;">⚠️ Below Target:</span> 
          Currently at <b>${stats.officeRate}%</b> (${stats.officeCount}/${stats.effectiveWorkingDays} effective days). You need approximately <b>${Math.max(1, needed)}</b> more office day(s) this month to meet your <b>${stats.targetPct}%</b> target.
        `;
      }
    }

    if (elements.analyticsFormulaBox) {
      elements.analyticsFormulaBox.innerHTML = `
        <div style="font-weight: 700; margin-bottom: 0.35rem; display: flex; align-items: center; gap: 0.4rem;">
          <span>📐</span> Office % Calculation Breakdown:
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 0.5rem; margin-top: 0.4rem; font-size: 0.8rem;">
          <div>• Calendar Working Days (Mon–Fri): <b>${stats.workingDays}</b></div>
          <div>• Public Holidays Deducted: <b>-${stats.holidayCount}</b></div>
          <div>• Leaves Taken Deducted: <b>-${stats.leaveCount}</b></div>
          <div style="color: var(--color-primary); font-weight: 700;">• Effective days after leave(s) is <b>${stats.effectiveWorkingDays} days</b></div>
        </div>
        <div style="margin-top: 0.55rem; padding-top: 0.45rem; border-top: 1px dashed var(--border-color); font-weight: 600; font-size: 0.825rem;">
          Office Rate = ${stats.officeCount} office days ÷ ${stats.effectiveWorkingDays} effective days = <span style="font-size: 1.05rem; color: var(--color-primary); font-weight: 800;">${stats.officeRate}%</span>
        </div>
      `;
    }

    // Weekly Breakdown Table
    renderWeeklyBreakdown(year, month);

    // YTD Stats
    renderYtdStats(year);
  }

  function renderWeeklyBreakdown(year, month) {
    elements.weeklyBreakdownBody.innerHTML = '';
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Group days into calendar weeks
    let currentWeek = 1;
    let weekOffice = 0;
    let weekWfh = 0;
    let weekLeaves = 0;
    let weekHolidays = 0;
    let weekWorkingDays = 0;
    let weekStart = 1;

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      const dateStr = formatDateKey(d);
      const isWknd = isWeekend(d);
      const entry = state.workDays[dateStr];

      if (!isWknd) {
        weekWorkingDays++;
        if (entry) {
          if (entry.status === 'office') weekOffice += 1;
          else if (entry.status === 'wfh') weekWfh += 1;
          else if (entry.status === 'half_office_wfh') { weekOffice += 0.5; weekWfh += 0.5; }
          else if (entry.status === 'leave') weekLeaves += 1;
          else if (entry.status === 'half_leave') weekLeaves += 0.5;
          else if (entry.status === 'holiday') weekHolidays += 1;
        }
      }

      // If Sunday or last day of month, close the week
      if (d.getDay() === 6 || day === daysInMonth) {
        if (weekWorkingDays > 0) {
          const weekEffective = Math.max(0, weekWorkingDays - weekHolidays - weekLeaves);
          const rawRate = weekEffective > 0 ? (weekOffice / weekEffective) * 100 : 0;
          const rate = rawRate % 1 === 0 ? rawRate : parseFloat(rawRate.toFixed(1));
          const target = parseFloat(state.settings.target_office_pct) || 60;
          const statusBadge = rate >= target
            ? `<span class="status-pill status-pill-success">Met Target</span>`
            : `<span class="status-pill status-pill-warning">${rate}%</span>`;

          const startDayStr = String(weekStart).padStart(2, '0');
          const endDayStr = String(day).padStart(2, '0');
          const mmm = getShortMonthName(month);

          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><strong>Week ${currentWeek}</strong></td>
            <td>${startDayStr} ${mmm} – ${endDayStr} ${mmm}</td>
            <td><b>${weekOffice}</b> / ${weekEffective} days</td>
            <td><b>${weekWfh}</b> days</td>
            <td><b>${weekLeaves}</b> leaves ${weekHolidays > 0 ? `(+${weekHolidays} hol)` : ''}</td>
            <td><b>${rate}%</b></td>
            <td>${statusBadge}</td>
          `;
          elements.weeklyBreakdownBody.appendChild(tr);
        }
        currentWeek++;
        weekOffice = 0;
        weekWfh = 0;
        weekLeaves = 0;
        weekHolidays = 0;
        weekWorkingDays = 0;
        weekStart = day + 1;
      }
    }
  }

  function renderYtdStats(year) {
    elements.ytdYearLabel.textContent = `${year} YTD`;
    elements.ytdStatsGrid.innerHTML = '';

    let ytdOffice = 0;
    let ytdWfh = 0;
    let ytdLeaves = 0;
    let ytdHolidays = 0;
    let ytdWorkingDays = 0;

    const todayYear = state.today.getFullYear();
    const maxMonth = year === todayYear ? state.today.getMonth() : 11;

    for (let m = 0; m <= maxMonth; m++) {
      const daysCount = new Date(year, m + 1, 0).getDate();
      for (let d = 1; d <= daysCount; d++) {
        const dt = new Date(year, m, d);
        if (dt > state.today && year === todayYear) break;
        if (!isWeekend(dt)) {
          ytdWorkingDays++;
          const str = formatDateKey(dt);
          const entry = state.workDays[str];
          if (entry) {
            if (entry.status === 'office') ytdOffice += 1;
            else if (entry.status === 'wfh') ytdWfh += 1;
            else if (entry.status === 'half_office_wfh') { ytdOffice += 0.5; ytdWfh += 0.5; }
            else if (entry.status === 'leave') ytdLeaves += 1;
            else if (entry.status === 'half_leave') ytdLeaves += 0.5;
            else if (entry.status === 'holiday') ytdHolidays += 1;
          }
        }
      }
    }

    const ytdEffective = Math.max(0, ytdWorkingDays - ytdHolidays - ytdLeaves);
    const rawOfficeRate = ytdEffective > 0 ? (ytdOffice / ytdEffective) * 100 : 0;
    const ytdOfficeRate = rawOfficeRate % 1 === 0 ? rawOfficeRate : parseFloat(rawOfficeRate.toFixed(1));

    const rawWfhRate = ytdEffective > 0 ? (ytdWfh / ytdEffective) * 100 : 0;
    const ytdWfhRate = rawWfhRate % 1 === 0 ? rawWfhRate : parseFloat(rawWfhRate.toFixed(1));

    const cardsData = [
      { label: 'YTD Effective Working Days', val: ytdEffective, sub: `${ytdWorkingDays} total - ${ytdHolidays} hols - ${ytdLeaves} leaves` },
      { label: 'YTD Office Days', val: ytdOffice, sub: `${ytdOfficeRate}% attendance (${ytdOffice}/${ytdEffective})` },
      { label: 'YTD WFH Days', val: ytdWfh, sub: `${ytdWfhRate}% remote (${ytdWfh}/${ytdEffective})` },
      { label: 'YTD Time Off', val: `${ytdLeaves} Leaves`, sub: `${ytdHolidays} Public Holidays` }
    ];

    cardsData.forEach(c => {
      const card = document.createElement('div');
      card.className = 'stat-box';
      card.innerHTML = `
        <div class="stat-box-title">${c.label}</div>
        <div class="stat-box-num">${c.val}</div>
        <div class="stat-box-sub">${c.sub}</div>
      `;
      elements.ytdStatsGrid.appendChild(card);
    });
  }

  // --- DAY MODAL HANDLERS ---
  function openDayModal(dateStr) {
    state.selectedDateStr = dateStr;
    const d = parseDateKey(dateStr);
    const dayName = getDayName(d.getDay());
    const monthName = getMonthName(d.getMonth());

    elements.modalDateTitle.textContent = formatDateDisplay(d);
    elements.modalDaySubtitle.textContent = dayName;

    const existing = state.workDays[dateStr];
    state.selectedModalStatus = existing ? existing.status : 'office';

    // Highlight selected button
    elements.statusChoiceBtns.forEach(btn => {
      btn.classList.toggle('selected', btn.getAttribute('data-status') === state.selectedModalStatus);
    });

    // Leave extra options
    if (state.selectedModalStatus === 'leave' || state.selectedModalStatus === 'half_leave') {
      elements.modalLeaveOptions.classList.remove('hidden');
      elements.modalLeaveTypeSelect.value = existing?.leave_type || 'annual';
      elements.modalLeaveHalfSelect.value = existing?.half_day_type || 'full';
    } else {
      elements.modalLeaveOptions.classList.add('hidden');
    }

    elements.modalDayNote.value = existing?.note || '';
    elements.dayModal.showModal();
  }

  function closeDayModal() {
    elements.dayModal.close();
  }

  // --- LEAVE DURATION ESTIMATOR ---
  function updateLeaveFormEstimate() {
    const startStr = elements.leaveStartDate ? elements.leaveStartDate.value : '';
    const endStr = elements.leaveEndDate ? elements.leaveEndDate.value : '';
    const durationVal = elements.leaveDurationMode ? elements.leaveDurationMode.value : 'full';
    const isHalf = (durationVal || '').startsWith('half');
    const cat = elements.leaveTypeSelect ? elements.leaveTypeSelect.value : 'annual';

    if (!startStr) {
      if (elements.calculatedLeaveDays) elements.calculatedLeaveDays.textContent = '0';
      if (elements.leaveQuotaRemainingHint) elements.leaveQuotaRemainingHint.textContent = '';
      return;
    }

    if (isHalf) {
      if (elements.leaveEndDateGroup) elements.leaveEndDateGroup.style.display = 'none';
      if (elements.calculatedLeaveDays) elements.calculatedLeaveDays.textContent = '0.5';
    } else {
      if (elements.leaveEndDateGroup) elements.leaveEndDateGroup.style.display = 'flex';
      if (!endStr) {
        if (elements.calculatedLeaveDays) elements.calculatedLeaveDays.textContent = '0';
        return;
      }
      const s = parseDateKey(startStr);
      const e = parseDateKey(endStr);
      if (e < s) {
        if (elements.calculatedLeaveDays) elements.calculatedLeaveDays.textContent = 'Invalid range';
        return;
      }
      const days = countWorkingDays(s, e);
      if (elements.calculatedLeaveDays) elements.calculatedLeaveDays.textContent = days.toString();
    }

    // Dynamic description based on category quota
    const summary = computeLeaveSummary();
    const targetCat = summary.breakdown.find(b => b.id === cat);
    if (targetCat && elements.leaveQuotaRemainingHint) {
      if (targetCat.quota <= 0) {
        elements.leaveQuotaRemainingHint.textContent = `⚠️ Category has 0 quota allocated in settings.`;
      } else {
        const accrualHint = targetCat.id === 'annual' ? ` (~${(targetCat.quota / 12).toFixed(2)} credited/month)` : '';
        elements.leaveQuotaRemainingHint.textContent = `Available balance: ${targetCat.remaining} / ${targetCat.quota} days${accrualHint}`;
      }
    }
  }

  // --- THEME ---
  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      elements.themeIcon.textContent = '☀️';
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      elements.themeIcon.textContent = '🌙';
    }
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    state.settings.theme = next;
    applyTheme(next);
    persistSettings({ theme: next });
  }

  // --- SAMPLE DATA GENERATOR ---
  function loadSampleData() {
    const year = state.today.getFullYear();
    const month = state.today.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    state.workDays = {};
    const workingDaysList = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      if (!isWeekend(d)) {
        workingDaysList.push(formatDateKey(d));
      }
    }

    // Exact scenario: working days minus 1 holiday minus 2 leaves
    // e.g. 22 working days - 1 holiday - 2 leaves = 19 effective days
    // 8 office days => 8 / 19 = 42.1%
    if (workingDaysList.length >= 12) {
      // 1 Public Holiday
      state.workDays[workingDaysList[0]] = { status: 'holiday', leave_type: '', note: 'Public Holiday', half_day_type: '' };

      // 2 Days Leave
      state.workDays[workingDaysList[1]] = { status: 'leave', leave_type: 'annual', note: 'Annual Leave', half_day_type: '' };
      state.workDays[workingDaysList[2]] = { status: 'leave', leave_type: 'annual', note: 'Annual Leave', half_day_type: '' };

      // 8 Office Days
      const officeLimit = Math.min(workingDaysList.length, 11);
      for (let i = 3; i < officeLimit; i++) {
        state.workDays[workingDaysList[i]] = { status: 'office', leave_type: '', note: 'Office Attendance', half_day_type: '' };
      }

      // Remaining as WFH
      for (let i = officeLimit; i < workingDaysList.length; i++) {
        state.workDays[workingDaysList[i]] = { status: 'wfh', leave_type: '', note: 'Work From Home', half_day_type: '' };
      }

      state.leaves = [
        {
          id: 101,
          title: 'Annual Leave',
          start_date: workingDaysList[1],
          end_date: workingDaysList[2],
          leave_type: 'annual',
          days_count: 2,
          is_half_day: 0,
          half_day_period: '',
          status: 'planned',
          notes: 'Vacation'
        }
      ];
    }

    saveToLocalStorage();
    showToast('Loaded sample scenario (Denominator = working - holiday - leaves)!', '✨');
    renderAll();
  }

  // Helper escape HTML
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // --- EVENT LISTENERS ---
  function setupEvents() {
    // Month navigation
    elements.prevMonthBtn.addEventListener('click', () => {
      state.viewDate.setMonth(state.viewDate.getMonth() - 1);
      renderAll();
    });

    elements.nextMonthBtn.addEventListener('click', () => {
      state.viewDate.setMonth(state.viewDate.getMonth() + 1);
      renderAll();
    });

    elements.todayBtn.addEventListener('click', () => {
      state.viewDate = new Date(state.today);
      renderAll();
    });

    // Quick log today
    elements.quickLogTodayBtn.addEventListener('click', () => {
      openDayModal(formatDateKey(state.today));
    });

    // Plan leave nav button & card jump
    const jumpToLeavePlanner = () => {
      document.querySelector('.tab-btn[data-tab="leavePlannerTab"]').click();
      elements.leaveStartDate.focus();
    };
    elements.planLeaveNavBtn.addEventListener('click', jumpToLeavePlanner);
    elements.viewAllLeavesBtn.addEventListener('click', jumpToLeavePlanner);

    // Theme Toggle
    elements.themeToggleBtn.addEventListener('click', toggleTheme);

    // Tabs switching
    document.querySelectorAll('.tab-btn').forEach(tabBtn => {
      tabBtn.addEventListener('click', () => {
        const targetTabId = tabBtn.getAttribute('data-tab');
        document.querySelectorAll('.tab-btn').forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));

        tabBtn.classList.add('active');
        tabBtn.setAttribute('aria-selected', 'true');
        document.getElementById(targetTabId).classList.remove('hidden');
        state.activeTab = targetTabId;
      });
    });

    // Batch Logger Tray Toggle
    elements.batchLogTriggerBtn.addEventListener('click', () => {
      elements.batchLogTray.classList.toggle('hidden');
      if (!elements.batchLogTray.classList.contains('hidden')) {
        const todayStr = formatDateKey(state.today);
        elements.batchStartDate.value = todayStr;
        elements.batchEndDate.value = todayStr;
      }
    });

    elements.closeBatchBtn.addEventListener('click', () => {
      elements.batchLogTray.classList.add('hidden');
    });

    elements.applyBatchBtn.addEventListener('click', () => {
      const startStr = elements.batchStartDate.value;
      const endStr = elements.batchEndDate.value;
      const status = elements.batchStatusSelect.value;

      if (!startStr || !endStr) {
        alert('Please select both start and end dates.');
        return;
      }

      const s = parseDateKey(startStr);
      const e = parseDateKey(endStr);
      if (e < s) {
        alert('End date cannot be earlier than start date.');
        return;
      }

      const dates = [];
      let curr = new Date(s);
      while (curr <= e) {
        if (!isWeekend(curr)) {
          dates.push(formatDateKey(curr));
        }
        curr.setDate(curr.getDate() + 1);
      }

      persistBatchDays(dates, status);
      elements.batchLogTray.classList.add('hidden');
      showToast(`Updated ${dates.length} days as ${status.toUpperCase()}!`, '✨');
    });

    // Modal Status Choices
    elements.statusChoiceBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        elements.statusChoiceBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        state.selectedModalStatus = btn.getAttribute('data-status');

        if (state.selectedModalStatus === 'leave') {
          elements.modalLeaveOptions.classList.remove('hidden');
        } else {
          elements.modalLeaveOptions.classList.add('hidden');
        }
      });
    });

    // Modal Action Buttons
    elements.closeModalBtn.addEventListener('click', closeDayModal);
    elements.modalCancelBtn.addEventListener('click', closeDayModal);

    elements.modalSaveBtn.addEventListener('click', () => {
      if (!state.selectedDateStr) return;
      const status = state.selectedModalStatus;
      const note = elements.modalDayNote.value.trim();
      let leaveType = '';
      let halfType = '';

      if (status === 'leave') {
        leaveType = elements.modalLeaveTypeSelect.value;
        const dur = elements.modalLeaveHalfSelect.value;
        if (dur !== 'full') {
          halfType = dur;
        }
      }

      persistDay(state.selectedDateStr, status, leaveType, note, halfType);
      closeDayModal();
      showToast(`Updated ${formatDateDisplay(state.selectedDateStr)}`, '💾');
    });

    elements.modalClearBtn.addEventListener('click', () => {
      if (!state.selectedDateStr) return;
      persistDay(state.selectedDateStr, 'clear');
      closeDayModal();
      showToast(`Cleared ${formatDateDisplay(state.selectedDateStr)}`, '🗑️');
    });

    // Leave Form inputs change
    elements.leaveStartDate.addEventListener('change', updateLeaveFormEstimate);
    elements.leaveEndDate.addEventListener('change', updateLeaveFormEstimate);
    elements.leaveDurationMode.addEventListener('change', updateLeaveFormEstimate);
    elements.leaveTypeSelect.addEventListener('change', updateLeaveFormEstimate);

    // Plan Leave Form Submission
    elements.planLeaveForm.addEventListener('submit', (evt) => {
      evt.preventDefault();
      const startStr = elements.leaveStartDate.value;
      const durationMode = elements.leaveDurationMode.value;
      const isHalf = durationMode.startsWith('half');
      const endStr = isHalf ? startStr : elements.leaveEndDate.value;
      const leaveType = elements.leaveTypeSelect.value;
      const title = elements.leaveTitleInput.value.trim() || `${leaveType.toUpperCase()} Leave`;

      if (!startStr || (!isHalf && !endStr)) {
        alert('Please fill out the dates.');
        return;
      }

      const startDateObj = parseDateKey(startStr);
      const endDateObj = parseDateKey(endStr);
      if (endDateObj < startDateObj) {
        alert('End date cannot precede start date.');
        return;
      }

      const daysCount = isHalf ? 0.5 : countWorkingDays(startDateObj, endDateObj);
      if (daysCount === 0) {
        alert('Selected date range contains only weekends! Please choose working days.');
        return;
      }

      // Check remaining quota
      const summary = computeLeaveSummary();
      const targetCat = summary.breakdown.find(b => b.id === leaveType);
      if (targetCat && daysCount > targetCat.remaining) {
        const proceed = confirm(`Warning: You have only ${targetCat.remaining} days left for ${targetCat.name}. Do you still want to schedule ${daysCount} days?`);
        if (!proceed) return;
      }

      persistLeave({
        title,
        start_date: startStr,
        end_date: endStr,
        leave_type: leaveType,
        days_count: daysCount,
        is_half_day: isHalf ? 1 : 0,
        half_day_period: durationMode,
        status: 'planned',
        notes: ''
      });

      elements.planLeaveForm.reset();
      updateLeaveFormEstimate();
      showToast(`Leave scheduled for ${daysCount} day(s)!`, '🌴');
    });

    // Filter pills for leaves table
    elements.filterPills.forEach(pill => {
      pill.addEventListener('click', () => {
        elements.filterPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        state.leaveFilter = pill.getAttribute('data-filter');
        renderPlannedLeavesTable();
      });
    });

    // Quick Menstrual Leave button
    if (elements.quickLogMenstrualBtn) {
      elements.quickLogMenstrualBtn.addEventListener('click', () => {
        const todayStr = formatDateKey(state.today);
        persistDay(todayStr, 'leave', 'menstrual', 'Menstrual Leave');
        showToast('Logged Menstrual Leave for today!', '🌸');
      });
    }

    // Accrual View Toggles (Annual Accrual vs Sick Segregation)
    if (elements.accrualViewAnnualBtn) {
      elements.accrualViewAnnualBtn.addEventListener('click', () => {
        state.accrualViewMode = 'annual';
        renderAccrualTracker();
      });
    }
    if (elements.accrualViewSickBtn) {
      elements.accrualViewSickBtn.addEventListener('click', () => {
        state.accrualViewMode = 'sick';
        renderAccrualTracker();
      });
    }

    // Link from KPI card to Leave Planner tab
    if (elements.viewPlannerFromKpi) {
      elements.viewPlannerFromKpi.addEventListener('click', () => {
        const leaveTabBtn = document.querySelector('[data-tab="leavePlannerTab"]');
        if (leaveTabBtn) leaveTabBtn.click();
      });
    }

    // Helper to dynamically populate joining month select based on FY cycle
    const populateJoiningMonthOptions = () => {
      if (!elements.settingJoiningMonth) return;
      const sMonth = parseInt(elements.settingFyStartMonth?.value || state.settings.fy_start_month, 10) || 4;
      const fyYr = parseInt(elements.settingFyYear?.value || state.settings.fy_year, 10) || 2026;
      const fyMonths = getFyMonthsList(sMonth, fyYr);
      const currentVal = parseInt(elements.settingJoiningMonth.value || state.settings.joining_month_index, 10) || 1;

      elements.settingJoiningMonth.innerHTML = fyMonths.map((mObj, idx) => {
        const monthNum = idx + 1;
        const isStart = monthNum === 1 ? ' (Start of Financial Year)' : '';
        return `<option value="${monthNum}" ${monthNum === currentVal ? 'selected' : ''}>Month ${monthNum}: ${mObj.name} ${mObj.year}${isStart}</option>`;
      }).join('');
    };

    // Helper to update settings hints
    const updateSettingsHints = () => {
      if (elements.settingFyHint && elements.settingFyStartMonth && elements.settingFyYear) {
        const sMonth = parseInt(elements.settingFyStartMonth.value, 10) || 4;
        const fyYr = parseInt(elements.settingFyYear.value, 10) || 2026;
        const info = getFyInfo(sMonth, fyYr);
        elements.settingFyHint.textContent = `${info.label} (${info.sub})`;
      }
      if (elements.settingJoiningHint && elements.settingJoiningMonth) {
        const jIdx = parseInt(elements.settingJoiningMonth.value, 10) || 1;
        const mEntitled = Math.max(1, Math.min(12, 13 - jIdx));
        if (jIdx === 1) {
          elements.settingJoiningHint.textContent = `Full financial year entitlement (12 months)`;
        } else {
          const q = parseQuota(elements.settingAnnualQuota?.value, 20);
          const proRata = Math.round((q * (mEntitled / 12)) * 10) / 10;
          elements.settingJoiningHint.textContent = `Joined in Month ${jIdx}: entitled for ${mEntitled} months (~${proRata} annual leave days)`;
        }
      }
      if (elements.settingAnnualRateHint && elements.settingAnnualQuota) {
        const q = parseQuota(elements.settingAnnualQuota.value, 20);
        const rate = (q / 12).toFixed(2);
        // Clean phrasing: only "1.67 leaves credited per month (20 ÷ 12)", NO "Technically"
        elements.settingAnnualRateHint.textContent = `${rate} leaves credited per month (${q} ÷ 12)`;
      }
      if (elements.settingMenstrualHint && elements.settingMenstrualQuota) {
        const mq = parseQuota(elements.settingMenstrualQuota.value, 0);
        if (mq <= 0) {
          elements.settingMenstrualHint.textContent = `0 days (Menstrual Leave section hidden from summary)`;
        } else {
          const perMo = (mq / 12);
          const perMoStr = perMo % 1 === 0 ? perMo : parseFloat(perMo.toFixed(1));
          elements.settingMenstrualHint.textContent = `${perMoStr} day(s) available per month (${mq} days/year)`;
        }
      }
    };

    if (elements.settingFyStartMonth) {
      elements.settingFyStartMonth.addEventListener('change', () => {
        populateJoiningMonthOptions();
        updateSettingsHints();
      });
    }
    if (elements.settingFyYear) {
      elements.settingFyYear.addEventListener('input', () => {
        populateJoiningMonthOptions();
        updateSettingsHints();
      });
    }
    if (elements.settingJoiningMonth) elements.settingJoiningMonth.addEventListener('change', updateSettingsHints);
    if (elements.settingAnnualOpeningBalance) elements.settingAnnualOpeningBalance.addEventListener('input', updateSettingsHints);
    if (elements.settingAnnualQuota) elements.settingAnnualQuota.addEventListener('input', updateSettingsHints);
    if (elements.settingSickQuota) elements.settingSickQuota.addEventListener('input', updateSettingsHints);
    if (elements.settingSickOpeningBalance) elements.settingSickOpeningBalance.addEventListener('input', updateSettingsHints);
    if (elements.settingCasualQuota) elements.settingCasualQuota.addEventListener('input', updateSettingsHints);
    if (elements.settingCasualOpeningBalance) elements.settingCasualOpeningBalance.addEventListener('input', updateSettingsHints);
    if (elements.settingOptionalQuota) elements.settingOptionalQuota.addEventListener('input', updateSettingsHints);
    if (elements.settingOptionalOpeningBalance) elements.settingOptionalOpeningBalance.addEventListener('input', updateSettingsHints);
    if (elements.settingMenstrualQuota) elements.settingMenstrualQuota.addEventListener('input', updateSettingsHints);
    if (elements.settingMenstrualOpeningBalance) elements.settingMenstrualOpeningBalance.addEventListener('input', updateSettingsHints);

    // Nav FY badge click
    if (elements.navFyBadge) {
      elements.navFyBadge.addEventListener('click', () => {
        elements.settingsBtn.click();
      });
    }

    // Settings Modal
    elements.settingsBtn.addEventListener('click', () => {
      if (elements.settingFyStartMonth) elements.settingFyStartMonth.value = state.settings.fy_start_month || 4;
      if (elements.settingFyYear) elements.settingFyYear.value = state.settings.fy_year || 2026;
      populateJoiningMonthOptions();
      if (elements.settingJoiningMonth) elements.settingJoiningMonth.value = state.settings.joining_month_index || 1;
      
      if (elements.settingAnnualQuota) elements.settingAnnualQuota.value = state.settings.annual_quota;
      if (elements.settingAnnualOpeningBalance) elements.settingAnnualOpeningBalance.value = state.settings.annual_opening_balance !== undefined ? state.settings.annual_opening_balance : 0;
      if (elements.settingSickQuota) elements.settingSickQuota.value = state.settings.sick_quota;
      if (elements.settingSickOpeningBalance) elements.settingSickOpeningBalance.value = state.settings.sick_opening_balance !== undefined ? state.settings.sick_opening_balance : 0;
      if (elements.settingCasualQuota) elements.settingCasualQuota.value = state.settings.casual_quota;
      if (elements.settingCasualOpeningBalance) elements.settingCasualOpeningBalance.value = state.settings.casual_opening_balance !== undefined ? state.settings.casual_opening_balance : 0;
      if (elements.settingOptionalQuota) elements.settingOptionalQuota.value = state.settings.optional_quota;
      if (elements.settingOptionalOpeningBalance) elements.settingOptionalOpeningBalance.value = state.settings.optional_opening_balance !== undefined ? state.settings.optional_opening_balance : 0;
      if (elements.settingMenstrualQuota) elements.settingMenstrualQuota.value = state.settings.menstrual_quota !== undefined ? state.settings.menstrual_quota : 12;
      if (elements.settingMenstrualOpeningBalance) elements.settingMenstrualOpeningBalance.value = state.settings.menstrual_opening_balance !== undefined ? state.settings.menstrual_opening_balance : 0;

      updateSettingsHints();
      elements.settingOfficeTarget.value = state.settings.target_office_pct;
      elements.settingYear.value = state.settings.year || new Date().getFullYear();
      elements.settingsModal.showModal();
    });

    elements.editQuotasBtn.addEventListener('click', () => {
      elements.settingsBtn.click();
    });

    elements.closeSettingsModalBtn.addEventListener('click', () => elements.settingsModal.close());
    elements.cancelSettingsBtn.addEventListener('click', () => elements.settingsModal.close());

    elements.saveSettingsBtn.addEventListener('click', () => {
      // Fix: parseQuota preserves 0 as a valid quota value without reverting to defaults!
      const newSettings = {
        annual_quota: parseQuota(elements.settingAnnualQuota.value, 20),
        annual_opening_balance: elements.settingAnnualOpeningBalance ? parseQuota(elements.settingAnnualOpeningBalance.value, 0) : 0,
        sick_quota: parseQuota(elements.settingSickQuota.value, 10),
        sick_opening_balance: elements.settingSickOpeningBalance ? parseQuota(elements.settingSickOpeningBalance.value, 0) : 0,
        casual_quota: parseQuota(elements.settingCasualQuota.value, 0),
        casual_opening_balance: elements.settingCasualOpeningBalance ? parseQuota(elements.settingCasualOpeningBalance.value, 0) : 0,
        optional_quota: parseQuota(elements.settingOptionalQuota.value, 0),
        optional_opening_balance: elements.settingOptionalOpeningBalance ? parseQuota(elements.settingOptionalOpeningBalance.value, 0) : 0,
        menstrual_quota: elements.settingMenstrualQuota ? parseQuota(elements.settingMenstrualQuota.value, 12) : 12,
        menstrual_opening_balance: elements.settingMenstrualOpeningBalance ? parseQuota(elements.settingMenstrualOpeningBalance.value, 0) : 0,
        joining_month_index: elements.settingJoiningMonth ? (parseInt(elements.settingJoiningMonth.value, 10) || 1) : 1,
        fy_start_month: elements.settingFyStartMonth ? (parseInt(elements.settingFyStartMonth.value, 10) || 4) : 4,
        fy_year: elements.settingFyYear ? (parseInt(elements.settingFyYear.value, 10) || 2026) : 2026,
        target_office_pct: parseQuota(elements.settingOfficeTarget.value, 60),
        year: elements.settingYear.value.trim()
      };
      persistSettings(newSettings);
      elements.settingsModal.close();
      showToast('Settings saved successfully!', '⚙️');
    });

    // Export Data
    elements.exportDataBtn.addEventListener('click', () => {
      const exportBlob = new Blob([JSON.stringify({
        work_days: Object.entries(state.workDays).map(([d, v]) => ({ date: d, ...v })),
        leaves: state.leaves,
        settings: state.settings,
        exported_at: new Date().toISOString()
      }, null, 2)], { type: 'application/json' });

      const url = URL.createObjectURL(exportBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `worktracker_backup_${formatDateKey(state.today)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Backup downloaded!', '💾');
    });

    // Import Data
    elements.importDataInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const imported = JSON.parse(event.target.result);
          if (imported.work_days && Array.isArray(imported.work_days)) {
            state.workDays = {};
            imported.work_days.forEach(d => {
              state.workDays[d.date] = {
                status: d.status,
                leave_type: d.leave_type || '',
                note: d.note || '',
                half_day_type: d.half_day_type || ''
              };
            });
          }
          if (imported.leaves) state.leaves = imported.leaves;
          if (imported.settings) state.settings = { ...state.settings, ...imported.settings };

          saveToLocalStorage();
          if (state.isServerMode) {
            await fetch('/api/import', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(imported)
            });
          }
          elements.settingsModal.close();
          showToast('Data imported successfully!', '📂');
          renderAll();
        } catch (err) {
          alert('Failed to parse JSON backup file.');
        }
      };
      reader.readAsText(file);
    });

    // Sample Data loader
    elements.resetSampleDataBtn.addEventListener('click', () => {
      if (confirm('Load sample office & WFH schedule to try out the app?')) {
        loadSampleData();
        elements.settingsModal.close();
      }
    });

    // Print Report
    elements.printReportBtn.addEventListener('click', () => {
      window.print();
    });

    // Pre-fill today in leave form
    elements.leaveStartDate.value = formatDateKey(state.today);
    elements.leaveEndDate.value = formatDateKey(state.today);
    updateLeaveFormEstimate();
  }

  // --- INIT ---
  document.addEventListener('DOMContentLoaded', () => {
    setupEvents();
    renderAll();
    loadInitialData();
  });

})();
