(function () {
    const MIN_STUDY_SECONDS = 60;
    const COURSE_PROGRESS_KEY = `scinuLessonProgress:${currentUser?.username || "guest"}`;
    const ECOSYSTEM_REFLECTION_KEY = `scinuEcosystemReflection:${currentUser?.username || "guest"}`;
    const LESSONS_CACHE_KEY = "scinuLessonsCache";
    const QUIZZES_CACHE_KEY = "scinuQuizzesCache";
    const ECOSYSTEM_COMPETENCIES = [
        { key: "digital", label: "Digital Literacy", icon: "fa-laptop-code", hint: "ใช้เครื่องมือดิจิทัลและระบบงานออนไลน์ได้มั่นใจ" },
        { key: "workflow", label: "Workflow Automation", icon: "fa-diagram-project", hint: "ออกแบบและลดขั้นตอนงานประจำด้วยกระบวนการอัตโนมัติ" },
        { key: "analytics", label: "Learning/Data Analytics", icon: "fa-chart-simple", hint: "อ่านข้อมูลผลลัพธ์เพื่อปรับปรุงงานและการเรียนรู้" },
        { key: "ai", label: "AI Literacy", icon: "fa-robot", hint: "ใช้ AI อย่างรับผิดชอบเพื่อสนับสนุนงานมหาวิทยาลัย" },
        { key: "collaboration", label: "Community & Collaboration", icon: "fa-people-group", hint: "เรียนรู้ร่วมกับเพื่อนร่วมงาน โค้ช และชุมชนนักปฏิบัติ" },
        { key: "lifelong", label: "Lifelong Learning", icon: "fa-seedling", hint: "ต่อยอดจากบทเรียนสู่ผลงานจริงและแผนพัฒนารายบุคคล" }
    ];
    const ECOSYSTEM_COMPONENTS = [
        { title: "Learners", icon: "fa-user-graduate", desc: "บุคลากรสายสนับสนุนเรียนรู้ตามบทบาท หน่วยงาน และระดับสมรรถนะ" },
        { title: "Learning Facilitator", icon: "fa-chalkboard-user", desc: "ผู้ดูแลระบบ/วิทยากรช่วยกำกับเส้นทาง แนะนำกิจกรรม และสะท้อนผล" },
        { title: "Technology & AI", icon: "fa-microchip", desc: "LMS, วิดีโอ, แบบทดสอบ, AI assistant และระบบติดตามความก้าวหน้า" },
        { title: "Community", icon: "fa-comments", desc: "พื้นที่แลกเปลี่ยนความรู้ คู่พี่เลี้ยง และชุมชนนักปฏิบัติระหว่างหน่วยงาน" },
        { title: "Workplace", icon: "fa-briefcase", desc: "โจทย์จริงจากงานธุรการ การเงิน พัสดุ แผน ห้องปฏิบัติการ และบริการการศึกษา" },
        { title: "Assessment & Analytics", icon: "fa-clipboard-check", desc: "Pre-test, Post-test, Reflection, Portfolio และข้อมูลสำหรับผู้บริหาร" }
    ];
    const ECOSYSTEM_JOURNEY = [
        { title: "ก่อนเรียน", icon: "fa-magnifying-glass-chart", desc: "วิเคราะห์พื้นฐานและช่องว่างด้วย Pre-test" },
        { title: "ระหว่างเรียน", icon: "fa-play", desc: "เรียนบทสั้น ทำกิจกรรม และรับคำแนะนำตามลำดับ" },
        { title: "หลังเรียน", icon: "fa-award", desc: "วัดผลด้วย Post-test พร้อมสรุปคะแนนรายบท" },
        { title: "ต่อยอดหน้างาน", icon: "fa-infinity", desc: "บันทึก Reflection สร้าง Portfolio และแชร์ในชุมชน" }
    ];
    let youtubeApiPromise = null;
    let youtubePlayer = null;
    let youtubeGuardTimer = null;
    let lessonFinished = false;

    function hasScore(value) {
        return value !== undefined && value !== null && value !== "";
    }

    function scoreText(score, total) {
        return hasScore(score) && Number(total) > 0 ? `${score}/${total}` : "รอทำ";
    }

    function scorePercent(score, total) {
        if (!hasScore(score) || !Number(total)) return 0;
        return Math.round((Number(score) / Number(total)) * 100);
    }

    function averageScore(type) {
        const scoreKey = `${type}Score`;
        const totalKey = `${type}Total`;
        const scored = sortedLessons()
            .map((lesson) => stateFor(lesson))
            .filter((state) => hasScore(state[scoreKey]) && Number(state[totalKey]) > 0);

        if (!scored.length) return null;

        const score = scored.reduce((sum, state) => sum + Number(state[scoreKey]), 0);
        const total = scored.reduce((sum, state) => sum + Number(state[totalKey]), 0);
        return { score, total };
    }

    function parseLessonProgress(value) {
        if (!value) return {};
        if (typeof value === "object") return value;
        try {
            return JSON.parse(value);
        } catch (error) {
            return {};
        }
    }

    function userLessonState() {
        return parseLessonProgress(currentUser.lessonProgress || currentUser.lessonState);
    }

    function getLessonState() {
        try {
            const localState = JSON.parse(localStorage.getItem(COURSE_PROGRESS_KEY) || "{}");
            return { ...userLessonState(), ...localState };
        } catch (error) {
            return userLessonState();
        }
    }

    function saveLessonState(state) {
        localStorage.setItem(COURSE_PROGRESS_KEY, JSON.stringify(state));
        currentUser.lessonProgress = JSON.stringify(state);
        currentUser.lessonProgressUpdatedAt = new Date().toISOString();
        saveCurrentUser();
    }

    function stateFor(lesson) {
        return getLessonState()[String(lesson.id)] || {};
    }

    function patchLessonState(lesson, patch) {
        const state = getLessonState();
        const key = String(lesson.id);
        state[key] = { ...(state[key] || {}), ...patch };
        saveLessonState(state);
        return state[key];
    }

    function saveCurrentUser() {
        sessionStorage.setItem("currentUser", JSON.stringify(currentUser));
    }

    function hydrateLessonStateFromUser() {
        const localState = (() => {
            try {
                return JSON.parse(localStorage.getItem(COURSE_PROGRESS_KEY) || "{}");
            } catch (error) {
                return {};
            }
        })();
        const remoteState = userLessonState();
        const mergedState = { ...remoteState, ...localState };

        if (Object.keys(mergedState).length) {
            saveLessonState(mergedState);
            return;
        }

        const progress = Number(currentUser.progress || 0);
        if (!progress || !lessonsList.length) return;

        const completedCount = Math.min(lessonsList.length, Math.floor((progress / 100) * lessonsList.length));
        if (!completedCount) return;

        const restoredState = {};
        sortedLessons().slice(0, completedCount).forEach((lesson) => {
            restoredState[String(lesson.id)] = {
                started: false,
                preDone: true,
                videoDone: true,
                postDone: true,
                restoredFromProgress: true
            };
        });
        saveLessonState(restoredState);
    }

    function sortedLessons() {
        return [...(lessonsList || [])].sort((a, b) => Number(a.order) - Number(b.order));
    }

    function getActiveLesson() {
        try {
            return JSON.parse(sessionStorage.getItem("activeLesson") || "null");
        } catch (error) {
            return null;
        }
    }

    function setActiveLesson(lesson) {
        const activeLesson = {
            id: lesson.id,
            order: lesson.order,
            title: lesson.title,
            url: lesson.url,
            desc: lesson.desc
        };

        sessionStorage.setItem("activeLesson", JSON.stringify(activeLesson));
        pendingLessonUrl = lesson.url || "";
    }

    function clearYouTubeGuard() {
        if (youtubeGuardTimer) window.clearInterval(youtubeGuardTimer);
        youtubeGuardTimer = null;
    }

    function completedLessonCount() {
        const state = getLessonState();
        return sortedLessons().filter((lesson) => state[String(lesson.id)]?.postDone).length;
    }

    function courseProgress() {
        const total = lessonsList.length || 0;
        if (!total) return Number(currentUser.progress || 0);
        return Math.round((completedLessonCount() / total) * 100);
    }

    function pendingCount() {
        if (!lessonsList.length) return 0;
        const unfinishedLessons = lessonsList.length - completedLessonCount();
        return unfinishedLessons;
    }

    function clampScore(value) {
        return Math.max(0, Math.min(100, Math.round(Number(value || 0))));
    }

    function percentFromAverage(type) {
        const avg = averageScore(type);
        if (!avg || !Number(avg.total)) return 0;
        return clampScore((Number(avg.score) / Number(avg.total)) * 100);
    }

    function lessonCoverageScore(keywordPattern) {
        const lessons = sortedLessons();
        if (!lessons.length) return 0;
        const matched = lessons.filter((lesson) => keywordPattern.test(`${lesson.title || ""} ${lesson.desc || ""} ${lesson.competency || ""}`));
        if (!matched.length) return 0;
        const done = matched.filter((lesson) => stateFor(lesson).postDone).length;
        return clampScore((done / matched.length) * 100);
    }

    function competencyScores() {
        const progress = courseProgress();
        const pre = percentFromAverage("pre");
        const post = percentFromAverage("post");
        const evidenceBonus = localStorage.getItem(ECOSYSTEM_REFLECTION_KEY) ? 12 : 0;
        const startedBonus = Object.values(getLessonState()).some((state) => state.started || state.preDone) ? 10 : 0;

        return {
            digital: clampScore(Math.max(progress, post, pre + startedBonus)),
            workflow: clampScore(Math.max(progress, lessonCoverageScore(/workflow|automation|กระบวนการ|อัตโนมัติ|เวิร์กโฟลว์/i))),
            analytics: clampScore(Math.max(post, lessonCoverageScore(/analytics|data|dashboard|ข้อมูล|วิเคราะห์/i), progress * 0.7)),
            ai: clampScore(Math.max(lessonCoverageScore(/ai|artificial|ปัญญาประดิษฐ์|เอไอ/i), post * 0.65)),
            collaboration: clampScore(Math.max(progress * 0.65, evidenceBonus + startedBonus + completedLessonCount() * 8)),
            lifelong: clampScore(Math.max(progress, evidenceBonus + completedLessonCount() * 12))
        };
    }

    function readinessLabel(score) {
        if (score >= 85) return "พร้อมเป็นต้นแบบและพี่เลี้ยงให้หน่วยงานอื่น";
        if (score >= 70) return "พร้อมนำไปใช้จริงและต่อยอดเป็นผลงานหน้างาน";
        if (score >= 45) return "กำลังพัฒนา ควรเติมกิจกรรมและหลักฐานการประยุกต์ใช้";
        return "เริ่มต้นระบบ ควรทำ Pre-test และเลือกบทเรียนแรก";
    }

    function renderEcosystemMap() {
        const container = document.getElementById("ecosystemMapCards");
        if (!container) return;

        container.innerHTML = ECOSYSTEM_COMPONENTS.map((item) => `
            <div class="rounded-2xl border border-gray-100 bg-slate-50 p-4 flex gap-4">
                <div class="w-11 h-11 rounded-2xl bg-white text-earth-clay border border-earth-100 flex items-center justify-center shrink-0">
                    <i class="fas ${item.icon}"></i>
                </div>
                <div>
                    <h5 class="text-sm font-bold text-gray-900">${item.title}</h5>
                    <p class="text-xs text-gray-500 leading-relaxed mt-1">${item.desc}</p>
                </div>
            </div>
        `).join("");
    }

    function renderEcosystemJourney() {
        const container = document.getElementById("ecosystemJourneySteps");
        if (!container) return;

        container.innerHTML = ECOSYSTEM_JOURNEY.map((step, index) => `
            <div class="rounded-2xl border border-gray-100 bg-slate-50 p-4">
                <div class="w-10 h-10 rounded-2xl bg-earth-clay text-white flex items-center justify-center mb-3">
                    <i class="fas ${step.icon}"></i>
                </div>
                <p class="text-[11px] font-bold text-earth-clay">STEP ${index + 1}</p>
                <h5 class="text-sm font-bold text-gray-900 mt-1">${step.title}</h5>
                <p class="text-xs text-gray-500 leading-relaxed mt-2">${step.desc}</p>
            </div>
        `).join("");
    }

    function renderEcosystemReflection() {
        const textarea = document.getElementById("ecosystemReflectionText");
        const status = document.getElementById("ecosystemReflectionStatus");
        if (!textarea || !status) return;

        const saved = localStorage.getItem(ECOSYSTEM_REFLECTION_KEY) || "";
        if (document.activeElement !== textarea) textarea.value = saved;
        status.innerText = saved ? "มีบันทึก Reflection แล้ว ระบบใช้เป็นหลักฐาน Portfolio เบื้องต้น" : "ยังไม่มีบันทึก";
    }

    function renderEcosystem() {
        if (!document.getElementById("view-ecosystem")) return;

        renderEcosystemMap();
        renderEcosystemJourney();
        renderEcosystemReflection();

        const scores = competencyScores();
        const readiness = clampScore(Object.values(scores).reduce((sum, score) => sum + score, 0) / ECOSYSTEM_COMPETENCIES.length);
        const bars = document.getElementById("ecosystemCompetencyBars");
        const gaps = document.getElementById("ecosystemGapList");

        setText("ecosystemReadinessScore", `${readiness}%`);
        setText("ecosystemReadinessLabel", readinessLabel(readiness));
        setText("ecosystemCompletedMini", `${completedLessonCount()}/${lessonsList.length || 0}`);
        setText("ecosystemGapMini", ECOSYSTEM_COMPETENCIES.filter((item) => scores[item.key] < 70).length);
        const readinessBar = document.getElementById("ecosystemReadinessBar");
        if (readinessBar) readinessBar.style.width = `${readiness}%`;

        if (bars) {
            bars.innerHTML = ECOSYSTEM_COMPETENCIES.map((item) => {
                const score = scores[item.key];
                const tone = score >= 70 ? "bg-emerald-500" : score >= 45 ? "bg-amber-500" : "bg-red-500";
                return `
                    <div>
                        <div class="flex items-center justify-between gap-3 mb-2">
                            <div class="flex items-center gap-3">
                                <span class="w-9 h-9 rounded-xl bg-gray-50 border border-gray-100 text-earth-clay flex items-center justify-center"><i class="fas ${item.icon}"></i></span>
                                <div>
                                    <p class="text-sm font-bold text-gray-900">${item.label}</p>
                                    <p class="text-[11px] text-gray-400">${item.hint}</p>
                                </div>
                            </div>
                            <span class="text-sm font-bold text-gray-700">${score}%</span>
                        </div>
                        <div class="h-2 bg-gray-100 rounded-full overflow-hidden"><div class="${tone} h-full rounded-full transition-all duration-500" style="width:${score}%"></div></div>
                    </div>
                `;
            }).join("");
        }

        if (gaps) {
            const low = ECOSYSTEM_COMPETENCIES
                .map((item) => ({ ...item, score: scores[item.key] }))
                .sort((a, b) => a.score - b.score)
                .slice(0, 3);

            gaps.innerHTML = low.map((item) => `
                <div class="rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
                    <div class="flex items-start gap-3">
                        <span class="w-9 h-9 rounded-xl bg-white text-amber-600 flex items-center justify-center shrink-0"><i class="fas ${item.icon}"></i></span>
                        <div>
                            <p class="text-sm font-bold text-gray-900">${item.label} ยังอยู่ที่ ${item.score}%</p>
                            <p class="text-xs text-gray-600 leading-relaxed mt-1">${item.hint} ควรเติมบทเรียน/กิจกรรมชุมชน และบันทึกหลักฐานการนำไปใช้กับงานจริง</p>
                        </div>
                    </div>
                </div>
            `).join("");
        }
    }

    window.saveEcosystemReflection = function () {
        const textarea = document.getElementById("ecosystemReflectionText");
        if (!textarea) return;
        localStorage.setItem(ECOSYSTEM_REFLECTION_KEY, textarea.value.trim());
        renderEcosystem();
        showCustomAlert("บันทึก Reflection และหลักฐาน Portfolio เบื้องต้นแล้ว", "success");
    };

    function isLessonUnlocked(lesson, index) {
        if (index === 0) return true;
        const previousLesson = sortedLessons()[index - 1];
        return Boolean(previousLesson && stateFor(previousLesson).postDone);
    }

    function currentDashboardLesson() {
        const activeLesson = getActiveLesson();
        const lessons = sortedLessons();
        if (activeLesson) {
            const found = lessons.find((lesson) => String(lesson.id) === String(activeLesson.id));
            if (found) return found;
        }

        return lessons.find((lesson, index) => isLessonUnlocked(lesson, index) && !stateFor(lesson).postDone) || lessons[0] || null;
    }

    function loadCachedData() {
        try {
            const cachedLessons = JSON.parse(sessionStorage.getItem(LESSONS_CACHE_KEY) || "[]");
            const cachedQuizzes = JSON.parse(sessionStorage.getItem(QUIZZES_CACHE_KEY) || "[]");
            if (cachedLessons.length) lessonsList = cachedLessons;
            if (cachedQuizzes.length) allQuizzes = cachedQuizzes;
        } catch (error) {
            console.error(error);
        }
    }

    function formatTime(totalSeconds) {
        const seconds = Math.max(0, Number(totalSeconds || 0));
        const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
        const remainder = Math.floor(seconds % 60).toString().padStart(2, "0");
        return `${minutes}:${remainder}`;
    }

    function loadYouTubeApi() {
        if (window.YT?.Player) return Promise.resolve(window.YT);
        if (youtubeApiPromise) return youtubeApiPromise;

        youtubeApiPromise = new Promise((resolve) => {
            const previousCallback = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = function () {
                if (typeof previousCallback === "function") previousCallback();
                resolve(window.YT);
            };

            if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
                const script = document.createElement("script");
                script.src = "https://www.youtube.com/iframe_api";
                document.head.appendChild(script);
            }
        });

        return youtubeApiPromise;
    }

    function updateScoreCards(preDone, postDone, pre, post, progress, preTotal, postTotal) {
        const avgPre = averageScore("pre");
        const avgPost = averageScore("post");

        document.getElementById("statPreScore").innerText = scoreText(pre, preTotal);
        document.getElementById("statPostScore").innerText = scoreText(post, postTotal);
        document.getElementById("statProgress").innerText = `${progress}%`;
        document.getElementById("summaryPreScore").innerText = avgPre ? scoreText(avgPre.score, avgPre.total) : "รอทำ";
        document.getElementById("summaryPostScore").innerText = avgPost ? scoreText(avgPost.score, avgPost.total) : "รอทำ";
        setText("summaryCompletedLessons", `${completedLessonCount()}/${lessonsList.length || 0}`);
        setText("summaryPendingLessons", `${pendingCount()}`);
    }

    function setText(id, value) {
        const element = document.getElementById(id);
        if (element) element.innerText = value;
    }

    function renderSummaryChart() {
        const container = document.getElementById("summaryScoreChart");
        if (!container) return;

        const rows = sortedLessons()
            .map((lesson) => ({ lesson, state: stateFor(lesson) }))
            .filter(({ state }) => state.preDone || state.postDone);

        if (!rows.length) {
            container.innerHTML = `<div class="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center"><p class="text-sm font-bold text-gray-500">ยังไม่มีคะแนนสำหรับแสดงกราฟ</p><p class="text-xs text-gray-400 mt-2">เริ่มทำ Pre-test ในบทเรียนแรก แล้วสรุปผลจะแสดงทันที</p></div>`;
            setText("summaryChartHint", "แสดงเฉพาะบทที่มีคะแนนแล้ว");
            return;
        }

        setText("summaryChartHint", "เปรียบเทียบคะแนนดิบรายบท");
        container.innerHTML = "";
        rows.forEach(({ lesson, state }) => {
            const prePercent = scorePercent(state.preScore, state.preTotal);
            const postPercent = scorePercent(state.postScore, state.postTotal);

            container.innerHTML += `
                <div class="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                    <div class="flex items-center justify-between gap-4 mb-3">
                        <div>
                            <p class="text-[11px] font-bold text-earth-clay">บทที่ ${lesson.order}</p>
                            <h5 class="text-sm font-bold text-gray-900">${lesson.title || "บทเรียน"}</h5>
                        </div>
                        <span class="text-xs font-bold text-gray-500">${state.postDone ? "ครบแล้ว" : state.preDone ? "รอ Post-test" : "รอคะแนน"}</span>
                    </div>
                    <div class="space-y-2">
                        <div class="grid grid-cols-[64px_1fr_52px] items-center gap-3">
                            <span class="text-xs font-bold text-emerald-700">Pre</span>
                            <div class="h-2 bg-white rounded-full overflow-hidden border border-emerald-100"><div class="h-full bg-emerald-500 rounded-full" style="width:${prePercent}%"></div></div>
                            <span class="text-xs font-bold text-emerald-700 text-right">${scoreText(state.preScore, state.preTotal)}</span>
                        </div>
                        <div class="grid grid-cols-[64px_1fr_52px] items-center gap-3">
                            <span class="text-xs font-bold text-purple-700">Post</span>
                            <div class="h-2 bg-white rounded-full overflow-hidden border border-purple-100"><div class="h-full bg-purple-500 rounded-full" style="width:${postPercent}%"></div></div>
                            <span class="text-xs font-bold text-purple-700 text-right">${scoreText(state.postScore, state.postTotal)}</span>
                        </div>
                    </div>
                </div>
            `;
        });
    }

    function renderSummaryList() {
        const container = document.getElementById("summaryLessonList");
        if (!container) return;

        const lessons = sortedLessons();
        if (!lessons.length) {
            container.innerHTML = `<div class="text-sm text-gray-400">ยังไม่มีบทเรียน</div>`;
            return;
        }

        container.innerHTML = "";
        lessons.forEach((lesson, index) => {
            const state = stateFor(lesson);
            const locked = !isLessonUnlocked(lesson, index);
            const dot = (done, active) => {
                if (done) return "bg-emerald-500 text-white";
                if (active) return "bg-earth-clay text-white";
                return "bg-gray-100 text-gray-400";
            };

            const cardTone = state.postDone
                ? "border-emerald-100 bg-emerald-50/50"
                : locked
                    ? "border-gray-100 bg-gray-50 opacity-70"
                    : "border-gray-200 bg-white";

            container.innerHTML += `
                <div class="rounded-2xl border ${cardTone} p-4">
                    <div class="flex items-start justify-between gap-3">
                        <div>
                            <p class="text-[11px] font-bold text-earth-clay">บทที่ ${lesson.order}</p>
                            <h5 class="text-sm font-bold text-gray-900 mt-1 leading-snug">${lesson.title || "บทเรียน"}</h5>
                        </div>
                        <span class="text-[10px] font-bold ${state.postDone ? "text-emerald-700" : locked ? "text-gray-400" : "text-gray-600"}">${lessonStageLabel(lesson, index)}</span>
                    </div>
                    <div class="grid grid-cols-3 gap-2 mt-4 text-center text-[10px] font-bold">
                        <div><span class="mx-auto w-8 h-8 rounded-full flex items-center justify-center ${dot(state.preDone, !state.preDone && !locked)}"><i class="fas fa-pencil-alt"></i></span><p class="mt-1 text-gray-500">${state.preDone ? scoreText(state.preScore, state.preTotal) : "Pre"}</p></div>
                        <div><span class="mx-auto w-8 h-8 rounded-full flex items-center justify-center ${dot(state.videoDone, state.preDone && !state.videoDone && !locked)}"><i class="fas fa-play"></i></span><p class="mt-1 text-gray-500">เรียน</p></div>
                        <div><span class="mx-auto w-8 h-8 rounded-full flex items-center justify-center ${dot(state.postDone, state.videoDone && !state.postDone && !locked)}"><i class="fas fa-award"></i></span><p class="mt-1 text-gray-500">${state.postDone ? scoreText(state.postScore, state.postTotal) : "Post"}</p></div>
                    </div>
                </div>
            `;
        });
    }

    function lessonStageLabel(lesson, index) {
        const state = stateFor(lesson);
        if (!isLessonUnlocked(lesson, index)) return "ล็อก";
        if (state.postDone) return "เสร็จแล้ว";
        if (!state.preDone) return "รอ Pre";
        if (!state.videoDone) return state.started ? "เรียนค้างไว้" : "พร้อมเรียน";
        if (!state.postDone) return "รอ Post";
        return "เสร็จแล้ว";
    }

    function renderJourney() {
        const container = document.getElementById("lessonJourneyList");
        if (!container) return;

        const lessons = sortedLessons();
        if (!lessons.length) {
            container.innerHTML = `<div class="min-w-[220px] bg-gray-50 rounded-2xl p-4 border border-gray-100 text-sm text-gray-400">ยังไม่มีบทเรียน</div>`;
            return;
        }

        container.innerHTML = "";
        lessons.forEach((lesson, index) => {
            const state = stateFor(lesson);
            const locked = !isLessonUnlocked(lesson, index);
            const preDone = Boolean(state.preDone);
            const videoDone = Boolean(state.videoDone);
            const postDone = Boolean(state.postDone);

            const stepClass = (done, active) => {
                if (done) return "bg-emerald-500 text-white border-emerald-500";
                if (active) return "bg-earth-clay text-white border-earth-clay";
                return "bg-white text-gray-400 border-gray-200";
            };

            container.innerHTML += `
                <div class="min-w-[240px] snap-start rounded-2xl border ${locked ? "border-gray-200 bg-gray-50 opacity-70" : "border-gray-200 bg-white"} p-4 shadow-sm">
                    <div class="flex items-center justify-between mb-4">
                        <span class="text-xs font-bold text-earth-clay">บทที่ ${lesson.order}</span>
                        <span class="text-[11px] font-bold ${locked ? "text-gray-400" : "text-gray-600"}">${lessonStageLabel(lesson, index)}</span>
                    </div>
                    <h4 class="text-sm font-bold text-gray-900 leading-snug line-clamp-2 min-h-[40px]">${lesson.title}</h4>
                    <div class="flex items-center gap-2 mt-4">
                        <div class="w-8 h-8 rounded-full border flex items-center justify-center text-xs ${stepClass(preDone, !preDone && !locked)}"><i class="fas fa-pencil-alt"></i></div>
                        <div class="h-1 flex-1 ${preDone ? "bg-emerald-400" : "bg-gray-200"} rounded-full"></div>
                        <div class="w-8 h-8 rounded-full border flex items-center justify-center text-xs ${stepClass(videoDone, preDone && !videoDone && !locked)}"><i class="fas fa-play"></i></div>
                        <div class="h-1 flex-1 ${videoDone ? "bg-emerald-400" : "bg-gray-200"} rounded-full"></div>
                        <div class="w-8 h-8 rounded-full border flex items-center justify-center text-xs ${stepClass(postDone, videoDone && !postDone && !locked)}"><i class="fas fa-award"></i></div>
                    </div>
                    <div class="grid grid-cols-3 gap-1 mt-3 text-[10px] font-bold text-center text-gray-400">
                        <span>Pre</span><span>เรียน</span><span>Post</span>
                    </div>
                </div>
            `;
        });
    }

    updateVisuals = function () {
        const dashboardLesson = currentDashboardLesson();
        const dashboardState = dashboardLesson ? stateFor(dashboardLesson) : {};
        const pre = dashboardLesson ? dashboardState.preScore : currentUser.preScore;
        const post = dashboardLesson ? dashboardState.postScore : currentUser.postScore;
        const preTotal = dashboardLesson ? dashboardState.preTotal : currentUser.preTotal;
        const postTotal = dashboardLesson ? dashboardState.postTotal : currentUser.postTotal;
        const preDone = hasScore(pre);
        const postDone = hasScore(post);
        const progress = courseProgress();

        currentUser.progress = progress;
        saveCurrentUser();
        updateScoreCards(preDone, postDone, pre, post, progress, preTotal, postTotal);
        updatePendingList(preDone, progress, postDone);
        renderJourney();
        renderSummaryChart();
        renderSummaryList();
        renderEcosystem();

        document.getElementById("lessonsGridWrapper").classList.remove("hidden");
        if (lessonsList.length > 0) renderLessons();
    };

    updatePendingList = function () {
        const list = document.getElementById("pendingTasksList");
        const lessons = sortedLessons();
        const count = pendingCount();
        list.innerHTML = "";

        const nextLesson = lessons.find((lesson, index) => isLessonUnlocked(lesson, index) && !stateFor(lesson).postDone);
        if (nextLesson) {
            const state = stateFor(nextLesson);
            const label = !state.preDone ? "ทำ Pre-test" : state.videoDone && !state.postDone ? "ทำ Post-test" : state.started ? "เรียนค้างไว้" : "เรียนบทถัดไป";
            const sub = !state.preDone ? `บทที่ ${nextLesson.order} ยังไม่ได้ทำ Pre-test` : state.videoDone && !state.postDone ? "วิดีโอครบแล้ว เหลือ Post-test" : `เหลือ ${lessons.length - completedLessonCount()} บท`;
            list.innerHTML += `<div class="flex justify-between items-center p-5 bg-amber-50 rounded-2xl border border-amber-100"><div class="flex items-center gap-4"><div class="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center"><i class="fas fa-layer-group text-xl"></i></div><div><p class="text-sm font-bold text-gray-900">${label}</p><p class="text-xs text-gray-500">${sub}</p></div></div><button onclick="switchTab('lessons')" class="text-xs bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 rounded-xl font-bold">ไปต่อ</button></div>`;
        }

        if (count === 0) {
            list.innerHTML = `<div class="h-full flex flex-col items-center justify-center py-8 text-emerald-500 opacity-70"><i class="fas fa-check-circle text-6xl mb-4"></i><p class="text-base font-bold">ยอดเยี่ยม! คุณทำกิจกรรมครบถ้วนแล้ว</p></div>`;
        }

        document.getElementById("statPendingCount").innerText = count;
    };

    function convertToEmbedUrl(url) {
        if (!url) return "";

        let videoId = "";
        try {
            const parsed = new URL(url);
            if (parsed.hostname.includes("youtube.com")) {
                if (parsed.pathname.startsWith("/embed/")) {
                    videoId = parsed.pathname.split("/embed/")[1].split("/")[0];
                } else if (parsed.pathname.startsWith("/shorts/")) {
                    videoId = parsed.pathname.split("/shorts/")[1].split("/")[0];
                } else {
                    videoId = parsed.searchParams.get("v") || "";
                }
            }

            if (parsed.hostname.includes("youtu.be")) {
                videoId = parsed.pathname.replace("/", "").split("/")[0];
            }
        } catch (error) {
            return url;
        }

        if (!videoId) return url;
        const origin = encodeURIComponent(window.location.origin);
        return `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1&controls=1&enablejsapi=1&origin=${origin}`;
    }

    async function watchYouTubeEnd(lesson, embedUrl) {
        if (!embedUrl.includes("youtube.com/embed/")) return;

        try {
            const YT = await loadYouTubeApi();
            clearYouTubeGuard();
            if (youtubePlayer?.destroy) youtubePlayer.destroy();

            youtubePlayer = new YT.Player("lessonVideoFrame", {
                events: {
                    onReady(event) {
                        const state = stateFor(lesson);
                        const canReview = Boolean(state.postDone);
                        let allowedSecond = Number(state.videoPosition || 0);

                        if (allowedSecond > 0 && !canReview) {
                            event.target.seekTo(allowedSecond, true);
                        }

                        if (canReview) return;

                        youtubeGuardTimer = window.setInterval(() => {
                            if (!youtubePlayer?.getCurrentTime) return;

                            const currentSecond = youtubePlayer.getCurrentTime();
                            if (currentSecond > allowedSecond + 2.5) {
                                youtubePlayer.seekTo(allowedSecond, true);
                                return;
                            }

                            if (currentSecond >= allowedSecond) {
                                allowedSecond = currentSecond;
                                if (Math.floor(allowedSecond) % 5 === 0) {
                                    patchLessonState(lesson, { videoPosition: Math.floor(allowedSecond) });
                                }
                            }
                        }, 700);
                    },
                    onStateChange(event) {
                        if (event.data === YT.PlayerState.ENDED && !lessonFinished) {
                            finishLessonVideo(lesson);
                        }
                    }
                }
            });
        } catch (error) {
            console.error(error);
        }
    }

    function lessonButtonLabel(locked, state) {
        if (locked) return "ล็อกบทเรียน";
        if (state.postDone) return "ดูบทเรียนอีกครั้ง";
        if (!state.preDone) return "ทำ Pre-test ก่อนเรียน";
        if (state.videoDone && !state.postDone) return "ทำ Post-test";
        if (state.started && !state.videoDone) return "เรียนค้างไว้";
        return "เปิดบทเรียน";
    }

    function lessonButtonClass(locked, state) {
        if (locked) return "bg-gray-200 text-gray-400 cursor-not-allowed border border-gray-200";
        if (state.postDone) return "bg-slate-700 hover:bg-slate-800 text-white";
        if (!state.preDone) return "bg-emerald-600 hover:bg-emerald-700 text-white";
        if (state.videoDone && !state.postDone) return "bg-purple-600 hover:bg-purple-700 text-white";
        if (state.started && !state.videoDone) return "bg-amber-600 hover:bg-amber-700 text-white";
        return "bg-earth-900 hover:bg-earth-800 text-white";
    }

    renderLessons = function () {
        const grid = document.getElementById("lessonsGrid");
        grid.innerHTML = "";

        const lessons = sortedLessons();
        if (!lessons.length) {
            grid.innerHTML = '<p class="text-sm text-gray-400 col-span-3 p-4">แอดมินยังไม่ได้เพิ่มบทเรียนเข้าสู่ระบบ</p>';
            return;
        }

        const activeLesson = getActiveLesson();

        lessons.forEach((lesson, index) => {
            const state = stateFor(lesson);
            const locked = !isLessonUnlocked(lesson, index);
            const isActive = activeLesson && String(activeLesson.id) === String(lesson.id);
            const preBadge = state.preDone
                ? `<span class="bg-emerald-50 text-emerald-700 border border-emerald-100 px-3 py-1 rounded-lg text-[11px] font-bold">Pre-test ${scoreText(state.preScore, state.preTotal)}</span>`
                : `<span class="bg-red-50 text-red-600 border border-red-100 px-3 py-1 rounded-lg text-[11px] font-bold">รอ Pre-test</span>`;
            const lessonBadge = state.postDone
                ? `<span class="bg-emerald-50 text-emerald-700 border border-emerald-100 px-3 py-1 rounded-lg text-[11px] font-bold">เรียนจบบทแล้ว</span>`
                : state.videoDone
                ? `<span class="bg-blue-50 text-blue-700 border border-blue-100 px-3 py-1 rounded-lg text-[11px] font-bold">เรียนวิดีโอแล้ว</span>`
                : state.started
                    ? `<span class="bg-amber-50 text-amber-700 border border-amber-100 px-3 py-1 rounded-lg text-[11px] font-bold">เรียนค้างไว้</span>`
                    : `<span class="bg-gray-50 text-gray-500 border border-gray-100 px-3 py-1 rounded-lg text-[11px] font-bold">ยังไม่เริ่มเรียน</span>`;
            const postBadge = state.postDone
                ? `<span class="bg-purple-50 text-purple-700 border border-purple-100 px-3 py-1 rounded-lg text-[11px] font-bold">Post-test ${scoreText(state.postScore, state.postTotal)}</span>`
                : state.videoDone
                    ? `<span class="bg-purple-50 text-purple-700 border border-purple-100 px-3 py-1 rounded-lg text-[11px] font-bold">พร้อม Post-test</span>`
                    : `<span class="bg-gray-50 text-gray-500 border border-gray-100 px-3 py-1 rounded-lg text-[11px] font-bold">Post-test ยังล็อก</span>`;
            const lockBadge = locked ? `<span class="bg-gray-100 text-gray-500 border border-gray-200 px-3 py-1 rounded-lg text-[11px] font-bold"><i class="fas fa-lock mr-1"></i>ล็อก</span>` : "";
            const competencyBadge = lesson.competency
                ? `<span class="bg-blue-50 text-blue-700 border border-blue-100 px-3 py-1 rounded-lg text-[11px] font-bold">${lesson.competency}</span>`
                : "";
            const evidenceText = lesson.evidence
                ? `<p class="text-xs text-gray-500 leading-relaxed mt-3"><i class="fas fa-folder-open text-earth-clay mr-1"></i>หลักฐานผลงาน: ${lesson.evidence}</p>`
                : "";

            grid.innerHTML += `
                <div class="bg-white rounded-2xl border ${isActive ? "border-earth-clay ring-2 ring-earth-clay/20" : "border-gray-100"} ${locked ? "opacity-60" : ""} shadow-sm hover:shadow-lg transition-all overflow-hidden flex flex-col">
                    <div class="p-6 flex-1 flex flex-col justify-between">
                        <div>
                            <div class="flex items-center justify-between gap-3 mb-4">
                                <span class="inline-block bg-earth-clay text-white px-4 py-1.5 rounded-xl text-xs font-bold">บทที่ ${lesson.order}</span>
                                ${isActive && state.started && !state.videoDone && !state.postDone ? '<span class="text-[11px] font-bold text-amber-700">เรียนค้างไว้</span>' : ""}
                            </div>
                            <h4 class="text-lg font-bold text-gray-900 leading-tight mb-3">${lesson.title}</h4>
                            <p class="text-sm text-gray-500 leading-relaxed">${lesson.desc || ""}</p>
                            ${lesson.outcome ? `<p class="text-xs text-earth-700 bg-earth-50 border border-earth-100 rounded-2xl p-3 leading-relaxed mt-4">${lesson.outcome}</p>` : ""}
                            ${evidenceText}
                            <div class="flex flex-wrap gap-2 mt-5">${competencyBadge}${preBadge}${lessonBadge}${postBadge}${lockBadge}</div>
                        </div>
                        <button data-lesson-id="${lesson.id}" ${locked ? "disabled" : ""} class="${lessonButtonClass(locked, state)} mt-6 w-full font-bold py-3 rounded-2xl text-sm transition-all shadow-sm">
                            ${lessonButtonLabel(locked, state)}
                        </button>
                    </div>
                </div>
            `;
        });

        grid.querySelectorAll("[data-lesson-id]").forEach((button) => {
            button.addEventListener("click", () => {
                const lesson = lessons.find((item) => String(item.id) === String(button.dataset.lessonId));
                if (lesson) startLesson(lesson.id);
            });
        });
    };

    startLesson = function (lessonId) {
        const lessons = sortedLessons();
        const lesson = lessons.find((item) => String(item.id) === String(lessonId));
        if (!lesson) return;

        const lessonIndex = lessons.findIndex((item) => String(item.id) === String(lessonId));
        if (!isLessonUnlocked(lesson, lessonIndex)) {
            showCustomAlert("กรุณาเรียนบทก่อนหน้าให้เสร็จก่อนครับ", "error");
            return;
        }

        setActiveLesson(lesson);
        const state = stateFor(lesson);

        if (!state.preDone) {
            patchLessonState(lesson, { preStarted: true });
            openQuizModal("pre");
            return;
        }

        if (state.videoDone && !state.postDone) {
            openQuizModal("post");
            return;
        }

        openLessonPlayer(lesson);
    };

    openLessonPlayer = function (lesson) {
        if (!lesson.url) {
            showCustomAlert("บทเรียนนี้ยังไม่มีลิงก์เนื้อหาครับ", "error");
            return;
        }

        setActiveLesson(lesson);
        patchLessonState(lesson, { started: true });

        const player = document.getElementById("lessonPlayerWrapper");
        const badge = document.getElementById("lessonStatusBadge");
        const timerText = document.getElementById("lessonTimerText");
        const countdown = document.getElementById("lessonCountdown");
        const progressBar = document.getElementById("lessonProgressBar");
        const embedUrl = convertToEmbedUrl(lesson.url);
        const isReview = Boolean(stateFor(lesson).postDone);
        lessonFinished = false;
        clearYouTubeGuard();

        document.getElementById("playerLessonTitle").innerText = lesson.title;
        document.getElementById("lessonVideoFrame").src = embedUrl;
        badge.innerText = isReview ? "ดูย้อนหลัง" : "เรียนค้างไว้";
        badge.className = isReview
            ? "bg-slate-100 text-slate-700 px-4 py-1 rounded-xl text-xs font-bold"
            : "bg-amber-100 text-amber-700 px-4 py-1 rounded-xl text-xs font-bold";
        player.classList.remove("hidden");

        const configuredSeconds = Number(lesson.durationSeconds || lesson.duration);
        const totalSeconds = configuredSeconds > 0 ? configuredSeconds : MIN_STUDY_SECONDS;
        let remaining = totalSeconds;
        countdown.innerText = "";
        countdown.classList.add("hidden");
        progressBar.style.width = isReview ? "100%" : "0%";
        timerText.innerText = "";
        timerText.classList.add("hidden");

        if (isReview) {
            window.clearTimeout(window.lessonStudyTimer);
            player.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
        }

        const tick = () => {
            if (remaining <= 0) {
                timerText.innerText = "";
                countdown.innerText = "";
                progressBar.style.width = "100%";
                finishLessonVideo(lesson);
                return;
            }

            const elapsed = totalSeconds - remaining;
            const percentage = Math.min(100, Math.round((elapsed / totalSeconds) * 100));
            timerText.innerText = "";
            timerText.classList.add("hidden");
            countdown.innerText = "";
            progressBar.style.width = `${percentage}%`;
            remaining -= 1;
            window.clearTimeout(window.lessonStudyTimer);
            window.lessonStudyTimer = window.setTimeout(tick, 1000);
        };

        updateVisuals();
        watchYouTubeEnd(lesson, embedUrl);
        tick();
        player.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    async function saveUserSnapshot() {
        try {
            await fetch(gasUrl, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({ action: "saveUser", user: currentUser })
            });
        } catch (error) {
            console.error(error);
        }
    }

    async function syncProgress() {
        currentUser.progress = courseProgress();
        currentUser.lessonProgress = JSON.stringify(getLessonState());
        saveCurrentUser();

        try {
            await fetch(gasUrl, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({
                    action: "updateProgress",
                    username: currentUser.username,
                    progress: currentUser.progress
                })
            });
            saveUserSnapshot();
        } catch (error) {
            console.error(error);
        }
    }

    finishLessonVideo = async function (lesson) {
        if (lessonFinished) return;
        lessonFinished = true;
        window.clearTimeout(window.lessonStudyTimer);
        clearYouTubeGuard();
        patchLessonState(lesson, { videoDone: true });
        document.getElementById("lessonStatusBadge").innerText = "พร้อม Post-test";
        document.getElementById("lessonStatusBadge").className = "bg-purple-100 text-purple-700 px-4 py-1 rounded-xl text-xs font-bold";
        updateVisuals();
        openQuizModal("post");
    };

    markLessonComplete = function () {};

    openQuizModal = function (type) {
        currentTakingType = type;
        currentQuizData = allQuizzes.filter((quiz) => quiz.type === type || quiz.type === "both");

        if (currentQuizData.length === 0) {
            showCustomAlert("ขณะนี้แอดมินยังไม่ได้เพิ่มแบบทดสอบเข้าระบบครับ", "error");
            return;
        }

        document.getElementById("quizHeaderType").innerText = type === "pre" ? "PRE-TEST" : "POST-TEST";
        setText("quizQuestionCount", `ทั้งหมด ${currentQuizData.length} ข้อ กรุณาตอบให้ครบก่อนส่งคำตอบ`);
        const container = document.getElementById("quizQuestionsContainer");
        container.innerHTML = "";

        currentQuizData.forEach((quiz, index) => {
            container.innerHTML += `
                <div class="bg-white p-5 lg:p-7 rounded-2xl border border-slate-200 shadow-sm question-block" data-answer="${quiz.answer}">
                    <div class="flex items-start gap-4 mb-5">
                        <div class="w-11 h-11 rounded-2xl bg-earth-clay text-white flex items-center justify-center text-base font-bold shrink-0 shadow-sm">${index + 1}</div>
                        <div>
                            <p class="text-[11px] font-bold text-earth-clay uppercase tracking-wide">คำถามที่ ${index + 1} จาก ${currentQuizData.length}</p>
                            <h4 class="text-lg lg:text-xl font-bold text-gray-950 leading-relaxed mt-1">${quiz.question}</h4>
                        </div>
                    </div>
                    <div class="grid grid-cols-1 gap-3 ios-radio">
                        <div><input type="radio" name="q${quiz.id}" id="q${quiz.id}_1" value="1"><label for="q${quiz.id}_1"><span class="w-8 h-8 rounded-xl bg-white border border-current/20 flex items-center justify-center mr-3 text-xs font-bold shrink-0">1</span><span>${quiz.opt1}</span></label></div>
                        <div><input type="radio" name="q${quiz.id}" id="q${quiz.id}_2" value="2"><label for="q${quiz.id}_2"><span class="w-8 h-8 rounded-xl bg-white border border-current/20 flex items-center justify-center mr-3 text-xs font-bold shrink-0">2</span><span>${quiz.opt2}</span></label></div>
                        <div><input type="radio" name="q${quiz.id}" id="q${quiz.id}_3" value="3"><label for="q${quiz.id}_3"><span class="w-8 h-8 rounded-xl bg-white border border-current/20 flex items-center justify-center mr-3 text-xs font-bold shrink-0">3</span><span>${quiz.opt3}</span></label></div>
                        <div><input type="radio" name="q${quiz.id}" id="q${quiz.id}_4" value="4"><label for="q${quiz.id}_4"><span class="w-8 h-8 rounded-xl bg-white border border-current/20 flex items-center justify-center mr-3 text-xs font-bold shrink-0">4</span><span>${quiz.opt4}</span></label></div>
                    </div>
                </div>`;
        });

        container.querySelectorAll('input[type="radio"]').forEach((input) => {
            input.addEventListener("change", () => {
                const answered = container.querySelectorAll('input[type="radio"]:checked').length;
                setText("quizQuestionCount", `ตอบแล้ว ${answered}/${currentQuizData.length} ข้อ`);
            });
        });

        document.getElementById("quizOverlay").classList.remove("hidden");
        document.getElementById("quizOverlay").classList.add("flex");
    };

    submitQuiz = async function () {
        const blocks = document.querySelectorAll(".question-block");
        let correctCount = 0;
        let answeredCount = 0;

        blocks.forEach((block) => {
            const selected = block.querySelector('input[type="radio"]:checked');
            if (!selected) return;
            answeredCount += 1;
            if (selected.value === block.getAttribute("data-answer")) correctCount += 1;
        });

        if (answeredCount < currentQuizData.length) {
            await showCustomAlert("กรุณาตอบคำถามให้ครบทุกข้อก่อนกดส่งคำตอบครับ", "error");
            return;
        }

        const rawScore = correctCount;
        const totalScore = currentQuizData.length;
        const finalPercent = Math.round((correctCount / currentQuizData.length) * 100);
        const activeLesson = getActiveLesson();
        closeQuizModal();

        if (currentTakingType === "pre") {
            currentUser.preScore = rawScore;
            currentUser.preTotal = totalScore;
            if (activeLesson) patchLessonState(activeLesson, { preDone: true, preScore: rawScore, preTotal: totalScore, prePercent: finalPercent });
        } else {
            currentUser.postScore = rawScore;
            currentUser.postTotal = totalScore;
            if (activeLesson) patchLessonState(activeLesson, { started: false, videoDone: true, postDone: true, postScore: rawScore, postTotal: totalScore, postPercent: finalPercent });
        }

        saveCurrentUser();
        updateVisuals();
        syncProgress();
        saveUserSnapshot();

        if (currentTakingType === "pre") {
            await showCustomAlert(`ส่ง Pre-test สำเร็จ ได้ ${rawScore}/${totalScore} คะแนน`, "success");
            if (activeLesson) openLessonPlayer(activeLesson);
            return;
        }

        const lessons = sortedLessons();
        const activeIndex = lessons.findIndex((lesson) => activeLesson && String(lesson.id) === String(activeLesson.id));
        const nextLesson = lessons[activeIndex + 1];

        if (nextLesson) {
            const continueNext = await showCustomAlert(`ส่ง Post-test สำเร็จ ได้ ${rawScore}/${totalScore} คะแนน\nต้องการเริ่มบทที่ ${nextLesson.order} ต่อเลยไหม?`, "warning");
            switchTab("lessons");
            if (continueNext) {
                startLesson(nextLesson.id);
            }
            return;
        }

        await showCustomAlert(`ส่ง Post-test สำเร็จ ได้ ${rawScore}/${totalScore} คะแนน คุณเรียนครบทุกบทแล้ว`, "success");
        switchTab("lessons");
    };

    fetchLessonsAndQuizzes = async function () {
        try {
            const lessonRequest = fetch(gasUrl, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({ action: "getLessons" })
            });

            const quizRequest = fetch(gasUrl, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({ action: "getQuizzes" })
            });

            const [lessonResponse, quizResponse] = await Promise.all([lessonRequest, quizRequest]);
            const [lessonData, quizData] = await Promise.all([lessonResponse.json(), quizResponse.json()]);

            if (lessonData.status === "success") {
                lessonsList = lessonData.lessons || [];
                sessionStorage.setItem(LESSONS_CACHE_KEY, JSON.stringify(lessonsList));
            }
            if (quizData.status === "success") {
                allQuizzes = quizData.quizzes || [];
                sessionStorage.setItem(QUIZZES_CACHE_KEY, JSON.stringify(allQuizzes));
            }

            hydrateLessonStateFromUser();
            updateVisuals();

            const activeLesson = getActiveLesson();
            if (activeLesson) {
                const lesson = sortedLessons().find((item) => String(item.id) === String(activeLesson.id));
                const state = lesson ? stateFor(lesson) : {};
                if (lesson && state.started && !state.videoDone) openLessonPlayer(lesson);
            }
        } catch (error) {
            console.error(error);
        }
    };

    switchTab = function (tabId) {
        ["dashboard", "lessons", "ecosystem", "tests"].forEach((id) => {
            const view = document.getElementById(`view-${id}`);
            if (view) view.classList.add("hidden");
        });

        const selected = document.getElementById(`view-${tabId}`);
        if (selected) selected.classList.remove("hidden");

        document.querySelectorAll(".tab-btn").forEach((button) => {
            button.className = "tab-btn flex flex-col lg:flex-row items-center gap-1 lg:gap-4 p-2.5 lg:p-3.5 hover:bg-white/10 text-gray-300 hover:text-white rounded-xl font-medium text-xs lg:text-sm transition-all";
        });

        const activeButton = document.querySelector(`.tab-btn[onclick="switchTab('${tabId}')"]`);
        if (activeButton) {
            activeButton.className = "tab-btn flex flex-col lg:flex-row items-center gap-1 lg:gap-4 p-2.5 lg:p-3.5 bg-earth-clay text-white rounded-xl shadow-sm font-bold text-xs lg:text-sm transition-all";
        }

        if (tabId === "ecosystem") renderEcosystem();
    };

    initConfig = async function () {
        try {
            gasUrl = await window.loadScinuConfig();
            if (!gasUrl) {
                await showCustomAlert("ยังไม่ได้ตั้งค่า GAS_WEB_APP_URL กรุณาตั้งค่าใน Vercel Environment Variable หรือในไฟล์ config.js หากใช้งานบน GitHub Pages", "error");
                return;
            }

            loadUserData();
            loadCachedData();
            updateVisuals();
            await fetchLessonsAndQuizzes();
        } catch (error) {
            console.error("Config load error:", error);
        }
    };

    window.onload = initConfig;
})();
