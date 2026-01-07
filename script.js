const { createApp, ref, computed, onMounted, onUnmounted, nextTick } = Vue;

createApp({
    setup() {
        // --- 0. 設定 ---
        const TIMES = { FOCUS: 25 * 60, SHORT_BREAK: 5 * 60, LONG_BREAK: 15 * 60 };
        const timeLeft = ref(TIMES.FOCUS);
        const isRunning = ref(false);
        const currentMode = ref('focus'); 
        const sessionStartTime = ref(null);
        let targetEndTime = null;

        const savedCycle = localStorage.getItem('focus_cycle');
        const cycleCount = ref(savedCycle ? parseInt(savedCycle) : 1);

        // --- 1. 時鐘 ---
        const currentTime = ref('00:00:00');
        const currentDate = ref('YYYY/MM/DD');
        const updateClock = () => {
            const now = new Date();
            currentTime.value = now.toLocaleTimeString('zh-TW', { hour12: false });
            currentDate.value = now.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });
        };

        // --- 2. 數據管理 ---
        const getTodayDateStr = () => {
            const d = new Date(); return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
        };

        const loadWeeklyHistory = () => {
            try { return JSON.parse(localStorage.getItem('focus_history') || '{}'); } catch(e){ return {}; }
        };
        const weeklyHistory = ref(loadWeeklyHistory());

        const loadDailySessions = () => {
            try {
                const s = localStorage.getItem('today_sessions');
                const lastDate = localStorage.getItem('last_record_date');
                const today = getTodayDateStr();
                if (lastDate !== today) {
                    localStorage.setItem('last_record_date', today);
                    return [];
                }
                return s ? JSON.parse(s) : [];
            } catch(e){ return []; }
        };
        const dailySessions = ref(loadDailySessions());

        // 計算今日總進度 (包含進行中)
        const todayTotalMinutes = computed(() => {
            let total = dailySessions.value.reduce((sum, s) => sum + s.duration, 0);
            if (isRunning.value && currentMode.value === 'focus') {
                const elapsedSeconds = TIMES.FOCUS - timeLeft.value;
                const elapsedMinutes = elapsedSeconds / 60;
                total += elapsedMinutes;
            }
            return total;
        });
        const displayTotalMinutes = computed(() => Math.floor(todayTotalMinutes.value));

        const recordFocusSession = (minutes) => {
            if (minutes <= 0.1) return;
            const today = getTodayDateStr();
            const timeLabel = sessionStartTime.value || new Date().toTimeString().slice(0,5);

            if (!weeklyHistory.value[today]) weeklyHistory.value[today] = 0;
            weeklyHistory.value[today] += minutes;
            localStorage.setItem('focus_history', JSON.stringify(weeklyHistory.value));

            dailySessions.value.push({ time: timeLabel, duration: parseFloat(minutes.toFixed(1)) });
            localStorage.setItem('today_sessions', JSON.stringify(dailySessions.value));
            localStorage.setItem('last_record_date', today);
            
            sessionStartTime.value = null;
            renderCharts(); 
        };

        const clearHistory = () => {
            if (confirm('確定要清除所有統計數據嗎？\n(這將刪除所有圖表紀錄)')) {
                localStorage.clear();
                location.reload();
            }
        };

        // --- 3. 任務 (勾選與刪除) ---
        const newTaskInput = ref('');
        const loadTasks = () => { try { return JSON.parse(localStorage.getItem('focus_tasks') || '[]'); } catch(e){ return []; } };
        const tasks = ref(loadTasks());
        const saveTasks = () => localStorage.setItem('focus_tasks', JSON.stringify(tasks.value));
        
        const addTask = () => {
            if (!newTaskInput.value.trim()) return;
            tasks.value.push({ id: Date.now(), text: newTaskInput.value, done: false });
            newTaskInput.value = ''; saveTasks();
        };
        
        const toggleTask = (id) => {
            const task = tasks.value.find(t => t.id === id);
            if (task) {
                task.done = !task.done;
                saveTasks();
            }
        };

        const removeTask = (id) => { tasks.value = tasks.value.filter(t => t.id !== id); saveTasks(); };

        // --- 4. 計時器 ---
        const modeText = computed(() => {
            if (currentMode.value === 'focus') return '深度專注';
            if (currentMode.value === 'short-break') return '短暫休息';
            return '長時間休息';
        });
        const modeColor = computed(() => currentMode.value === 'focus' ? '#bb86fc' : '#03dac6');

        const formatTime = computed(() => {
            const m = Math.floor(timeLeft.value / 60).toString().padStart(2, '0');
            const s = (timeLeft.value % 60).toString().padStart(2, '0');
            return `${m}:${s}`;
        });

        let timerInterval = null;
        
        const toggleTimer = () => {
            if (isRunning.value) {
                clearInterval(timerInterval); isRunning.value = false; targetEndTime = null; 
            } else {
                if (!sessionStartTime.value && currentMode.value === 'focus') {
                    const now = new Date();
                    sessionStartTime.value = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
                }
                targetEndTime = Date.now() + (timeLeft.value * 1000);
                isRunning.value = true;

                timerInterval = setInterval(() => {
                    const now = Date.now();
                    const remaining = Math.ceil((targetEndTime - now) / 1000);
                    if (remaining > 0) {
                        timeLeft.value = remaining;
                    } else { 
                        timeLeft.value = 0; 
                        handleTimerComplete(); 
                    }
                }, 1000);
            }
        };

        const handleTimerComplete = () => {
            clearInterval(timerInterval); isRunning.value = false; targetEndTime = null;
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
            audio.volume = 1.0; audio.play().catch(e=>{});

            if (currentMode.value === 'focus') {
                recordFocusSession(TIMES.FOCUS / 60); 
                cycleCount.value < 4 ? (currentMode.value = 'short-break', timeLeft.value = TIMES.SHORT_BREAK) : (currentMode.value = 'long-break', timeLeft.value = TIMES.LONG_BREAK);
                alert('專注結束！休息一下。');
            } else {
                currentMode.value === 'long-break' ? cycleCount.value = 1 : cycleCount.value++;
                currentMode.value = 'focus'; timeLeft.value = TIMES.FOCUS; sessionStartTime.value = null;
                alert('休息結束，開始新的一輪！');
            }
        };

        const skipPhase = () => {
            clearInterval(timerInterval); isRunning.value = false; targetEndTime = null;
            if (currentMode.value === 'focus') {
                const elapsed = (TIMES.FOCUS - timeLeft.value) / 60;
                recordFocusSession(elapsed); 
                currentMode.value = 'short-break'; timeLeft.value = TIMES.SHORT_BREAK;
            } else {
                currentMode.value = 'focus'; timeLeft.value = TIMES.FOCUS; sessionStartTime.value = null;
            }
        };

        // --- 5. Chart.js (Weekly) ---
        let weeklyChart = null;

        const getLast7Days = () => {
            const days = [];
            for (let i = 6; i >= 0; i--) {
                const d = new Date(); d.setDate(d.getDate() - i);
                days.push(`${d.getMonth()+1}/${d.getDate()}`);
            }
            return days;
        };
        
        const getWeeklyData = () => {
            const data = [];
            for (let i = 6; i >= 0; i--) {
                const d = new Date(); d.setDate(d.getDate() - i);
                const key = `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
                data.push(weeklyHistory.value[key] || 0);
            }
            return data;
        };

        const renderCharts = () => {
            if (weeklyChart) { weeklyChart.destroy(); weeklyChart = null; }
            const purple = '#bb86fc'; const gridColor = 'rgba(255,255,255,0.05)'; const textColor = '#888';
            
            const ctx1 = document.getElementById('weeklyChart');
            if (ctx1) {
                weeklyChart = new Chart(ctx1, {
                    type: 'bar',
                    data: { labels: getLast7Days(), datasets: [{ label: '分鐘', data: getWeeklyData(), backgroundColor: purple, borderRadius: 4 }] },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        scales: { 
                            y: { 
                                beginAtZero: true, grid: { color: gridColor }, 
                                ticks: { color: textColor, stepSize: 60, callback: function(value) { return (value / 60) + 'h'; } } 
                            }, 
                            x: { grid: { display: false }, ticks: { color: textColor } } 
                        }, 
                        plugins: { legend: { display: false } } 
                    }
                });
            }
        };

        // --- 6. WS & Init ---
        const wsMessage = ref('連線中...'); const latency = ref(0); const isWsConnected = ref(false); let ws = null;
        let clockInterval = null;

        onMounted(() => {
            updateClock(); clockInterval = setInterval(updateClock, 1000);
            try {
                ws = new WebSocket('wss://echo.websocket.org');
                ws.onopen = () => { isWsConnected.value = true; wsMessage.value = '已連線'; setInterval(() => { if(ws.readyState===1) ws.send(Date.now()) }, 2000); };
                ws.onmessage = (e) => { const t = parseInt(e.data); if(!isNaN(t)) latency.value = Date.now() - t; };
                ws.onerror = () => { wsMessage.value = '連線失敗'; isWsConnected.value = false; };
                ws.onclose = () => { wsMessage.value = '已離線'; isWsConnected.value = false; };
            } catch(e) { wsMessage.value = '連線錯誤'; }

            setTimeout(renderCharts, 300);
        });

        onUnmounted(() => { if(timerInterval) clearInterval(timerInterval); if(clockInterval) clearInterval(clockInterval); if(ws) ws.close(); if(weeklyChart) weeklyChart.destroy(); });

        return {
            timeLeft, formatTime, isRunning, currentMode, modeText, cycleCount, toggleTimer, skipPhase,
            modeColor,
            tasks, newTaskInput, addTask, removeTask, toggleTask, 
            wsMessage, latency, isWsConnected, currentTime, currentDate, clearHistory,
            todayTotalMinutes, displayTotalMinutes
        };
    }
}).mount('#app');