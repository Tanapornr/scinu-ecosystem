(function () {
    const MIN_STUDY_SECONDS = 60;

    function hasScore(value) {
        return value !== undefined && value !== null && value !== "";
    }

    function scoreText(value) {
        return hasScore(value) ? `${value}%` : "รอทำ";
    }

    function getProgress() {
        return Number(currentUser.progress || 0);
    }

    function saveCurrentUser() {
        sessionStorage.setItem("currentUser", JSON.stringify(currentUser));
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

    function updateScoreCards(preDone, postDone, pre, post, progress) {
        document.getElementById("statPreScore").innerText = scoreText(pre);
        document.getElementById("statPostScore").innerText = scoreText(post);
        document.getElementById("statProgress").innerText = `${progress}%`;
        document.getElementById("summaryPreScore").innerText = scoreText(pre);
        document.getElementById("summaryPostScore").innerText = scoreText(post);

        const line = postDone ? 100 : progress >= 100 ? 100 : preDone ? 50 : 0;
        document.getElementById("journeyLine").style.width = `${line}%`;

        document.getElementById("chartPreBarTab3").style.height = preDone ? `${pre}%` : "0%";
        document.getElementById("chartPreTextTab3").innerText = preDone ? `${pre}%` : "0%";
        document.getElementById("chartPostBarTab3").style.height = postDone ? `${post}%` : "0%";
        document.getElementById("chartPostTextTab3").innerText = postDone ? `${post}%` : "0%";
    }

    function setStepState(id, done, text) {
        const circle = document.getElementById(`${id}-circle`);
        const tag = document.getElementById(`${id}-tag`);

        circle.className = done
            ? "w-14 h-14 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xl border-[5px] border-white shadow-sm transition-colors"
            : "w-14 h-14 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center text-xl border-[5px] border-white shadow-sm transition-colors";
        tag.className = done
            ? "text-[10px] font-bold text-emerald-600"
            : "text-[10px] font-bold text-gray-400";
        tag.innerText = text;
    }

    updateVisuals = function () {
        const pre = currentUser.preScore;
        const post = currentUser.postScore;
        const preDone = hasScore(pre);
        const postDone = hasScore(post);
        const progress = getProgress();

        updateScoreCards(preDone, postDone, pre, post, progress);
        setStepState("step1", preDone, preDone ? "ทำแล้ว" : "รอทำ");
        setStepState("step2", progress >= 100, progress >= 100 ? "เรียนครบแล้ว" : preDone ? "กำลังเรียน" : "รอ Pre-test");
        setStepState("step3", postDone, postDone ? "ทำแล้ว" : progress >= 100 ? "พร้อมทำ" : "รอเรียนครบ");

        document.getElementById("lessonsGridWrapper").classList.remove("hidden");
        updatePendingList(preDone, progress, postDone);

        if (lessonsList.length > 0) {
            renderLessons();
        }
    };

    updatePendingList = function (preDone, progress, postDone) {
        const list = document.getElementById("pendingTasksList");
        let count = 0;
        list.innerHTML = "";

        if (!preDone) {
            count += 1;
            list.innerHTML += `<div class="flex justify-between items-center p-5 bg-red-50 rounded-2xl border border-red-100"><div class="flex items-center gap-4"><div class="w-12 h-12 rounded-xl bg-red-100 text-red-500 flex items-center justify-center"><i class="fas fa-clipboard-list text-xl"></i></div><div><p class="text-sm font-bold text-gray-900">ทำ Pre-test</p><p class="text-xs text-gray-500">กดเข้าบทเรียนเพื่อเริ่มทำแบบทดสอบก่อนเรียน</p></div></div><button onclick="switchTab('lessons')" class="text-xs bg-red-500 hover:bg-red-600 text-white px-5 py-2.5 rounded-xl font-bold">ไปบทเรียน</button></div>`;
        }

        if (preDone && progress < 100 && lessonsList.length > 0) {
            count += 1;
            list.innerHTML += `<div class="flex justify-between items-center p-5 bg-amber-50 rounded-2xl border border-amber-100"><div class="flex items-center gap-4"><div class="w-12 h-12 rounded-xl bg-amber-100 text-amber-500 flex items-center justify-center"><i class="fas fa-layer-group text-xl"></i></div><div><p class="text-sm font-bold text-gray-900">เรียนบทเรียน</p><p class="text-xs text-gray-500">ความก้าวหน้า ${progress}% กลับมาเรียนต่อได้จากการ์ดบทเรียน</p></div></div><button onclick="switchTab('lessons')" class="text-xs bg-amber-500 hover:bg-amber-600 text-white px-5 py-2.5 rounded-xl font-bold">เรียนต่อ</button></div>`;
        }

        if (preDone && progress >= 100 && !postDone && lessonsList.length > 0) {
            count += 1;
            list.innerHTML += `<div class="flex justify-between items-center p-5 bg-purple-50 rounded-2xl border border-purple-100"><div class="flex items-center gap-4"><div class="w-12 h-12 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center"><i class="fas fa-award text-xl"></i></div><div><p class="text-sm font-bold text-gray-900">ทำ Post-test</p><p class="text-xs text-gray-500">ปุ่ม Post-test อยู่ในการ์ดบทเรียนที่เรียนครบแล้ว</p></div></div><button onclick="switchTab('lessons')" class="text-xs bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl font-bold">ไปทำข้อสอบ</button></div>`;
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
        return `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1&controls=0&disablekb=1&fs=0`;
    }

    function lessonButtonLabel(preDone, postDone, progress) {
        if (!preDone) return "ทำ Pre-test ก่อนเรียน";
        if (progress >= 100 && !postDone) return "ทำ Post-test";
        if (postDone) return "ทบทวนบทเรียน";
        return getActiveLesson() ? "เรียนต่อในเว็บ" : "เข้าเรียนในเว็บ";
    }

    function lessonButtonClass(preDone, postDone, progress) {
        if (!preDone) return "bg-emerald-600 hover:bg-emerald-700";
        if (progress >= 100 && !postDone) return "bg-purple-600 hover:bg-purple-700";
        if (postDone) return "bg-slate-700 hover:bg-slate-800";
        return "bg-earth-navy hover:bg-black";
    }

    renderLessons = function () {
        const grid = document.getElementById("lessonsGrid");
        grid.innerHTML = "";

        if (!lessonsList || lessonsList.length === 0) {
            grid.innerHTML = '<p class="text-sm text-gray-400 col-span-3 p-4">แอดมินยังไม่ได้เพิ่มบทเรียนเข้าสู่ระบบ</p>';
            return;
        }

        const preDone = hasScore(currentUser.preScore);
        const postDone = hasScore(currentUser.postScore);
        const progress = getProgress();
        const activeLesson = getActiveLesson();

        lessonsList.sort((a, b) => Number(a.order) - Number(b.order));
        lessonsList.forEach((lesson) => {
            const isActive = activeLesson && String(activeLesson.id) === String(lesson.id);
            const preBadge = preDone
                ? `<span class="bg-emerald-50 text-emerald-700 border border-emerald-100 px-3 py-1 rounded-lg text-[11px] font-bold">Pre-test ${currentUser.preScore}%</span>`
                : `<span class="bg-red-50 text-red-600 border border-red-100 px-3 py-1 rounded-lg text-[11px] font-bold">รอ Pre-test</span>`;
            const postBadge = postDone
                ? `<span class="bg-purple-50 text-purple-700 border border-purple-100 px-3 py-1 rounded-lg text-[11px] font-bold">Post-test ${currentUser.postScore}%</span>`
                : progress >= 100
                    ? `<span class="bg-purple-50 text-purple-700 border border-purple-100 px-3 py-1 rounded-lg text-[11px] font-bold">พร้อม Post-test</span>`
                    : `<span class="bg-gray-50 text-gray-500 border border-gray-100 px-3 py-1 rounded-lg text-[11px] font-bold">Post-test ยังล็อก</span>`;

            grid.innerHTML += `
                <div class="bg-white rounded-2xl border ${isActive ? "border-earth-clay ring-2 ring-earth-clay/20" : "border-gray-100"} shadow-sm hover:shadow-lg transition-all overflow-hidden flex flex-col">
                    <div class="p-6 flex-1 flex flex-col justify-between">
                        <div>
                            <div class="flex items-center justify-between gap-3 mb-4">
                                <span class="inline-block bg-earth-clay text-white px-4 py-1.5 rounded-xl text-xs font-bold">บทที่ ${lesson.order}</span>
                                ${isActive ? '<span class="text-[11px] font-bold text-earth-clay">กำลังเรียนอยู่</span>' : ""}
                            </div>
                            <h4 class="text-lg font-bold text-gray-900 leading-tight mb-3">${lesson.title}</h4>
                            <p class="text-sm text-gray-500 leading-relaxed">${lesson.desc || ""}</p>
                            <div class="flex flex-wrap gap-2 mt-5">${preBadge}${postBadge}</div>
                        </div>
                        <button data-lesson-id="${lesson.id}" class="${lessonButtonClass(preDone, postDone, progress)} mt-6 w-full text-white font-bold py-3 rounded-2xl text-sm transition-all">
                            ${lessonButtonLabel(preDone, postDone, progress)}
                        </button>
                    </div>
                </div>
            `;
        });

        grid.querySelectorAll("[data-lesson-id]").forEach((button) => {
            button.addEventListener("click", () => {
                const lesson = lessonsList.find((item) => String(item.id) === String(button.dataset.lessonId));
                if (lesson) startLesson(lesson.id);
            });
        });
    };

    startLesson = function (lessonId) {
        const lesson = lessonsList.find((item) => String(item.id) === String(lessonId));
        if (!lesson) return;

        setActiveLesson(lesson);

        if (!hasScore(currentUser.preScore)) {
            openQuizModal("pre");
            return;
        }

        if (getProgress() >= 100 && !hasScore(currentUser.postScore)) {
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
        const player = document.getElementById("lessonPlayerWrapper");
        const badge = document.getElementById("lessonStatusBadge");
        const completeButton = document.getElementById("completeLessonButton");
        const timerText = document.getElementById("lessonTimerText");

        document.getElementById("playerLessonTitle").innerText = lesson.title;
        document.getElementById("lessonVideoFrame").src = convertToEmbedUrl(lesson.url);
        badge.innerText = "กำลังเรียน";
        badge.className = "bg-amber-100 text-amber-700 px-4 py-1 rounded-xl text-xs font-bold";
        player.classList.remove("hidden");

        let remaining = Number(lesson.durationSeconds || lesson.duration || MIN_STUDY_SECONDS);
        completeButton.disabled = true;
        completeButton.className = "bg-gray-300 text-gray-500 px-6 py-3 rounded-xl text-sm font-bold cursor-not-allowed";

        const tick = () => {
            if (remaining <= 0) {
                timerText.innerText = "เรียนครบตามเวลาขั้นต่ำแล้ว สามารถยืนยันเพื่อปลดล็อก Post-test ได้";
                completeButton.disabled = false;
                completeButton.className = "bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl text-sm font-bold";
                return;
            }

            timerText.innerText = `กำลังเรียนในเว็บ กรุณาอย่าปิดหน้านี้ เหลืออย่างน้อย ${remaining} วินาที`;
            remaining -= 1;
            window.clearTimeout(window.lessonStudyTimer);
            window.lessonStudyTimer = window.setTimeout(tick, 1000);
        };

        tick();
        player.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    markLessonComplete = async function () {
        const increment = Math.ceil(100 / (lessonsList.length || 1));
        currentUser.progress = Math.min(100, getProgress() + increment);
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

        document.getElementById("lessonStatusBadge").innerText = currentUser.progress >= 100 ? "เรียนครบแล้ว" : "บันทึกความคืบหน้าแล้ว";
        document.getElementById("lessonStatusBadge").className = "bg-emerald-100 text-emerald-700 px-4 py-1 rounded-xl text-xs font-bold";
        updateVisuals();

        if (currentUser.progress >= 100 && !hasScore(currentUser.postScore)) {
            await showCustomAlert("เรียนครบแล้วครับ ปุ่ม Post-test พร้อมอยู่ในการ์ดบทเรียน", "success");
            renderLessons();
            return;
        }

        showCustomAlert("บันทึกความคืบหน้าบทเรียนแล้ว คุณสามารถกลับมาเรียนต่อได้ครับ", "success");
    };

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

        const finalScore = Math.round((correctCount / currentQuizData.length) * 100);
        closeQuizModal();

        if (currentTakingType === "pre") {
            currentUser.preScore = finalScore;
        } else {
            currentUser.postScore = finalScore;
        }

        saveCurrentUser();
        updateVisuals();

        if (currentTakingType === "pre") {
            await showCustomAlert(`ส่ง Pre-test สำเร็จ ${finalScore}%`, "success");
            const activeLesson = getActiveLesson();
            if (activeLesson) openLessonPlayer(activeLesson);
            return;
        }

        await showCustomAlert(`ส่ง Post-test สำเร็จ ${finalScore}%`, "success");
        switchTab("lessons");
    };

    fetchLessonsAndQuizzes = async function () {
        try {
            const lessonResponse = await fetch(gasUrl, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({ action: "getLessons" })
            });
            const lessonData = await lessonResponse.json();
            if (lessonData.status === "success") lessonsList = lessonData.lessons || [];

            const quizResponse = await fetch(gasUrl, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({ action: "getQuizzes" })
            });
            const quizData = await quizResponse.json();
            if (quizData.status === "success") allQuizzes = quizData.quizzes || [];

            updateVisuals();

            const activeLesson = getActiveLesson();
            if (activeLesson && hasScore(currentUser.preScore) && getProgress() < 100) {
                const lesson = lessonsList.find((item) => String(item.id) === String(activeLesson.id)) || activeLesson;
                openLessonPlayer(lesson);
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
            await fetchLessonsAndQuizzes();
        } catch (error) {
            console.error("Config load error:", error);
        }
    };

    window.onload = initConfig;
})();
