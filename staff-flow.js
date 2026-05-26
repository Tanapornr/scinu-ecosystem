(function () {
    const MIN_STUDY_SECONDS = 60;
    const COURSE_PROGRESS_KEY = `scinuLessonProgress:${currentUser?.username || "guest"}`;
    const LESSONS_CACHE_KEY = "scinuLessonsCache";
    const QUIZZES_CACHE_KEY = "scinuQuizzesCache";
    let youtubeApiPromise = null;
    let youtubePlayer = null;
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

    function getLessonState() {
        try {
            return JSON.parse(localStorage.getItem(COURSE_PROGRESS_KEY) || "{}");
        } catch (error) {
            return {};
        }
    }

    function saveLessonState(state) {
        localStorage.setItem(COURSE_PROGRESS_KEY, JSON.stringify(state));
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
        const prePercent = scorePercent(pre, preTotal);
        const postPercent = scorePercent(post, postTotal);

        document.getElementById("statPreScore").innerText = scoreText(pre, preTotal);
        document.getElementById("statPostScore").innerText = scoreText(post, postTotal);
        document.getElementById("statProgress").innerText = `${progress}%`;
        document.getElementById("summaryPreScore").innerText = scoreText(pre, preTotal);
        document.getElementById("summaryPostScore").innerText = scoreText(post, postTotal);

        document.getElementById("chartPreBarTab3").style.height = preDone ? `${prePercent}%` : "0%";
        document.getElementById("chartPreTextTab3").innerText = preDone && Number(preTotal) > 0 ? `${pre}/${preTotal}` : "รอทำ";
        document.getElementById("chartPostBarTab3").style.height = postDone ? `${postPercent}%` : "0%";
        document.getElementById("chartPostTextTab3").innerText = postDone && Number(postTotal) > 0 ? `${post}/${postTotal}` : "รอทำ";
    }

    function setText(id, value) {
        const element = document.getElementById(id);
        if (element) element.innerText = value;
    }

    function renderSummaryPanel(lesson, state) {
        if (!lesson) {
            setText("summaryLessonOrder", "ยังไม่มีบทเรียน");
            setText("summaryLessonTitle", "ยังไม่มีข้อมูลสรุปผล");
            setText("summaryLessonStatus", "เมื่อมีบทเรียน ระบบจะแสดงคะแนนและสถานะที่นี่");
            setText("summaryVideoStatus", "รอเรียน");
            setText("summaryChartHint", "กราฟจะแสดงเมื่อมีคะแนน Pre-test หรือ Post-test");
            return;
        }

        const stage = state.postDone
            ? "เรียนจบบทนี้แล้ว"
            : state.videoDone
                ? "วิดีโอครบแล้ว เหลือ Post-test"
                : state.started
                    ? "เรียนค้างไว้"
                    : state.preDone
                        ? "พร้อมเรียนวิดีโอ"
                        : "รอทำ Pre-test";

        setText("summaryLessonOrder", `บทที่ ${lesson.order}`);
        setText("summaryLessonTitle", lesson.title || "บทเรียน");
        setText("summaryLessonStatus", stage);
        setText("summaryVideoStatus", state.postDone ? "จบบทแล้ว" : state.videoDone ? "เรียนวิดีโอแล้ว" : state.started ? "เรียนค้างไว้" : "รอเรียน");
        setText("summaryPreNote", state.preDone ? "คะแนนก่อนเรียนของบทนี้" : "เริ่มบทนี้เพื่อทำ Pre-test");
        setText("summaryPostNote", state.postDone ? "คะแนนหลังเรียนของบทนี้" : state.videoDone ? "พร้อมทำ Post-test" : "ต้องเรียนวิดีโอก่อน");
        setText("summaryChartHint", state.preDone || state.postDone ? "กราฟเทียบคะแนนดิบของบทนี้" : "ยังไม่มีคะแนนของบทนี้");
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
        renderSummaryPanel(dashboardLesson, dashboardState);
        renderSummaryList();

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
            if (youtubePlayer?.destroy) youtubePlayer.destroy();

            youtubePlayer = new YT.Player("lessonVideoFrame", {
                events: {
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
                            <div class="flex flex-wrap gap-2 mt-5">${preBadge}${lessonBadge}${postBadge}${lockBadge}</div>
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
        lessonFinished = false;

        document.getElementById("playerLessonTitle").innerText = lesson.title;
        document.getElementById("lessonVideoFrame").src = embedUrl;
        badge.innerText = "เรียนค้างไว้";
        badge.className = "bg-amber-100 text-amber-700 px-4 py-1 rounded-xl text-xs font-bold";
        player.classList.remove("hidden");

        const configuredSeconds = Number(lesson.durationSeconds || lesson.duration);
        const totalSeconds = configuredSeconds > 0 ? configuredSeconds : MIN_STUDY_SECONDS;
        let remaining = totalSeconds;
        countdown.innerText = `00:00 / ${formatTime(totalSeconds)}`;
        progressBar.style.width = "0%";

        const tick = () => {
            if (remaining <= 0) {
                timerText.innerText = "ครบเวลาเรียนแล้ว ระบบกำลังเปิด Post-test";
                countdown.innerText = `${formatTime(totalSeconds)} / ${formatTime(totalSeconds)}`;
                progressBar.style.width = "100%";
                finishLessonVideo(lesson);
                return;
            }

            const elapsed = totalSeconds - remaining;
            const percentage = Math.min(100, Math.round((elapsed / totalSeconds) * 100));
            timerText.innerText = `เรียนค้างไว้ หากออกจากหน้านี้สามารถกลับมาเปิดบทเรียนต่อได้ เหลือ ${formatTime(remaining)}`;
            countdown.innerText = `${formatTime(elapsed)} / ${formatTime(totalSeconds)}`;
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
        } catch (error) {
            console.error(error);
        }
    }

    finishLessonVideo = async function (lesson) {
        if (lessonFinished) return;
        lessonFinished = true;
        window.clearTimeout(window.lessonStudyTimer);
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
        const container = document.getElementById("quizQuestionsContainer");
        container.innerHTML = "";

        currentQuizData.forEach((quiz, index) => {
            container.innerHTML += `
                <div class="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm question-block" data-answer="${quiz.answer}">
                    <h4 class="text-base font-bold text-gray-900 mb-6 leading-relaxed"><span class="text-earth-clay mr-2">ข้อที่ ${index + 1}.</span> ${quiz.question}</h4>
                    <div class="space-y-3 ios-radio">
                        <div><input type="radio" name="q${quiz.id}" id="q${quiz.id}_1" value="1"><label for="q${quiz.id}_1">1. ${quiz.opt1}</label></div>
                        <div><input type="radio" name="q${quiz.id}" id="q${quiz.id}_2" value="2"><label for="q${quiz.id}_2">2. ${quiz.opt2}</label></div>
                        <div><input type="radio" name="q${quiz.id}" id="q${quiz.id}_3" value="3"><label for="q${quiz.id}_3">3. ${quiz.opt3}</label></div>
                        <div><input type="radio" name="q${quiz.id}" id="q${quiz.id}_4" value="4"><label for="q${quiz.id}_4">4. ${quiz.opt4}</label></div>
                    </div>
                </div>`;
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
        ["dashboard", "lessons", "tests"].forEach((id) => {
            const view = document.getElementById(`view-${id}`);
            if (view) view.classList.add("hidden");
        });

        const selected = document.getElementById(`view-${tabId}`);
        if (selected) selected.classList.remove("hidden");

        document.querySelectorAll(".tab-btn").forEach((button) => {
            button.className = "tab-btn flex items-center gap-4 p-3.5 hover:bg-white/10 text-gray-300 hover:text-white rounded-xl font-medium text-sm transition-all";
        });

        const activeButton = document.querySelector(`.tab-btn[onclick="switchTab('${tabId}')"]`);
        if (activeButton) {
            activeButton.className = "tab-btn flex items-center gap-4 p-3.5 bg-earth-clay text-white rounded-xl shadow-sm font-bold text-sm transition-all";
        }
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
