const { createApp, ref, computed, onMounted, onUnmounted, watch, nextTick } = Vue;

// --- 模組 1: 時鐘邏輯 ---
function useClock() {
    const currentTime = ref('00:00:00');
    const currentDate = ref('YYYY/MM/DD');
    let intervalId = null;

    const updateClock = () => {
        const now = new Date();
        currentTime.value = now.toLocaleTimeString('zh-TW', { hour12: false });
        currentDate.value = now.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });
    };

    onMounted(() => {
        updateClock();
        intervalId = setInterval(updateClock, 1000);
    });

    onUnmounted(() => {
        if (intervalId) clearInterval(intervalId);
    });

    return { currentTime, currentDate };
}

// --- 模組 2: 資料持久化與統計 ---
function useDataPersistence() {
    const getTodayDateStr = () => {
        const d = new Date();
        return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    };

    // 讀取每週紀錄
    const loadWeeklyHistory = () => {
        try { return JSON.parse(localStorage.getItem('focus_history') || '{}'); } catch (e) { return {}; }
    };
    const weeklyHistory = ref(loadWeeklyHistory());

    // 讀取今日紀錄
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
        } catch (e) { return []; }
    };
    const dailySessions = ref(loadDailySessions());

    // 儲存紀錄
    const saveRecord = (minutes, sessionStartTimeStr) => {
        if (minutes <= 0.1) return;
        const today = getTodayDateStr();
        const timeLabel = sessionStartTimeStr || new Date().toTimeString().slice(0, 5);

        // Update Weekly
        if (!weeklyHistory.value[today]) weeklyHistory.value[today] = 0;
        weeklyHistory.value[today] += minutes;
        localStorage.setItem('focus_history', JSON.stringify(weeklyHistory.value));

        // Update Daily
        dailySessions.value.push({ time: timeLabel, duration: parseFloat(minutes.toFixed(1)) });
        localStorage.setItem('today_sessions', JSON.stringify(dailySessions.value));
        localStorage.setItem('last_record_date', today);
    };

    const clearAllData = () => {
        if (confirm('確定要清除所有統計數據嗎？\n(這將刪除所有圖表紀錄)')) {
            localStorage.clear();
            location.reload();
        }
    };

    return { weeklyHistory, dailySessions, saveRecord, clearAllData };
}

// --- 模組 3: 任務管理 ---
function useTasks() {
    const newTaskInput = ref('');
    const tasks = ref([]);

    const loadTasks = () => {
        try { tasks.value = JSON.parse(localStorage.getItem('focus_tasks') || '[]'); } 
        catch (e) { tasks.value = []; }
    };

    const saveTasks = () => localStorage.setItem('focus_tasks', JSON.stringify(tasks.value));

    const addTask = () => {
        if (!newTaskInput.value.trim()) return;
        tasks.value.push({ id: Date.now(), text: newTaskInput.value, done: false });
        newTaskInput.value = '';
        saveTasks();
    };

    const toggleTask = (id) => {
        const task = tasks.value.find(t => t.id === id);
        if (task) {
            task.done = !task.done;
            saveTasks();
        }
    };

    const removeTask = (id) => {
        tasks.value = tasks.value.filter(t => t.id !== id);
        saveTasks();
    };

    onMounted(loadTasks);

    return { tasks, newTaskInput, addTask, toggleTask, removeTask };
}

// --- 模組 4: 番茄鐘計時器 ---
function useTimer(onComplete) {
    const TIMES = { FOCUS: 25 * 60, SHORT_BREAK: 5 * 60, LONG_BREAK: 15 * 60 };
    const timeLeft = ref(TIMES.FOCUS);
    const isRunning = ref(false);
    const currentMode = ref('focus');
    const sessionStartTime = ref(null);
    
    // 循環計數
    const cycleCount = ref(parseInt(localStorage.getItem('focus_cycle') || '1'));
    let timerInterval = null;
    let targetEndTime = null;

    const formatTime = computed(() => {
        const m = Math.floor(timeLeft.value / 60).toString().padStart(2, '0');
        const s = (timeLeft.value % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    });

    const modeText = computed(() => {
        if (currentMode.value === 'focus') return '深度專注';
        if (currentMode.value === 'short-break') return '短暫休息';
        return '長時間休息';
    });

    const modeColor = computed(() => currentMode.value === 'focus' ? '#bb86fc' : '#03dac6');

    const startTimer = () => {
        if (!sessionStartTime.value && currentMode.value === 'focus') {
            const now = new Date();
            sessionStartTime.value = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        }
        targetEndTime = Date.now() + (timeLeft.value * 1000);
        isRunning.value = true;
        
        timerInterval = setInterval(() => {
            const remaining = Math.ceil((targetEndTime - Date.now()) / 1000);
            if (remaining > 0) {
                timeLeft.value = remaining;
            } else {
                timeLeft.value = 0;
                handleComplete();
            }
        }, 1000);
    };

    const pauseTimer = () => {
        clearInterval(timerInterval);
        isRunning.value = false;
        targetEndTime = null;
    };

    const toggleTimer = () => isRunning.value ? pauseTimer() : startTimer();

    const handleComplete = () => {
        pauseTimer();
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audio.volume = 1.0; 
        audio.play().catch(() => {});

        if (currentMode.value === 'focus') {
            // 觸發完成回調，傳出專注時間與開始時間
            onComplete(TIMES.FOCUS / 60, sessionStartTime.value);
            
            // 切換模式
            if (cycleCount.value < 4) {
                currentMode.value = 'short-break';
                timeLeft.value = TIMES.SHORT_BREAK;
            } else {
                currentMode.value = 'long-break';
                timeLeft.value = TIMES.LONG_BREAK;
            }
            alert('專注結束！休息一下。');
        } else {
            cycleCount.value = (currentMode.value === 'long-break') ? 1 : cycleCount.value + 1;
            currentMode.value = 'focus';
            timeLeft.value = TIMES.FOCUS;
            sessionStartTime.value = null;
            localStorage.setItem('focus_cycle', cycleCount.value.toString());
            alert('休息結束，開始新的一輪！');
        }
    };

    const skipPhase = () => {
        pauseTimer();
        if (currentMode.value === 'focus') {
            const elapsed = (TIMES.FOCUS - timeLeft.value) / 60;
            onComplete(elapsed, sessionStartTime.value); // 記錄已過時間
            currentMode.value = 'short-break';
            timeLeft.value = TIMES.SHORT_BREAK;
        } else {
            currentMode.value = 'focus';
            timeLeft.value = TIMES.FOCUS;
            sessionStartTime.value = null;
        }
    };

    return { 
        timeLeft, formatTime, isRunning, currentMode, modeText, modeColor, cycleCount, 
        toggleTimer, skipPhase, pauseTimer, TIMES 
    };
}

// --- 模組 5: Chart.js 圖表 ---
function useCharts(weeklyHistory) {
    let weeklyChart = null;

    const getLast7Days = () => {
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            days.push(`${d.getMonth() + 1}/${d.getDate()}`);
        }
        return days;
    };

    const getWeeklyData = () => {
        const data = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
            data.push(weeklyHistory.value[key] || 0);
        }
        return data;
    };

    const renderCharts = () => {
        if (weeklyChart) { weeklyChart.destroy(); }
        const ctx1 = document.getElementById('weeklyChart');
        if (!ctx1) return;

        weeklyChart = new Chart(ctx1, {
            type: 'bar',
            data: {
                labels: getLast7Days(),
                datasets: [{
                    label: '分鐘',
                    data: getWeeklyData(),
                    backgroundColor: '#bb86fc',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: {
                            color: '#888',
                            stepSize: 60,
                            callback: (value) => (value / 60) + 'h'
                        }
                    },
                    x: { grid: { display: false }, ticks: { color: '#888' } }
                },
                plugins: { legend: { display: false } }
            }
        });
    };

    return { renderCharts };
}

// --- 模組 6: WebSocket 網路監控 ---
function useNetworkMonitor(onDisconnect) {
    const wsMessage = ref('連線初始化...');
    const latency = ref(0);
    const isWsConnected = ref(false);
    let ws = null;
    let pingInterval = null;

    const initWebSocket = () => {
        try {
            ws = new WebSocket('wss://echo.websocket.org');
            ws.onopen = () => {
                isWsConnected.value = true;
                wsMessage.value = '已連線';
                pingInterval = setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) ws.send(Date.now());
                }, 5000);
            };
            ws.onmessage = (e) => {
                const t = parseInt(e.data);
                if (!isNaN(t)) latency.value = Date.now() - t;
            };
            ws.onclose = () => {
                isWsConnected.value = false;
                wsMessage.value = '已離線';
                if (typeof onDisconnect === 'function') onDisconnect();
                setTimeout(initWebSocket, 5000);
            };
            ws.onerror = () => {
                isWsConnected.value = false;
                wsMessage.value = '連線錯誤';
                ws.close();
            };
        } catch (e) {
            isWsConnected.value = false;
            setTimeout(initWebSocket, 5000);
        }
    };

    onUnmounted(() => {
        if (pingInterval) clearInterval(pingInterval);
        if (ws) ws.close();
    });

    return { wsMessage, latency, isWsConnected, initWebSocket };
}

// --- 主應用組裝 ---
createApp({
    setup() {
        // 1. 初始化各個模組
        const { currentTime, currentDate } = useClock();
        const { weeklyHistory, dailySessions, saveRecord, clearAllData } = useDataPersistence();
        const { tasks, newTaskInput, addTask, toggleTask, removeTask } = useTasks();
        const { renderCharts } = useCharts(weeklyHistory);

        // 2. 定義計時器完成時的回調 (連接 Timer 與 Data)
        const onTimerComplete = (minutes, startTime) => {
            saveRecord(minutes, startTime);
            renderCharts(); // 更新圖表
        };

        const { 
            timeLeft, formatTime, isRunning, currentMode, modeText, 
            modeColor, cycleCount, toggleTimer, skipPhase, pauseTimer, TIMES 
        } = useTimer(onTimerComplete);

        // 3. 定義網路斷線時的行為 (連接 WebSocket 與 Timer)
        const onNetworkDisconnect = () => {
            // 如果要實現「斷線即專注」或「斷線暫停」，可在此處操作
            // 例如：目前保留原樣，僅顯示狀態
        };
        const { wsMessage, latency, isWsConnected, initWebSocket } = useNetworkMonitor(onNetworkDisconnect);

        // 4. 計算今日總進度 (結合 Data 與 Timer 狀態)
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

        // 5. 生命週期掛載
        onMounted(() => {
            initWebSocket();
            setTimeout(renderCharts, 300);
        });

        return {
            // Clock
            currentTime, currentDate,
            // Data
            clearHistory: clearAllData, todayTotalMinutes, displayTotalMinutes,
            // Tasks
            tasks, newTaskInput, addTask, toggleTask, removeTask,
            // Timer
            timeLeft, formatTime, isRunning, currentMode, modeText, modeColor, cycleCount, toggleTimer, skipPhase,
            // WS
            wsMessage, latency, isWsConnected
        };
    }
}).mount('#app');