/*
*   MUST:
*       ☺
*   SHOULD:
*       sort videos by offsetwidth
*       replace await sleep with promisified structure
*   COULD:
*       indentify video on header:hover
*   WONT:
*       download video
*           https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Recording_API
*/

async function main(defaults) {
    const videosListEl = document.getElementById("videosList");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const vidMap = {}; // index: { localindex, parsedFilter, playbackRate, windowUri }
    const videoList = []; // accumulator for videos from all frames
    const vidQueue = [];
    let vidCounter = 0;
    let addVideoRunning = false;

    chrome.runtime.onMessage.addListener((request, _, sendResponse) => {
        if (request.greeting === "videos") {
            sendResponse({ greeting: "success" });
            if (request.videos.length > 0) {
                videoList.push(...request.videos);
                vidQueue.push(...request.videos);
                addVideoRunner();
            }
        } else {
            sendResponse({ greeting: "failure" });
        }
    });

    chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        function: () => {
            function mapVid(vid, index) {
                return { index: index, filter: vid.style.filter, playbackRate: vid.playbackRate, uri: window.location.href };
            }
            let nodes = Array.from(document.querySelectorAll("video, .VF_standin")) ?? [];
            for (const { shadowRoot } of document.querySelectorAll("*")) {
                if (shadowRoot) {
                    nodes = nodes.concat(Array.from(shadowRoot.querySelectorAll("video, .VF_standin")) ?? []);
                }
            }
            const vids = nodes.map(mapVid);
            for (const vid of nodes) {
                vid.disablePictureInPicture = false;
            }
            chrome.runtime.sendMessage({ greeting: "videos", videos: vids });
        },
    }, _ => !chrome.runtime.lastError || console.log("Error(getVids):", chrome.runtime.lastError));

    // give it time to find videos before telling user there aren't any
    await sleep(1000).then(() => {
        if (videoList.length === 0) {
            videosListEl.classList.add("noVidsFound");
            videosListEl.innerHTML = `No videos found on page! <br> If there is one, use the feedback button on the options page!`;
        }
    });

    function addVideoRunner() {
        if (addVideoRunning) return;
        addVideoRunning = true;
        if (vidCounter == 0) {
            videosListEl.innerHTML = "";
            videosListEl.classList.remove("noVidsFound");
        }
        const newVideo = vidQueue.pop();
        const pf = parseFilter(newVideo.filter);
        const vidUID = `${newVideo.index}-${newVideo.uri}`
        vidMap[vidUID] = { localIndex: newVideo.index, pf: pf, playbackRate: newVideo.playbackRate, uri: newVideo.uri };

        const videoEl = document.createElement("div");
        const vidLabel = document.createElement("h3");
        const reqPIPBtn = document.createElement("button");
        reqPIPBtn.title = "Toggle Picture In Picture";
        reqPIPBtn.addEventListener("click", () => {
            reqPIP(vidMap[vidUID]);
        });

        vidLabel.innerHTML = `Video: ${++vidCounter}`;
        vidLabel.appendChild(reqPIPBtn);
        videoEl.appendChild(vidLabel);
        videosListEl.appendChild(videoEl);

        addFilterElement(videoEl, vidUID, pf, "Brightness:", "brightness");
        addFilterElement(videoEl, vidUID, pf, "Contrast:", "contrast");
        addFilterElement(videoEl, vidUID, pf, "Saturation:", "saturate");
        addFilterElement(videoEl, vidUID, pf, "Invert:", "invert");
        addFilterElement(videoEl, vidUID, pf, "Sepia:", "sepia");
        addFilterElement(videoEl, vidUID, pf, "Opacity:", "opacity");
        addFilterElement(videoEl, vidUID, pf, "Grayscale:", "grayscale");
        addFilterElement(videoEl, vidUID, pf, "Hue:", "hueRotate", (val) => `${val} deg`);
        addFilterElement(videoEl, vidUID, pf, "Blur:", "blur", (val) => `${val} px`);

        addPlaybackRateElement(videoEl, vidUID);

        addPresetSelector(videoEl, vidUID);

        addVideoRunning = false;
        if (vidQueue.length > 0) addVideoRunner();
    }

    function addPresetSelector(videoEl, vidUID, preselectedValue) {
        const presetDiv = document.createElement("div");
        presetDiv.innerHTML = "Presets: ";
        const selectEl = document.createElement("select");

        selectEl.addEventListener("change", (e) => {
            let template = defaults.templates.find((templ) => templ.name == e.target.value);
            if (!template) {
                template = { name: "default", pf: parseFilter(""), playbackRate: defaults.playbackRate.v };
            }

            vidMap[vidUID].playbackRate = template.playbackRate;
            vidMap[vidUID].pf = template.pf;
            setPlaybackRate(vidMap[vidUID]);
            setFilter(vidMap[vidUID]);
            window.dispatchEvent(new CustomEvent("templateChange", { detail: { vidUID: vidUID, templateName: e.target.value } }));
        });

        templateOptionEls(selectEl, "default")
        for (const template of defaults.templates) {
            templateOptionEls(selectEl, template.name);
        }

        const saveBtn = document.createElement("button");
        saveBtn.setAttribute("id", "saveBtn");
        saveBtn.classList.add("addBtn");
        saveBtn.addEventListener("click", () => {
            let presetName = selectEl.value;
            if (!presetName || presetName == "undefined" || presetName == "default") presetName = prompt("Please enter new preset name");
            if (presetName == null || presetName == "") { return; }
            const saveTemplateEvent = new CustomEvent("templateSave", { detail: { vidUID: vidUID, templateName: presetName } });
            defaults.templates = defaults.templates.filter(template => template.name != presetName);
            defaults.templates.push({ name: presetName, pf: vidMap[vidUID].pf, playbackRate: vidMap[vidUID].playbackRate });
            chrome.storage.sync.set({ defaults }).then(() => {
                window.dispatchEvent(saveTemplateEvent);
            });
        });
        const delBtn = document.createElement("button");
        delBtn.setAttribute("id", "delBtn");
        delBtn.addEventListener("click", () => {
            let presetName = selectEl.value;
            if (presetName == null || presetName == "" || presetName == "default") { return; }
            const saveTemplateEvent = new CustomEvent("templateSave");
            defaults.templates = defaults.templates.filter(template => template.name != presetName);
            chrome.storage.sync.set({ defaults }).then(() => {
                window.dispatchEvent(saveTemplateEvent);
            });
        });
        window.addEventListener("templateSave", (e) => {
            presetDiv.remove();
            addPresetSelector(videoEl, vidUID, e.detail?.vidUID == vidUID ? e.detail.templateName : undefined);
        }, { once: true });
        window.addEventListener("templateChange", (e) => {
            if (e.detail.vidUID != vidUID) return;
            selectEl.value = e.detail.templateName;
            updateBtnStates();
        });

        if (preselectedValue) {
            selectEl.value = preselectedValue;
        } else {
            selectEl.value = undefined;
        }

        updateBtnStates();
        presetDiv.appendChild(selectEl);
        presetDiv.appendChild(saveBtn);
        presetDiv.appendChild(delBtn);
        videoEl.appendChild(presetDiv);

        function updateBtnStates() {
            if (!selectEl.value || selectEl.value == "default") {
                saveBtn.classList.add("addBtn");
                delBtn.disabled = true;
            } else {
                delBtn.disabled = false;
                saveBtn.classList.remove("addBtn");
            }
        }
    }

    function templateOptionEls(parent, name) {
        const newOption = document.createElement("option");
        newOption.setAttribute("value", name);
        newOption.innerHTML = name;
        parent.appendChild(newOption);
    }

    function addFilterElement(videoEl, vidUID, pf, label, field, percentFn) {
        const filterDiv = document.createElement("div");
        const labelEl = document.createElement("label");
        labelEl.innerHTML = label;
        const percentEl = document.createElement("span");
        percentEl.innerHTML = percentFn ? percentFn(pf[field]) : `${Math.round(pf[field] * 100)}%`;
        const sliderEl = document.createElement("input");
        sliderEl.type = "range";
        sliderEl.min = defaults[field].min;
        sliderEl.step = defaults[field].step;
        sliderEl.max = defaults[field].max;
        sliderEl.value = pf[field];
        filterDiv.appendChild(labelEl);
        filterDiv.appendChild(sliderEl);
        filterDiv.appendChild(percentEl);
        const resetEl = document.createElement("button");
        resetEl.setAttribute("id", "resetBtn")
        resetEl.disabled = pf[field] == defaults[field].v;
        resetEl.addEventListener("click", () => {
            sliderEl.value = defaults[field].v;
            percentEl.innerHTML = percentFn ? percentFn(sliderEl.value) : `${Math.round(sliderEl.value * 100)}%`;
            vidMap[vidUID].pf[field] = sliderEl.value;
            resetEl.disabled = true;
            setFilter(vidMap[vidUID]);
        });
        sliderEl.addEventListener("input", () => {
            percentEl.innerHTML = percentFn ? percentFn(sliderEl.value) : `${Math.round(sliderEl.value * 100)}%`;
            vidMap[vidUID].pf[field] = sliderEl.value;
            resetEl.disabled = sliderEl.value == defaults[field].v;
            setFilter(vidMap[vidUID]);
        });
        window.addEventListener("templateChange", (e) => {
            if (e.detail.vidUID != vidUID) return;
            const newVal = e.detail.templateName == "default" ? defaults[field].v : vidMap[vidUID].pf[field]
            sliderEl.value = newVal;
            percentEl.innerHTML = percentFn ? percentFn(sliderEl.value) : `${Math.round(sliderEl.value * 100)}%`;
            resetEl.disabled = sliderEl.value == defaults[field].v;
        });
        filterDiv.appendChild(resetEl);
        videoEl.appendChild(filterDiv);
    }

    function addPlaybackRateElement(videoEl, vidUID) {
        //playback rate
        const playbackRateDiv = document.createElement("div");
        const playbackRateLabel = document.createElement("label");
        playbackRateLabel.innerHTML = "Speed:";
        const playbackRateMultiplier = document.createElement("span");
        playbackRateMultiplier.innerHTML = `${vidMap[vidUID].playbackRate}x`;
        const playbackRateSlider = document.createElement("input");
        playbackRateSlider.type = "range";
        playbackRateSlider.min = defaults.playbackRate.min;
        playbackRateSlider.step = defaults.playbackRate.step;
        playbackRateSlider.max = defaults.playbackRate.max;
        playbackRateSlider.value = vidMap[vidUID].playbackRate;
        playbackRateDiv.appendChild(playbackRateLabel);
        playbackRateDiv.appendChild(playbackRateSlider);
        playbackRateDiv.appendChild(playbackRateMultiplier);
        const playbackRateReset = document.createElement("button");
        playbackRateReset.setAttribute("id", "resetBtn");
        playbackRateReset.disabled = vidMap[vidUID].playbackRate == defaults.playbackRate.v;
        playbackRateReset.addEventListener("click", () => {
            playbackRateSlider.value = 1;
            playbackRateMultiplier.innerHTML = `${playbackRateSlider.value}x`;
            vidMap[vidUID].playbackRate = playbackRateSlider.value;
            playbackRateReset.disabled = true;
            setPlaybackRate(vidMap[vidUID]);
        });
        playbackRateSlider.addEventListener("input", () => {
            //set playbackRate val and update playbackRate
            playbackRateMultiplier.innerHTML = `${playbackRateSlider.value}x`;
            vidMap[vidUID].playbackRate = playbackRateSlider.value;
            playbackRateReset.disabled = playbackRateSlider.value == defaults.playbackRate.v;
            setPlaybackRate(vidMap[vidUID]);
        });
        window.addEventListener("templateChange", (e) => {
            if (e.detail.vidUID != vidUID) return;
            playbackRateMultiplier.innerHTML = `${vidMap[vidUID].playbackRate}x`;
            playbackRateSlider.value = vidMap[vidUID].playbackRate;
            playbackRateReset.disabled = playbackRateSlider.value == defaults.playbackRate.v;
        });
        playbackRateDiv.appendChild(playbackRateReset);
        videoEl.appendChild(playbackRateDiv);
    }

    function setFilter(video) {
        const filter = video.pf;
        chrome.storage.local.set({ videoStyleFilter: pfToString(filter) });
        chrome.storage.local.set({ videoIndex: video.localIndex });
        chrome.storage.local.set({ frameUri: video.uri });
        chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            function: () => {
                chrome.storage.local.get("frameUri", (data) => {
                    if (window.location.href !== data.frameUri) return;
                    chrome.storage.local.get("videoIndex", (videoIndex) => {
                        let nodes = Array.from(document.querySelectorAll("video, .VF_standin")) ?? [];
                        for (const { shadowRoot } of document.querySelectorAll("*")) {
                            if (shadowRoot) {
                                nodes = nodes.concat(Array.from(shadowRoot.querySelectorAll("video, .VF_standin")) ?? []);
                            }
                        }
                        const vid = nodes[videoIndex.videoIndex];
                        chrome.storage.local.get("videoStyleFilter", (videoStyleFilter) => {
                            vid.style.filter = videoStyleFilter.videoStyleFilter;
                        });
                    });
                });
            },
        }, _ => !chrome.runtime.lastError || console.log("Error(setFilter): ", chrome.runtime.lastError));
    }
    function setPlaybackRate(video) {
        const playbackRate = video.playbackRate;
        chrome.storage.local.set({ videoPlaybackRate: playbackRate });
        chrome.storage.local.set({ videoIndex: video.localIndex });
        chrome.storage.local.set({ frameUri: video.uri });
        chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            function: () => {
                chrome.storage.local.get("frameUri", (data) => {
                    if (window.location.href !== data.frameUri) return;
                    chrome.storage.local.get("videoIndex", (videoIndex) => {
                        let nodes = Array.from(document.querySelectorAll("video, .VF_standin")) ?? [];
                        for (const { shadowRoot } of document.querySelectorAll("*")) {
                            if (shadowRoot) {
                                nodes = nodes.concat(Array.from(shadowRoot.querySelectorAll("video, .VF_standin")) ?? []);
                            }
                        }
                        const vid = nodes[videoIndex.videoIndex];
                        chrome.storage.local.get("videoPlaybackRate", (videoPlaybackRate) => {
                            vid.playbackRate = videoPlaybackRate.videoPlaybackRate;
                        });
                    });
                });
            },
        }, _ => !chrome.runtime.lastError || console.log("Error(setPlayBackRate): ", chrome.runtime.lastError));
    }
    function reqPIP(video) {
        chrome.storage.local.set({ videoIndex: video.localIndex });
        chrome.storage.local.set({ frameUri: video.uri });
        chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            function: () => {

                function insertAt(parent, newElement, index) {
                    if (index >= parent.children.length) {
                        parent.appendChild(newElement);
                    } else {
                        parent.insertBefore(newElement, parent.children[index]);
                    }
                }

                function getElementIndex(element) {
                    return Array.prototype.slice.call(element.parentNode.children).indexOf(element);
                }

                function clearDocPIP() {
                    document.VF_vidContRef.append(document.VF_vidRef);
                    document.VF_vidRef.style.width = document.VF_vidWidth ? document.VF_vidWidth : "";
                    document.VF_vidRef.style.height = document.VF_vidHeight ? document.VF_vidHeight : "";
                    insertAt(document.VF_vidContRef, document.VF_vidRef, document.VF_vidIndex);
                    document.pipWindow.close();
                    document.VF_pipIndex = null;
                    document.VF_vidRef = null;
                    document.VF_vidContRef = null;
                    document.VF_vidIndex = null;
                    document.VF_vidWidth = null;
                    document.VF_vidHeight = null;
                    document.VF_standinEl.remove();
                }

                chrome.storage.local.get("frameUri", (data) => {
                    if (window.location.href !== data.frameUri) return;
                    chrome.storage.local.get("videoIndex", async (videoIndex) => {
                        let nodes = Array.from(document.querySelectorAll("video, .VF_standin")) ?? [];
                        for (const { shadowRoot } of document.querySelectorAll("*")) {
                            if (shadowRoot) {
                                nodes = nodes.concat(Array.from(shadowRoot.querySelectorAll("video, .VF_standin")) ?? []);
                            }
                        }
                        const vid = nodes[videoIndex.videoIndex];
                        chrome.storage.sync.get("advancedPIPEnabled", async enabled => {
                            if (enabled.advancedPIPEnabled) {
                                if (document.VF_pipIndex !== videoIndex.videoIndex) {
                                    document.VF_pipIndex = videoIndex.videoIndex;
                                    document.VF_vidRef = vid;
                                    document.VF_vidContRef = vid.parentElement;
                                    document.VF_vidIndex = getElementIndex(vid);
                                    document.VF_vidWidth = vid.style?.width ?? 0;
                                    document.VF_vidHeight = vid.style?.height ?? 0;

                                    document.VF_standinEl = document.createElement("div");
                                    document.VF_standinEl.style = {};
                                    document.VF_standinEl.width = vid.clientWidth;
                                    document.VF_standinEl.height = vid.clientHeight;
                                    document.VF_standinEl.uri = vid.uri;
                                    document.VF_standinEl.index = vid.index;
                                    Object.defineProperty(document.VF_standinEl, 'playbackRate', {
                                        get: () => vid.playbackRate,
                                        set: function (value) {
                                            vid.playbackRate = value;
                                        }
                                    });
                                    Object.defineProperty(document.VF_standinEl.style, 'filter', {
                                        get: () => vid.style.filter,
                                        set: function (value) {
                                            vid.style.filter = value;
                                        }
                                    });

                                    document.VF_standinEl.classList.add("VF_standin");

                                    document.pipWindow = await window.documentPictureInPicture.requestWindow({
                                        width: vid.clientWidth,
                                        height: vid.clientHeight,
                                    });
                                    document.pipWindow.document.body.style = "margin: 0; background-color: black;"
                                    document.pipWindow.addEventListener("pagehide", clearDocPIP);

                                    document.pipWindow.document.body.append(vid);
                                    document.pipWindow.document.body.addEventListener("click", () => {
                                        vid.paused ? vid.play() : vid.pause();
                                    });

                                    insertAt(document.VF_vidContRef, document.VF_standinEl, document.VF_vidIndex); // set VF_standin at original video position.
                                    vid.style.width = "100vw"; // "fill window"
                                    vid.style.height = "100vh";

                                } else {
                                    clearDocPIP();
                                }
                            } else { // simple 
                                if (document.VF_pipIndex !== videoIndex.videoIndex || !document.pictureInPictureElement) {
                                    vid.requestPictureInPicture().then(() => {
                                        document.VF_pipIndex = videoIndex.videoIndex;
                                    });
                                } else {
                                    document.exitPictureInPicture();
                                    document.VF_pipIndex = null;
                                }
                            }
                        })

                    });
                });
            },
        }, _ => !chrome.runtime.lastError || console.log("Error(reqPIP): ", chrome.runtime.lastError));
    }

    function parseFilter(fltr) {
        // TODO replace regex with a proper parser?
        //  feature = (regex between the parentheses || [0, default]) [capture group]
        let blur = (fltr.match(/blur\((.*?)\)/m) || [0, "0"])[1];
        let brightness = (fltr.match(/brightness\((.*?)\)/m) || [0, "1"])[1];
        let contrast = (fltr.match(/contrast\((.*?)\)/m) || [0, "1"])[1];
        let grayscale = (fltr.match(/grayscale\((.*?)\)/m) || [0, "0"])[1];
        let hueRotate = (fltr.match(/hue-rotate\((.*?)\)/m) || [0, "0"])[1];
        let invert = (fltr.match(/invert\((.*?)\)/m) || [0, "0"])[1];
        let opacity = (fltr.match(/opacity\((.*?)\)/m) || [0, "1"])[1];
        let saturate = (fltr.match(/saturate\((.*?)\)/m) || [0, "1"])[1];
        let sepia = (fltr.match(/sepia\((.*?)\)/m) || [0, "0"])[1];

        if (blur.includes("px")) {
            blur = parseInt(blur.replace("px", ""));
        }
        if (brightness.includes("%")) {
            brightness = parseInt(brightness.replace("%", "")) / 100;
        }
        if (contrast.includes("%")) {
            contrast = parseInt(contrast.replace("%", "")) / 100;
        }
        if (grayscale.includes("%")) {
            grayscale = parseInt(grayscale.replace("%", "")) / 100;
        }
        if (hueRotate.includes("deg")) {
            hueRotate = parseInt(hueRotate.replace("deg", ""));
        }
        if (invert.includes("%")) {
            invert = parseInt(invert.replace("%", "")) / 100;
        }
        if (opacity.includes("%")) {
            opacity = parseInt(opacity.replace("%", "")) / 100;
        }
        if (saturate.includes("%")) {
            saturate = parseInt(saturate.replace("%", "")) / 100;
        }
        if (sepia.includes("%")) {
            sepia = parseInt(sepia.replace("%", "")) / 100;
        }
        return { blur, brightness, contrast, grayscale, hueRotate, invert, opacity, saturate, sepia };
    }

    // turns the filter object into a string suitable for setting the style.filter property
    function pfToString(pf) {
        return `blur(${pf.blur}px) brightness(${pf.brightness}) contrast(${pf.contrast}) saturate(${pf.saturate}) invert(${pf.invert}) sepia(${pf.sepia}) opacity(${pf.opacity}) grayscale(${pf.grayscale}) hue-rotate(${pf.hueRotate}deg)`;
    }
}

// TODO: when chrome.* stops using callbacks refactor this to use promises 
chrome.storage.sync.get("defaults", defaults => {
    main(defaults.defaults);
});

chrome.storage.sync.get("advancedPIPEnabled", enabled => {
    const toggle = document.getElementById("advancedPIP");
    if (enabled.advancedPIPEnabled) toggle.checked = true;
    toggle.addEventListener("change", () => {
        console.log(toggle.checked);
        chrome.storage.sync.set({ "advancedPIPEnabled": toggle.checked });
    });
});

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
