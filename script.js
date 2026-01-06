const { createApp, ref, computed, onMounted, onUnmounted, watch } = Vue;

createApp({
    setup() {
        // --- 0. 設定 ---
        const TIMES = { FOCUS: 25 * 60, SHORT_BREAK: 5 * 60, LONG_BREAK: 15 * 60 };
        const timeLeft = ref(TIMES.FOCUS);
        const isRunning = ref(false);
        const currentMode = ref('focus'); 
        const sessionStartTime = ref(null);
        let targetEndTime = null;

        // 讀取循環次數
        const savedCycle = localStorage.getItem('focus_cycle');
        const cycleCount = ref(savedCycle ? parseInt(savedCycle) : 1);

        // --- 1. 時鐘 ---
        const currentTime = ref('00:00:00');
        const currentDate = ref('YYYY-MM-DD');
        const updateClock = () => {
            const now = new Date();
            currentTime.value = now.toLocaleTimeString('zh-TW', { hour12: false });
            currentDate.value = now.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });
        };
        let clockInterval = null;

        // --- 2. 數據 (持久化) ---
        const loadWeeklyHistory = () => {
            const h = localStorage.getItem('focus_history'); return h ? JSON.parse(h) : {};
        };
        const weeklyHistory = ref(loadWeeklyHistory());

        const getTodayDateStr = () => {
            const d = new Date(); return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
        };

        const loadDailySessions = () => {
            const s = localStorage.getItem('today_sessions');
            const lastDate = localStorage.getItem('last_record_date');
            const today = getTodayDateStr();
            if (lastDate !== today) {
                localStorage.setItem('last_record_date', today);
                return [];
            }
            return s ? JSON.parse(s) : [];
        };
        const dailySessions = ref(loadDailySessions());

        const recordFocusSession = (minutes) => {
            if (minutes <= 0) return;
            const today = getTodayDateStr();
            const timeLabel = sessionStartTime.value || new Date().toTimeString().slice(0,5);

            if (!weeklyHistory.value[today]) weeklyHistory.value[today] = 0;
            weeklyHistory.value[today] += minutes;
            localStorage.setItem('focus_history', JSON.stringify(weeklyHistory.value));

            dailySessions.value.push({ time: timeLabel, duration: parseFloat(minutes.toFixed(1)) });
            localStorage.setItem('today_sessions', JSON.stringify(dailySessions.value));
            
            sessionStartTime.value = null;
            updateCharts(); // 只有在記錄完成時才更新圖表，解決延遲
        };

        const clearHistory = () => {
            if (confirm('確定要清除所有統計數據嗎？\n(這將刪除所有圖表紀錄)')) {
                localStorage.removeItem('focus_history');
                localStorage.removeItem('today_sessions');
                localStorage.removeItem('focus_cycle');
                
                weeklyHistory.value = {};
                dailySessions.value = [];
                cycleCount.value = 1;
                
                updateCharts();
            }
        };

        // --- 3. 任務 (移除預設，移除完成度) ---
        const newTaskInput = ref('');
        const loadTasks = () => { const t = localStorage.getItem('focus_tasks'); return t ? JSON.parse(t) : []; };
        const tasks = ref(loadTasks());
        
        const saveTasks = () => localStorage.setItem('focus_tasks', JSON.stringify(tasks.value));
        
        const addTask = () => {
            if (newTaskInput.value.trim() === '') return;
            tasks.value.push({ id: Date.now(), text: newTaskInput.value });
            newTaskInput.value = ''; 
            saveTasks();
        };
        
        const removeTask = (id) => { 
            tasks.value = tasks.value.filter(t => t.id !== id); 
            saveTasks(); 
        };

        // --- 4. 番茄鐘 (SVG 動畫優化) ---
        const modeText = computed(() => {
            if (currentMode.value === 'focus') return '深度專注';
            if (currentMode.value === 'short-break') return '短暫休息';
            return '長時間休息';
        });
        
        const modeColor = computed(() => {
             if (currentMode.value === 'focus') return '#bb86fc';
             return '#03dac6';
        });

        const circumference = 2 * Math.PI * 120; // 半徑120
        const progressOffset = computed(() => {
             const total = currentMode.value === 'focus' ? TIMES.FOCUS : (currentMode.value === 'short-break' ? TIMES.SHORT_BREAK : TIMES.LONG_BREAK);
             const ratio = timeLeft.value / total;
             return circumference * (1 - ratio);
        });

        const formatTime = computed(() => {
            const m = Math.floor(timeLeft.value / 60).toString().padStart(2, '0');
            const s = (timeLeft.value % 60).toString().padStart(2, '0');
            return `${m}:${s}`;
        });

        let timerInterval = null;
        
        const toggleTimer = () => {
            if (isRunning.value) {
                // 暫停
                clearInterval(timerInterval); 
                isRunning.value = false; 
                targetEndTime = null; 
            } else {
                // 開始
                if (!sessionStartTime.value && currentMode.value === 'focus') {
                    const now = new Date();
                    sessionStartTime.value = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
                }
                
                targetEndTime = Date.now() + (timeLeft.value * 1000);
                isRunning.value = true;

                // 移除這裡的 updateCharts 呼叫，這是造成延遲的主因
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
            audio.volume = 0.5; 
            audio.play().catch(e => console.log('Autoplay prevented', e));

            if (currentMode.value === 'focus') {
                recordFocusSession(25); // 紀錄時間
                if (cycleCount.value < 4) {
                    currentMode.value = 'short-break'; timeLeft.value = TIMES.SHORT_BREAK; 
                } else {
                    currentMode.value = 'long-break'; timeLeft.value = TIMES.LONG_BREAK; 
                }
            } else {
                if (currentMode.value === 'long-break') cycleCount.value = 1; else cycleCount.value++;
                currentMode.value = 'focus'; timeLeft.value = TIMES.FOCUS; sessionStartTime.value = null;
            }
        };

        const skipPhase = () => {
            clearInterval(timerInterval); isRunning.value = false; targetEndTime = null;
            if (currentMode.value === 'focus') {
                const elapsedSeconds = TIMES.FOCUS - timeLeft.value;
                const elapsedMinutes = elapsedSeconds / 60;
                
                if (elapsedMinutes > 0.5) recordFocusSession(elapsedMinutes); // 少於半分鐘不紀錄
                else sessionStartTime.value = null;
                
                currentMode.value = 'short-break'; timeLeft.value = TIMES.SHORT_BREAK;
            } else {
                currentMode.value = 'focus'; timeLeft.value = TIMES.FOCUS; sessionStartTime.value = null;
            }
        };

        watch(cycleCount, (n) => localStorage.setItem('focus_cycle', n.toString()));

        // --- 5. Charts ---
        let weeklyChartInstance = null;
        let dailyChartInstance = null;
        
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

        const initCharts = () => {
            const purple = '#bb86fc'; const secondary = '#03dac6'; const gridColor = 'rgba(255,255,255,0.1)'; const textColor = '#888';
            
            const ctx1 = document.getElementById('weeklyChart').getContext('2d');
            weeklyChartInstance = new Chart(ctx1, {
                type: 'bar',
                data: { labels: getLast7Days(), datasets: [{ label: '總分鐘', data: getWeeklyData(), backgroundColor: purple, borderRadius: 4 }] },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false, 
                    scales: { 
                        y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor } }, 
                        x: { grid: { display: false }, ticks: { color: textColor } } 
                    }, 
                    plugins: { legend: { display: false } } 
                }
            });

            const ctx2 = document.getElementById('dailyChart').getContext('2d');
            dailyChartInstance = new Chart(ctx2, {
                type: 'bar',
                data: { labels: dailySessions.value.map(s => s.time), datasets: [{ label: '專注時長', data: dailySessions.value.map(s => s.duration), backgroundColor: secondary, borderRadius: 4, barThickness: 'flex', maxBarThickness: 30 }] },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false,
                    scales: { 
                        y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor, stepSize: 5 }, suggestedMax: 25 }, 
                        x: { grid: { display: false }, ticks: { color: textColor } } 
                    }, 
                    plugins: { legend: { display: false } } 
                }
            });
        };

        const updateCharts = () => {
            if (weeklyChartInstance) {
                weeklyChartInstance.data.labels = getLast7Days();
                weeklyChartInstance.data.datasets[0].data = getWeeklyData();
                weeklyChartInstance.update();
            }
            if (dailyChartInstance) {
                dailyChartInstance.data.labels = dailySessions.value.map(s => s.time);
                dailyChartInstance.data.datasets[0].data = dailySessions.value.map(s => s.duration);
                dailyChartInstance.update();
            }
        };

        // --- 6. WS & Init ---
        const wsMessage = ref('連線中...'); const latency = ref(0); const isWsConnected = ref(false); let ws = null;

        onMounted(() => {
            ws = new WebSocket('wss://echo.websocket.org');
            ws.onopen = () => { isWsConnected.value = true; wsMessage.value = '已連線'; setInterval(() => { if(ws.readyState===1) ws.send(Date.now()) }, 5000); }; // 改為5秒ping一次，節省資源
            ws.onmessage = (e) => { const t = parseInt(e.data); if(!isNaN(t)) latency.value = Date.now() - t; };
            ws.onerror = () => { wsMessage.value = '離線模式'; }; 
            
            updateClock(); clockInterval = setInterval(updateClock, 1000);
            
            setTimeout(() => { initCharts(); }, 100);
        });

        onUnmounted(() => { if(timerInterval) clearInterval(timerInterval); if(clockInterval) clearInterval(clockInterval); if(ws) ws.close(); });

        return {
            timeLeft, formatTime, isRunning, currentMode, modeText, cycleCount, toggleTimer, skipPhase,
            modeColor, progressOffset, circumference, // SVG 相關
            tasks, newTaskInput, addTask, removeTask, 
            wsMessage, latency, isWsConnected, currentTime, currentDate,
            clearHistory
        };
    }
}).mount('#app');